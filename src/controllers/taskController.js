import { query, getClient } from '../config/database.js';
import { parsePagination, buildPaginationResponse } from '../utils/helpers.js';

/**
 * Get all tasks for the current user
 */
export const getTasks = async (req, res) => {
  try {
    const { page, limit, offset } = parsePagination(req.query);
    const { estado, lista, prioridad, id_cuenta, fecha_inicio, fecha_fin } = req.query;

    let whereClause = 'WHERE t.id_usuario = $1';
    const params = [req.user.id];
    let paramIndex = 2;

    if (estado) {
      whereClause += ` AND t.estado = $${paramIndex}`;
      params.push(estado);
      paramIndex++;
    }

    if (lista) {
      whereClause += ` AND t.lista = $${paramIndex}`;
      params.push(lista);
      paramIndex++;
    }

    if (prioridad) {
      whereClause += ` AND t.prioridad = $${paramIndex}`;
      params.push(prioridad);
      paramIndex++;
    }

    if (id_cuenta) {
      whereClause += ` AND t.id_cuenta = $${paramIndex}`;
      params.push(id_cuenta);
      paramIndex++;
    }

    if (fecha_inicio) {
      whereClause += ` AND t.fecha_inicio >= $${paramIndex}`;
      params.push(fecha_inicio);
      paramIndex++;
    }

    if (fecha_fin) {
      whereClause += ` AND t.fecha_fin <= $${paramIndex}`;
      params.push(fecha_fin);
      paramIndex++;
    }

    // Get total count
    const countResult = await query(
      `SELECT COUNT(*) FROM tareas t ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].count);

    // Get tasks
    const tasksResult = await query(
      `SELECT t.*,
              c.nombre as cuenta_nombre,
              ua.nombre as asignado_nombre
       FROM tareas t
       LEFT JOIN cuentas c ON t.id_cuenta = c.id_cuenta
       LEFT JOIN usuarios ua ON t.id_usuario_asignado = ua.id_usuario
       ${whereClause}
       ORDER BY
         CASE t.prioridad WHEN 'alta' THEN 1 WHEN 'media' THEN 2 ELSE 3 END,
         t.fecha_fin NULLS LAST,
         t.created_at DESC
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...params, limit, offset]
    );

    const tasks = tasksResult.rows.map(t => ({
      id: t.id_tarea,
      titulo: t.titulo,
      descripcion: t.descripcion,
      fechaInicio: t.fecha_inicio,
      fechaFin: t.fecha_fin,
      estado: t.estado,
      lista: t.lista,
      prioridad: t.prioridad,
      cuenta: t.id_cuenta ? {
        id: t.id_cuenta,
        nombre: t.cuenta_nombre
      } : null,
      asignado: t.id_usuario_asignado ? {
        id: t.id_usuario_asignado,
        nombre: t.asignado_nombre
      } : null,
      createdAt: t.created_at,
      updatedAt: t.updated_at
    }));

    res.json(buildPaginationResponse(tasks, total, page, limit));
  } catch (error) {
    console.error('Get tasks error:', error);
    res.status(500).json({ error: 'Failed to get tasks.' });
  }
};

/**
 * Get task by ID
 */
export const getTaskById = async (req, res) => {
  try {
    const { taskId } = req.params;

    const result = await query(
      `SELECT t.*,
              c.nombre as cuenta_nombre,
              ua.nombre as asignado_nombre,
              ua.email as asignado_email
       FROM tareas t
       LEFT JOIN cuentas c ON t.id_cuenta = c.id_cuenta
       LEFT JOIN usuarios ua ON t.id_usuario_asignado = ua.id_usuario
       WHERE t.id_tarea = $1 AND t.id_usuario = $2`,
      [taskId, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found.' });
    }

    const t = result.rows[0];

    // Get task history
    const historyResult = await query(
      `SELECT th.*, u.nombre as usuario_nombre
       FROM tareas_historial th
       LEFT JOIN usuarios u ON th.id_usuario = u.id_usuario
       WHERE th.id_tarea = $1
       ORDER BY th.created_at DESC`,
      [taskId]
    );

    res.json({
      id: t.id_tarea,
      titulo: t.titulo,
      descripcion: t.descripcion,
      fechaInicio: t.fecha_inicio,
      fechaFin: t.fecha_fin,
      estado: t.estado,
      lista: t.lista,
      prioridad: t.prioridad,
      cuenta: t.id_cuenta ? {
        id: t.id_cuenta,
        nombre: t.cuenta_nombre
      } : null,
      asignado: t.id_usuario_asignado ? {
        id: t.id_usuario_asignado,
        nombre: t.asignado_nombre,
        email: t.asignado_email
      } : null,
      historial: historyResult.rows.map(h => ({
        id: h.id,
        estadoAnterior: h.estado_anterior,
        estadoNuevo: h.estado_nuevo,
        usuario: h.usuario_nombre,
        comentario: h.comentario,
        fecha: h.created_at
      })),
      createdAt: t.created_at,
      updatedAt: t.updated_at
    });
  } catch (error) {
    console.error('Get task by ID error:', error);
    res.status(500).json({ error: 'Failed to get task.' });
  }
};

/**
 * Create task
 */
export const createTask = async (req, res) => {
  const client = await getClient();

  try {
    await client.query('BEGIN');

    const {
      titulo,
      descripcion,
      fecha_inicio,
      fecha_fin,
      lista,
      prioridad,
      id_cuenta,
      id_usuario_asignado
    } = req.body;

    // If account is provided, verify user has access
    if (id_cuenta) {
      const accessCheck = await client.query(
        'SELECT id FROM usuario_cuenta WHERE id_cuenta = $1 AND id_usuario = $2',
        [id_cuenta, req.user.id]
      );

      if (accessCheck.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(403).json({ error: 'Access denied to this account.' });
      }
    }

    const result = await client.query(
      `INSERT INTO tareas (id_usuario, id_cuenta, titulo, descripcion, fecha_inicio, fecha_fin, estado, lista, prioridad, id_usuario_asignado)
       VALUES ($1, $2, $3, $4, $5, $6, 'pendiente', $7, $8, $9)
       RETURNING *`,
      [
        req.user.id,
        id_cuenta || null,
        titulo,
        descripcion || null,
        fecha_inicio || null,
        fecha_fin || null,
        lista || 'general',
        prioridad || 'media',
        id_usuario_asignado || null
      ]
    );

    const task = result.rows[0];

    // Log creation in history
    await client.query(
      `INSERT INTO tareas_historial (id_tarea, estado_nuevo, id_usuario, comentario)
       VALUES ($1, 'pendiente', $2, 'Tarea creada')`,
      [task.id_tarea, req.user.id]
    );

    await client.query('COMMIT');

    res.status(201).json({
      message: 'Task created successfully',
      task: {
        id: task.id_tarea,
        titulo: task.titulo,
        estado: task.estado,
        prioridad: task.prioridad,
        createdAt: task.created_at
      }
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Create task error:', error);
    res.status(500).json({ error: 'Failed to create task.' });
  } finally {
    client.release();
  }
};

/**
 * Update task
 */
export const updateTask = async (req, res) => {
  const client = await getClient();

  try {
    await client.query('BEGIN');

    const { taskId } = req.params;
    const {
      titulo,
      descripcion,
      fecha_inicio,
      fecha_fin,
      estado,
      lista,
      prioridad,
      id_usuario_asignado,
      comentario
    } = req.body;

    // Get current task state
    const currentTask = await client.query(
      'SELECT * FROM tareas WHERE id_tarea = $1 AND id_usuario = $2',
      [taskId, req.user.id]
    );

    if (currentTask.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Task not found.' });
    }

    const oldEstado = currentTask.rows[0].estado;

    const result = await client.query(
      `UPDATE tareas
       SET titulo = COALESCE($1, titulo),
           descripcion = COALESCE($2, descripcion),
           fecha_inicio = COALESCE($3, fecha_inicio),
           fecha_fin = COALESCE($4, fecha_fin),
           estado = COALESCE($5, estado),
           lista = COALESCE($6, lista),
           prioridad = COALESCE($7, prioridad),
           id_usuario_asignado = COALESCE($8, id_usuario_asignado),
           updated_at = CURRENT_TIMESTAMP
       WHERE id_tarea = $9 AND id_usuario = $10
       RETURNING *`,
      [titulo, descripcion, fecha_inicio, fecha_fin, estado, lista, prioridad, id_usuario_asignado, taskId, req.user.id]
    );

    const task = result.rows[0];

    // Log state change in history if estado changed
    if (estado && estado !== oldEstado) {
      await client.query(
        `INSERT INTO tareas_historial (id_tarea, estado_anterior, estado_nuevo, id_usuario, comentario)
         VALUES ($1, $2, $3, $4, $5)`,
        [taskId, oldEstado, estado, req.user.id, comentario || null]
      );
    }

    await client.query('COMMIT');

    res.json({
      message: 'Task updated successfully',
      task: {
        id: task.id_tarea,
        titulo: task.titulo,
        estado: task.estado,
        prioridad: task.prioridad,
        updatedAt: task.updated_at
      }
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Update task error:', error);
    res.status(500).json({ error: 'Failed to update task.' });
  } finally {
    client.release();
  }
};

/**
 * Update task status
 */
export const updateTaskStatus = async (req, res) => {
  const client = await getClient();

  try {
    await client.query('BEGIN');

    const { taskId } = req.params;
    const { estado, comentario } = req.body;

    // Get current state
    const currentTask = await client.query(
      'SELECT estado FROM tareas WHERE id_tarea = $1 AND id_usuario = $2',
      [taskId, req.user.id]
    );

    if (currentTask.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Task not found.' });
    }

    const oldEstado = currentTask.rows[0].estado;

    if (oldEstado === estado) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Task is already in this state.' });
    }

    await client.query(
      'UPDATE tareas SET estado = $1, updated_at = CURRENT_TIMESTAMP WHERE id_tarea = $2',
      [estado, taskId]
    );

    // Log in history
    await client.query(
      `INSERT INTO tareas_historial (id_tarea, estado_anterior, estado_nuevo, id_usuario, comentario)
       VALUES ($1, $2, $3, $4, $5)`,
      [taskId, oldEstado, estado, req.user.id, comentario || null]
    );

    await client.query('COMMIT');

    res.json({
      message: 'Task status updated successfully',
      task: {
        id: taskId,
        estadoAnterior: oldEstado,
        estadoNuevo: estado
      }
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Update task status error:', error);
    res.status(500).json({ error: 'Failed to update task status.' });
  } finally {
    client.release();
  }
};

/**
 * Delete task
 */
export const deleteTask = async (req, res) => {
  try {
    const { taskId } = req.params;

    const result = await query(
      'DELETE FROM tareas WHERE id_tarea = $1 AND id_usuario = $2 RETURNING id_tarea',
      [taskId, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found.' });
    }

    res.json({ message: 'Task deleted successfully.' });
  } catch (error) {
    console.error('Delete task error:', error);
    res.status(500).json({ error: 'Failed to delete task.' });
  }
};

/**
 * Get tasks by list
 */
export const getTasksByList = async (req, res) => {
  try {
    const result = await query(
      `SELECT lista, COUNT(*) as total,
              SUM(CASE WHEN estado = 'pendiente' THEN 1 ELSE 0 END) as pendientes,
              SUM(CASE WHEN estado = 'en_progreso' THEN 1 ELSE 0 END) as en_progreso,
              SUM(CASE WHEN estado = 'completada' THEN 1 ELSE 0 END) as completadas
       FROM tareas
       WHERE id_usuario = $1
       GROUP BY lista
       ORDER BY lista`,
      [req.user.id]
    );

    res.json({
      listas: result.rows.map(l => ({
        nombre: l.lista,
        total: parseInt(l.total),
        pendientes: parseInt(l.pendientes),
        enProgreso: parseInt(l.en_progreso),
        completadas: parseInt(l.completadas)
      }))
    });
  } catch (error) {
    console.error('Get tasks by list error:', error);
    res.status(500).json({ error: 'Failed to get tasks by list.' });
  }
};

/**
 * Get tasks summary (for dashboard)
 */
export const getTasksSummary = async (req, res) => {
  try {
    const result = await query(
      `SELECT
         COUNT(*) as total,
         SUM(CASE WHEN estado = 'pendiente' THEN 1 ELSE 0 END) as pendientes,
         SUM(CASE WHEN estado = 'en_progreso' THEN 1 ELSE 0 END) as en_progreso,
         SUM(CASE WHEN estado = 'completada' THEN 1 ELSE 0 END) as completadas,
         SUM(CASE WHEN estado = 'cancelada' THEN 1 ELSE 0 END) as canceladas,
         SUM(CASE WHEN prioridad = 'alta' AND estado NOT IN ('completada', 'cancelada') THEN 1 ELSE 0 END) as alta_prioridad,
         SUM(CASE WHEN fecha_fin < CURRENT_DATE AND estado NOT IN ('completada', 'cancelada') THEN 1 ELSE 0 END) as vencidas
       FROM tareas
       WHERE id_usuario = $1`,
      [req.user.id]
    );

    const summary = result.rows[0];

    res.json({
      total: parseInt(summary.total) || 0,
      pendientes: parseInt(summary.pendientes) || 0,
      enProgreso: parseInt(summary.en_progreso) || 0,
      completadas: parseInt(summary.completadas) || 0,
      canceladas: parseInt(summary.canceladas) || 0,
      altaPrioridad: parseInt(summary.alta_prioridad) || 0,
      vencidas: parseInt(summary.vencidas) || 0
    });
  } catch (error) {
    console.error('Get tasks summary error:', error);
    res.status(500).json({ error: 'Failed to get tasks summary.' });
  }
};

// ================== ACCOUNT-SCOPED TASKS ==================

/**
 * Get tasks for a specific account
 */
export const getAccountTasks = async (req, res) => {
  try {
    const { accountId } = req.params;
    const { estado, prioridad } = req.query;

    let whereClause = 'WHERE t.id_cuenta = $1';
    const params = [accountId];
    let paramIndex = 2;

    if (estado) {
      whereClause += ` AND t.estado = $${paramIndex}`;
      params.push(estado);
      paramIndex++;
    }

    if (prioridad) {
      whereClause += ` AND t.prioridad = $${paramIndex}`;
      params.push(prioridad);
      paramIndex++;
    }

    const result = await query(
      `SELECT t.*, u.nombre as usuario_nombre, ua.nombre as asignado_nombre,
              cat.nombre as categoria_nombre
       FROM tareas t
       LEFT JOIN usuarios u ON t.id_usuario = u.id_usuario
       LEFT JOIN usuarios ua ON t.id_usuario_asignado = ua.id_usuario
       LEFT JOIN categorias cat ON t.id_categoria = cat.id_categoria
       ${whereClause}
       ORDER BY
         CASE t.prioridad WHEN 'alta' THEN 1 WHEN 'media' THEN 2 ELSE 3 END,
         t.fecha_fin NULLS LAST,
         t.created_at DESC`,
      params
    );

    const tasks = result.rows.map(t => ({
      id: t.id_tarea,
      titulo: t.titulo,
      descripcion: t.descripcion,
      fechaInicio: t.fecha_inicio,
      fechaVencimiento: t.fecha_fin,
      estado: t.estado,
      prioridad: t.prioridad,
      categoriaId: t.id_categoria,
      categoria: t.categoria_nombre ? { id: t.id_categoria, nombre: t.categoria_nombre } : null,
      usuario: { id: t.id_usuario, nombre: t.usuario_nombre },
      asignado: t.id_usuario_asignado ? { id: t.id_usuario_asignado, nombre: t.asignado_nombre } : null,
      createdAt: t.created_at,
      updatedAt: t.updated_at
    }));

    res.json(tasks);
  } catch (error) {
    console.error('Get account tasks error:', error);
    res.status(500).json({ error: 'Failed to get tasks.' });
  }
};

/**
 * Create task for a specific account
 */
export const createAccountTask = async (req, res) => {
  const client = await getClient();

  try {
    await client.query('BEGIN');

    const { accountId } = req.params;
    const {
      titulo,
      descripcion,
      fecha_vencimiento,
      prioridad,
      categoria_id,
      id_usuario_asignado
    } = req.body;

    const result = await client.query(
      `INSERT INTO tareas (id_usuario, id_cuenta, titulo, descripcion, fecha_fin, estado, prioridad, id_categoria, id_usuario_asignado)
       VALUES ($1, $2, $3, $4, $5, 'pendiente', $6, $7, $8)
       RETURNING *`,
      [
        req.user.id,
        accountId,
        titulo,
        descripcion || null,
        fecha_vencimiento || null,
        prioridad || 'media',
        categoria_id || null,
        id_usuario_asignado || null
      ]
    );

    const task = result.rows[0];

    // Log creation in history
    await client.query(
      `INSERT INTO tareas_historial (id_tarea, estado_nuevo, id_usuario, comentario)
       VALUES ($1, 'pendiente', $2, 'Tarea creada')`,
      [task.id_tarea, req.user.id]
    );

    await client.query('COMMIT');

    res.status(201).json({
      id: task.id_tarea,
      titulo: task.titulo,
      estado: task.estado,
      prioridad: task.prioridad,
      createdAt: task.created_at
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Create account task error:', error);
    res.status(500).json({ error: 'Failed to create task.' });
  } finally {
    client.release();
  }
};

/**
 * Update task for a specific account
 */
export const updateAccountTask = async (req, res) => {
  const client = await getClient();

  try {
    await client.query('BEGIN');

    const { accountId, taskId } = req.params;
    const {
      titulo,
      descripcion,
      fecha_vencimiento,
      estado,
      prioridad,
      categoria_id,
      id_usuario_asignado
    } = req.body;

    // Get current task state
    const currentTask = await client.query(
      'SELECT * FROM tareas WHERE id_tarea = $1 AND id_cuenta = $2',
      [taskId, accountId]
    );

    if (currentTask.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Task not found.' });
    }

    const oldEstado = currentTask.rows[0].estado;

    const result = await client.query(
      `UPDATE tareas
       SET titulo = COALESCE($1, titulo),
           descripcion = COALESCE($2, descripcion),
           fecha_fin = COALESCE($3, fecha_fin),
           estado = COALESCE($4, estado),
           prioridad = COALESCE($5, prioridad),
           id_categoria = COALESCE($6, id_categoria),
           id_usuario_asignado = COALESCE($7, id_usuario_asignado),
           updated_at = CURRENT_TIMESTAMP
       WHERE id_tarea = $8 AND id_cuenta = $9
       RETURNING *`,
      [titulo, descripcion, fecha_vencimiento, estado, prioridad, categoria_id, id_usuario_asignado, taskId, accountId]
    );

    const task = result.rows[0];

    // Log state change in history if estado changed
    if (estado && estado !== oldEstado) {
      await client.query(
        `INSERT INTO tareas_historial (id_tarea, estado_anterior, estado_nuevo, id_usuario)
         VALUES ($1, $2, $3, $4)`,
        [taskId, oldEstado, estado, req.user.id]
      );
    }

    await client.query('COMMIT');

    res.json({
      id: task.id_tarea,
      titulo: task.titulo,
      estado: task.estado,
      prioridad: task.prioridad,
      updatedAt: task.updated_at
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Update account task error:', error);
    res.status(500).json({ error: 'Failed to update task.' });
  } finally {
    client.release();
  }
};

/**
 * Delete task for a specific account
 */
export const deleteAccountTask = async (req, res) => {
  try {
    const { accountId, taskId } = req.params;

    const result = await query(
      'DELETE FROM tareas WHERE id_tarea = $1 AND id_cuenta = $2 RETURNING id_tarea',
      [taskId, accountId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found.' });
    }

    res.json({ message: 'Task deleted successfully.' });
  } catch (error) {
    console.error('Delete account task error:', error);
    res.status(500).json({ error: 'Failed to delete task.' });
  }
};
