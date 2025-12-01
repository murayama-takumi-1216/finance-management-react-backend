import bcrypt from 'bcryptjs';
import { query } from '../config/database.js';
import { parsePagination, buildPaginationResponse } from '../utils/helpers.js';

/**
 * Get all users (admin only)
 */
export const getAllUsers = async (req, res) => {
  try {
    const { page, limit, offset } = parsePagination(req.query);
    const { search, estado, rol_global } = req.query;

    let whereClause = 'WHERE 1=1';
    const params = [];
    let paramIndex = 1;

    if (search) {
      whereClause += ` AND (nombre ILIKE $${paramIndex} OR email ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    if (estado) {
      whereClause += ` AND estado = $${paramIndex}`;
      params.push(estado);
      paramIndex++;
    }

    if (rol_global) {
      whereClause += ` AND rol_global = $${paramIndex}`;
      params.push(rol_global);
      paramIndex++;
    }

    // Get total count
    const countResult = await query(
      `SELECT COUNT(*) FROM usuarios ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].count);

    // Get users
    const usersResult = await query(
      `SELECT id_usuario, nombre, email, rol_global, estado, created_at, updated_at
       FROM usuarios
       ${whereClause}
       ORDER BY created_at DESC
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...params, limit, offset]
    );

    const users = usersResult.rows.map(u => ({
      id: u.id_usuario,
      nombre: u.nombre,
      email: u.email,
      rolGlobal: u.rol_global,
      estado: u.estado,
      createdAt: u.created_at,
      updatedAt: u.updated_at
    }));

    res.json(buildPaginationResponse(users, total, page, limit));
  } catch (error) {
    console.error('Get all users error:', error);
    res.status(500).json({ error: 'Failed to get users.' });
  }
};

/**
 * Get user by ID (admin only)
 */
export const getUserById = async (req, res) => {
  try {
    const { userId } = req.params;

    const result = await query(
      `SELECT id_usuario, nombre, email, rol_global, estado, created_at, updated_at
       FROM usuarios WHERE id_usuario = $1`,
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found.' });
    }

    const user = result.rows[0];

    // Get user's accounts
    const accountsResult = await query(
      `SELECT c.id_cuenta, c.nombre, c.tipo, c.moneda, c.estado, uc.rol_en_cuenta
       FROM cuentas c
       JOIN usuario_cuenta uc ON c.id_cuenta = uc.id_cuenta
       WHERE uc.id_usuario = $1`,
      [userId]
    );

    res.json({
      id: user.id_usuario,
      nombre: user.nombre,
      email: user.email,
      rolGlobal: user.rol_global,
      estado: user.estado,
      createdAt: user.created_at,
      updatedAt: user.updated_at,
      accounts: accountsResult.rows.map(a => ({
        id: a.id_cuenta,
        nombre: a.nombre,
        tipo: a.tipo,
        moneda: a.moneda,
        estado: a.estado,
        rol: a.rol_en_cuenta
      }))
    });
  } catch (error) {
    console.error('Get user by ID error:', error);
    res.status(500).json({ error: 'Failed to get user.' });
  }
};

/**
 * Create user (admin only)
 */
export const createUser = async (req, res) => {
  try {
    const { nombre, email, password, rol_global, estado } = req.body;

    // Check if email exists
    const existingUser = await query(
      'SELECT id_usuario FROM usuarios WHERE email = $1',
      [email.toLowerCase()]
    );

    if (existingUser.rows.length > 0) {
      return res.status(400).json({ error: 'Email already registered.' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Create user
    const result = await query(
      `INSERT INTO usuarios (nombre, email, password_hash, rol_global, estado)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id_usuario, nombre, email, rol_global, estado, created_at`,
      [nombre, email.toLowerCase(), hashedPassword, rol_global || 'usuario_normal', estado || 'activo']
    );

    const user = result.rows[0];

    res.status(201).json({
      message: 'User created successfully',
      user: {
        id: user.id_usuario,
        nombre: user.nombre,
        email: user.email,
        rolGlobal: user.rol_global,
        estado: user.estado,
        createdAt: user.created_at
      }
    });
  } catch (error) {
    console.error('Create user error:', error);
    res.status(500).json({ error: 'Failed to create user.' });
  }
};

/**
 * Update user (admin only)
 */
export const updateUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const { nombre, email, rol_global, estado } = req.body;

    // Check if user exists
    const existingUser = await query(
      'SELECT id_usuario FROM usuarios WHERE id_usuario = $1',
      [userId]
    );

    if (existingUser.rows.length === 0) {
      return res.status(404).json({ error: 'User not found.' });
    }

    // If email is changing, check if new email exists
    if (email) {
      const emailCheck = await query(
        'SELECT id_usuario FROM usuarios WHERE email = $1 AND id_usuario != $2',
        [email.toLowerCase(), userId]
      );

      if (emailCheck.rows.length > 0) {
        return res.status(400).json({ error: 'Email already in use.' });
      }
    }

    const result = await query(
      `UPDATE usuarios
       SET nombre = COALESCE($1, nombre),
           email = COALESCE($2, email),
           rol_global = COALESCE($3, rol_global),
           estado = COALESCE($4, estado),
           updated_at = CURRENT_TIMESTAMP
       WHERE id_usuario = $5
       RETURNING id_usuario, nombre, email, rol_global, estado, updated_at`,
      [nombre, email?.toLowerCase(), rol_global, estado, userId]
    );

    const user = result.rows[0];

    res.json({
      message: 'User updated successfully',
      user: {
        id: user.id_usuario,
        nombre: user.nombre,
        email: user.email,
        rolGlobal: user.rol_global,
        estado: user.estado,
        updatedAt: user.updated_at
      }
    });
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ error: 'Failed to update user.' });
  }
};

/**
 * Delete user (admin only)
 */
export const deleteUser = async (req, res) => {
  try {
    const { userId } = req.params;

    // Prevent self-deletion
    if (userId === req.user.id) {
      return res.status(400).json({ error: 'Cannot delete your own account.' });
    }

    const result = await query(
      'DELETE FROM usuarios WHERE id_usuario = $1 RETURNING id_usuario',
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found.' });
    }

    res.json({ message: 'User deleted successfully.' });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ error: 'Failed to delete user.' });
  }
};

/**
 * Reset user password (admin only)
 */
export const resetUserPassword = async (req, res) => {
  try {
    const { userId } = req.params;
    const { newPassword } = req.body;

    // Check if user exists
    const existingUser = await query(
      'SELECT id_usuario FROM usuarios WHERE id_usuario = $1',
      [userId]
    );

    if (existingUser.rows.length === 0) {
      return res.status(404).json({ error: 'User not found.' });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 12);

    await query(
      'UPDATE usuarios SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id_usuario = $2',
      [hashedPassword, userId]
    );

    res.json({ message: 'Password reset successfully.' });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ error: 'Failed to reset password.' });
  }
};
