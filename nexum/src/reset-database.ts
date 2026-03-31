import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DataSource } from 'typeorm';

async function resetDatabase() {
  console.log('🔄 Iniciando reset completo de la base de datos...');
  
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: false, // Desactivar logs para limpiar salida
  });
  
  const dataSource = app.get(DataSource);
  
  try {
    // Obtener todas las tablas
    const tables = await dataSource.query(`
      SELECT tablename 
      FROM pg_tables 
      WHERE schemaname = 'public'
    `);
    
    console.log('📋 Tablas encontradas:', tables.map((t: any) => t.tablename).join(', '));
    
    // Desactivar restricciones de foreign keys
    await dataSource.query('SET session_replication_role = replica;');
    
    // Truncar todas las tablas en orden correcto
    const tableNames = tables.map((t: any) => t.tablename);
    
    // Primero truncar tablas de auditoría y logs
    const auditTables = tableNames.filter(name => name.includes('audit') || name.includes('log'));
    for (const table of auditTables) {
      await dataSource.query(`TRUNCATE TABLE "${table}" CASCADE;`);
      console.log(`✅ Tabla ${table} truncada`);
    }
    
    // Luego truncar el resto
    const otherTables = tableNames.filter(name => !name.includes('audit') && !name.includes('log'));
    for (const table of otherTables) {
      await dataSource.query(`TRUNCATE TABLE "${table}" CASCADE;`);
      console.log(`✅ Tabla ${table} truncada`);
    }
    
    // Reactivar restricciones
    await dataSource.query('SET session_replication_role = DEFAULT;');
    
    // Resetear secuencias
    await dataSource.query(`
      SELECT setval(pg_get_serial_sequence('"users"', 'id'), 1, false);
      SELECT setval(pg_get_serial_sequence('"companies"', 'id'), 1, false);
      SELECT setval(pg_get_serial_sequence('"warehouses"', 'id'), 1, false);
      SELECT setval(pg_get_serial_sequence('"inventory"', 'id'), 1, false);
      SELECT setval(pg_get_serial_sequence('"fixed_assets"', 'id'), 1, false);
      SELECT setval(pg_get_serial_sequence('"stock_limits"', 'id'), 1, false);
    `);
    
    console.log('🔄 Secuencias reseteadas');
    
    console.log('✅ Base de datos reseteada completamente');
    console.log('🎯 Ahora puedes ejecutar el seed para crear datos iniciales');
    
  } catch (error) {
    console.error('❌ Error al resetear la base de datos:', error);
  } finally {
    await app.close();
  }
}

resetDatabase().catch(console.error);
