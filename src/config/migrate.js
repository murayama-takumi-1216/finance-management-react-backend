import { query } from './database.js';
import dotenv from 'dotenv';

dotenv.config();

const createTables = async () => {
  console.log('Starting database migration...');

  try {
    // Create ENUM types
    await query(`
      DO $$ BEGIN
        CREATE TYPE rol_global AS ENUM ('admin_general', 'usuario_normal');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await query(`
      DO $$ BEGIN
        CREATE TYPE estado_usuario AS ENUM ('activo', 'bloqueado');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await query(`
      DO $$ BEGIN
        CREATE TYPE tipo_cuenta AS ENUM ('personal', 'negocio', 'ahorro', 'compartida');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await query(`
      DO $$ BEGIN
        CREATE TYPE estado_cuenta AS ENUM ('activa', 'archivada');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await query(`
      DO $$ BEGIN
        CREATE TYPE rol_en_cuenta AS ENUM ('propietario', 'editor', 'solo_lectura');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await query(`
      DO $$ BEGIN
        CREATE TYPE tipo_acceso AS ENUM ('independiente', 'compartida');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await query(`
      DO $$ BEGIN
        CREATE TYPE tipo_movimiento AS ENUM ('ingreso', 'gasto');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await query(`
      DO $$ BEGIN
        CREATE TYPE origen_movimiento AS ENUM ('manual', 'escaneo');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await query(`
      DO $$ BEGIN
        CREATE TYPE estado_movimiento AS ENUM ('confirmado', 'pendiente_revision');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await query(`
      DO $$ BEGIN
        CREATE TYPE tipo_categoria AS ENUM ('ingreso', 'gasto', 'ambos');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await query(`
      DO $$ BEGIN
        CREATE TYPE tipo_archivo AS ENUM ('imagen', 'pdf', 'otro');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await query(`
      DO $$ BEGIN
        CREATE TYPE origen_documento AS ENUM ('foto', 'subida_manual');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await query(`
      DO $$ BEGIN
        CREATE TYPE estado_tarea AS ENUM ('pendiente', 'en_progreso', 'completada', 'cancelada');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await query(`
      DO $$ BEGIN
        CREATE TYPE prioridad_tarea AS ENUM ('baja', 'media', 'alta');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await query(`
      DO $$ BEGIN
        CREATE TYPE tipo_evento AS ENUM ('pago_unico', 'pago_recurrente', 'recordatorio_generico');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await query(`
      DO $$ BEGIN
        CREATE TYPE recurrencia_evento AS ENUM ('ninguna', 'diaria', 'semanal', 'mensual', 'anual', 'personalizada');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await query(`
      DO $$ BEGIN
        CREATE TYPE canal_recordatorio AS ENUM ('notificacion_app', 'email', 'sms');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await query(`
      DO $$ BEGIN
        CREATE TYPE tipo_integracion AS ENUM ('google', 'apple', 'calendario_movil');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    console.log('ENUM types created successfully');

    // Create Usuario table
    await query(`
      CREATE TABLE IF NOT EXISTS usuarios (
        id_usuario UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        nombre VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        rol_global rol_global DEFAULT 'usuario_normal',
        estado estado_usuario DEFAULT 'activo',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('Table usuarios created');

    // Create Cuenta table
    await query(`
      CREATE TABLE IF NOT EXISTS cuentas (
        id_cuenta UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        nombre VARCHAR(255) NOT NULL,
        tipo tipo_cuenta NOT NULL,
        moneda VARCHAR(3) DEFAULT 'USD',
        id_usuario_propietario UUID NOT NULL REFERENCES usuarios(id_usuario) ON DELETE CASCADE,
        estado estado_cuenta DEFAULT 'activa',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('Table cuentas created');

    // Create Usuario-Cuenta relation table
    await query(`
      CREATE TABLE IF NOT EXISTS usuario_cuenta (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        id_usuario UUID NOT NULL REFERENCES usuarios(id_usuario) ON DELETE CASCADE,
        id_cuenta UUID NOT NULL REFERENCES cuentas(id_cuenta) ON DELETE CASCADE,
        rol_en_cuenta rol_en_cuenta NOT NULL,
        tipo_acceso tipo_acceso DEFAULT 'independiente',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(id_usuario, id_cuenta)
      );
    `);
    console.log('Table usuario_cuenta created');

    // Create Categoria table
    await query(`
      CREATE TABLE IF NOT EXISTS categorias (
        id_categoria UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        id_cuenta UUID REFERENCES cuentas(id_cuenta) ON DELETE CASCADE,
        nombre VARCHAR(255) NOT NULL,
        tipo tipo_categoria NOT NULL,
        orden_visual INTEGER DEFAULT 0,
        es_global BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('Table categorias created');

    // Create Movimiento table
    await query(`
      CREATE TABLE IF NOT EXISTS movimientos (
        id_movimiento UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        id_cuenta UUID NOT NULL REFERENCES cuentas(id_cuenta) ON DELETE CASCADE,
        tipo tipo_movimiento NOT NULL,
        fecha_operacion DATE NOT NULL,
        importe DECIMAL(15, 2) NOT NULL CHECK (importe > 0),
        id_categoria UUID NOT NULL REFERENCES categorias(id_categoria),
        proveedor VARCHAR(255),
        descripcion TEXT,
        notas TEXT,
        origen origen_movimiento DEFAULT 'manual',
        estado estado_movimiento DEFAULT 'confirmado',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('Table movimientos created');

    // Create Etiqueta table
    await query(`
      CREATE TABLE IF NOT EXISTS etiquetas (
        id_etiqueta UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        id_cuenta UUID NOT NULL REFERENCES cuentas(id_cuenta) ON DELETE CASCADE,
        nombre VARCHAR(100) NOT NULL,
        color VARCHAR(7) DEFAULT '#3B82F6',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('Table etiquetas created');

    // Create MovimientoEtiqueta relation table (N to N)
    await query(`
      CREATE TABLE IF NOT EXISTS movimiento_etiqueta (
        id_movimiento UUID NOT NULL REFERENCES movimientos(id_movimiento) ON DELETE CASCADE,
        id_etiqueta UUID NOT NULL REFERENCES etiquetas(id_etiqueta) ON DELETE CASCADE,
        PRIMARY KEY (id_movimiento, id_etiqueta)
      );
    `);
    console.log('Table movimiento_etiqueta created');

    // Create DocumentoAdjunto table
    await query(`
      CREATE TABLE IF NOT EXISTS documentos_adjuntos (
        id_documento UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        id_movimiento UUID NOT NULL REFERENCES movimientos(id_movimiento) ON DELETE CASCADE,
        url_archivo VARCHAR(500) NOT NULL,
        nombre_archivo VARCHAR(255),
        tipo_archivo tipo_archivo NOT NULL,
        origen origen_documento DEFAULT 'subida_manual',
        tamano_bytes INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('Table documentos_adjuntos created');

    // Create Tarea table
    await query(`
      CREATE TABLE IF NOT EXISTS tareas (
        id_tarea UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        id_cuenta UUID REFERENCES cuentas(id_cuenta) ON DELETE SET NULL,
        id_usuario UUID NOT NULL REFERENCES usuarios(id_usuario) ON DELETE CASCADE,
        titulo VARCHAR(255) NOT NULL,
        descripcion TEXT,
        fecha_inicio TIMESTAMP,
        fecha_fin TIMESTAMP,
        estado estado_tarea DEFAULT 'pendiente',
        lista VARCHAR(100) DEFAULT 'general',
        prioridad prioridad_tarea DEFAULT 'media',
        id_usuario_asignado UUID REFERENCES usuarios(id_usuario) ON DELETE SET NULL,
        id_categoria UUID REFERENCES categorias(id_categoria) ON DELETE SET NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('Table tareas created');

    // Create Tarea history log table
    await query(`
      CREATE TABLE IF NOT EXISTS tareas_historial (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        id_tarea UUID NOT NULL REFERENCES tareas(id_tarea) ON DELETE CASCADE,
        estado_anterior estado_tarea,
        estado_nuevo estado_tarea NOT NULL,
        id_usuario UUID REFERENCES usuarios(id_usuario) ON DELETE SET NULL,
        comentario TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('Table tareas_historial created');

    // Create EventoCalendario table
    await query(`
      CREATE TABLE IF NOT EXISTS eventos_calendario (
        id_evento UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        id_cuenta UUID REFERENCES cuentas(id_cuenta) ON DELETE CASCADE,
        id_usuario UUID NOT NULL REFERENCES usuarios(id_usuario) ON DELETE CASCADE,
        titulo VARCHAR(255) NOT NULL,
        descripcion TEXT,
        fecha_hora_inicio TIMESTAMP NOT NULL,
        fecha_hora_fin TIMESTAMP,
        tipo tipo_evento NOT NULL,
        monto DECIMAL(15, 2),
        id_categoria UUID REFERENCES categorias(id_categoria) ON DELETE SET NULL,
        id_movimiento_asociado UUID REFERENCES movimientos(id_movimiento) ON DELETE SET NULL,
        recurrencia recurrencia_evento DEFAULT 'ninguna',
        recurrencia_config JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('Table eventos_calendario created');

    // Create Recordatorio table
    await query(`
      CREATE TABLE IF NOT EXISTS recordatorios (
        id_recordatorio UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        id_evento UUID NOT NULL REFERENCES eventos_calendario(id_evento) ON DELETE CASCADE,
        mensaje TEXT,
        fecha_recordatorio TIMESTAMP,
        minutos_antes INTEGER NOT NULL DEFAULT 60,
        canal canal_recordatorio DEFAULT 'notificacion_app',
        activo BOOLEAN DEFAULT TRUE,
        enviado BOOLEAN DEFAULT FALSE,
        fecha_envio TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('Table recordatorios created');

    // Create IntegracionCalendario table
    await query(`
      CREATE TABLE IF NOT EXISTS integraciones_calendario (
        id_integracion UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        id_usuario UUID NOT NULL REFERENCES usuarios(id_usuario) ON DELETE CASCADE,
        tipo tipo_integracion NOT NULL,
        token_oauth TEXT,
        refresh_token TEXT,
        token_expiry TIMESTAMP,
        configuracion JSONB DEFAULT '{"sincronizar_solo_eventos_pago": true}',
        activa BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(id_usuario, tipo)
      );
    `);
    console.log('Table integraciones_calendario created');

    // Create indexes for better query performance
    await query(`CREATE INDEX IF NOT EXISTS idx_movimientos_cuenta ON movimientos(id_cuenta);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_movimientos_fecha ON movimientos(fecha_operacion);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_movimientos_tipo ON movimientos(tipo);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_movimientos_estado ON movimientos(estado);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_movimientos_categoria ON movimientos(id_categoria);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_tareas_usuario ON tareas(id_usuario);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_tareas_estado ON tareas(estado);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_eventos_usuario ON eventos_calendario(id_usuario);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_eventos_fecha ON eventos_calendario(fecha_hora_inicio);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_eventos_cuenta ON eventos_calendario(id_cuenta);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_tareas_cuenta ON tareas(id_cuenta);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_recordatorios_fecha ON recordatorios(fecha_recordatorio);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_usuario_cuenta_usuario ON usuario_cuenta(id_usuario);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_usuario_cuenta_cuenta ON usuario_cuenta(id_cuenta);`);
    console.log('Indexes created');

    console.log('Migration completed successfully!');
  } catch (error) {
    console.error('Migration failed:', error);
    throw error;
  }
};

createTables()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
