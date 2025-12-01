import { query } from '../config/database.js';

/**
 * Get all tags for an account
 */
export const getTags = async (req, res) => {
  try {
    const { accountId } = req.params;

    const result = await query(
      `SELECT e.*, COUNT(me.id_movimiento) as uso_count
       FROM etiquetas e
       LEFT JOIN movimiento_etiqueta me ON e.id_etiqueta = me.id_etiqueta
       WHERE e.id_cuenta = $1
       GROUP BY e.id_etiqueta
       ORDER BY e.nombre`,
      [accountId]
    );

    const tags = result.rows.map(t => ({
      id: t.id_etiqueta,
      nombre: t.nombre,
      color: t.color,
      usoCount: parseInt(t.uso_count),
      createdAt: t.created_at
    }));

    res.json({ tags });
  } catch (error) {
    console.error('Get tags error:', error);
    res.status(500).json({ error: 'Failed to get tags.' });
  }
};

/**
 * Get tag by ID
 */
export const getTagById = async (req, res) => {
  try {
    const { accountId, tagId } = req.params;

    const result = await query(
      `SELECT e.*, COUNT(me.id_movimiento) as uso_count
       FROM etiquetas e
       LEFT JOIN movimiento_etiqueta me ON e.id_etiqueta = me.id_etiqueta
       WHERE e.id_etiqueta = $1 AND e.id_cuenta = $2
       GROUP BY e.id_etiqueta`,
      [tagId, accountId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Tag not found.' });
    }

    const tag = result.rows[0];

    res.json({
      id: tag.id_etiqueta,
      nombre: tag.nombre,
      color: tag.color,
      usoCount: parseInt(tag.uso_count),
      createdAt: tag.created_at
    });
  } catch (error) {
    console.error('Get tag by ID error:', error);
    res.status(500).json({ error: 'Failed to get tag.' });
  }
};

/**
 * Create tag
 */
export const createTag = async (req, res) => {
  try {
    const { accountId } = req.params;
    const { nombre, color } = req.body;

    // Check if tag with same name exists
    const existing = await query(
      'SELECT id_etiqueta FROM etiquetas WHERE nombre ILIKE $1 AND id_cuenta = $2',
      [nombre, accountId]
    );

    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'Tag with this name already exists.' });
    }

    const result = await query(
      `INSERT INTO etiquetas (id_cuenta, nombre, color)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [accountId, nombre, color || '#3B82F6']
    );

    const tag = result.rows[0];

    res.status(201).json({
      message: 'Tag created successfully',
      tag: {
        id: tag.id_etiqueta,
        nombre: tag.nombre,
        color: tag.color,
        createdAt: tag.created_at
      }
    });
  } catch (error) {
    console.error('Create tag error:', error);
    res.status(500).json({ error: 'Failed to create tag.' });
  }
};

/**
 * Update tag
 */
export const updateTag = async (req, res) => {
  try {
    const { accountId, tagId } = req.params;
    const { nombre, color } = req.body;

    // Check if new name conflicts with existing
    if (nombre) {
      const existing = await query(
        'SELECT id_etiqueta FROM etiquetas WHERE nombre ILIKE $1 AND id_cuenta = $2 AND id_etiqueta != $3',
        [nombre, accountId, tagId]
      );

      if (existing.rows.length > 0) {
        return res.status(400).json({ error: 'Tag with this name already exists.' });
      }
    }

    const result = await query(
      `UPDATE etiquetas
       SET nombre = COALESCE($1, nombre),
           color = COALESCE($2, color)
       WHERE id_etiqueta = $3 AND id_cuenta = $4
       RETURNING *`,
      [nombre, color, tagId, accountId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Tag not found.' });
    }

    const tag = result.rows[0];

    res.json({
      message: 'Tag updated successfully',
      tag: {
        id: tag.id_etiqueta,
        nombre: tag.nombre,
        color: tag.color
      }
    });
  } catch (error) {
    console.error('Update tag error:', error);
    res.status(500).json({ error: 'Failed to update tag.' });
  }
};

/**
 * Delete tag
 */
export const deleteTag = async (req, res) => {
  try {
    const { accountId, tagId } = req.params;

    // Delete tag associations first (cascade should handle this, but being explicit)
    await query(
      'DELETE FROM movimiento_etiqueta WHERE id_etiqueta = $1',
      [tagId]
    );

    const result = await query(
      'DELETE FROM etiquetas WHERE id_etiqueta = $1 AND id_cuenta = $2 RETURNING id_etiqueta',
      [tagId, accountId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Tag not found.' });
    }

    res.json({ message: 'Tag deleted successfully.' });
  } catch (error) {
    console.error('Delete tag error:', error);
    res.status(500).json({ error: 'Failed to delete tag.' });
  }
};

/**
 * Get movements by tag
 */
export const getMovementsByTag = async (req, res) => {
  try {
    const { accountId, tagId } = req.params;

    const result = await query(
      `SELECT m.*, c.nombre as categoria_nombre
       FROM movimientos m
       JOIN movimiento_etiqueta me ON m.id_movimiento = me.id_movimiento
       LEFT JOIN categorias c ON m.id_categoria = c.id_categoria
       WHERE me.id_etiqueta = $1 AND m.id_cuenta = $2
       ORDER BY m.fecha_operacion DESC`,
      [tagId, accountId]
    );

    const movements = result.rows.map(m => ({
      id: m.id_movimiento,
      tipo: m.tipo,
      fechaOperacion: m.fecha_operacion,
      importe: parseFloat(m.importe),
      categoria: m.categoria_nombre,
      proveedor: m.proveedor,
      descripcion: m.descripcion,
      estado: m.estado
    }));

    res.json({ movements });
  } catch (error) {
    console.error('Get movements by tag error:', error);
    res.status(500).json({ error: 'Failed to get movements.' });
  }
};
