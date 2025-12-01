import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { query } from '../config/database.js';
import { ESTADO_ACTIVO } from '../utils/constants.js';

/**
 * Register a new user
 */
export const register = async (req, res) => {
  try {
    const { nombre, email, password } = req.body;

    // Check if user already exists
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
       VALUES ($1, $2, $3, 'usuario_normal', 'activo')
       RETURNING id_usuario, nombre, email, rol_global, estado, created_at`,
      [nombre, email.toLowerCase(), hashedPassword]
    );

    const user = result.rows[0];

    // Generate JWT token
    const token = jwt.sign(
      { userId: user.id_usuario, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    res.status(201).json({
      message: 'User registered successfully',
      token,
      user: {
        id: user.id_usuario,
        nombre: user.nombre,
        email: user.email,
        rolGlobal: user.rol_global,
        estado: user.estado
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed.' });
  }
};

/**
 * Login user
 */
export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Find user
    const result = await query(
      'SELECT * FROM usuarios WHERE email = $1',
      [email.toLowerCase()]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const user = result.rows[0];

    // Check if user is blocked
    if (user.estado === 'bloqueado') {
      return res.status(403).json({ error: 'Account is blocked. Contact administrator.' });
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    // Generate JWT token
    const token = jwt.sign(
      { userId: user.id_usuario, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user.id_usuario,
        nombre: user.nombre,
        email: user.email,
        rolGlobal: user.rol_global,
        estado: user.estado
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed.' });
  }
};

/**
 * Get current user profile
 */
export const getProfile = async (req, res) => {
  try {
    const result = await query(
      `SELECT id_usuario, nombre, email, rol_global, estado, created_at, updated_at
       FROM usuarios WHERE id_usuario = $1`,
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found.' });
    }

    const user = result.rows[0];

    // Get user's accounts summary
    const accountsResult = await query(
      `SELECT c.id_cuenta, c.nombre, c.tipo, c.moneda, c.estado, uc.rol_en_cuenta
       FROM cuentas c
       JOIN usuario_cuenta uc ON c.id_cuenta = uc.id_cuenta
       WHERE uc.id_usuario = $1
       ORDER BY c.nombre`,
      [req.user.id]
    );

    res.json({
      user: {
        id: user.id_usuario,
        nombre: user.nombre,
        email: user.email,
        rolGlobal: user.rol_global,
        estado: user.estado,
        createdAt: user.created_at
      },
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
    console.error('Get profile error:', error);
    res.status(500).json({ error: 'Failed to get profile.' });
  }
};

/**
 * Update user profile
 */
export const updateProfile = async (req, res) => {
  try {
    const { nombre } = req.body;

    const result = await query(
      `UPDATE usuarios
       SET nombre = COALESCE($1, nombre), updated_at = CURRENT_TIMESTAMP
       WHERE id_usuario = $2
       RETURNING id_usuario, nombre, email, rol_global, estado`,
      [nombre, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found.' });
    }

    const user = result.rows[0];

    res.json({
      message: 'Profile updated successfully',
      user: {
        id: user.id_usuario,
        nombre: user.nombre,
        email: user.email,
        rolGlobal: user.rol_global,
        estado: user.estado
      }
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ error: 'Failed to update profile.' });
  }
};

/**
 * Change password
 */
export const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    // Get user's current password hash
    const result = await query(
      'SELECT password_hash FROM usuarios WHERE id_usuario = $1',
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found.' });
    }

    // Verify current password
    const isValidPassword = await bcrypt.compare(currentPassword, result.rows[0].password_hash);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Current password is incorrect.' });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 12);

    // Update password
    await query(
      'UPDATE usuarios SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id_usuario = $2',
      [hashedPassword, req.user.id]
    );

    res.json({ message: 'Password changed successfully.' });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ error: 'Failed to change password.' });
  }
};

/**
 * Refresh token
 */
export const refreshToken = async (req, res) => {
  try {
    // Generate new token
    const token = jwt.sign(
      { userId: req.user.id, email: req.user.email },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    res.json({ token });
  } catch (error) {
    console.error('Refresh token error:', error);
    res.status(500).json({ error: 'Failed to refresh token.' });
  }
};
