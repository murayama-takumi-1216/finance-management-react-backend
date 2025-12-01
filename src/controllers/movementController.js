import { query, getClient } from '../config/database.js';
import { parsePagination, buildPaginationResponse, formatDate } from '../utils/helpers.js';
import { ESTADO_CONFIRMADO, ESTADO_PENDIENTE_REVISION } from '../utils/constants.js';

/**
 * Get all movements for an account
 */
export const getMovements = async (req, res) => {
  try {
    const { accountId } = req.params;
    const { page, limit, offset } = parsePagination(req.query);
    const { tipo, estado, categoria, fecha_desde, fecha_hasta, proveedor, search } = req.query;

    let whereClause = 'WHERE m.id_cuenta = $1';
    const params = [accountId];
    let paramIndex = 2;

    if (tipo) {
      whereClause += ` AND m.tipo = $${paramIndex}`;
      params.push(tipo);
      paramIndex++;
    }

    if (estado) {
      whereClause += ` AND m.estado = $${paramIndex}`;
      params.push(estado);
      paramIndex++;
    }

    if (categoria) {
      whereClause += ` AND m.id_categoria = $${paramIndex}`;
      params.push(categoria);
      paramIndex++;
    }

    if (fecha_desde) {
      whereClause += ` AND m.fecha_operacion >= $${paramIndex}`;
      params.push(fecha_desde);
      paramIndex++;
    }

    if (fecha_hasta) {
      whereClause += ` AND m.fecha_operacion <= $${paramIndex}`;
      params.push(fecha_hasta);
      paramIndex++;
    }

    if (proveedor) {
      whereClause += ` AND m.proveedor ILIKE $${paramIndex}`;
      params.push(`%${proveedor}%`);
      paramIndex++;
    }

    if (search) {
      whereClause += ` AND (m.descripcion ILIKE $${paramIndex} OR m.proveedor ILIKE $${paramIndex} OR m.notas ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    // Get total count
    const countResult = await query(
      `SELECT COUNT(*) FROM movimientos m ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].count);

    // Get movements with category
    const movementsResult = await query(
      `SELECT m.*, c.nombre as categoria_nombre, c.tipo as categoria_tipo
       FROM movimientos m
       LEFT JOIN categorias c ON m.id_categoria = c.id_categoria
       ${whereClause}
       ORDER BY m.fecha_operacion DESC, m.created_at DESC
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...params, limit, offset]
    );

    // Get tags for each movement
    const movementIds = movementsResult.rows.map(m => m.id_movimiento);
    let tagsMap = {};

    if (movementIds.length > 0) {
      const tagsResult = await query(
        `SELECT me.id_movimiento, e.id_etiqueta, e.nombre, e.color
         FROM movimiento_etiqueta me
         JOIN etiquetas e ON me.id_etiqueta = e.id_etiqueta
         WHERE me.id_movimiento = ANY($1)`,
        [movementIds]
      );

      tagsResult.rows.forEach(tag => {
        if (!tagsMap[tag.id_movimiento]) {
          tagsMap[tag.id_movimiento] = [];
        }
        tagsMap[tag.id_movimiento].push({
          id: tag.id_etiqueta,
          nombre: tag.nombre,
          color: tag.color
        });
      });
    }

    const movements = movementsResult.rows.map(m => ({
      id: m.id_movimiento,
      tipo: m.tipo,
      fechaOperacion: m.fecha_operacion,
      importe: parseFloat(m.importe),
      categoria: {
        id: m.id_categoria,
        nombre: m.categoria_nombre,
        tipo: m.categoria_tipo
      },
      proveedor: m.proveedor,
      descripcion: m.descripcion,
      notas: m.notas,
      origen: m.origen,
      estado: m.estado,
      etiquetas: tagsMap[m.id_movimiento] || [],
      createdAt: m.created_at,
      updatedAt: m.updated_at
    }));

    res.json(buildPaginationResponse(movements, total, page, limit));
  } catch (error) {
    console.error('Get movements error:', error);
    res.status(500).json({ error: 'Failed to get movements.' });
  }
};

/**
 * Get movement by ID
 */
export const getMovementById = async (req, res) => {
  try {
    const { accountId, movementId } = req.params;

    const result = await query(
      `SELECT m.*, c.nombre as categoria_nombre, c.tipo as categoria_tipo
       FROM movimientos m
       LEFT JOIN categorias c ON m.id_categoria = c.id_categoria
       WHERE m.id_movimiento = $1 AND m.id_cuenta = $2`,
      [movementId, accountId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Movement not found.' });
    }

    const m = result.rows[0];

    // Get tags
    const tagsResult = await query(
      `SELECT e.id_etiqueta, e.nombre, e.color
       FROM movimiento_etiqueta me
       JOIN etiquetas e ON me.id_etiqueta = e.id_etiqueta
       WHERE me.id_movimiento = $1`,
      [movementId]
    );

    // Get attached documents
    const docsResult = await query(
      `SELECT * FROM documentos_adjuntos WHERE id_movimiento = $1`,
      [movementId]
    );

    res.json({
      id: m.id_movimiento,
      idCuenta: m.id_cuenta,
      tipo: m.tipo,
      fechaOperacion: m.fecha_operacion,
      importe: parseFloat(m.importe),
      categoria: {
        id: m.id_categoria,
        nombre: m.categoria_nombre,
        tipo: m.categoria_tipo
      },
      proveedor: m.proveedor,
      descripcion: m.descripcion,
      notas: m.notas,
      origen: m.origen,
      estado: m.estado,
      etiquetas: tagsResult.rows.map(t => ({
        id: t.id_etiqueta,
        nombre: t.nombre,
        color: t.color
      })),
      documentos: docsResult.rows.map(d => ({
        id: d.id_documento,
        urlArchivo: d.url_archivo,
        nombreArchivo: d.nombre_archivo,
        tipoArchivo: d.tipo_archivo,
        origen: d.origen,
        tamano: d.tamano_bytes
      })),
      createdAt: m.created_at,
      updatedAt: m.updated_at
    });
  } catch (error) {
    console.error('Get movement by ID error:', error);
    res.status(500).json({ error: 'Failed to get movement.' });
  }
};

/**
 * Create a new movement
 */
export const createMovement = async (req, res) => {
  const client = await getClient();

  try {
    await client.query('BEGIN');

    const { accountId } = req.params;
    const {
      tipo,
      fecha_operacion,
      importe,
      id_categoria,
      proveedor,
      descripcion,
      notas,
      origen,
      estado,
      etiquetas
    } = req.body;

    // Validate category belongs to account or is global
    const categoryCheck = await client.query(
      'SELECT id_categoria FROM categorias WHERE id_categoria = $1 AND (id_cuenta = $2 OR es_global = TRUE)',
      [id_categoria, accountId]
    );

    if (categoryCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Invalid category for this account.' });
    }

    // Create movement
    const movementResult = await client.query(
      `INSERT INTO movimientos (id_cuenta, tipo, fecha_operacion, importe, id_categoria, proveedor, descripcion, notas, origen, estado)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        accountId,
        tipo,
        fecha_operacion,
        importe,
        id_categoria,
        proveedor || null,
        descripcion || null,
        notas || null,
        origen || 'manual',
        estado || ESTADO_CONFIRMADO
      ]
    );

    const movement = movementResult.rows[0];

    // Add tags if provided
    if (etiquetas && etiquetas.length > 0) {
      for (const tagId of etiquetas) {
        // Verify tag belongs to account
        const tagCheck = await client.query(
          'SELECT id_etiqueta FROM etiquetas WHERE id_etiqueta = $1 AND id_cuenta = $2',
          [tagId, accountId]
        );

        if (tagCheck.rows.length > 0) {
          await client.query(
            'INSERT INTO movimiento_etiqueta (id_movimiento, id_etiqueta) VALUES ($1, $2)',
            [movement.id_movimiento, tagId]
          );
        }
      }
    }

    await client.query('COMMIT');

    res.status(201).json({
      message: 'Movement created successfully',
      movement: {
        id: movement.id_movimiento,
        tipo: movement.tipo,
        fechaOperacion: movement.fecha_operacion,
        importe: parseFloat(movement.importe),
        idCategoria: movement.id_categoria,
        estado: movement.estado,
        createdAt: movement.created_at
      }
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Create movement error:', error);
    res.status(500).json({ error: 'Failed to create movement.' });
  } finally {
    client.release();
  }
};

/**
 * Update movement
 */
export const updateMovement = async (req, res) => {
  const client = await getClient();

  try {
    await client.query('BEGIN');

    const { accountId, movementId } = req.params;
    const {
      tipo,
      fecha_operacion,
      importe,
      id_categoria,
      proveedor,
      descripcion,
      notas,
      estado,
      etiquetas
    } = req.body;

    // Check if movement exists
    const existingMovement = await client.query(
      'SELECT id_movimiento FROM movimientos WHERE id_movimiento = $1 AND id_cuenta = $2',
      [movementId, accountId]
    );

    if (existingMovement.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Movement not found.' });
    }

    // If changing category, validate it
    if (id_categoria) {
      const categoryCheck = await client.query(
        'SELECT id_categoria FROM categorias WHERE id_categoria = $1 AND (id_cuenta = $2 OR es_global = TRUE)',
        [id_categoria, accountId]
      );

      if (categoryCheck.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Invalid category for this account.' });
      }
    }

    const result = await client.query(
      `UPDATE movimientos
       SET tipo = COALESCE($1, tipo),
           fecha_operacion = COALESCE($2, fecha_operacion),
           importe = COALESCE($3, importe),
           id_categoria = COALESCE($4, id_categoria),
           proveedor = COALESCE($5, proveedor),
           descripcion = COALESCE($6, descripcion),
           notas = COALESCE($7, notas),
           estado = COALESCE($8, estado),
           updated_at = CURRENT_TIMESTAMP
       WHERE id_movimiento = $9 AND id_cuenta = $10
       RETURNING *`,
      [tipo, fecha_operacion, importe, id_categoria, proveedor, descripcion, notas, estado, movementId, accountId]
    );

    // Update tags if provided
    if (etiquetas !== undefined) {
      // Remove existing tags
      await client.query(
        'DELETE FROM movimiento_etiqueta WHERE id_movimiento = $1',
        [movementId]
      );

      // Add new tags
      if (etiquetas && etiquetas.length > 0) {
        for (const tagId of etiquetas) {
          const tagCheck = await client.query(
            'SELECT id_etiqueta FROM etiquetas WHERE id_etiqueta = $1 AND id_cuenta = $2',
            [tagId, accountId]
          );

          if (tagCheck.rows.length > 0) {
            await client.query(
              'INSERT INTO movimiento_etiqueta (id_movimiento, id_etiqueta) VALUES ($1, $2)',
              [movementId, tagId]
            );
          }
        }
      }
    }

    await client.query('COMMIT');

    const movement = result.rows[0];

    res.json({
      message: 'Movement updated successfully',
      movement: {
        id: movement.id_movimiento,
        tipo: movement.tipo,
        fechaOperacion: movement.fecha_operacion,
        importe: parseFloat(movement.importe),
        idCategoria: movement.id_categoria,
        estado: movement.estado,
        updatedAt: movement.updated_at
      }
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Update movement error:', error);
    res.status(500).json({ error: 'Failed to update movement.' });
  } finally {
    client.release();
  }
};

/**
 * Delete movement
 */
export const deleteMovement = async (req, res) => {
  try {
    const { accountId, movementId } = req.params;

    const result = await query(
      'DELETE FROM movimientos WHERE id_movimiento = $1 AND id_cuenta = $2 RETURNING id_movimiento',
      [movementId, accountId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Movement not found.' });
    }

    res.json({ message: 'Movement deleted successfully.' });
  } catch (error) {
    console.error('Delete movement error:', error);
    res.status(500).json({ error: 'Failed to delete movement.' });
  }
};

/**
 * Confirm pending movement
 */
export const confirmMovement = async (req, res) => {
  try {
    const { accountId, movementId } = req.params;

    const result = await query(
      `UPDATE movimientos
       SET estado = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id_movimiento = $2 AND id_cuenta = $3 AND estado = $4
       RETURNING *`,
      [ESTADO_CONFIRMADO, movementId, accountId, ESTADO_PENDIENTE_REVISION]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Movement not found or already confirmed.' });
    }

    res.json({
      message: 'Movement confirmed successfully',
      movement: {
        id: result.rows[0].id_movimiento,
        estado: result.rows[0].estado
      }
    });
  } catch (error) {
    console.error('Confirm movement error:', error);
    res.status(500).json({ error: 'Failed to confirm movement.' });
  }
};

/**
 * Bulk create movements
 */
export const bulkCreateMovements = async (req, res) => {
  const client = await getClient();

  try {
    await client.query('BEGIN');

    const { accountId } = req.params;
    const { movements } = req.body;

    const createdMovements = [];

    for (const mov of movements) {
      // Validate category
      const categoryCheck = await client.query(
        'SELECT id_categoria FROM categorias WHERE id_categoria = $1 AND (id_cuenta = $2 OR es_global = TRUE)',
        [mov.id_categoria, accountId]
      );

      if (categoryCheck.rows.length === 0) {
        continue; // Skip invalid categories
      }

      const result = await client.query(
        `INSERT INTO movimientos (id_cuenta, tipo, fecha_operacion, importe, id_categoria, proveedor, descripcion, notas, origen, estado)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING id_movimiento`,
        [
          accountId,
          mov.tipo,
          mov.fecha_operacion,
          mov.importe,
          mov.id_categoria,
          mov.proveedor || null,
          mov.descripcion || null,
          mov.notas || null,
          mov.origen || 'manual',
          mov.estado || ESTADO_CONFIRMADO
        ]
      );

      createdMovements.push(result.rows[0].id_movimiento);
    }

    await client.query('COMMIT');

    res.status(201).json({
      message: `${createdMovements.length} movements created successfully`,
      count: createdMovements.length,
      ids: createdMovements
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Bulk create movements error:', error);
    res.status(500).json({ error: 'Failed to create movements.' });
  } finally {
    client.release();
  }
};
