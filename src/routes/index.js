import { Router } from 'express';
import { body, param, query as queryValidator } from 'express-validator';
import { validate, errorMessages } from '../middleware/validation.js';
import { authenticate, requireAdmin, checkAccountPermission, attachAccountInfo } from '../middleware/auth.js';
import { upload, uploadMultiple } from '../middleware/upload.js';

// Controllers
import * as authController from '../controllers/authController.js';
import * as userController from '../controllers/userController.js';
import * as accountController from '../controllers/accountController.js';
import * as movementController from '../controllers/movementController.js';
import * as categoryController from '../controllers/categoryController.js';
import * as tagController from '../controllers/tagController.js';
import * as documentController from '../controllers/documentController.js';
import * as taskController from '../controllers/taskController.js';
import * as calendarController from '../controllers/calendarController.js';
import * as reportController from '../controllers/reportController.js';

const router = Router();

// ==================== HEALTH CHECK ====================
router.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ==================== AUTH ROUTES ====================
router.post('/auth/register',
  body('nombre').notEmpty().withMessage(errorMessages.required('Nombre')),
  body('email').isEmail().withMessage(errorMessages.email),
  body('password').isLength({ min: 6 }).withMessage(errorMessages.minLength('Password', 6)),
  validate,
  authController.register
);

router.post('/auth/login',
  body('email').isEmail().withMessage(errorMessages.email),
  body('password').notEmpty().withMessage(errorMessages.required('Password')),
  validate,
  authController.login
);

router.get('/auth/profile', authenticate, authController.getProfile);
router.put('/auth/profile', authenticate, authController.updateProfile);
router.put('/auth/change-password',
  authenticate,
  body('currentPassword').notEmpty().withMessage(errorMessages.required('Current password')),
  body('newPassword').isLength({ min: 6 }).withMessage(errorMessages.minLength('New password', 6)),
  validate,
  authController.changePassword
);
router.post('/auth/refresh', authenticate, authController.refreshToken);

// ==================== USER ROUTES (Admin only) ====================
router.get('/users', authenticate, requireAdmin, userController.getAllUsers);
router.get('/users/:userId',
  authenticate,
  requireAdmin,
  param('userId').isUUID().withMessage(errorMessages.uuid('User ID')),
  validate,
  userController.getUserById
);
router.post('/users',
  authenticate,
  requireAdmin,
  body('nombre').notEmpty().withMessage(errorMessages.required('Nombre')),
  body('email').isEmail().withMessage(errorMessages.email),
  body('password').isLength({ min: 6 }).withMessage(errorMessages.minLength('Password', 6)),
  validate,
  userController.createUser
);
router.put('/users/:userId',
  authenticate,
  requireAdmin,
  param('userId').isUUID().withMessage(errorMessages.uuid('User ID')),
  validate,
  userController.updateUser
);
router.delete('/users/:userId',
  authenticate,
  requireAdmin,
  param('userId').isUUID().withMessage(errorMessages.uuid('User ID')),
  validate,
  userController.deleteUser
);
router.put('/users/:userId/reset-password',
  authenticate,
  requireAdmin,
  param('userId').isUUID().withMessage(errorMessages.uuid('User ID')),
  body('newPassword').isLength({ min: 6 }).withMessage(errorMessages.minLength('New password', 6)),
  validate,
  userController.resetUserPassword
);

// ==================== ACCOUNT ROUTES ====================
router.get('/accounts', authenticate, accountController.getAccounts);
router.get('/accounts/:accountId',
  authenticate,
  param('accountId').isUUID().withMessage(errorMessages.uuid('Account ID')),
  validate,
  accountController.getAccountById
);
router.post('/accounts',
  authenticate,
  body('nombre').notEmpty().withMessage(errorMessages.required('Nombre')),
  body('tipo').isIn(['personal', 'negocio', 'ahorro', 'compartida']).withMessage(errorMessages.enum('Tipo', ['personal', 'negocio', 'ahorro', 'compartida'])),
  validate,
  accountController.createAccount
);
router.put('/accounts/:accountId',
  authenticate,
  param('accountId').isUUID().withMessage(errorMessages.uuid('Account ID')),
  validate,
  checkAccountPermission(['editar']),
  accountController.updateAccount
);
router.delete('/accounts/:accountId',
  authenticate,
  param('accountId').isUUID().withMessage(errorMessages.uuid('Account ID')),
  validate,
  accountController.deleteAccount
);

// Account member management
router.post('/accounts/:accountId/members',
  authenticate,
  param('accountId').isUUID().withMessage(errorMessages.uuid('Account ID')),
  body('email').isEmail().withMessage(errorMessages.email),
  validate,
  checkAccountPermission(['invitar_usuarios']),
  accountController.inviteUser
);
router.put('/accounts/:accountId/members/:userId',
  authenticate,
  param('accountId').isUUID().withMessage(errorMessages.uuid('Account ID')),
  param('userId').isUUID().withMessage(errorMessages.uuid('User ID')),
  body('rol_en_cuenta').isIn(['editor', 'solo_lectura']).withMessage(errorMessages.enum('Rol', ['editor', 'solo_lectura'])),
  validate,
  checkAccountPermission(['invitar_usuarios']),
  accountController.updateMemberRole
);
router.delete('/accounts/:accountId/members/:userId',
  authenticate,
  param('accountId').isUUID().withMessage(errorMessages.uuid('Account ID')),
  param('userId').isUUID().withMessage(errorMessages.uuid('User ID')),
  validate,
  checkAccountPermission(['invitar_usuarios']),
  accountController.removeMember
);

// ==================== MOVEMENT ROUTES ====================
router.get('/accounts/:accountId/movements',
  authenticate,
  param('accountId').isUUID().withMessage(errorMessages.uuid('Account ID')),
  validate,
  checkAccountPermission(['ver']),
  movementController.getMovements
);
router.get('/accounts/:accountId/movements/:movementId',
  authenticate,
  param('accountId').isUUID().withMessage(errorMessages.uuid('Account ID')),
  param('movementId').isUUID().withMessage(errorMessages.uuid('Movement ID')),
  validate,
  checkAccountPermission(['ver']),
  movementController.getMovementById
);
router.post('/accounts/:accountId/movements',
  authenticate,
  param('accountId').isUUID().withMessage(errorMessages.uuid('Account ID')),
  body('tipo').isIn(['ingreso', 'gasto']).withMessage(errorMessages.enum('Tipo', ['ingreso', 'gasto'])),
  body('fecha_operacion').isDate().withMessage(errorMessages.date('Fecha operacion')),
  body('importe').isFloat({ gt: 0 }).withMessage(errorMessages.positive('Importe')),
  body('id_categoria').isUUID().withMessage(errorMessages.uuid('Categoria')),
  validate,
  checkAccountPermission(['crear']),
  movementController.createMovement
);
router.put('/accounts/:accountId/movements/:movementId',
  authenticate,
  param('accountId').isUUID().withMessage(errorMessages.uuid('Account ID')),
  param('movementId').isUUID().withMessage(errorMessages.uuid('Movement ID')),
  validate,
  checkAccountPermission(['editar']),
  movementController.updateMovement
);
router.delete('/accounts/:accountId/movements/:movementId',
  authenticate,
  param('accountId').isUUID().withMessage(errorMessages.uuid('Account ID')),
  param('movementId').isUUID().withMessage(errorMessages.uuid('Movement ID')),
  validate,
  checkAccountPermission(['borrar']),
  movementController.deleteMovement
);
router.put('/accounts/:accountId/movements/:movementId/confirm',
  authenticate,
  param('accountId').isUUID().withMessage(errorMessages.uuid('Account ID')),
  param('movementId').isUUID().withMessage(errorMessages.uuid('Movement ID')),
  validate,
  checkAccountPermission(['editar']),
  movementController.confirmMovement
);
router.post('/accounts/:accountId/movements/bulk',
  authenticate,
  param('accountId').isUUID().withMessage(errorMessages.uuid('Account ID')),
  body('movements').isArray({ min: 1 }).withMessage('At least one movement is required'),
  validate,
  checkAccountPermission(['crear']),
  movementController.bulkCreateMovements
);

// ==================== CATEGORY ROUTES ====================
router.get('/accounts/:accountId/categories',
  authenticate,
  param('accountId').isUUID().withMessage(errorMessages.uuid('Account ID')),
  validate,
  checkAccountPermission(['ver']),
  categoryController.getCategories
);
router.post('/accounts/:accountId/categories',
  authenticate,
  param('accountId').isUUID().withMessage(errorMessages.uuid('Account ID')),
  body('nombre').notEmpty().withMessage(errorMessages.required('Nombre')),
  body('tipo').isIn(['ingreso', 'gasto', 'ambos']).withMessage(errorMessages.enum('Tipo', ['ingreso', 'gasto', 'ambos'])),
  validate,
  checkAccountPermission(['gestionar_categorias']),
  categoryController.createCategory
);
router.put('/accounts/:accountId/categories/:categoryId',
  authenticate,
  param('accountId').isUUID().withMessage(errorMessages.uuid('Account ID')),
  param('categoryId').isUUID().withMessage(errorMessages.uuid('Category ID')),
  validate,
  checkAccountPermission(['gestionar_categorias']),
  categoryController.updateCategory
);
router.delete('/accounts/:accountId/categories/:categoryId',
  authenticate,
  param('accountId').isUUID().withMessage(errorMessages.uuid('Account ID')),
  param('categoryId').isUUID().withMessage(errorMessages.uuid('Category ID')),
  validate,
  checkAccountPermission(['gestionar_categorias']),
  categoryController.deleteCategory
);

// Global categories (admin only)
router.get('/categories/global', authenticate, categoryController.getGlobalCategories);
router.post('/categories/global',
  authenticate,
  requireAdmin,
  body('nombre').notEmpty().withMessage(errorMessages.required('Nombre')),
  body('tipo').isIn(['ingreso', 'gasto', 'ambos']).withMessage(errorMessages.enum('Tipo', ['ingreso', 'gasto', 'ambos'])),
  validate,
  categoryController.createGlobalCategory
);
router.put('/categories/global/:categoryId',
  authenticate,
  requireAdmin,
  param('categoryId').isUUID().withMessage(errorMessages.uuid('Category ID')),
  validate,
  categoryController.updateGlobalCategory
);
router.delete('/categories/global/:categoryId',
  authenticate,
  requireAdmin,
  param('categoryId').isUUID().withMessage(errorMessages.uuid('Category ID')),
  validate,
  categoryController.deleteGlobalCategory
);

// ==================== TAG ROUTES ====================
router.get('/accounts/:accountId/tags',
  authenticate,
  param('accountId').isUUID().withMessage(errorMessages.uuid('Account ID')),
  validate,
  checkAccountPermission(['ver']),
  tagController.getTags
);
router.get('/accounts/:accountId/tags/:tagId',
  authenticate,
  param('accountId').isUUID().withMessage(errorMessages.uuid('Account ID')),
  param('tagId').isUUID().withMessage(errorMessages.uuid('Tag ID')),
  validate,
  checkAccountPermission(['ver']),
  tagController.getTagById
);
router.post('/accounts/:accountId/tags',
  authenticate,
  param('accountId').isUUID().withMessage(errorMessages.uuid('Account ID')),
  body('nombre').notEmpty().withMessage(errorMessages.required('Nombre')),
  validate,
  checkAccountPermission(['crear']),
  tagController.createTag
);
router.put('/accounts/:accountId/tags/:tagId',
  authenticate,
  param('accountId').isUUID().withMessage(errorMessages.uuid('Account ID')),
  param('tagId').isUUID().withMessage(errorMessages.uuid('Tag ID')),
  validate,
  checkAccountPermission(['editar']),
  tagController.updateTag
);
router.delete('/accounts/:accountId/tags/:tagId',
  authenticate,
  param('accountId').isUUID().withMessage(errorMessages.uuid('Account ID')),
  param('tagId').isUUID().withMessage(errorMessages.uuid('Tag ID')),
  validate,
  checkAccountPermission(['borrar']),
  tagController.deleteTag
);
router.get('/accounts/:accountId/tags/:tagId/movements',
  authenticate,
  param('accountId').isUUID().withMessage(errorMessages.uuid('Account ID')),
  param('tagId').isUUID().withMessage(errorMessages.uuid('Tag ID')),
  validate,
  checkAccountPermission(['ver']),
  tagController.getMovementsByTag
);

// ==================== DOCUMENT ROUTES ====================
router.get('/accounts/:accountId/movements/:movementId/documents',
  authenticate,
  param('accountId').isUUID().withMessage(errorMessages.uuid('Account ID')),
  param('movementId').isUUID().withMessage(errorMessages.uuid('Movement ID')),
  validate,
  checkAccountPermission(['ver']),
  documentController.getDocuments
);
router.post('/accounts/:accountId/movements/:movementId/documents',
  authenticate,
  param('accountId').isUUID().withMessage(errorMessages.uuid('Account ID')),
  param('movementId').isUUID().withMessage(errorMessages.uuid('Movement ID')),
  validate,
  checkAccountPermission(['editar']),
  upload.single('file'),
  documentController.uploadDocument
);
router.post('/accounts/:accountId/movements/:movementId/documents/multiple',
  authenticate,
  param('accountId').isUUID().withMessage(errorMessages.uuid('Account ID')),
  param('movementId').isUUID().withMessage(errorMessages.uuid('Movement ID')),
  validate,
  checkAccountPermission(['editar']),
  uploadMultiple.array('files', 10),
  documentController.uploadMultipleDocuments
);
router.delete('/accounts/:accountId/movements/:movementId/documents/:documentId',
  authenticate,
  param('accountId').isUUID().withMessage(errorMessages.uuid('Account ID')),
  param('movementId').isUUID().withMessage(errorMessages.uuid('Movement ID')),
  param('documentId').isUUID().withMessage(errorMessages.uuid('Document ID')),
  validate,
  checkAccountPermission(['editar']),
  documentController.deleteDocument
);
router.get('/documents/:documentId/download',
  authenticate,
  param('documentId').isUUID().withMessage(errorMessages.uuid('Document ID')),
  validate,
  documentController.getDocumentById
);

// ==================== TASK ROUTES ====================
// Global tasks (user's own tasks without account)
router.get('/tasks', authenticate, taskController.getTasks);
router.get('/tasks/summary', authenticate, taskController.getTasksSummary);
router.get('/tasks/by-list', authenticate, taskController.getTasksByList);
router.get('/tasks/:taskId',
  authenticate,
  param('taskId').isUUID().withMessage(errorMessages.uuid('Task ID')),
  validate,
  taskController.getTaskById
);
router.post('/tasks',
  authenticate,
  body('titulo').notEmpty().withMessage(errorMessages.required('Titulo')),
  validate,
  taskController.createTask
);
router.put('/tasks/:taskId',
  authenticate,
  param('taskId').isUUID().withMessage(errorMessages.uuid('Task ID')),
  validate,
  taskController.updateTask
);
router.put('/tasks/:taskId/status',
  authenticate,
  param('taskId').isUUID().withMessage(errorMessages.uuid('Task ID')),
  body('estado').isIn(['pendiente', 'en_progreso', 'completada', 'cancelada']).withMessage(errorMessages.enum('Estado', ['pendiente', 'en_progreso', 'completada', 'cancelada'])),
  validate,
  taskController.updateTaskStatus
);
router.delete('/tasks/:taskId',
  authenticate,
  param('taskId').isUUID().withMessage(errorMessages.uuid('Task ID')),
  validate,
  taskController.deleteTask
);

// Account-scoped tasks
router.get('/accounts/:accountId/tasks',
  authenticate,
  param('accountId').isUUID().withMessage(errorMessages.uuid('Account ID')),
  validate,
  checkAccountPermission(['ver']),
  taskController.getAccountTasks
);
router.post('/accounts/:accountId/tasks',
  authenticate,
  param('accountId').isUUID().withMessage(errorMessages.uuid('Account ID')),
  body('titulo').notEmpty().withMessage(errorMessages.required('Titulo')),
  validate,
  checkAccountPermission(['crear']),
  taskController.createAccountTask
);
router.put('/accounts/:accountId/tasks/:taskId',
  authenticate,
  param('accountId').isUUID().withMessage(errorMessages.uuid('Account ID')),
  param('taskId').isUUID().withMessage(errorMessages.uuid('Task ID')),
  validate,
  checkAccountPermission(['editar']),
  taskController.updateAccountTask
);
router.delete('/accounts/:accountId/tasks/:taskId',
  authenticate,
  param('accountId').isUUID().withMessage(errorMessages.uuid('Account ID')),
  param('taskId').isUUID().withMessage(errorMessages.uuid('Task ID')),
  validate,
  checkAccountPermission(['borrar']),
  taskController.deleteAccountTask
);

// ==================== CALENDAR ROUTES ====================
// Global events
router.get('/events', authenticate, calendarController.getEvents);
router.get('/events/upcoming', authenticate, calendarController.getUpcomingEvents);

// Account-scoped events
router.get('/accounts/:accountId/events',
  authenticate,
  param('accountId').isUUID().withMessage(errorMessages.uuid('Account ID')),
  validate,
  checkAccountPermission(['ver']),
  calendarController.getAccountEvents
);
router.post('/accounts/:accountId/events',
  authenticate,
  param('accountId').isUUID().withMessage(errorMessages.uuid('Account ID')),
  body('titulo').notEmpty().withMessage(errorMessages.required('Titulo')),
  body('fecha_hora_inicio').isISO8601().withMessage(errorMessages.date('Fecha')),
  body('tipo').notEmpty().withMessage(errorMessages.required('Tipo')),
  validate,
  checkAccountPermission(['crear']),
  calendarController.createAccountEvent
);
router.put('/accounts/:accountId/events/:eventId',
  authenticate,
  param('accountId').isUUID().withMessage(errorMessages.uuid('Account ID')),
  param('eventId').isUUID().withMessage(errorMessages.uuid('Event ID')),
  validate,
  checkAccountPermission(['editar']),
  calendarController.updateAccountEvent
);
router.delete('/accounts/:accountId/events/:eventId',
  authenticate,
  param('accountId').isUUID().withMessage(errorMessages.uuid('Account ID')),
  param('eventId').isUUID().withMessage(errorMessages.uuid('Event ID')),
  validate,
  checkAccountPermission(['borrar']),
  calendarController.deleteAccountEvent
);

// Account-scoped reminders
router.get('/accounts/:accountId/reminders',
  authenticate,
  param('accountId').isUUID().withMessage(errorMessages.uuid('Account ID')),
  validate,
  checkAccountPermission(['ver']),
  calendarController.getAccountReminders
);
router.post('/accounts/:accountId/reminders',
  authenticate,
  param('accountId').isUUID().withMessage(errorMessages.uuid('Account ID')),
  body('mensaje').notEmpty().withMessage(errorMessages.required('Mensaje')),
  body('fecha_recordatorio').isISO8601().withMessage(errorMessages.date('Fecha recordatorio')),
  validate,
  checkAccountPermission(['crear']),
  calendarController.createAccountReminder
);
router.delete('/accounts/:accountId/reminders/:reminderId',
  authenticate,
  param('accountId').isUUID().withMessage(errorMessages.uuid('Account ID')),
  param('reminderId').isUUID().withMessage(errorMessages.uuid('Reminder ID')),
  validate,
  checkAccountPermission(['borrar']),
  calendarController.deleteAccountReminder
);

// Continue with original global routes
router.get('/events/range', authenticate, calendarController.getEventsByDateRange);
router.get('/events/:eventId',
  authenticate,
  param('eventId').isUUID().withMessage(errorMessages.uuid('Event ID')),
  validate,
  calendarController.getEventById
);
router.post('/events',
  authenticate,
  body('titulo').notEmpty().withMessage(errorMessages.required('Titulo')),
  body('fecha_hora_inicio').isISO8601().withMessage(errorMessages.date('Fecha hora inicio')),
  body('tipo').isIn(['pago_unico', 'pago_recurrente', 'recordatorio_generico']).withMessage(errorMessages.enum('Tipo', ['pago_unico', 'pago_recurrente', 'recordatorio_generico'])),
  validate,
  calendarController.createEvent
);
router.put('/events/:eventId',
  authenticate,
  param('eventId').isUUID().withMessage(errorMessages.uuid('Event ID')),
  validate,
  calendarController.updateEvent
);
router.delete('/events/:eventId',
  authenticate,
  param('eventId').isUUID().withMessage(errorMessages.uuid('Event ID')),
  validate,
  calendarController.deleteEvent
);

// Event reminders
router.get('/events/:eventId/reminders',
  authenticate,
  param('eventId').isUUID().withMessage(errorMessages.uuid('Event ID')),
  validate,
  calendarController.getReminders
);
router.post('/events/:eventId/reminders',
  authenticate,
  param('eventId').isUUID().withMessage(errorMessages.uuid('Event ID')),
  validate,
  calendarController.addReminder
);
router.put('/events/:eventId/reminders/:reminderId',
  authenticate,
  param('eventId').isUUID().withMessage(errorMessages.uuid('Event ID')),
  param('reminderId').isUUID().withMessage(errorMessages.uuid('Reminder ID')),
  validate,
  calendarController.updateReminder
);
router.delete('/events/:eventId/reminders/:reminderId',
  authenticate,
  param('eventId').isUUID().withMessage(errorMessages.uuid('Event ID')),
  param('reminderId').isUUID().withMessage(errorMessages.uuid('Reminder ID')),
  validate,
  calendarController.deleteReminder
);

// Payment events
router.post('/accounts/:accountId/payment-events',
  authenticate,
  param('accountId').isUUID().withMessage(errorMessages.uuid('Account ID')),
  body('titulo').notEmpty().withMessage(errorMessages.required('Titulo')),
  body('fecha_hora_inicio').isISO8601().withMessage(errorMessages.date('Fecha hora inicio')),
  validate,
  checkAccountPermission(['crear']),
  calendarController.createPaymentEvent
);

// Calendar integrations
router.get('/integrations/calendar', authenticate, calendarController.getIntegrations);
router.post('/integrations/calendar',
  authenticate,
  body('tipo').isIn(['google', 'apple', 'calendario_movil']).withMessage(errorMessages.enum('Tipo', ['google', 'apple', 'calendario_movil'])),
  validate,
  calendarController.upsertIntegration
);
router.delete('/integrations/calendar/:integrationType',
  authenticate,
  param('integrationType').isIn(['google', 'apple', 'calendario_movil']).withMessage(errorMessages.enum('Tipo', ['google', 'apple', 'calendario_movil'])),
  validate,
  calendarController.deleteIntegration
);

// Admin reminder endpoints
router.get('/admin/reminders/pending', authenticate, requireAdmin, calendarController.getPendingReminders);
router.put('/admin/reminders/:reminderId/sent',
  authenticate,
  requireAdmin,
  param('reminderId').isUUID().withMessage(errorMessages.uuid('Reminder ID')),
  validate,
  calendarController.markReminderSent
);

// ==================== REPORT ROUTES ====================
router.get('/accounts/:accountId/reports/totals',
  authenticate,
  param('accountId').isUUID().withMessage(errorMessages.uuid('Account ID')),
  validate,
  checkAccountPermission(['ver_informes']),
  reportController.getTotalsByPeriod
);
router.get('/accounts/:accountId/reports/expenses-by-category',
  authenticate,
  param('accountId').isUUID().withMessage(errorMessages.uuid('Account ID')),
  validate,
  checkAccountPermission(['ver_informes']),
  reportController.getExpensesByCategory
);
router.get('/accounts/:accountId/reports/income-by-category',
  authenticate,
  param('accountId').isUUID().withMessage(errorMessages.uuid('Account ID')),
  validate,
  checkAccountPermission(['ver_informes']),
  reportController.getIncomeByCategory
);
router.get('/accounts/:accountId/reports/compare-periods',
  authenticate,
  param('accountId').isUUID().withMessage(errorMessages.uuid('Account ID')),
  validate,
  checkAccountPermission(['ver_informes']),
  reportController.comparePeriods
);
router.get('/accounts/:accountId/reports/top-categories',
  authenticate,
  param('accountId').isUUID().withMessage(errorMessages.uuid('Account ID')),
  validate,
  checkAccountPermission(['ver_informes']),
  reportController.getTopCategories
);
router.get('/accounts/:accountId/reports/income-vs-expenses',
  authenticate,
  param('accountId').isUUID().withMessage(errorMessages.uuid('Account ID')),
  validate,
  checkAccountPermission(['ver_informes']),
  reportController.getIncomeVsExpenses
);
router.get('/accounts/:accountId/reports/net-income',
  authenticate,
  param('accountId').isUUID().withMessage(errorMessages.uuid('Account ID')),
  validate,
  checkAccountPermission(['ver_informes']),
  reportController.getNetIncome
);
router.get('/accounts/:accountId/reports/spending-by-provider',
  authenticate,
  param('accountId').isUUID().withMessage(errorMessages.uuid('Account ID')),
  validate,
  checkAccountPermission(['ver_informes']),
  reportController.getSpendingByProvider
);
router.get('/accounts/:accountId/reports/monthly-trends',
  authenticate,
  param('accountId').isUUID().withMessage(errorMessages.uuid('Account ID')),
  validate,
  checkAccountPermission(['ver_informes']),
  reportController.getMonthlyTrends
);
router.get('/accounts/:accountId/reports/dashboard',
  authenticate,
  param('accountId').isUUID().withMessage(errorMessages.uuid('Account ID')),
  validate,
  checkAccountPermission(['ver_informes']),
  reportController.getDashboardSummary
);
router.get('/accounts/:accountId/reports/most-expensive-month',
  authenticate,
  param('accountId').isUUID().withMessage(errorMessages.uuid('Account ID')),
  validate,
  checkAccountPermission(['ver_informes']),
  reportController.getMostExpensiveMonth
);

// Admin reports
router.get('/admin/reports/all-accounts', authenticate, requireAdmin, reportController.getAllAccountsSummary);

export default router;
