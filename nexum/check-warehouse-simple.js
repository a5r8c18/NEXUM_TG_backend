const { DataSource } = require('typeorm');

const dataSource = new DataSource({
  type: 'postgres',
  host: 'localhost',
  port: 5432,
  username: 'postgres',
  password: '1234',
  database: 'nexum_db',
  synchronize: false,
  logging: false,
});

async function checkWarehouse001() {
  try {
    await dataSource.initialize();
    console.log('Conectado a la base de datos');
    
    const result = await dataSource.query(`
      SELECT id, code, name, is_active, company_id 
      FROM warehouses 
      WHERE code = '001' OR id ILIKE '%001%' OR code ILIKE '%001%'
      ORDER BY name
    `);
    
    console.log('\n🔍 Búsqueda del almacén "001":');
    console.log('─'.repeat(50));
    
    if (result.length > 0) {
      console.log('✅ Encontrados:');
      result.forEach(wh => {
        const id = wh.id.substring(0, 8) + '...';
        const code = wh.code || 'N/A';
        const name = wh.name || 'Sin nombre';
        const active = wh.is_active ? '✓' : '✗';
        console.log(`   ${active} ${code.padEnd(8)} ${name.padEnd(25)} ${id}`);
      });
    } else {
      console.log('❌ No se encontró almacén con código "001" o que contenga "001"');
    }
    
    // Mostrar todos los almacenes
    const allResult = await dataSource.query(`
      SELECT id, code, name, is_active, company_id 
      FROM warehouses 
      ORDER BY name
    `);
    
    console.log('\n📦 Todos los almacenes disponibles:');
    if (allResult.length === 0) {
      console.log('   ❌ No hay almacenes en la base de datos');
    } else {
      allResult.forEach(wh => {
        const id = wh.id.substring(0, 8) + '...';
        const code = wh.code || 'N/A';
        const name = wh.name || 'Sin nombre';
        const active = wh.is_active ? '✓' : '✗';
        console.log(`   ${active} ${code.padEnd(8)} ${name.padEnd(25)} ${id}`);
      });
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await dataSource.destroy();
  }
}

checkWarehouse001();
