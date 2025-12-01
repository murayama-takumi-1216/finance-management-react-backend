import jwt from 'jsonwebtoken';
import { query } from '../config/database.js';
import { ROL_ADMIN_GENERAL, ROL_PROPIETARIO, ROL_EDITOR, ROL_SOLO_LECTURA } from '../utils/constants.js';

/**
 * Verify JWT token and attach user to request
 */
export const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Access denied. No token provided.' });
    }

    const token = authHeader.split(' ')[1];

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // Fetch user from database
      const result = await query(
        'SELECT id_usuario, nombre, email, rol_global, estado FROM usuarios WHERE id_usuario = $1',
        [decoded.userId]
      );

      if (result.rows.length === 0) {
        return res.status(401).json({ error: 'User not found.' });
      }

      const user = result.rows[0];

      if (user.estado === 'bloqueado') {
        return res.status(403).json({ error: 'Account is blocked.' });
      }

      req.user = {
        id: user.id_usuario,
        nombre: user.nombre,
        email: user.email,
        rolGlobal: user.rol_global,
        isAdmin: user.rol_global === ROL_ADMIN_GENERAL
      };

      next();
    } catch (jwtError) {
      if (jwtError.name === 'TokenExpiredError') {
        return res.status(401).json({ error: 'Token expired.' });
      }
      return res.status(401).json({ error: 'Invalid token.' });
    }
  } catch (error) {
    console.error('Authentication error:', error);
    return res.status(500).json({ error: 'Authentication failed.' });
  }
};

/**
 * Check if user is admin
 */
export const requireAdmin = (req, res, next) => {
  if (!req.user.isAdmin) {
    return res.status(403).json({ error: 'Admin access required.' });
  }
  next();
};

/**
 * Check user's permission for a specific account
 */
export const checkAccountPermission = (requiredPermissions = []) => {
  return async (req, res, next) => {
    try {
      const accountId = req.params.accountId || req.body.id_cuenta || req.query.id_cuenta;

      if (!accountId) {
        return res.status(400).json({ error: 'Account ID required.' });
      }

      // Admin can access all accounts
      if (req.user.isAdmin) {
        req.accountRole = ROL_PROPIETARIO;
        return next();
      }

      // Check user's role in the account
      const result = await query(
        `SELECT uc.rol_en_cuenta, c.estado
         FROM usuario_cuenta uc
         JOIN cuentas c ON c.id_cuenta = uc.id_cuenta
         WHERE uc.id_usuario = $1 AND uc.id_cuenta = $2`,
        [req.user.id, accountId]
      );

      if (result.rows.length === 0) {
        return res.status(403).json({ error: 'Access denied to this account.' });
      }

      const { rol_en_cuenta, estado } = result.rows[0];

      if (estado === 'archivada' && requiredPermissions.includes('editar')) {
        return res.status(403).json({ error: 'Cannot modify archived account.' });
      }

      // Define permissions by role
      const rolePermissions = {
        [ROL_PROPIETARIO]: ['ver', 'crear', 'editar', 'borrar', 'gestionar_categorias', 'invitar_usuarios', 'ver_informes'],
        [ROL_EDITOR]: ['ver', 'crear', 'editar', 'ver_informes'],
        [ROL_SOLO_LECTURA]: ['ver', 'ver_informes']
      };

      const userPermissions = rolePermissions[rol_en_cuenta] || [];

      // Check if user has all required permissions
      const hasPermission = requiredPermissions.every(p => userPermissions.includes(p));

      if (!hasPermission) {
        return res.status(403).json({ error: 'Insufficient permissions for this action.' });
      }

      req.accountRole = rol_en_cuenta;
      req.accountPermissions = userPermissions;
      next();
    } catch (error) {
      console.error('Permission check error:', error);
      return res.status(500).json({ error: 'Permission check failed.' });
    }
  };
};

/**
 * Attach account info to request if account ID is provided
 */
export const attachAccountInfo = async (req, res, next) => {
  try {
    const accountId = req.params.accountId || req.body.id_cuenta || req.query.id_cuenta;

    if (!accountId) {
      return next();
    }

    // Get user's accounts and their roles
    const result = await query(
      `SELECT c.*, uc.rol_en_cuenta, uc.tipo_acceso
       FROM cuentas c
       JOIN usuario_cuenta uc ON c.id_cuenta = uc.id_cuenta
       WHERE c.id_cuenta = $1 AND (uc.id_usuario = $2 OR $3 = true)`,
      [accountId, req.user.id, req.user.isAdmin]
    );

    if (result.rows.length > 0) {
      req.account = result.rows[0];
    }

    next();
  } catch (error) {
    console.error('Attach account info error:', error);
    next();
  }
};
