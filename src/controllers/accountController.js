import { query, getClient } from '../config/database.js';
import { parsePagination, buildPaginationResponse } from '../utils/helpers.js';
import { ROL_PROPIETARIO, ACCESO_INDEPENDIENTE, ACCESO_COMPARTIDA } from '../utils/constants.js';

/**
 * Get all accounts for the current user
 */
export const getAccounts = async (req, res) => {
  try {
    const { estado, tipo } = req.query;

    let whereClause = 'WHERE uc.id_usuario = $1';
    const params = [req.user.id];
    let paramIndex = 2;

    if (estado) {
      whereClause += ` AND c.estado = $${paramIndex}`;
      params.push(estado);
      paramIndex++;
    }

    if (tipo) {
      whereClause += ` AND c.tipo = $${paramIndex}`;
      params.push(tipo);
      paramIndex++;
    }

    // For admin, can see all accounts
    if (req.user.isAdmin && req.query.all === 'true') {
      whereClause = 'WHERE 1=1';
      params.shift();
      paramIndex = 1;
    }

    const result = await query(
      `SELECT c.*, uc.rol_en_cuenta, uc.tipo_acceso,
              u.nombre as propietario_nombre, u.email as propietario_email,
              COALESCE(
                (SELECT SUM(CASE WHEN m.tipo = 'ingreso' AND m.estado = 'confirmado' THEN m.importe ELSE 0 END) -
                        SUM(CASE WHEN m.tipo = 'gasto' AND m.estado = 'confirmado' THEN m.importe ELSE 0 END)
                 FROM movimientos m WHERE m.id_cuenta = c.id_cuenta), 0
              ) as saldo
       FROM cuentas c
       JOIN usuario_cuenta uc ON c.id_cuenta = uc.id_cuenta
       JOIN usuarios u ON c.id_usuario_propietario = u.id_usuario
       ${whereClause}
       ORDER BY c.nombre`,
      params
    );

    const accounts = result.rows.map(a => ({
      id: a.id_cuenta,
      nombre: a.nombre,
      tipo: a.tipo,
      moneda: a.moneda,
      estado: a.estado,
      rol: a.rol_en_cuenta,
      tipoAcceso: a.tipo_acceso,
      propietario: {
        nombre: a.propietario_nombre,
        email: a.propietario_email
      },
      balance: {
        saldo: parseFloat(a.saldo) || 0
      },
      createdAt: a.created_at
    }));

    res.json({ accounts });
  } catch (error) {
    console.error('Get accounts error:', error);
    res.status(500).json({ error: 'Failed to get accounts.' });
  }
};

/**
 * Get account by ID
 */
export const getAccountById = async (req, res) => {
  try {
    const { accountId } = req.params;

    // Check access
    let accessCheck;
    if (req.user.isAdmin) {
      accessCheck = await query(
        `SELECT c.*, u.nombre as propietario_nombre, u.email as propietario_email
         FROM cuentas c
         JOIN usuarios u ON c.id_usuario_propietario = u.id_usuario
         WHERE c.id_cuenta = $1`,
        [accountId]
      );
    } else {
      accessCheck = await query(
        `SELECT c.*, uc.rol_en_cuenta, uc.tipo_acceso,
                u.nombre as propietario_nombre, u.email as propietario_email
         FROM cuentas c
         JOIN usuario_cuenta uc ON c.id_cuenta = uc.id_cuenta
         JOIN usuarios u ON c.id_usuario_propietario = u.id_usuario
         WHERE c.id_cuenta = $1 AND uc.id_usuario = $2`,
        [accountId, req.user.id]
      );
    }

    if (accessCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Account not found or access denied.' });
    }

    const account = accessCheck.rows[0];

    // Get account members
    const membersResult = await query(
      `SELECT u.id_usuario, u.nombre, u.email, uc.rol_en_cuenta, uc.tipo_acceso
       FROM usuario_cuenta uc
       JOIN usuarios u ON u.id_usuario = uc.id_usuario
       WHERE uc.id_cuenta = $1`,
      [accountId]
    );

    // Get balance summary
    const balanceResult = await query(
      `SELECT
         COALESCE(SUM(CASE WHEN tipo = 'ingreso' AND estado = 'confirmado' THEN importe ELSE 0 END), 0) as total_ingresos,
         COALESCE(SUM(CASE WHEN tipo = 'gasto' AND estado = 'confirmado' THEN importe ELSE 0 END), 0) as total_gastos
       FROM movimientos
       WHERE id_cuenta = $1`,
      [accountId]
    );

    const balance = balanceResult.rows[0];

    res.json({
      id: account.id_cuenta,
      nombre: account.nombre,
      tipo: account.tipo,
      moneda: account.moneda,
      estado: account.estado,
      rol: account.rol_en_cuenta || ROL_PROPIETARIO,
      tipoAcceso: account.tipo_acceso || ACCESO_INDEPENDIENTE,
      propietario: {
        nombre: account.propietario_nombre,
        email: account.propietario_email
      },
      miembros: membersResult.rows.map(m => ({
        id: m.id_usuario,
        nombre: m.nombre,
        email: m.email,
        rol: m.rol_en_cuenta,
        tipoAcceso: m.tipo_acceso
      })),
      balance: {
        totalIngresos: parseFloat(balance.total_ingresos),
        totalGastos: parseFloat(balance.total_gastos),
        saldo: parseFloat(balance.total_ingresos) - parseFloat(balance.total_gastos)
      },
      createdAt: account.created_at,
      updatedAt: account.updated_at
    });
  } catch (error) {
    console.error('Get account by ID error:', error);
    res.status(500).json({ error: 'Failed to get account.' });
  }
};

/**
 * Create a new account
 */
export const createAccount = async (req, res) => {
  const client = await getClient();

  try {
    await client.query('BEGIN');

    const { nombre, tipo, moneda } = req.body;

    // Create account
    const accountResult = await client.query(
      `INSERT INTO cuentas (nombre, tipo, moneda, id_usuario_propietario, estado)
       VALUES ($1, $2, $3, $4, 'activa')
       RETURNING *`,
      [nombre, tipo, moneda || 'USD', req.user.id]
    );

    const account = accountResult.rows[0];

    // Add user as owner in usuario_cuenta
    await client.query(
      `INSERT INTO usuario_cuenta (id_usuario, id_cuenta, rol_en_cuenta, tipo_acceso)
       VALUES ($1, $2, $3, $4)`,
      [req.user.id, account.id_cuenta, ROL_PROPIETARIO, ACCESO_INDEPENDIENTE]
    );

    // Copy global categories for this account
    const globalCategories = await client.query(
      'SELECT nombre, tipo, orden_visual FROM categorias WHERE es_global = TRUE'
    );

    for (const cat of globalCategories.rows) {
      await client.query(
        `INSERT INTO categorias (id_cuenta, nombre, tipo, orden_visual, es_global)
         VALUES ($1, $2, $3, $4, FALSE)`,
        [account.id_cuenta, cat.nombre, cat.tipo, cat.orden_visual]
      );
    }

    await client.query('COMMIT');

    res.status(201).json({
      message: 'Account created successfully',
      account: {
        id: account.id_cuenta,
        nombre: account.nombre,
        tipo: account.tipo,
        moneda: account.moneda,
        estado: account.estado,
        rol: ROL_PROPIETARIO,
        createdAt: account.created_at
      }
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Create account error:', error);
    res.status(500).json({ error: 'Failed to create account.' });
  } finally {
    client.release();
  }
};

// Exchange rates relative to USD (base currency)
const EXCHANGE_RATES = {
  USD: 1,
  EUR: 0.92,
  GBP: 0.79,
  MXN: 17.15,
  ARS: 350.00,
  BRL: 4.97,
  COP: 3950.00
};

/**
 * Convert amount from one currency to another
 */
const convertCurrency = (amount, fromCurrency, toCurrency) => {
  if (fromCurrency === toCurrency) return amount;

  // Convert to USD first, then to target currency
  const amountInUSD = amount / EXCHANGE_RATES[fromCurrency];
  const convertedAmount = amountInUSD * EXCHANGE_RATES[toCurrency];

  return Math.round(convertedAmount * 100) / 100; // Round to 2 decimal places
};

/**
 * Update account
 */
export const updateAccount = async (req, res) => {
  const client = await getClient();

  try {
    await client.query('BEGIN');

    const { accountId } = req.params;
    const { nombre, tipo, moneda, estado } = req.body;

    // Check if user is owner or admin
    if (!req.user.isAdmin) {
      const ownerCheck = await client.query(
        'SELECT rol_en_cuenta FROM usuario_cuenta WHERE id_cuenta = $1 AND id_usuario = $2',
        [accountId, req.user.id]
      );

      if (ownerCheck.rows.length === 0 || ownerCheck.rows[0].rol_en_cuenta !== ROL_PROPIETARIO) {
        await client.query('ROLLBACK');
        return res.status(403).json({ error: 'Only account owner can update account.' });
      }
    }

    // Get current account to check if currency is changing
    const currentAccount = await client.query(
      'SELECT moneda FROM cuentas WHERE id_cuenta = $1',
      [accountId]
    );

    if (currentAccount.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Account not found.' });
    }

    const oldCurrency = currentAccount.rows[0].moneda;
    const newCurrency = moneda || oldCurrency;

    // If currency is changing, convert all movements
    if (newCurrency !== oldCurrency) {
      // Get all movements for this account
      const movements = await client.query(
        'SELECT id_movimiento, importe FROM movimientos WHERE id_cuenta = $1',
        [accountId]
      );

      // Update each movement with converted amount
      for (const movement of movements.rows) {
        const convertedAmount = convertCurrency(
          parseFloat(movement.importe),
          oldCurrency,
          newCurrency
        );

        await client.query(
          'UPDATE movimientos SET importe = $1, updated_at = CURRENT_TIMESTAMP WHERE id_movimiento = $2',
          [convertedAmount, movement.id_movimiento]
        );
      }

      // Also convert event amounts
      const events = await client.query(
        'SELECT id_evento, monto FROM eventos_calendario WHERE id_cuenta = $1 AND monto IS NOT NULL',
        [accountId]
      );

      for (const event of events.rows) {
        const convertedAmount = convertCurrency(
          parseFloat(event.monto),
          oldCurrency,
          newCurrency
        );

        await client.query(
          'UPDATE eventos_calendario SET monto = $1, updated_at = CURRENT_TIMESTAMP WHERE id_evento = $2',
          [convertedAmount, event.id_evento]
        );
      }
    }

    const result = await client.query(
      `UPDATE cuentas
       SET nombre = COALESCE($1, nombre),
           tipo = COALESCE($2, tipo),
           moneda = COALESCE($3, moneda),
           estado = COALESCE($4, estado),
           updated_at = CURRENT_TIMESTAMP
       WHERE id_cuenta = $5
       RETURNING *`,
      [nombre, tipo, moneda, estado, accountId]
    );

    await client.query('COMMIT');

    const account = result.rows[0];

    res.json({
      message: newCurrency !== oldCurrency
        ? `Account updated and all amounts converted from ${oldCurrency} to ${newCurrency}`
        : 'Account updated successfully',
      account: {
        id: account.id_cuenta,
        nombre: account.nombre,
        tipo: account.tipo,
        moneda: account.moneda,
        estado: account.estado,
        updatedAt: account.updated_at
      },
      currencyConverted: newCurrency !== oldCurrency
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Update account error:', error);
    res.status(500).json({ error: 'Failed to update account.' });
  } finally {
    client.release();
  }
};

/**
 * Delete account (archive)
 */
export const deleteAccount = async (req, res) => {
  try {
    const { accountId } = req.params;

    // Check if user is owner or admin
    if (!req.user.isAdmin) {
      const ownerCheck = await query(
        'SELECT rol_en_cuenta FROM usuario_cuenta WHERE id_cuenta = $1 AND id_usuario = $2',
        [accountId, req.user.id]
      );

      if (ownerCheck.rows.length === 0 || ownerCheck.rows[0].rol_en_cuenta !== ROL_PROPIETARIO) {
        return res.status(403).json({ error: 'Only account owner can delete account.' });
      }
    }

    // Archive instead of hard delete
    const result = await query(
      `UPDATE cuentas
       SET estado = 'archivada', updated_at = CURRENT_TIMESTAMP
       WHERE id_cuenta = $1
       RETURNING id_cuenta`,
      [accountId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Account not found.' });
    }

    res.json({ message: 'Account archived successfully.' });
  } catch (error) {
    console.error('Delete account error:', error);
    res.status(500).json({ error: 'Failed to delete account.' });
  }
};

/**
 * Invite user to account
 */
export const inviteUser = async (req, res) => {
  try {
    const { accountId } = req.params;
    const { email, rol_en_cuenta } = req.body;

    // Check if requester is owner
    const ownerCheck = await query(
      'SELECT rol_en_cuenta FROM usuario_cuenta WHERE id_cuenta = $1 AND id_usuario = $2',
      [accountId, req.user.id]
    );

    if (!req.user.isAdmin && (ownerCheck.rows.length === 0 || ownerCheck.rows[0].rol_en_cuenta !== ROL_PROPIETARIO)) {
      return res.status(403).json({ error: 'Only account owner can invite users.' });
    }

    // Find user by email
    const userResult = await query(
      'SELECT id_usuario FROM usuarios WHERE email = $1',
      [email.toLowerCase()]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found.' });
    }

    const invitedUserId = userResult.rows[0].id_usuario;

    // Check if already member
    const existingMember = await query(
      'SELECT id FROM usuario_cuenta WHERE id_cuenta = $1 AND id_usuario = $2',
      [accountId, invitedUserId]
    );

    if (existingMember.rows.length > 0) {
      return res.status(400).json({ error: 'User is already a member of this account.' });
    }

    // Add user to account
    await query(
      `INSERT INTO usuario_cuenta (id_usuario, id_cuenta, rol_en_cuenta, tipo_acceso)
       VALUES ($1, $2, $3, $4)`,
      [invitedUserId, accountId, rol_en_cuenta || 'editor', ACCESO_COMPARTIDA]
    );

    res.status(201).json({ message: 'User invited successfully.' });
  } catch (error) {
    console.error('Invite user error:', error);
    res.status(500).json({ error: 'Failed to invite user.' });
  }
};

/**
 * Update member role
 */
export const updateMemberRole = async (req, res) => {
  try {
    const { accountId, userId } = req.params;
    const { rol_en_cuenta } = req.body;

    // Check if requester is owner
    const ownerCheck = await query(
      'SELECT rol_en_cuenta FROM usuario_cuenta WHERE id_cuenta = $1 AND id_usuario = $2',
      [accountId, req.user.id]
    );

    if (!req.user.isAdmin && (ownerCheck.rows.length === 0 || ownerCheck.rows[0].rol_en_cuenta !== ROL_PROPIETARIO)) {
      return res.status(403).json({ error: 'Only account owner can update member roles.' });
    }

    // Cannot change owner role
    const targetUser = await query(
      'SELECT rol_en_cuenta FROM usuario_cuenta WHERE id_cuenta = $1 AND id_usuario = $2',
      [accountId, userId]
    );

    if (targetUser.rows.length === 0) {
      return res.status(404).json({ error: 'Member not found.' });
    }

    if (targetUser.rows[0].rol_en_cuenta === ROL_PROPIETARIO) {
      return res.status(400).json({ error: 'Cannot change owner role.' });
    }

    await query(
      'UPDATE usuario_cuenta SET rol_en_cuenta = $1 WHERE id_cuenta = $2 AND id_usuario = $3',
      [rol_en_cuenta, accountId, userId]
    );

    res.json({ message: 'Member role updated successfully.' });
  } catch (error) {
    console.error('Update member role error:', error);
    res.status(500).json({ error: 'Failed to update member role.' });
  }
};

/**
 * Remove member from account
 */
export const removeMember = async (req, res) => {
  try {
    const { accountId, userId } = req.params;

    // Check if requester is owner
    const ownerCheck = await query(
      'SELECT rol_en_cuenta FROM usuario_cuenta WHERE id_cuenta = $1 AND id_usuario = $2',
      [accountId, req.user.id]
    );

    if (!req.user.isAdmin && (ownerCheck.rows.length === 0 || ownerCheck.rows[0].rol_en_cuenta !== ROL_PROPIETARIO)) {
      return res.status(403).json({ error: 'Only account owner can remove members.' });
    }

    // Cannot remove owner
    const targetUser = await query(
      'SELECT rol_en_cuenta FROM usuario_cuenta WHERE id_cuenta = $1 AND id_usuario = $2',
      [accountId, userId]
    );

    if (targetUser.rows.length === 0) {
      return res.status(404).json({ error: 'Member not found.' });
    }

    if (targetUser.rows[0].rol_en_cuenta === ROL_PROPIETARIO) {
      return res.status(400).json({ error: 'Cannot remove account owner.' });
    }

    await query(
      'DELETE FROM usuario_cuenta WHERE id_cuenta = $1 AND id_usuario = $2',
      [accountId, userId]
    );

    res.json({ message: 'Member removed successfully.' });
  } catch (error) {
    console.error('Remove member error:', error);
    res.status(500).json({ error: 'Failed to remove member.' });
  }
};
