import { query, getClient } from '../config/database.js';
import { parsePagination, buildPaginationResponse } from '../utils/helpers.js';

/**
 * Get all calendar events for the current user
 */
export const getEvents = async (req, res) => {
  try {
    const { page, limit, offset } = parsePagination(req.query);
    const { tipo, id_cuenta, fecha_desde, fecha_hasta, recurrencia } = req.query;

    let whereClause = 'WHERE e.id_usuario = $1';
    const params = [req.user.id];
    let paramIndex = 2;

    if (tipo) {
      whereClause += ` AND e.tipo = $${paramIndex}`;
      params.push(tipo);
      paramIndex++;
    }

    if (id_cuenta) {
      whereClause += ` AND e.id_cuenta = $${paramIndex}`;
      params.push(id_cuenta);
      paramIndex++;
    }

    if (fecha_desde) {
      whereClause += ` AND e.fecha_hora_inicio >= $${paramIndex}`;
      params.push(fecha_desde);
      paramIndex++;
    }

    if (fecha_hasta) {
      whereClause += ` AND e.fecha_hora_inicio <= $${paramIndex}`;
      params.push(fecha_hasta);
      paramIndex++;
    }

    if (recurrencia) {
      whereClause += ` AND e.recurrencia = $${paramIndex}`;
      params.push(recurrencia);
      paramIndex++;
    }

    // Get total count
    const countResult = await query(
      `SELECT COUNT(*) FROM eventos_calendario e ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].count);

    // Get events
    const eventsResult = await query(
      `SELECT e.*,
              c.nombre as cuenta_nombre,
              m.importe as movimiento_importe,
              m.tipo as movimiento_tipo
       FROM eventos_calendario e
       LEFT JOIN cuentas c ON e.id_cuenta = c.id_cuenta
       LEFT JOIN movimientos m ON e.id_movimiento_asociado = m.id_movimiento
       ${whereClause}
       ORDER BY e.fecha_hora_inicio ASC
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...params, limit, offset]
    );

    const events = eventsResult.rows.map(e => ({
      id: e.id_evento,
      titulo: e.titulo,
      descripcion: e.descripcion,
      fechaHoraInicio: e.fecha_hora_inicio,
      fechaHoraFin: e.fecha_hora_fin,
      tipo: e.tipo,
      recurrencia: e.recurrencia,
      recurrenciaConfig: e.recurrencia_config,
      cuenta: e.id_cuenta ? {
        id: e.id_cuenta,
        nombre: e.cuenta_nombre
      } : null,
      movimientoAsociado: e.id_movimiento_asociado ? {
        id: e.id_movimiento_asociado,
        importe: parseFloat(e.movimiento_importe),
        tipo: e.movimiento_tipo
      } : null,
      createdAt: e.created_at,
      updatedAt: e.updated_at
    }));

    res.json(buildPaginationResponse(events, total, page, limit));
  } catch (error) {
    console.error('Get events error:', error);
    res.status(500).json({ error: 'Failed to get events.' });
  }
};

/**
 * Get event by ID
 */
export const getEventById = async (req, res) => {
  try {
    const { eventId } = req.params;

    const result = await query(
      `SELECT e.*,
              c.nombre as cuenta_nombre,
              m.importe as movimiento_importe,
              m.tipo as movimiento_tipo,
              m.descripcion as movimiento_descripcion
       FROM eventos_calendario e
       LEFT JOIN cuentas c ON e.id_cuenta = c.id_cuenta
       LEFT JOIN movimientos m ON e.id_movimiento_asociado = m.id_movimiento
       WHERE e.id_evento = $1 AND e.id_usuario = $2`,
      [eventId, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Event not found.' });
    }

    const e = result.rows[0];

    // Get reminders for this event
    const remindersResult = await query(
      'SELECT * FROM recordatorios WHERE id_evento = $1 ORDER BY minutos_antes ASC',
      [eventId]
    );

    res.json({
      id: e.id_evento,
      titulo: e.titulo,
      descripcion: e.descripcion,
      fechaHoraInicio: e.fecha_hora_inicio,
      fechaHoraFin: e.fecha_hora_fin,
      tipo: e.tipo,
      recurrencia: e.recurrencia,
      recurrenciaConfig: e.recurrencia_config,
      cuenta: e.id_cuenta ? {
        id: e.id_cuenta,
        nombre: e.cuenta_nombre
      } : null,
      movimientoAsociado: e.id_movimiento_asociado ? {
        id: e.id_movimiento_asociado,
        importe: parseFloat(e.movimiento_importe),
        tipo: e.movimiento_tipo,
        descripcion: e.movimiento_descripcion
      } : null,
      recordatorios: remindersResult.rows.map(r => ({
        id: r.id_recordatorio,
        minutosAntes: r.minutos_antes,
        canal: r.canal,
        activo: r.activo,
        enviado: r.enviado,
        fechaEnvio: r.fecha_envio
      })),
      createdAt: e.created_at,
      updatedAt: e.updated_at
    });
  } catch (error) {
    console.error('Get event by ID error:', error);
    res.status(500).json({ error: 'Failed to get event.' });
  }
};

/**
 * Create event
 */
export const createEvent = async (req, res) => {
  const client = await getClient();

  try {
    await client.query('BEGIN');

    const {
      titulo,
      descripcion,
      fecha_hora_inicio,
      fecha_hora_fin,
      tipo,
      id_cuenta,
      id_movimiento_asociado,
      recurrencia,
      recurrencia_config,
      recordatorios
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

    // If movement is provided, verify it belongs to the account
    if (id_movimiento_asociado && id_cuenta) {
      const movCheck = await client.query(
        'SELECT id_movimiento FROM movimientos WHERE id_movimiento = $1 AND id_cuenta = $2',
        [id_movimiento_asociado, id_cuenta]
      );

      if (movCheck.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Movement does not belong to this account.' });
      }
    }

    const result = await client.query(
      `INSERT INTO eventos_calendario
       (id_usuario, id_cuenta, titulo, descripcion, fecha_hora_inicio, fecha_hora_fin, tipo, id_movimiento_asociado, recurrencia, recurrencia_config)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        req.user.id,
        id_cuenta || null,
        titulo,
        descripcion || null,
        fecha_hora_inicio,
        fecha_hora_fin || null,
        tipo,
        id_movimiento_asociado || null,
        recurrencia || 'ninguna',
        recurrencia_config ? JSON.stringify(recurrencia_config) : null
      ]
    );

    const event = result.rows[0];

    // Create reminders if provided
    if (recordatorios && recordatorios.length > 0) {
      for (const reminder of recordatorios) {
        await client.query(
          `INSERT INTO recordatorios (id_evento, minutos_antes, canal, activo)
           VALUES ($1, $2, $3, $4)`,
          [
            event.id_evento,
            reminder.minutos_antes || 60,
            reminder.canal || 'notificacion_app',
            reminder.activo !== false
          ]
        );
      }
    }

    await client.query('COMMIT');

    res.status(201).json({
      message: 'Event created successfully',
      event: {
        id: event.id_evento,
        titulo: event.titulo,
        fechaHoraInicio: event.fecha_hora_inicio,
        tipo: event.tipo,
        recurrencia: event.recurrencia,
        createdAt: event.created_at
      }
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Create event error:', error);
    res.status(500).json({ error: 'Failed to create event.' });
  } finally {
    client.release();
  }
};

/**
 * Update event
 */
export const updateEvent = async (req, res) => {
  const client = await getClient();

  try {
    await client.query('BEGIN');

    const { eventId } = req.params;
    const {
      titulo,
      descripcion,
      fecha_hora_inicio,
      fecha_hora_fin,
      tipo,
      id_movimiento_asociado,
      recurrencia,
      recurrencia_config
    } = req.body;

    // Check if event exists and belongs to user
    const existingEvent = await client.query(
      'SELECT id_evento, id_cuenta FROM eventos_calendario WHERE id_evento = $1 AND id_usuario = $2',
      [eventId, req.user.id]
    );

    if (existingEvent.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Event not found.' });
    }

    const result = await client.query(
      `UPDATE eventos_calendario
       SET titulo = COALESCE($1, titulo),
           descripcion = COALESCE($2, descripcion),
           fecha_hora_inicio = COALESCE($3, fecha_hora_inicio),
           fecha_hora_fin = COALESCE($4, fecha_hora_fin),
           tipo = COALESCE($5, tipo),
           id_movimiento_asociado = COALESCE($6, id_movimiento_asociado),
           recurrencia = COALESCE($7, recurrencia),
           recurrencia_config = COALESCE($8, recurrencia_config),
           updated_at = CURRENT_TIMESTAMP
       WHERE id_evento = $9 AND id_usuario = $10
       RETURNING *`,
      [
        titulo,
        descripcion,
        fecha_hora_inicio,
        fecha_hora_fin,
        tipo,
        id_movimiento_asociado,
        recurrencia,
        recurrencia_config ? JSON.stringify(recurrencia_config) : null,
        eventId,
        req.user.id
      ]
    );

    await client.query('COMMIT');

    const event = result.rows[0];

    res.json({
      message: 'Event updated successfully',
      event: {
        id: event.id_evento,
        titulo: event.titulo,
        fechaHoraInicio: event.fecha_hora_inicio,
        tipo: event.tipo,
        recurrencia: event.recurrencia,
        updatedAt: event.updated_at
      }
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Update event error:', error);
    res.status(500).json({ error: 'Failed to update event.' });
  } finally {
    client.release();
  }
};

/**
 * Delete event
 */
export const deleteEvent = async (req, res) => {
  try {
    const { eventId } = req.params;

    const result = await query(
      'DELETE FROM eventos_calendario WHERE id_evento = $1 AND id_usuario = $2 RETURNING id_evento',
      [eventId, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Event not found.' });
    }

    res.json({ message: 'Event deleted successfully.' });
  } catch (error) {
    console.error('Delete event error:', error);
    res.status(500).json({ error: 'Failed to delete event.' });
  }
};

/**
 * Get events for a specific date range (for calendar view)
 */
export const getEventsByDateRange = async (req, res) => {
  try {
    const { fecha_inicio, fecha_fin } = req.query;

    if (!fecha_inicio || !fecha_fin) {
      return res.status(400).json({ error: 'Start and end dates are required.' });
    }

    const result = await query(
      `SELECT e.*,
              c.nombre as cuenta_nombre
       FROM eventos_calendario e
       LEFT JOIN cuentas c ON e.id_cuenta = c.id_cuenta
       WHERE e.id_usuario = $1
         AND e.fecha_hora_inicio >= $2
         AND e.fecha_hora_inicio <= $3
       ORDER BY e.fecha_hora_inicio ASC`,
      [req.user.id, fecha_inicio, fecha_fin]
    );

    const events = result.rows.map(e => ({
      id: e.id_evento,
      titulo: e.titulo,
      descripcion: e.descripcion,
      fechaHoraInicio: e.fecha_hora_inicio,
      fechaHoraFin: e.fecha_hora_fin,
      tipo: e.tipo,
      recurrencia: e.recurrencia,
      cuenta: e.id_cuenta ? {
        id: e.id_cuenta,
        nombre: e.cuenta_nombre
      } : null
    }));

    res.json({ events });
  } catch (error) {
    console.error('Get events by date range error:', error);
    res.status(500).json({ error: 'Failed to get events.' });
  }
};

/**
 * Get upcoming events (for dashboard)
 */
export const getUpcomingEvents = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 5;

    const result = await query(
      `SELECT e.*,
              c.nombre as cuenta_nombre
       FROM eventos_calendario e
       LEFT JOIN cuentas c ON e.id_cuenta = c.id_cuenta
       WHERE e.id_usuario = $1
         AND e.fecha_hora_inicio >= CURRENT_TIMESTAMP
       ORDER BY e.fecha_hora_inicio ASC
       LIMIT $2`,
      [req.user.id, limit]
    );

    const events = result.rows.map(e => ({
      id: e.id_evento,
      titulo: e.titulo,
      fechaHoraInicio: e.fecha_hora_inicio,
      tipo: e.tipo,
      cuenta: e.id_cuenta ? {
        id: e.id_cuenta,
        nombre: e.cuenta_nombre
      } : null
    }));

    res.json({ events });
  } catch (error) {
    console.error('Get upcoming events error:', error);
    res.status(500).json({ error: 'Failed to get upcoming events.' });
  }
};

// ================== REMINDERS ==================

/**
 * Get reminders for an event
 */
export const getReminders = async (req, res) => {
  try {
    const { eventId } = req.params;

    // Verify event belongs to user
    const eventCheck = await query(
      'SELECT id_evento FROM eventos_calendario WHERE id_evento = $1 AND id_usuario = $2',
      [eventId, req.user.id]
    );

    if (eventCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Event not found.' });
    }

    const result = await query(
      'SELECT * FROM recordatorios WHERE id_evento = $1 ORDER BY minutos_antes ASC',
      [eventId]
    );

    const reminders = result.rows.map(r => ({
      id: r.id_recordatorio,
      minutosAntes: r.minutos_antes,
      canal: r.canal,
      activo: r.activo,
      enviado: r.enviado,
      fechaEnvio: r.fecha_envio,
      createdAt: r.created_at
    }));

    res.json({ reminders });
  } catch (error) {
    console.error('Get reminders error:', error);
    res.status(500).json({ error: 'Failed to get reminders.' });
  }
};

/**
 * Add reminder to event
 */
export const addReminder = async (req, res) => {
  try {
    const { eventId } = req.params;
    const { minutos_antes, canal } = req.body;

    // Verify event belongs to user
    const eventCheck = await query(
      'SELECT id_evento FROM eventos_calendario WHERE id_evento = $1 AND id_usuario = $2',
      [eventId, req.user.id]
    );

    if (eventCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Event not found.' });
    }

    const result = await query(
      `INSERT INTO recordatorios (id_evento, minutos_antes, canal, activo)
       VALUES ($1, $2, $3, TRUE)
       RETURNING *`,
      [eventId, minutos_antes || 60, canal || 'notificacion_app']
    );

    const reminder = result.rows[0];

    res.status(201).json({
      message: 'Reminder added successfully',
      reminder: {
        id: reminder.id_recordatorio,
        minutosAntes: reminder.minutos_antes,
        canal: reminder.canal,
        activo: reminder.activo
      }
    });
  } catch (error) {
    console.error('Add reminder error:', error);
    res.status(500).json({ error: 'Failed to add reminder.' });
  }
};

/**
 * Update reminder
 */
export const updateReminder = async (req, res) => {
  try {
    const { eventId, reminderId } = req.params;
    const { minutos_antes, canal, activo } = req.body;

    // Verify event belongs to user
    const eventCheck = await query(
      'SELECT id_evento FROM eventos_calendario WHERE id_evento = $1 AND id_usuario = $2',
      [eventId, req.user.id]
    );

    if (eventCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Event not found.' });
    }

    const result = await query(
      `UPDATE recordatorios
       SET minutos_antes = COALESCE($1, minutos_antes),
           canal = COALESCE($2, canal),
           activo = COALESCE($3, activo)
       WHERE id_recordatorio = $4 AND id_evento = $5
       RETURNING *`,
      [minutos_antes, canal, activo, reminderId, eventId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Reminder not found.' });
    }

    const reminder = result.rows[0];

    res.json({
      message: 'Reminder updated successfully',
      reminder: {
        id: reminder.id_recordatorio,
        minutosAntes: reminder.minutos_antes,
        canal: reminder.canal,
        activo: reminder.activo
      }
    });
  } catch (error) {
    console.error('Update reminder error:', error);
    res.status(500).json({ error: 'Failed to update reminder.' });
  }
};

/**
 * Delete reminder
 */
export const deleteReminder = async (req, res) => {
  try {
    const { eventId, reminderId } = req.params;

    // Verify event belongs to user
    const eventCheck = await query(
      'SELECT id_evento FROM eventos_calendario WHERE id_evento = $1 AND id_usuario = $2',
      [eventId, req.user.id]
    );

    if (eventCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Event not found.' });
    }

    const result = await query(
      'DELETE FROM recordatorios WHERE id_recordatorio = $1 AND id_evento = $2 RETURNING id_recordatorio',
      [reminderId, eventId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Reminder not found.' });
    }

    res.json({ message: 'Reminder deleted successfully.' });
  } catch (error) {
    console.error('Delete reminder error:', error);
    res.status(500).json({ error: 'Failed to delete reminder.' });
  }
};

/**
 * Get pending reminders (for notification scheduler)
 */
export const getPendingReminders = async (req, res) => {
  try {
    // Only admin can access this
    if (!req.user.isAdmin) {
      return res.status(403).json({ error: 'Admin access required.' });
    }

    const result = await query(
      `SELECT r.*, e.titulo as evento_titulo, e.fecha_hora_inicio, e.id_usuario,
              u.email as usuario_email, u.nombre as usuario_nombre
       FROM recordatorios r
       JOIN eventos_calendario e ON r.id_evento = e.id_evento
       JOIN usuarios u ON e.id_usuario = u.id_usuario
       WHERE r.activo = TRUE
         AND r.enviado = FALSE
         AND e.fecha_hora_inicio - (r.minutos_antes * INTERVAL '1 minute') <= CURRENT_TIMESTAMP
         AND e.fecha_hora_inicio >= CURRENT_TIMESTAMP
       ORDER BY e.fecha_hora_inicio ASC`
    );

    const reminders = result.rows.map(r => ({
      id: r.id_recordatorio,
      evento: {
        id: r.id_evento,
        titulo: r.evento_titulo,
        fechaHoraInicio: r.fecha_hora_inicio
      },
      usuario: {
        id: r.id_usuario,
        nombre: r.usuario_nombre,
        email: r.usuario_email
      },
      minutosAntes: r.minutos_antes,
      canal: r.canal
    }));

    res.json({ reminders });
  } catch (error) {
    console.error('Get pending reminders error:', error);
    res.status(500).json({ error: 'Failed to get pending reminders.' });
  }
};

/**
 * Mark reminder as sent
 */
export const markReminderSent = async (req, res) => {
  try {
    // Only admin can access this
    if (!req.user.isAdmin) {
      return res.status(403).json({ error: 'Admin access required.' });
    }

    const { reminderId } = req.params;

    const result = await query(
      `UPDATE recordatorios
       SET enviado = TRUE, fecha_envio = CURRENT_TIMESTAMP
       WHERE id_recordatorio = $1
       RETURNING id_recordatorio`,
      [reminderId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Reminder not found.' });
    }

    res.json({ message: 'Reminder marked as sent.' });
  } catch (error) {
    console.error('Mark reminder sent error:', error);
    res.status(500).json({ error: 'Failed to mark reminder as sent.' });
  }
};

// ================== CALENDAR INTEGRATIONS ==================

/**
 * Get calendar integrations for user
 */
export const getIntegrations = async (req, res) => {
  try {
    const result = await query(
      'SELECT * FROM integraciones_calendario WHERE id_usuario = $1 ORDER BY tipo',
      [req.user.id]
    );

    const integrations = result.rows.map(i => ({
      id: i.id_integracion,
      tipo: i.tipo,
      activa: i.activa,
      configuracion: i.configuracion,
      createdAt: i.created_at,
      updatedAt: i.updated_at
    }));

    res.json({ integrations });
  } catch (error) {
    console.error('Get integrations error:', error);
    res.status(500).json({ error: 'Failed to get integrations.' });
  }
};

/**
 * Create or update calendar integration
 */
export const upsertIntegration = async (req, res) => {
  try {
    const { tipo, token_oauth, refresh_token, token_expiry, configuracion, activa } = req.body;

    const result = await query(
      `INSERT INTO integraciones_calendario
       (id_usuario, tipo, token_oauth, refresh_token, token_expiry, configuracion, activa)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (id_usuario, tipo)
       DO UPDATE SET
         token_oauth = COALESCE($3, integraciones_calendario.token_oauth),
         refresh_token = COALESCE($4, integraciones_calendario.refresh_token),
         token_expiry = COALESCE($5, integraciones_calendario.token_expiry),
         configuracion = COALESCE($6, integraciones_calendario.configuracion),
         activa = COALESCE($7, integraciones_calendario.activa),
         updated_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [
        req.user.id,
        tipo,
        token_oauth || null,
        refresh_token || null,
        token_expiry || null,
        configuracion ? JSON.stringify(configuracion) : null,
        activa !== false
      ]
    );

    const integration = result.rows[0];

    res.json({
      message: 'Integration saved successfully',
      integration: {
        id: integration.id_integracion,
        tipo: integration.tipo,
        activa: integration.activa,
        configuracion: integration.configuracion
      }
    });
  } catch (error) {
    console.error('Upsert integration error:', error);
    res.status(500).json({ error: 'Failed to save integration.' });
  }
};

/**
 * Delete calendar integration
 */
export const deleteIntegration = async (req, res) => {
  try {
    const { integrationType } = req.params;

    const result = await query(
      'DELETE FROM integraciones_calendario WHERE id_usuario = $1 AND tipo = $2 RETURNING id_integracion',
      [req.user.id, integrationType]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Integration not found.' });
    }

    res.json({ message: 'Integration deleted successfully.' });
  } catch (error) {
    console.error('Delete integration error:', error);
    res.status(500).json({ error: 'Failed to delete integration.' });
  }
};

// ================== ACCOUNT-SCOPED EVENTS ==================

/**
 * Get events for a specific account
 */
export const getAccountEvents = async (req, res) => {
  try {
    const { accountId } = req.params;
    const { start, end } = req.query;

    let whereClause = 'WHERE e.id_cuenta = $1';
    const params = [accountId];
    let paramIndex = 2;

    if (start) {
      whereClause += ` AND DATE(e.fecha_hora_inicio) >= $${paramIndex}`;
      params.push(start);
      paramIndex++;
    }

    if (end) {
      whereClause += ` AND DATE(e.fecha_hora_inicio) <= $${paramIndex}`;
      params.push(end);
      paramIndex++;
    }

    const result = await query(
      `SELECT e.*, cat.nombre as categoria_nombre
       FROM eventos_calendario e
       LEFT JOIN categorias cat ON e.id_categoria = cat.id_categoria
       ${whereClause}
       ORDER BY e.fecha_hora_inicio ASC`,
      params
    );

    const events = result.rows.map(e => ({
      id: e.id_evento,
      titulo: e.titulo,
      descripcion: e.descripcion,
      fecha: e.fecha_hora_inicio,
      fechaFin: e.fecha_hora_fin,
      tipo: e.tipo,
      monto: e.monto ? parseFloat(e.monto) : null,
      recurrencia: e.recurrencia,
      categoriaId: e.id_categoria,
      categoria: e.categoria_nombre ? { id: e.id_categoria, nombre: e.categoria_nombre } : null,
      createdAt: e.created_at
    }));

    res.json(events);
  } catch (error) {
    console.error('Get account events error:', error);
    res.status(500).json({ error: 'Failed to get events.' });
  }
};

/**
 * Create event for a specific account
 */
export const createAccountEvent = async (req, res) => {
  try {
    const { accountId } = req.params;
    const {
      titulo,
      descripcion,
      fecha_hora_inicio,
      tipo,
      monto,
      recurrencia,
      categoria_id
    } = req.body;

    // Use provided tipo, or derive from recurrencia
    const eventType = tipo || (recurrencia && recurrencia !== 'ninguna' ? 'pago_recurrente' : 'pago_unico');

    const result = await query(
      `INSERT INTO eventos_calendario
       (id_usuario, id_cuenta, titulo, descripcion, fecha_hora_inicio, tipo, monto, recurrencia, id_categoria)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        req.user.id,
        accountId,
        titulo,
        descripcion || null,
        fecha_hora_inicio,
        eventType,
        monto || null,
        recurrencia || 'ninguna',
        categoria_id || null
      ]
    );

    const event = result.rows[0];

    res.status(201).json({
      id: event.id_evento,
      titulo: event.titulo,
      fecha: event.fecha_hora_inicio,
      tipo: event.tipo,
      recurrencia: event.recurrencia,
      createdAt: event.created_at
    });
  } catch (error) {
    console.error('Create account event error:', error);
    res.status(500).json({ error: 'Failed to create event.' });
  }
};

/**
 * Update event for a specific account
 */
export const updateAccountEvent = async (req, res) => {
  try {
    const { accountId, eventId } = req.params;
    const {
      titulo,
      descripcion,
      fecha_hora_inicio,
      tipo,
      monto,
      recurrencia,
      categoria_id
    } = req.body;

    const result = await query(
      `UPDATE eventos_calendario
       SET titulo = COALESCE($1, titulo),
           descripcion = COALESCE($2, descripcion),
           fecha_hora_inicio = COALESCE($3, fecha_hora_inicio),
           tipo = COALESCE($4, tipo),
           monto = COALESCE($5, monto),
           recurrencia = COALESCE($6, recurrencia),
           id_categoria = COALESCE($7, id_categoria),
           updated_at = CURRENT_TIMESTAMP
       WHERE id_evento = $8 AND id_cuenta = $9
       RETURNING *`,
      [titulo, descripcion, fecha_hora_inicio, tipo, monto, recurrencia, categoria_id, eventId, accountId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Event not found.' });
    }

    const event = result.rows[0];

    res.json({
      id: event.id_evento,
      titulo: event.titulo,
      fecha: event.fecha_hora_inicio,
      tipo: event.tipo,
      recurrencia: event.recurrencia,
      updatedAt: event.updated_at
    });
  } catch (error) {
    console.error('Update account event error:', error);
    res.status(500).json({ error: 'Failed to update event.' });
  }
};

/**
 * Delete event for a specific account
 */
export const deleteAccountEvent = async (req, res) => {
  try {
    const { accountId, eventId } = req.params;

    const result = await query(
      'DELETE FROM eventos_calendario WHERE id_evento = $1 AND id_cuenta = $2 RETURNING id_evento',
      [eventId, accountId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Event not found.' });
    }

    res.json({ message: 'Event deleted successfully.' });
  } catch (error) {
    console.error('Delete account event error:', error);
    res.status(500).json({ error: 'Failed to delete event.' });
  }
};

// ================== ACCOUNT-SCOPED REMINDERS ==================

/**
 * Get reminders for a specific account (standalone reminders not tied to events)
 */
export const getAccountReminders = async (req, res) => {
  try {
    const { accountId } = req.params;

    const result = await query(
      `SELECT r.*, e.titulo as evento_titulo
       FROM recordatorios r
       JOIN eventos_calendario e ON r.id_evento = e.id_evento
       WHERE e.id_cuenta = $1 AND r.enviado = FALSE
       ORDER BY r.fecha_recordatorio ASC`,
      [accountId]
    );

    const reminders = result.rows.map(r => ({
      id: r.id_recordatorio,
      mensaje: r.mensaje || r.evento_titulo,
      fechaRecordatorio: r.fecha_recordatorio,
      minutosAntes: r.minutos_antes,
      canal: r.canal,
      activo: r.activo,
      enviado: r.enviado,
      evento: { id: r.id_evento, titulo: r.evento_titulo },
      createdAt: r.created_at
    }));

    res.json(reminders);
  } catch (error) {
    console.error('Get account reminders error:', error);
    res.status(500).json({ error: 'Failed to get reminders.' });
  }
};

/**
 * Create reminder for a specific account
 */
export const createAccountReminder = async (req, res) => {
  try {
    const { accountId } = req.params;
    const { mensaje, fecha_recordatorio, minutos_antes, id_evento } = req.body;

    // If no event is specified, create a generic reminder event first
    let eventId = id_evento;

    if (!eventId) {
      const eventResult = await query(
        `INSERT INTO eventos_calendario
         (id_usuario, id_cuenta, titulo, fecha_hora_inicio, tipo)
         VALUES ($1, $2, $3, $4, 'recordatorio_generico')
         RETURNING id_evento`,
        [req.user.id, accountId, mensaje, fecha_recordatorio]
      );
      eventId = eventResult.rows[0].id_evento;
    }

    const result = await query(
      `INSERT INTO recordatorios (id_evento, minutos_antes, canal, activo, mensaje, fecha_recordatorio)
       VALUES ($1, $2, 'notificacion_app', TRUE, $3, $4)
       RETURNING *`,
      [eventId, minutos_antes || 0, mensaje, fecha_recordatorio]
    );

    const reminder = result.rows[0];

    res.status(201).json({
      id: reminder.id_recordatorio,
      mensaje: mensaje,
      fechaRecordatorio: reminder.fecha_recordatorio,
      createdAt: reminder.created_at
    });
  } catch (error) {
    console.error('Create account reminder error:', error);
    res.status(500).json({ error: 'Failed to create reminder.' });
  }
};

/**
 * Delete reminder for a specific account
 */
export const deleteAccountReminder = async (req, res) => {
  try {
    const { accountId, reminderId } = req.params;

    // Verify the reminder belongs to an event in this account
    const result = await query(
      `DELETE FROM recordatorios r
       USING eventos_calendario e
       WHERE r.id_recordatorio = $1 AND r.id_evento = e.id_evento AND e.id_cuenta = $2
       RETURNING r.id_recordatorio`,
      [reminderId, accountId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Reminder not found.' });
    }

    res.json({ message: 'Reminder deleted successfully.' });
  } catch (error) {
    console.error('Delete account reminder error:', error);
    res.status(500).json({ error: 'Failed to delete reminder.' });
  }
};

/**
 * Create payment event from movement (when a recurring payment is registered)
 */
export const createPaymentEvent = async (req, res) => {
  const client = await getClient();

  try {
    await client.query('BEGIN');

    const { accountId } = req.params;
    const {
      id_movimiento,
      titulo,
      descripcion,
      fecha_hora_inicio,
      recurrencia,
      recurrencia_config,
      recordatorios
    } = req.body;

    // Verify user has access to account
    const accessCheck = await client.query(
      'SELECT id FROM usuario_cuenta WHERE id_cuenta = $1 AND id_usuario = $2',
      [accountId, req.user.id]
    );

    if (accessCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Access denied to this account.' });
    }

    // Verify movement exists and belongs to account
    if (id_movimiento) {
      const movCheck = await client.query(
        'SELECT id_movimiento FROM movimientos WHERE id_movimiento = $1 AND id_cuenta = $2',
        [id_movimiento, accountId]
      );

      if (movCheck.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Movement not found.' });
      }
    }

    // Determine event type based on recurrence
    const tipo = recurrencia && recurrencia !== 'ninguna' ? 'pago_recurrente' : 'pago_unico';

    const result = await client.query(
      `INSERT INTO eventos_calendario
       (id_usuario, id_cuenta, titulo, descripcion, fecha_hora_inicio, tipo, id_movimiento_asociado, recurrencia, recurrencia_config)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        req.user.id,
        accountId,
        titulo,
        descripcion || null,
        fecha_hora_inicio,
        tipo,
        id_movimiento || null,
        recurrencia || 'ninguna',
        recurrencia_config ? JSON.stringify(recurrencia_config) : null
      ]
    );

    const event = result.rows[0];

    // Create reminders if provided
    if (recordatorios && recordatorios.length > 0) {
      for (const reminder of recordatorios) {
        await client.query(
          `INSERT INTO recordatorios (id_evento, minutos_antes, canal, activo)
           VALUES ($1, $2, $3, $4)`,
          [
            event.id_evento,
            reminder.minutos_antes || 1440, // Default 1 day before
            reminder.canal || 'notificacion_app',
            reminder.activo !== false
          ]
        );
      }
    } else {
      // Create default reminder (1 day before)
      await client.query(
        `INSERT INTO recordatorios (id_evento, minutos_antes, canal, activo)
         VALUES ($1, 1440, 'notificacion_app', TRUE)`,
        [event.id_evento]
      );
    }

    await client.query('COMMIT');

    res.status(201).json({
      message: 'Payment event created successfully',
      event: {
        id: event.id_evento,
        titulo: event.titulo,
        fechaHoraInicio: event.fecha_hora_inicio,
        tipo: event.tipo,
        recurrencia: event.recurrencia,
        createdAt: event.created_at
      }
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Create payment event error:', error);
    res.status(500).json({ error: 'Failed to create payment event.' });
  } finally {
    client.release();
  }
};
