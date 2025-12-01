import { query } from './database.js';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';

dotenv.config();

const seedDatabase = async () => {
  console.log('Starting database seeding...');

  try {
    // Create default global categories
    const defaultCategories = [
      // Expense categories
      { nombre: 'Hogar', tipo: 'gasto', orden_visual: 1 },
      { nombre: 'Transporte', tipo: 'gasto', orden_visual: 2 },
      { nombre: 'Alimentación', tipo: 'gasto', orden_visual: 3 },
      { nombre: 'Salud', tipo: 'gasto', orden_visual: 4 },
      { nombre: 'Educación', tipo: 'gasto', orden_visual: 5 },
      { nombre: 'Entretenimiento', tipo: 'gasto', orden_visual: 6 },
      { nombre: 'Ropa', tipo: 'gasto', orden_visual: 7 },
      { nombre: 'Servicios', tipo: 'gasto', orden_visual: 8 },
      { nombre: 'Impuestos', tipo: 'gasto', orden_visual: 9 },
      { nombre: 'Seguros', tipo: 'gasto', orden_visual: 10 },
      { nombre: 'Otros gastos', tipo: 'gasto', orden_visual: 11 },
      // Income categories
      { nombre: 'Salario', tipo: 'ingreso', orden_visual: 1 },
      { nombre: 'Freelance', tipo: 'ingreso', orden_visual: 2 },
      { nombre: 'Inversiones', tipo: 'ingreso', orden_visual: 3 },
      { nombre: 'Alquiler', tipo: 'ingreso', orden_visual: 4 },
      { nombre: 'Ventas', tipo: 'ingreso', orden_visual: 5 },
      { nombre: 'Reembolsos', tipo: 'ingreso', orden_visual: 6 },
      { nombre: 'Otros ingresos', tipo: 'ingreso', orden_visual: 7 },
      // Both categories
      { nombre: 'Transferencias', tipo: 'ambos', orden_visual: 1 },
    ];

    // Check if global categories exist
    const existingCategories = await query(
      'SELECT COUNT(*) FROM categorias WHERE es_global = TRUE'
    );

    if (parseInt(existingCategories.rows[0].count) === 0) {
      for (const cat of defaultCategories) {
        await query(
          `INSERT INTO categorias (nombre, tipo, orden_visual, es_global)
           VALUES ($1, $2, $3, TRUE)`,
          [cat.nombre, cat.tipo, cat.orden_visual]
        );
      }
      console.log('Default global categories created');
    } else {
      console.log('Global categories already exist, skipping...');
    }

    // Create admin user if not exists
    const adminEmail = 'admin@gmail.com';
    const existingAdmin = await query(
      'SELECT id_usuario FROM usuarios WHERE email = $1',
      [adminEmail]
    );

    if (existingAdmin.rows.length === 0) {
      const hashedPassword = await bcrypt.hash('123456', 12);
      await query(
        `INSERT INTO usuarios (nombre, email, password_hash, rol_global, estado)
         VALUES ($1, $2, $3, 'admin_general', 'activo')`,
        ['Administrador', adminEmail, hashedPassword]
      );
      console.log('Admin user created (email: admin@gmail.com, password: 123456)');
    } else {
      console.log('Admin user already exists, skipping...');
    }

    console.log('Seeding completed successfully!');
  } catch (error) {
    console.error('Seeding failed:', error);
    throw error;
  }
};

seedDatabase()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
