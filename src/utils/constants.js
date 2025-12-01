// User roles
export const ROL_ADMIN_GENERAL = 'admin_general';
export const ROL_USUARIO_NORMAL = 'usuario_normal';

// User states
export const ESTADO_ACTIVO = 'activo';
export const ESTADO_BLOQUEADO = 'bloqueado';

// Account types
export const TIPO_CUENTA_PERSONAL = 'personal';
export const TIPO_CUENTA_NEGOCIO = 'negocio';
export const TIPO_CUENTA_AHORRO = 'ahorro';
export const TIPO_CUENTA_COMPARTIDA = 'compartida';

// Account states
export const ESTADO_CUENTA_ACTIVA = 'activa';
export const ESTADO_CUENTA_ARCHIVADA = 'archivada';

// Account roles
export const ROL_PROPIETARIO = 'propietario';
export const ROL_EDITOR = 'editor';
export const ROL_SOLO_LECTURA = 'solo_lectura';

// Access types
export const ACCESO_INDEPENDIENTE = 'independiente';
export const ACCESO_COMPARTIDA = 'compartida';

// Movement types
export const TIPO_INGRESO = 'ingreso';
export const TIPO_GASTO = 'gasto';

// Movement origins
export const ORIGEN_MANUAL = 'manual';
export const ORIGEN_ESCANEO = 'escaneo';

// Movement states
export const ESTADO_CONFIRMADO = 'confirmado';
export const ESTADO_PENDIENTE_REVISION = 'pendiente_revision';

// Category types
export const TIPO_CATEGORIA_INGRESO = 'ingreso';
export const TIPO_CATEGORIA_GASTO = 'gasto';
export const TIPO_CATEGORIA_AMBOS = 'ambos';

// File types
export const TIPO_ARCHIVO_IMAGEN = 'imagen';
export const TIPO_ARCHIVO_PDF = 'pdf';
export const TIPO_ARCHIVO_OTRO = 'otro';

// Document origins
export const ORIGEN_FOTO = 'foto';
export const ORIGEN_SUBIDA_MANUAL = 'subida_manual';

// Task states
export const ESTADO_TAREA_PENDIENTE = 'pendiente';
export const ESTADO_TAREA_EN_PROGRESO = 'en_progreso';
export const ESTADO_TAREA_COMPLETADA = 'completada';
export const ESTADO_TAREA_CANCELADA = 'cancelada';

// Task priorities
export const PRIORIDAD_BAJA = 'baja';
export const PRIORIDAD_MEDIA = 'media';
export const PRIORIDAD_ALTA = 'alta';

// Event types
export const TIPO_PAGO_UNICO = 'pago_unico';
export const TIPO_PAGO_RECURRENTE = 'pago_recurrente';
export const TIPO_RECORDATORIO_GENERICO = 'recordatorio_generico';

// Recurrence types
export const RECURRENCIA_NINGUNA = 'ninguna';
export const RECURRENCIA_DIARIA = 'diaria';
export const RECURRENCIA_SEMANAL = 'semanal';
export const RECURRENCIA_MENSUAL = 'mensual';
export const RECURRENCIA_ANUAL = 'anual';
export const RECURRENCIA_PERSONALIZADA = 'personalizada';

// Reminder channels
export const CANAL_NOTIFICACION_APP = 'notificacion_app';
export const CANAL_EMAIL = 'email';
export const CANAL_SMS = 'sms';

// Integration types
export const INTEGRACION_GOOGLE = 'google';
export const INTEGRACION_APPLE = 'apple';
export const INTEGRACION_MOVIL = 'calendario_movil';

// Permission sets
export const PERMISOS_PROPIETARIO = ['ver', 'crear', 'editar', 'borrar', 'gestionar_categorias', 'invitar_usuarios', 'ver_informes'];
export const PERMISOS_EDITOR = ['ver', 'crear', 'editar', 'ver_informes'];
export const PERMISOS_SOLO_LECTURA = ['ver', 'ver_informes'];
