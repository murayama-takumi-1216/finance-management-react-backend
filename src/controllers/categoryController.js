import { query } from '../config/database.js';

/**
 * Get all categories for an account (including global)
 */
export const getCategories = async (req, res) => {
  try {
    const { accountId } = req.params;
    const { tipo } = req.query;

    let whereClause = 'WHERE (id_cuenta = $1 OR es_global = TRUE)';
    const params = [accountId];
    let paramIndex = 2;

    if (tipo) {
      whereClause += ` AND (tipo = $${paramIndex} OR tipo = 'ambos')`;
      params.push(tipo);
    }

    const result = await query(
      `SELECT * FROM categorias
       ${whereClause}
       ORDER BY es_global DESC, orden_visual ASC, nombre ASC`,
      params
    );

    const categories = result.rows.map(c => ({
      id: c.id_categoria,
      nombre: c.nombre,
      tipo: c.tipo,
      ordenVisual: c.orden_visual,
      esGlobal: c.es_global,
      idCuenta: c.id_cuenta
    }));

    res.json({ categories });
  } catch (error) {
    console.error('Get categories error:', error);
    res.status(500).json({ error: 'Failed to get categories.' });
  }
};

/**
 * Get global categories (for admin)
 */
export const getGlobalCategories = async (req, res) => {
  try {
    const { tipo } = req.query;

    let whereClause = 'WHERE es_global = TRUE';
    const params = [];

    if (tipo) {
      whereClause += ' AND (tipo = $1 OR tipo = \'ambos\')';
      params.push(tipo);
    }

    const result = await query(
      `SELECT * FROM categorias ${whereClause} ORDER BY orden_visual ASC, nombre ASC`,
      params
    );

    const categories = result.rows.map(c => ({
      id: c.id_categoria,
      nombre: c.nombre,
      tipo: c.tipo,
      ordenVisual: c.orden_visual
    }));

    res.json({ categories });
  } catch (error) {
    console.error('Get global categories error:', error);
    res.status(500).json({ error: 'Failed to get global categories.' });
  }
};

/**
 * Create category for account
 */
export const createCategory = async (req, res) => {
  try {
    const { accountId } = req.params;
    const { nombre, tipo, orden_visual } = req.body;

    // Check if category with same name exists for this account
    const existing = await query(
      'SELECT id_categoria FROM categorias WHERE nombre ILIKE $1 AND id_cuenta = $2',
      [nombre, accountId]
    );

    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'Category with this name already exists.' });
    }

    const result = await query(
      `INSERT INTO categorias (id_cuenta, nombre, tipo, orden_visual, es_global)
       VALUES ($1, $2, $3, $4, FALSE)
       RETURNING *`,
      [accountId, nombre, tipo, orden_visual || 0]
    );

    const category = result.rows[0];

    res.status(201).json({
      message: 'Category created successfully',
      category: {
        id: category.id_categoria,
        nombre: category.nombre,
        tipo: category.tipo,
        ordenVisual: category.orden_visual,
        esGlobal: false
      }
    });
  } catch (error) {
    console.error('Create category error:', error);
    res.status(500).json({ error: 'Failed to create category.' });
  }
};

/**
 * Create global category (admin only)
 */
export const createGlobalCategory = async (req, res) => {
  try {
    const { nombre, tipo, orden_visual } = req.body;

    // Check if global category with same name exists
    const existing = await query(
      'SELECT id_categoria FROM categorias WHERE nombre ILIKE $1 AND es_global = TRUE',
      [nombre]
    );

    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'Global category with this name already exists.' });
    }

    const result = await query(
      `INSERT INTO categorias (nombre, tipo, orden_visual, es_global)
       VALUES ($1, $2, $3, TRUE)
       RETURNING *`,
      [nombre, tipo, orden_visual || 0]
    );

    const category = result.rows[0];

    res.status(201).json({
      message: 'Global category created successfully',
      category: {
        id: category.id_categoria,
        nombre: category.nombre,
        tipo: category.tipo,
        ordenVisual: category.orden_visual,
        esGlobal: true
      }
    });
  } catch (error) {
    console.error('Create global category error:', error);
    res.status(500).json({ error: 'Failed to create global category.' });
  }
};

/**
 * Update category
 */
export const updateCategory = async (req, res) => {
  try {
    const { accountId, categoryId } = req.params;
    const { nombre, tipo, orden_visual } = req.body;

    // Check if category belongs to account
    const existing = await query(
      'SELECT * FROM categorias WHERE id_categoria = $1 AND id_cuenta = $2',
      [categoryId, accountId]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Category not found or is a global category.' });
    }

    const result = await query(
      `UPDATE categorias
       SET nombre = COALESCE($1, nombre),
           tipo = COALESCE($2, tipo),
           orden_visual = COALESCE($3, orden_visual),
           updated_at = CURRENT_TIMESTAMP
       WHERE id_categoria = $4 AND id_cuenta = $5
       RETURNING *`,
      [nombre, tipo, orden_visual, categoryId, accountId]
    );

    const category = result.rows[0];

    res.json({
      message: 'Category updated successfully',
      category: {
        id: category.id_categoria,
        nombre: category.nombre,
        tipo: category.tipo,
        ordenVisual: category.orden_visual
      }
    });
  } catch (error) {
    console.error('Update category error:', error);
    res.status(500).json({ error: 'Failed to update category.' });
  }
};

/**
 * Update global category (admin only)
 */
export const updateGlobalCategory = async (req, res) => {
  try {
    const { categoryId } = req.params;
    const { nombre, tipo, orden_visual } = req.body;

    const result = await query(
      `UPDATE categorias
       SET nombre = COALESCE($1, nombre),
           tipo = COALESCE($2, tipo),
           orden_visual = COALESCE($3, orden_visual),
           updated_at = CURRENT_TIMESTAMP
       WHERE id_categoria = $4 AND es_global = TRUE
       RETURNING *`,
      [nombre, tipo, orden_visual, categoryId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Global category not found.' });
    }

    const category = result.rows[0];

    res.json({
      message: 'Global category updated successfully',
      category: {
        id: category.id_categoria,
        nombre: category.nombre,
        tipo: category.tipo,
        ordenVisual: category.orden_visual
      }
    });
  } catch (error) {
    console.error('Update global category error:', error);
    res.status(500).json({ error: 'Failed to update global category.' });
  }
};

/**
 * Delete category
 */
export const deleteCategory = async (req, res) => {
  try {
    const { accountId, categoryId } = req.params;

    // Check if category is in use
    const usageCheck = await query(
      'SELECT COUNT(*) FROM movimientos WHERE id_categoria = $1',
      [categoryId]
    );

    if (parseInt(usageCheck.rows[0].count) > 0) {
      return res.status(400).json({ error: 'Cannot delete category that is in use.' });
    }

    const result = await query(
      'DELETE FROM categorias WHERE id_categoria = $1 AND id_cuenta = $2 AND es_global = FALSE RETURNING id_categoria',
      [categoryId, accountId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Category not found or is a global category.' });
    }

    res.json({ message: 'Category deleted successfully.' });
  } catch (error) {
    console.error('Delete category error:', error);
    res.status(500).json({ error: 'Failed to delete category.' });
  }
};

/**
 * Delete global category (admin only)
 */
export const deleteGlobalCategory = async (req, res) => {
  try {
    const { categoryId } = req.params;

    // Check if category is in use
    const usageCheck = await query(
      'SELECT COUNT(*) FROM movimientos WHERE id_categoria = $1',
      [categoryId]
    );

    if (parseInt(usageCheck.rows[0].count) > 0) {
      return res.status(400).json({ error: 'Cannot delete global category that is in use.' });
    }

    const result = await query(
      'DELETE FROM categorias WHERE id_categoria = $1 AND es_global = TRUE RETURNING id_categoria',
      [categoryId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Global category not found.' });
    }

    res.json({ message: 'Global category deleted successfully.' });
  } catch (error) {
    console.error('Delete global category error:', error);
    res.status(500).json({ error: 'Failed to delete global category.' });
  }
};
