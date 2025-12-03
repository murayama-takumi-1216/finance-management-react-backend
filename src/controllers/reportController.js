import { query } from '../config/database.js';
import { getPeriodDates, calculatePercentageChange, roundToDecimals } from '../utils/helpers.js';
import { ESTADO_CONFIRMADO } from '../utils/constants.js';

// Helper to normalize date params (support both Spanish and English param names)
const getDateParams = (queryParams) => {
  const { fecha_desde, fecha_hasta, start, end } = queryParams;
  return {
    startDate: fecha_desde || start,
    endDate: fecha_hasta || end
  };
};

/**
 * Get totals by period (month, quarter, year)
 * Groups confirmed movements and calculates income, expenses, and balance
 */
export const getTotalsByPeriod = async (req, res) => {
  try {
    const { accountId } = req.params;
    const { agrupacion, year } = req.query;
    const { startDate, endDate } = getDateParams(req.query);

    let dateFilter = '';
    const params = [accountId, ESTADO_CONFIRMADO];
    let paramIndex = 3;

    if (startDate && endDate) {
      dateFilter = `AND fecha_operacion >= $${paramIndex} AND fecha_operacion <= $${paramIndex + 1}`;
      params.push(startDate, endDate);
      paramIndex += 2;
    } else if (year) {
      const periodDates = getPeriodDates(parseInt(year));
      dateFilter = `AND fecha_operacion >= $${paramIndex} AND fecha_operacion <= $${paramIndex + 1}`;
      params.push(periodDates.startDate, periodDates.endDate);
      paramIndex += 2;
    }

    let groupBy, selectPeriod;

    switch (agrupacion) {
      case 'mes':
        groupBy = "DATE_TRUNC('month', fecha_operacion)";
        selectPeriod = `TO_CHAR(DATE_TRUNC('month', fecha_operacion), 'YYYY-MM') as periodo,
                        EXTRACT(YEAR FROM DATE_TRUNC('month', fecha_operacion)) as year,
                        EXTRACT(MONTH FROM DATE_TRUNC('month', fecha_operacion)) as month`;
        break;
      case 'trimestre':
        groupBy = "DATE_TRUNC('quarter', fecha_operacion)";
        selectPeriod = `TO_CHAR(DATE_TRUNC('quarter', fecha_operacion), 'YYYY-"Q"Q') as periodo,
                        EXTRACT(YEAR FROM DATE_TRUNC('quarter', fecha_operacion)) as year,
                        EXTRACT(QUARTER FROM DATE_TRUNC('quarter', fecha_operacion)) as quarter`;
        break;
      case 'anio':
      default:
        groupBy = "DATE_TRUNC('year', fecha_operacion)";
        selectPeriod = `TO_CHAR(DATE_TRUNC('year', fecha_operacion), 'YYYY') as periodo,
                        EXTRACT(YEAR FROM DATE_TRUNC('year', fecha_operacion)) as year`;
        break;
    }

    const result = await query(
      `SELECT
        ${selectPeriod},
        COALESCE(SUM(CASE WHEN tipo = 'ingreso' THEN importe ELSE 0 END), 0) as total_ingresos,
        COALESCE(SUM(CASE WHEN tipo = 'gasto' THEN importe ELSE 0 END), 0) as total_gastos,
        COALESCE(SUM(CASE WHEN tipo = 'ingreso' THEN importe ELSE 0 END), 0) -
        COALESCE(SUM(CASE WHEN tipo = 'gasto' THEN importe ELSE 0 END), 0) as saldo,
        COUNT(*) as num_movimientos
       FROM movimientos
       WHERE id_cuenta = $1 AND estado = $2 ${dateFilter}
       GROUP BY ${groupBy}
       ORDER BY ${groupBy} DESC`,
      params
    );

    const totals = result.rows.map(row => ({
      periodo: row.periodo,
      year: parseInt(row.year),
      month: row.month ? parseInt(row.month) : undefined,
      quarter: row.quarter ? parseInt(row.quarter) : undefined,
      totalIngresos: roundToDecimals(parseFloat(row.total_ingresos)),
      totalGastos: roundToDecimals(parseFloat(row.total_gastos)),
      saldo: roundToDecimals(parseFloat(row.saldo)),
      numMovimientos: parseInt(row.num_movimientos)
    }));

    res.json({ totals, agrupacion: agrupacion || 'anio' });
  } catch (error) {
    console.error('Get totals by period error:', error);
    res.status(500).json({ error: 'Failed to get totals by period.' });
  }
};

/**
 * Get expense breakdown by category (for pie/bar charts)
 */
export const getExpensesByCategory = async (req, res) => {
  try {
    const { accountId } = req.params;
    const { startDate, endDate } = getDateParams(req.query);

    let dateFilter = '';
    const params = [accountId, ESTADO_CONFIRMADO, 'gasto'];
    let paramIndex = 4;

    if (startDate && endDate) {
      dateFilter = `AND m.fecha_operacion >= $${paramIndex} AND m.fecha_operacion <= $${paramIndex + 1}`;
      params.push(startDate, endDate);
    }

    // Get total expenses
    const totalResult = await query(
      `SELECT COALESCE(SUM(importe), 0) as total
       FROM movimientos
       WHERE id_cuenta = $1 AND estado = $2 AND tipo = $3 ${dateFilter.replaceAll('m.', '')}`,
      params
    );
    const totalExpenses = parseFloat(totalResult.rows[0].total);

    // Get expenses by category
    const result = await query(
      `SELECT
        c.id_categoria,
        c.nombre as categoria,
        COALESCE(SUM(m.importe), 0) as total,
        COUNT(m.id_movimiento) as num_movimientos
       FROM movimientos m
       JOIN categorias c ON m.id_categoria = c.id_categoria
       WHERE m.id_cuenta = $1 AND m.estado = $2 AND m.tipo = $3 ${dateFilter}
       GROUP BY c.id_categoria, c.nombre
       ORDER BY total DESC`,
      params
    );

    const categories = result.rows.map(row => ({
      id: row.id_categoria,
      categoria: row.categoria,
      total: roundToDecimals(parseFloat(row.total)),
      numMovimientos: parseInt(row.num_movimientos),
      porcentaje: totalExpenses > 0
        ? roundToDecimals((parseFloat(row.total) / totalExpenses) * 100)
        : 0
    }));

    res.json({
      categories,
      totalGastos: roundToDecimals(totalExpenses),
      periodo: { fechaDesde: startDate, fechaHasta: endDate }
    });
  } catch (error) {
    console.error('Get expenses by category error:', error);
    res.status(500).json({ error: 'Failed to get expenses by category.' });
  }
};

/**
 * Get income breakdown by category
 */
export const getIncomeByCategory = async (req, res) => {
  try {
    const { accountId } = req.params;
    const { startDate, endDate } = getDateParams(req.query);

    let dateFilter = '';
    const params = [accountId, ESTADO_CONFIRMADO, 'ingreso'];
    let paramIndex = 4;

    if (startDate && endDate) {
      dateFilter = `AND m.fecha_operacion >= $${paramIndex} AND m.fecha_operacion <= $${paramIndex + 1}`;
      params.push(startDate, endDate);
    }

    // Get total income
    const totalResult = await query(
      `SELECT COALESCE(SUM(importe), 0) as total
       FROM movimientos
       WHERE id_cuenta = $1 AND estado = $2 AND tipo = $3 ${dateFilter.replaceAll('m.', '')}`,
      params
    );
    const totalIncome = parseFloat(totalResult.rows[0].total);

    // Get income by category
    const result = await query(
      `SELECT
        c.id_categoria,
        c.nombre as categoria,
        COALESCE(SUM(m.importe), 0) as total,
        COUNT(m.id_movimiento) as num_movimientos
       FROM movimientos m
       JOIN categorias c ON m.id_categoria = c.id_categoria
       WHERE m.id_cuenta = $1 AND m.estado = $2 AND m.tipo = $3 ${dateFilter}
       GROUP BY c.id_categoria, c.nombre
       ORDER BY total DESC`,
      params
    );

    const categories = result.rows.map(row => ({
      id: row.id_categoria,
      categoria: row.categoria,
      total: roundToDecimals(parseFloat(row.total)),
      numMovimientos: parseInt(row.num_movimientos),
      porcentaje: totalIncome > 0
        ? roundToDecimals((parseFloat(row.total) / totalIncome) * 100)
        : 0
    }));

    res.json({
      categories,
      totalIngresos: roundToDecimals(totalIncome),
      periodo: { fechaDesde: startDate, fechaHasta: endDate }
    });
  } catch (error) {
    console.error('Get income by category error:', error);
    res.status(500).json({ error: 'Failed to get income by category.' });
  }
};

/**
 * Compare two periods (for trend analysis)
 */
export const comparePeriods = async (req, res) => {
  try {
    const { accountId } = req.params;
    const {
      periodo_a_inicio, periodo_a_fin, periodo_b_inicio, periodo_b_fin,
      periodo1_inicio, periodo1_fin, periodo2_inicio, periodo2_fin
    } = req.query;

    // Support both naming conventions
    const periodAStart = periodo_a_inicio || periodo1_inicio;
    const periodAEnd = periodo_a_fin || periodo1_fin;
    const periodBStart = periodo_b_inicio || periodo2_inicio;
    const periodBEnd = periodo_b_fin || periodo2_fin;

    if (!periodAStart || !periodAEnd || !periodBStart || !periodBEnd) {
      return res.status(400).json({
        error: 'Both periods with start and end dates are required.'
      });
    }

    // Get totals for period A
    const periodAResult = await query(
      `SELECT
        c.id_categoria,
        c.nombre as categoria,
        m.tipo,
        COALESCE(SUM(m.importe), 0) as total
       FROM movimientos m
       JOIN categorias c ON m.id_categoria = c.id_categoria
       WHERE m.id_cuenta = $1 AND m.estado = $2
         AND m.fecha_operacion >= $3 AND m.fecha_operacion <= $4
       GROUP BY c.id_categoria, c.nombre, m.tipo`,
      [accountId, ESTADO_CONFIRMADO, periodAStart, periodAEnd]
    );

    // Get totals for period B
    const periodBResult = await query(
      `SELECT
        c.id_categoria,
        c.nombre as categoria,
        m.tipo,
        COALESCE(SUM(m.importe), 0) as total
       FROM movimientos m
       JOIN categorias c ON m.id_categoria = c.id_categoria
       WHERE m.id_cuenta = $1 AND m.estado = $2
         AND m.fecha_operacion >= $3 AND m.fecha_operacion <= $4
       GROUP BY c.id_categoria, c.nombre, m.tipo`,
      [accountId, ESTADO_CONFIRMADO, periodBStart, periodBEnd]
    );

    // Build comparison map
    const periodAMap = new Map();
    const periodBMap = new Map();

    periodAResult.rows.forEach(row => {
      const key = `${row.id_categoria}-${row.tipo}`;
      periodAMap.set(key, {
        idCategoria: row.id_categoria,
        categoria: row.categoria,
        tipo: row.tipo,
        total: parseFloat(row.total)
      });
    });

    periodBResult.rows.forEach(row => {
      const key = `${row.id_categoria}-${row.tipo}`;
      periodBMap.set(key, {
        idCategoria: row.id_categoria,
        categoria: row.categoria,
        tipo: row.tipo,
        total: parseFloat(row.total)
      });
    });

    // Combine all keys
    const allKeys = new Set([...periodAMap.keys(), ...periodBMap.keys()]);
    const comparison = [];

    allKeys.forEach(key => {
      const periodA = periodAMap.get(key);
      const periodB = periodBMap.get(key);

      const totalA = periodA?.total || 0;
      const totalB = periodB?.total || 0;
      const diferencia = totalB - totalA;
      const variacion = calculatePercentageChange(totalA, totalB);

      comparison.push({
        idCategoria: (periodA || periodB).idCategoria,
        categoria: (periodA || periodB).categoria,
        tipo: (periodA || periodB).tipo,
        periodoA: roundToDecimals(totalA),
        periodoB: roundToDecimals(totalB),
        diferencia: roundToDecimals(diferencia),
        variacionPorcentaje: roundToDecimals(variacion)
      });
    });

    // Calculate summary
    const summaryA = { ingresos: 0, gastos: 0 };
    const summaryB = { ingresos: 0, gastos: 0 };

    periodAResult.rows.forEach(row => {
      if (row.tipo === 'ingreso') summaryA.ingresos += parseFloat(row.total);
      else summaryA.gastos += parseFloat(row.total);
    });

    periodBResult.rows.forEach(row => {
      if (row.tipo === 'ingreso') summaryB.ingresos += parseFloat(row.total);
      else summaryB.gastos += parseFloat(row.total);
    });

    res.json({
      comparison: comparison.sort((a, b) => Math.abs(b.diferencia) - Math.abs(a.diferencia)),
      resumen: {
        periodoA: {
          fechaInicio: periodAStart,
          fechaFin: periodAEnd,
          ingresos: roundToDecimals(summaryA.ingresos),
          gastos: roundToDecimals(summaryA.gastos),
          saldo: roundToDecimals(summaryA.ingresos - summaryA.gastos)
        },
        periodoB: {
          fechaInicio: periodBStart,
          fechaFin: periodBEnd,
          ingresos: roundToDecimals(summaryB.ingresos),
          gastos: roundToDecimals(summaryB.gastos),
          saldo: roundToDecimals(summaryB.ingresos - summaryB.gastos)
        },
        variacion: {
          ingresos: roundToDecimals(calculatePercentageChange(summaryA.ingresos, summaryB.ingresos)),
          gastos: roundToDecimals(calculatePercentageChange(summaryA.gastos, summaryB.gastos)),
          saldo: roundToDecimals(calculatePercentageChange(
            summaryA.ingresos - summaryA.gastos,
            summaryB.ingresos - summaryB.gastos
          ))
        }
      }
    });
  } catch (error) {
    console.error('Compare periods error:', error);
    res.status(500).json({ error: 'Failed to compare periods.' });
  }
};

/**
 * Get top spending categories (ranking)
 */
export const getTopCategories = async (req, res) => {
  try {
    const { accountId } = req.params;
    const { tipo, limit } = req.query;
    const { startDate, endDate } = getDateParams(req.query);

    const topLimit = Math.min(parseInt(limit) || 10, 50);
    const movementType = tipo || 'gasto';

    let dateFilter = '';
    const params = [accountId, ESTADO_CONFIRMADO, movementType, topLimit];
    let paramIndex = 5;

    if (startDate && endDate) {
      dateFilter = `AND m.fecha_operacion >= $${paramIndex} AND m.fecha_operacion <= $${paramIndex + 1}`;
      params.push(startDate, endDate);
    }

    const result = await query(
      `SELECT
        c.id_categoria,
        c.nombre as categoria,
        COALESCE(SUM(m.importe), 0) as total,
        COUNT(m.id_movimiento) as num_movimientos,
        MIN(m.fecha_operacion) as primera_fecha,
        MAX(m.fecha_operacion) as ultima_fecha
       FROM movimientos m
       JOIN categorias c ON m.id_categoria = c.id_categoria
       WHERE m.id_cuenta = $1 AND m.estado = $2 AND m.tipo = $3 ${dateFilter}
       GROUP BY c.id_categoria, c.nombre
       ORDER BY total DESC
       LIMIT $4`,
      params
    );

    const ranking = result.rows.map((row, index) => ({
      posicion: index + 1,
      id: row.id_categoria,
      categoria: row.categoria,
      total: roundToDecimals(parseFloat(row.total)),
      numMovimientos: parseInt(row.num_movimientos),
      primeraFecha: row.primera_fecha,
      ultimaFecha: row.ultima_fecha
    }));

    res.json({
      ranking,
      tipo: movementType,
      periodo: { fechaDesde: startDate, fechaHasta: endDate }
    });
  } catch (error) {
    console.error('Get top categories error:', error);
    res.status(500).json({ error: 'Failed to get top categories.' });
  }
};

/**
 * Income vs Expenses report
 */
export const getIncomeVsExpenses = async (req, res) => {
  try {
    const { accountId } = req.params;
    const { agrupacion } = req.query;
    const { startDate, endDate } = getDateParams(req.query);

    let dateFilter = '';
    const params = [accountId, ESTADO_CONFIRMADO];
    let paramIndex = 3;

    if (startDate && endDate) {
      dateFilter = `AND fecha_operacion >= $${paramIndex} AND fecha_operacion <= $${paramIndex + 1}`;
      params.push(startDate, endDate);
    }

    let groupBy, selectPeriod, orderBy;

    switch (agrupacion) {
      case 'dia':
        groupBy = "DATE_TRUNC('day', fecha_operacion)";
        selectPeriod = `TO_CHAR(fecha_operacion, 'YYYY-MM-DD') as periodo`;
        orderBy = 'fecha_operacion';
        break;
      case 'semana':
        groupBy = "DATE_TRUNC('week', fecha_operacion)";
        selectPeriod = `TO_CHAR(DATE_TRUNC('week', fecha_operacion), 'YYYY-"W"IW') as periodo`;
        orderBy = "DATE_TRUNC('week', fecha_operacion)";
        break;
      case 'trimestre':
        groupBy = "DATE_TRUNC('quarter', fecha_operacion)";
        selectPeriod = `TO_CHAR(DATE_TRUNC('quarter', fecha_operacion), 'YYYY-"Q"Q') as periodo`;
        orderBy = "DATE_TRUNC('quarter', fecha_operacion)";
        break;
      case 'mes':
      default:
        groupBy = "DATE_TRUNC('month', fecha_operacion)";
        selectPeriod = `TO_CHAR(DATE_TRUNC('month', fecha_operacion), 'YYYY-MM') as periodo`;
        orderBy = "DATE_TRUNC('month', fecha_operacion)";
        break;
    }

    const result = await query(
      `SELECT
        ${selectPeriod},
        COALESCE(SUM(CASE WHEN tipo = 'ingreso' THEN importe ELSE 0 END), 0) as ingresos,
        COALESCE(SUM(CASE WHEN tipo = 'gasto' THEN importe ELSE 0 END), 0) as gastos
       FROM movimientos
       WHERE id_cuenta = $1 AND estado = $2 ${dateFilter}
       GROUP BY ${groupBy}
       ORDER BY ${orderBy} ASC`,
      params
    );

    // Calculate totals
    let totalIngresos = 0;
    let totalGastos = 0;

    const series = result.rows.map(row => {
      const ingresos = parseFloat(row.ingresos);
      const gastos = parseFloat(row.gastos);
      totalIngresos += ingresos;
      totalGastos += gastos;

      return {
        periodo: row.periodo,
        ingresos: roundToDecimals(ingresos),
        gastos: roundToDecimals(gastos),
        balance: roundToDecimals(ingresos - gastos)
      };
    });

    res.json({
      series,
      totales: {
        ingresos: roundToDecimals(totalIngresos),
        gastos: roundToDecimals(totalGastos),
        balance: roundToDecimals(totalIngresos - totalGastos)
      },
      agrupacion: agrupacion || 'mes',
      periodo: { fechaDesde: startDate, fechaHasta: endDate }
    });
  } catch (error) {
    console.error('Get income vs expenses error:', error);
    res.status(500).json({ error: 'Failed to get income vs expenses report.' });
  }
};

/**
 * Get net income after deductions
 * (Ingresos - categorias marcadas como deducciones)
 */
export const getNetIncome = async (req, res) => {
  try {
    const { accountId } = req.params;
    const { categorias_deduccion } = req.query;
    const { startDate, endDate } = getDateParams(req.query);

    let dateFilter = '';
    const params = [accountId, ESTADO_CONFIRMADO];
    let paramIndex = 3;

    if (startDate && endDate) {
      dateFilter = `AND fecha_operacion >= $${paramIndex} AND fecha_operacion <= $${paramIndex + 1}`;
      params.push(startDate, endDate);
      paramIndex += 2;
    }

    // Get total income
    const incomeResult = await query(
      `SELECT COALESCE(SUM(importe), 0) as total
       FROM movimientos
       WHERE id_cuenta = $1 AND estado = $2 AND tipo = 'ingreso' ${dateFilter}`,
      params
    );
    const totalIncome = parseFloat(incomeResult.rows[0].total);

    // Get deductions if categories specified
    let totalDeductions = 0;
    let deductionDetails = [];

    if (categorias_deduccion) {
      const deductionCategoryIds = categorias_deduccion.split(',');

      const deductionsResult = await query(
        `SELECT
          c.id_categoria,
          c.nombre as categoria,
          COALESCE(SUM(m.importe), 0) as total
         FROM movimientos m
         JOIN categorias c ON m.id_categoria = c.id_categoria
         WHERE m.id_cuenta = $1 AND m.estado = $2 AND m.tipo = 'gasto'
           AND m.id_categoria = ANY($${paramIndex})
           ${dateFilter}
         GROUP BY c.id_categoria, c.nombre`,
        [...params.slice(0, 2), deductionCategoryIds, ...params.slice(2)]
      );

      deductionDetails = deductionsResult.rows.map(row => {
        const amount = parseFloat(row.total);
        totalDeductions += amount;
        return {
          id: row.id_categoria,
          categoria: row.categoria,
          total: roundToDecimals(amount)
        };
      });
    }

    const netIncome = totalIncome - totalDeductions;

    res.json({
      ingresosBrutos: roundToDecimals(totalIncome),
      deducciones: {
        total: roundToDecimals(totalDeductions),
        detalle: deductionDetails
      },
      ingresosNetos: roundToDecimals(netIncome),
      periodo: { fechaDesde: startDate, fechaHasta: endDate }
    });
  } catch (error) {
    console.error('Get net income error:', error);
    res.status(500).json({ error: 'Failed to get net income.' });
  }
};

/**
 * Get spending by provider
 */
export const getSpendingByProvider = async (req, res) => {
  try {
    const { accountId } = req.params;
    const { limit } = req.query;
    const { startDate, endDate } = getDateParams(req.query);

    const topLimit = Math.min(parseInt(limit) || 20, 100);

    let dateFilter = '';
    const params = [accountId, ESTADO_CONFIRMADO, topLimit];
    let paramIndex = 4;

    if (startDate && endDate) {
      dateFilter = `AND fecha_operacion >= $${paramIndex} AND fecha_operacion <= $${paramIndex + 1}`;
      params.push(startDate, endDate);
    }

    const result = await query(
      `SELECT
        COALESCE(proveedor, 'Sin proveedor') as proveedor,
        COALESCE(SUM(importe), 0) as total,
        COUNT(*) as num_movimientos
       FROM movimientos
       WHERE id_cuenta = $1 AND estado = $2 AND tipo = 'gasto' ${dateFilter}
       GROUP BY proveedor
       ORDER BY total DESC
       LIMIT $3`,
      params
    );

    const providers = result.rows.map(row => ({
      proveedor: row.proveedor,
      total: roundToDecimals(parseFloat(row.total)),
      numMovimientos: parseInt(row.num_movimientos)
    }));

    res.json({
      providers,
      periodo: { fechaDesde: startDate, fechaHasta: endDate }
    });
  } catch (error) {
    console.error('Get spending by provider error:', error);
    res.status(500).json({ error: 'Failed to get spending by provider.' });
  }
};

/**
 * Get monthly trends (last 12 months)
 */
export const getMonthlyTrends = async (req, res) => {
  try {
    const { accountId } = req.params;
    const { months } = req.query;

    const numMonths = Math.min(parseInt(months) || 12, 24);

    const result = await query(
      `SELECT
        TO_CHAR(DATE_TRUNC('month', fecha_operacion), 'YYYY-MM') as periodo,
        EXTRACT(YEAR FROM fecha_operacion) as year,
        EXTRACT(MONTH FROM fecha_operacion) as month,
        COALESCE(SUM(CASE WHEN tipo = 'ingreso' THEN importe ELSE 0 END), 0) as ingresos,
        COALESCE(SUM(CASE WHEN tipo = 'gasto' THEN importe ELSE 0 END), 0) as gastos,
        COUNT(*) as num_movimientos
       FROM movimientos
       WHERE id_cuenta = $1 AND estado = $2
         AND fecha_operacion >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '${numMonths - 1} months'
       GROUP BY DATE_TRUNC('month', fecha_operacion),
                EXTRACT(YEAR FROM fecha_operacion),
                EXTRACT(MONTH FROM fecha_operacion)
       ORDER BY DATE_TRUNC('month', fecha_operacion) ASC`,
      [accountId, ESTADO_CONFIRMADO]
    );

    const trends = result.rows.map(row => ({
      periodo: row.periodo,
      year: parseInt(row.year),
      month: parseInt(row.month),
      ingresos: roundToDecimals(parseFloat(row.ingresos)),
      gastos: roundToDecimals(parseFloat(row.gastos)),
      balance: roundToDecimals(parseFloat(row.ingresos) - parseFloat(row.gastos)),
      numMovimientos: parseInt(row.num_movimientos)
    }));

    // Calculate averages
    const avgIngresos = trends.reduce((sum, t) => sum + t.ingresos, 0) / trends.length;
    const avgGastos = trends.reduce((sum, t) => sum + t.gastos, 0) / trends.length;

    res.json({
      trends,
      promedios: {
        ingresos: roundToDecimals(avgIngresos),
        gastos: roundToDecimals(avgGastos),
        balance: roundToDecimals(avgIngresos - avgGastos)
      },
      numMeses: trends.length
    });
  } catch (error) {
    console.error('Get monthly trends error:', error);
    res.status(500).json({ error: 'Failed to get monthly trends.' });
  }
};

/**
 * Get dashboard summary for an account
 */
export const getDashboardSummary = async (req, res) => {
  try {
    const { accountId } = req.params;

    // Get current month totals
    const currentMonthResult = await query(
      `SELECT
        COALESCE(SUM(CASE WHEN tipo = 'ingreso' THEN importe ELSE 0 END), 0) as ingresos,
        COALESCE(SUM(CASE WHEN tipo = 'gasto' THEN importe ELSE 0 END), 0) as gastos,
        COUNT(*) as num_movimientos
       FROM movimientos
       WHERE id_cuenta = $1 AND estado = $2
         AND fecha_operacion >= DATE_TRUNC('month', CURRENT_DATE)`,
      [accountId, ESTADO_CONFIRMADO]
    );

    // Get previous month totals (for comparison)
    const prevMonthResult = await query(
      `SELECT
        COALESCE(SUM(CASE WHEN tipo = 'ingreso' THEN importe ELSE 0 END), 0) as ingresos,
        COALESCE(SUM(CASE WHEN tipo = 'gasto' THEN importe ELSE 0 END), 0) as gastos
       FROM movimientos
       WHERE id_cuenta = $1 AND estado = $2
         AND fecha_operacion >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '1 month'
         AND fecha_operacion < DATE_TRUNC('month', CURRENT_DATE)`,
      [accountId, ESTADO_CONFIRMADO]
    );

    // Get all-time balance
    const balanceResult = await query(
      `SELECT
        COALESCE(SUM(CASE WHEN tipo = 'ingreso' THEN importe ELSE 0 END), 0) -
        COALESCE(SUM(CASE WHEN tipo = 'gasto' THEN importe ELSE 0 END), 0) as saldo_total
       FROM movimientos
       WHERE id_cuenta = $1 AND estado = $2`,
      [accountId, ESTADO_CONFIRMADO]
    );

    // Get pending movements count
    const pendingResult = await query(
      `SELECT COUNT(*) as pendientes
       FROM movimientos
       WHERE id_cuenta = $1 AND estado = 'pendiente_revision'`,
      [accountId]
    );

    // Get top 5 expense categories this month
    const topCategoriesResult = await query(
      `SELECT
        c.nombre as categoria,
        COALESCE(SUM(m.importe), 0) as total
       FROM movimientos m
       JOIN categorias c ON m.id_categoria = c.id_categoria
       WHERE m.id_cuenta = $1 AND m.estado = $2 AND m.tipo = 'gasto'
         AND m.fecha_operacion >= DATE_TRUNC('month', CURRENT_DATE)
       GROUP BY c.id_categoria, c.nombre
       ORDER BY total DESC
       LIMIT 5`,
      [accountId, ESTADO_CONFIRMADO]
    );

    // Get recent movements
    const recentResult = await query(
      `SELECT m.*, c.nombre as categoria_nombre
       FROM movimientos m
       LEFT JOIN categorias c ON m.id_categoria = c.id_categoria
       WHERE m.id_cuenta = $1
       ORDER BY m.fecha_operacion DESC, m.created_at DESC
       LIMIT 5`,
      [accountId]
    );

    const current = currentMonthResult.rows[0];
    const previous = prevMonthResult.rows[0];

    res.json({
      mesActual: {
        ingresos: roundToDecimals(parseFloat(current.ingresos)),
        gastos: roundToDecimals(parseFloat(current.gastos)),
        balance: roundToDecimals(parseFloat(current.ingresos) - parseFloat(current.gastos)),
        numMovimientos: parseInt(current.num_movimientos)
      },
      comparacionMesAnterior: {
        ingresos: roundToDecimals(calculatePercentageChange(
          parseFloat(previous.ingresos),
          parseFloat(current.ingresos)
        )),
        gastos: roundToDecimals(calculatePercentageChange(
          parseFloat(previous.gastos),
          parseFloat(current.gastos)
        ))
      },
      saldoTotal: roundToDecimals(parseFloat(balanceResult.rows[0].saldo_total)),
      pendientesRevision: parseInt(pendingResult.rows[0].pendientes),
      topCategoriasGasto: topCategoriesResult.rows.map(row => ({
        categoria: row.categoria,
        total: roundToDecimals(parseFloat(row.total))
      })),
      movimientosRecientes: recentResult.rows.map(m => ({
        id: m.id_movimiento,
        tipo: m.tipo,
        fechaOperacion: m.fecha_operacion,
        importe: roundToDecimals(parseFloat(m.importe)),
        categoria: m.categoria_nombre,
        proveedor: m.proveedor,
        estado: m.estado
      }))
    });
  } catch (error) {
    console.error('Get dashboard summary error:', error);
    res.status(500).json({ error: 'Failed to get dashboard summary.' });
  }
};

/**
 * Find the most expensive month
 */
export const getMostExpensiveMonth = async (req, res) => {
  try {
    const { accountId } = req.params;
    const { year } = req.query;

    let dateFilter = '';
    const params = [accountId, ESTADO_CONFIRMADO];

    if (year) {
      dateFilter = 'AND EXTRACT(YEAR FROM fecha_operacion) = $3';
      params.push(year);
    }

    const result = await query(
      `SELECT
        TO_CHAR(DATE_TRUNC('month', fecha_operacion), 'YYYY-MM') as periodo,
        EXTRACT(YEAR FROM fecha_operacion) as year,
        EXTRACT(MONTH FROM fecha_operacion) as month,
        COALESCE(SUM(importe), 0) as total_gastos
       FROM movimientos
       WHERE id_cuenta = $1 AND estado = $2 AND tipo = 'gasto' ${dateFilter}
       GROUP BY DATE_TRUNC('month', fecha_operacion),
                EXTRACT(YEAR FROM fecha_operacion),
                EXTRACT(MONTH FROM fecha_operacion)
       ORDER BY total_gastos DESC
       LIMIT 1`,
      params
    );

    if (result.rows.length === 0) {
      return res.json({ message: 'No expenses found.' });
    }

    const row = result.rows[0];

    res.json({
      mesMasCostoso: {
        periodo: row.periodo,
        year: parseInt(row.year),
        month: parseInt(row.month),
        totalGastos: roundToDecimals(parseFloat(row.total_gastos))
      }
    });
  } catch (error) {
    console.error('Get most expensive month error:', error);
    res.status(500).json({ error: 'Failed to get most expensive month.' });
  }
};

/**
 * Get all accounts summary for admin dashboard
 */
export const getAllAccountsSummary = async (req, res) => {
  try {
    if (!req.user.isAdmin) {
      return res.status(403).json({ error: 'Admin access required.' });
    }

    const result = await query(
      `SELECT
        c.id_cuenta,
        c.nombre,
        c.tipo,
        c.moneda,
        u.nombre as propietario,
        COALESCE(SUM(CASE WHEN m.tipo = 'ingreso' AND m.estado = 'confirmado' THEN m.importe ELSE 0 END), 0) as total_ingresos,
        COALESCE(SUM(CASE WHEN m.tipo = 'gasto' AND m.estado = 'confirmado' THEN m.importe ELSE 0 END), 0) as total_gastos,
        COUNT(DISTINCT m.id_movimiento) as num_movimientos
       FROM cuentas c
       JOIN usuarios u ON c.id_usuario_propietario = u.id_usuario
       LEFT JOIN movimientos m ON c.id_cuenta = m.id_cuenta
       WHERE c.estado = 'activa'
       GROUP BY c.id_cuenta, c.nombre, c.tipo, c.moneda, u.nombre
       ORDER BY c.nombre`
    );

    const accounts = result.rows.map(row => ({
      id: row.id_cuenta,
      nombre: row.nombre,
      tipo: row.tipo,
      moneda: row.moneda,
      propietario: row.propietario,
      totalIngresos: roundToDecimals(parseFloat(row.total_ingresos)),
      totalGastos: roundToDecimals(parseFloat(row.total_gastos)),
      saldo: roundToDecimals(parseFloat(row.total_ingresos) - parseFloat(row.total_gastos)),
      numMovimientos: parseInt(row.num_movimientos)
    }));

    res.json({ accounts });
  } catch (error) {
    console.error('Get all accounts summary error:', error);
    res.status(500).json({ error: 'Failed to get accounts summary.' });
  }
};
