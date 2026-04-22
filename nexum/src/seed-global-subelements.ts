import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DataSource } from 'typeorm';

const SUBELEMENTS_DATA = [
  // Inventory Category
  { code: '11101', name: 'Alimento Consumo Humano', category: 'inventory' },
  { code: '11102', name: 'Alimento Consumo Animal', category: 'inventory' },
  { code: '11110', name: 'Materiales de la Construcción', category: 'inventory' },
  { code: '11111', name: 'Aridos', category: 'inventory' },
  { code: '11112', name: 'Aceros', category: 'inventory' },
  { code: '11113', name: 'Elaborados', category: 'inventory' },
  { code: '11114', name: 'Pinturas y otros', category: 'inventory' },
  { code: '11120', name: 'Vestuario y Lencería', category: 'inventory' },
  { code: '11121', name: 'Uniformes', category: 'inventory' },
  { code: '11122', name: 'Calzado', category: 'inventory' },
  { code: '11123', name: 'Lencería', category: 'inventory' },
  { code: '11130', name: 'Materiales para la Enseñanza', category: 'inventory' },
  { code: '11131', name: 'Cuadernos y libros', category: 'inventory' },
  { code: '11132', name: 'Juguetes', category: 'inventory' },
  { code: '11133', name: 'Audiovisuales', category: 'inventory' },
  { code: '11134', name: 'útiles, herramientas y materiales de laboratorios y talleres', category: 'inventory' },
  { code: '11140', name: 'Medicamentos y Materiales Afines', category: 'inventory' },
  { code: '11150', name: 'Materiales y Artículos de Consumo', category: 'inventory' },
  { code: '11151', name: 'Materiales y Artículos de Consumo', category: 'inventory' },
  { code: '11160', name: 'Libros y Revistas', category: 'inventory' },
  { code: '11161', name: 'Papel de Escritorio y Materiales Oficina', category: 'inventory' },
  { code: '11162', name: 'Artículos de Limpieza y Aseo', category: 'inventory' },
  { code: '11163', name: 'Mat p/ Mtto y Reparaciones, Mat Eléctricos', category: 'inventory' },
  { code: '11164', name: 'Libros y Revistas', category: 'inventory' },
  { code: '11170', name: 'Útiles y Herramientas', category: 'inventory' },
  { code: '11171', name: 'Útiles de escritorio y oficina', category: 'inventory' },
  { code: '11172', name: 'Utensilios de cocina', category: 'inventory' },
  { code: '11173', name: 'Utensilios deportivos', category: 'inventory' },
  { code: '11174', name: 'Depreciación de Útiles y Herramientas', category: 'inventory' },
  { code: '11180', name: 'Partes y Piezas de Repuestos', category: 'inventory' },
  { code: '11181', name: 'Piezas de repuesto y accesorios parque automotor', category: 'inventory' },
  { code: '11182', name: 'Piezas de repuesto y accesorios otros equipos', category: 'inventory' },
  { code: '11190', name: 'Otros Inventarios', category: 'inventory' },
  { code: '11200', name: 'Equipos de protección personal', category: 'inventory' },

  // Fuel Category
  { code: '30101', name: 'Gas Licuado', category: 'fuel' },
  { code: '30102', name: 'Gas Manufacturado', category: 'fuel' },
  { code: '30111', name: 'Gasolina Especial', category: 'fuel' },
  { code: '30112', name: 'Gasolina Regular', category: 'fuel' },
  { code: '30113', name: 'Diesel', category: 'fuel' },
  { code: '30120', name: 'Lubricantes y Aceites', category: 'fuel' },
  { code: '30130', name: 'Leña', category: 'fuel' },
  { code: '30140', name: 'Carbón', category: 'fuel' },

  // Energy Category
  { code: '40100', name: 'Energía Eléctrica', category: 'energy' },
  { code: '40200', name: 'Otras formas de energía', category: 'energy' },

  // Personnel Category
  { code: '50100', name: 'Salarios del personal contratado', category: 'personnel' },
  { code: '50200', name: 'Estimulación', category: 'personnel' },
  { code: '50300', name: 'Acumulación de vacaciones', category: 'personnel' },
  { code: '50400', name: 'Seguridad Social 12,5%', category: 'personnel' },
  { code: '50500', name: 'Otros conceptos de Salario', category: 'personnel' },

  // Depreciation Category
  { code: '70100', name: 'Depreciación Activos Fijos Tangibles', category: 'depreciation' },
  { code: '70200', name: 'Amortización de Activos Fijos Intangibles', category: 'depreciation' },

  // Services Category
  { code: '80010', name: 'Viáticos', category: 'services' },
  { code: '80011', name: 'Alimentación', category: 'services' },
  { code: '80012', name: 'Transportación', category: 'services' },
  { code: '80013', name: 'Alojamiento', category: 'services' },
  { code: '80014', name: 'Gastos de bolsillo', category: 'services' },
  { code: '80021', name: 'Prestación a Trabajadores', category: 'services' },
  { code: '80031', name: 'Estipendio a Estudiantes', category: 'services' },
  { code: '80040', name: 'Otros Servicios de Mantenimiento y Reparaciones Corrientes', category: 'services' },
  { code: '80041', name: 'Mantenimiento y Reparaciones muebles', category: 'services' },
  { code: '80042', name: 'Mantenimiento y Reparaciones de vehículos', category: 'services' },
  { code: '80043', name: 'Mantenimiento y Reparaciones de maquinarias y equipos', category: 'services' },
  { code: '80044', name: 'Mantenimientos y reparaciones de equipos de computación', category: 'services' },
  { code: '80050', name: 'Otros Servicios Contratados', category: 'services' },
  { code: '80051', name: 'Agua', category: 'services' },
  { code: '80052', name: 'Teléfono', category: 'services' },
  { code: '80053', name: 'Servicios gastronómicos', category: 'services' },
  { code: '80054', name: 'Servicios de telecomunicaciones', category: 'services' },
  { code: '80055', name: 'Servicios de transporte de personal y de carga', category: 'services' },
  { code: '80056', name: 'Talento artístico', category: 'services' },
  { code: '80057', name: 'Arrendamiento', category: 'services' },
  { code: '80058', name: 'Servicios de Seguridad y Protección', category: 'services' },
  { code: '80059', name: 'Servicios de Impresión y Reproducción de Documentos', category: 'services' },
  { code: '80060', name: 'Servicios Profesionales', category: 'services' },
  { code: '80061', name: 'Servicios Jurídicos', category: 'services' },
  { code: '80062', name: 'Contabilidad y Auditoría', category: 'services' },
  { code: '80063', name: 'Servicios de Procesamiento de Datos', category: 'services' },
  { code: '80064', name: 'Servicios de Ingeniería y Arquitectónicos', category: 'services' },
  { code: '80065', name: 'Servicios de Capacitación', category: 'services' },
  { code: '80066', name: 'Servicios Aduanales y Transitarios', category: 'services' },
  { code: '80067', name: 'Servicios de Lavandería y Tintorería', category: 'services' },
  { code: '80068', name: 'Seguros', category: 'services' },
  { code: '80070', name: 'Otros Gastos', category: 'services' },
  { code: '80071', name: 'Otros Gastos de almacenaje', category: 'services' },
  { code: '80072', name: 'Efecto económico de innovaciones y racionalizaciones', category: 'services' },
  { code: '80073', name: 'Compensación de vehículos vinculados', category: 'services' },
  { code: '80074', name: 'Pagos de derecho de autor', category: 'services' },
  { code: '80075', name: 'Pagos de inscripción en eventos nacionales e internacionales', category: 'services' },
  { code: '80080', name: 'Pagos a Organismos Internacionales', category: 'services' },
  { code: '80090', name: 'Reparación y Mantenimiento de Viales', category: 'services' },
  { code: '80100', name: 'Servicio de Mantenimiento y Reparación Constructivo', category: 'services' },
  { code: '80110', name: 'Financiamiento otorgado para compra de materiales de la construcción', category: 'services' },
  { code: '81100', name: 'Gastos por Importación de Servicios', category: 'services' },
  { code: '81200', name: 'Pagos de Servicios recibidos de embajadas, misiones diplomáticas y consulares', category: 'services' },
  { code: '81300', name: 'Pagos de Servicios recibidos de instituciones internacionales', category: 'services' },
  { code: '81400', name: 'Pagos de Servicios recibidos de personas naturales radicadas en el exterior', category: 'services' },
  { code: '81500', name: 'Pagos de Servicios recibidos de personas jurídicas radicadas en el exterior', category: 'services' },
  { code: '82100', name: 'Pensiones a Corto Plazo', category: 'services' },
  { code: '82200', name: 'Pensiones a Largo Plazo', category: 'services' },
  { code: '83100', name: 'Prestaciones en Efectivo', category: 'services' },
  { code: '83200', name: 'Prestaciones en Especies', category: 'services' },
  { code: '83300', name: 'Garantías de Ingreso', category: 'services' },
  { code: '84100', name: 'Subvención por Pérdidas', category: 'services' },
  { code: '84200', name: 'Subvención a Organizaciones y Asociaciones', category: 'services' },
  { code: '84300', name: 'Gastos Específicos en Organizaciones y Asociaciones', category: 'services' },
  { code: '84400', name: 'Financiamiento a la Exportación y Sustitución de Importaciones', category: 'services' },
  { code: '84500', name: 'Precios Minoristas Subsidiados', category: 'services' },
  { code: '84600', name: 'Rebajas de Precios Minoristas', category: 'services' },
  { code: '84700', name: 'Transferencias al Sector Cooperativo y Campesino', category: 'services' },
  { code: '84800', name: 'Compensación por Ventas Directas a Productores Agrícolas', category: 'services' },
  { code: '84900', name: 'Subvención por resultado negativo a Unidades Presupuestadas con Tratamiento Especial', category: 'services' },
  { code: '85000', name: 'Donaciones del Estado al Exterior', category: 'services' },
  { code: '85100', name: 'Compensaciones Estatales', category: 'services' },
  { code: '85200', name: 'Financiamiento de la Contribución Territorial', category: 'services' },
  { code: '85300', name: 'Indemnizaciones de la Caja de Resarcimiento', category: 'services' },
  { code: '85400', name: 'Otras Transferencias Corrientes', category: 'services' },

  // Transfers Category
  { code: '90100', name: 'Traspasos de gastos indirectos de producción', category: 'transfers' },
  { code: '90200', name: 'Traspasos por otros Conceptos', category: 'transfers' },
  { code: '90300', name: 'Cierre del Año', category: 'transfers' },
];

async function seedGlobalSubelements() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const dataSource = app.get(DataSource);

  try {
    console.log('Starting global subelements seeding...');

    // Clear existing subelements
    console.log('Clearing existing subelements...');
    await dataSource.query('DELETE FROM subelements');

    // Create global subelements (without companyId)
    console.log(`Creating ${SUBELEMENTS_DATA.length} global subelements...`);
    
    const subelements = SUBELEMENTS_DATA.map(data => ({
      ...data,
      companyId: null, // Global subelements
      isActive: true,
    }));

    // Insert all subelements
    await dataSource
      .createQueryBuilder()
      .insert()
      .into('subelements')
      .values(subelements)
      .execute();

    console.log(`Successfully created ${subelements.length} global subelements!`);

    // Verify creation
    const count = await dataSource.query('SELECT COUNT(*) as count FROM subelements WHERE company_id IS NULL');
    console.log(`Total global subelements in database: ${count[0].count}`);

  } catch (error) {
    console.error('Error seeding global subelements:', error);
    throw error;
  } finally {
    await app.close();
  }
}

// Run the seed
seedGlobalSubelements()
  .then(() => {
    console.log('Global subelements seeding completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Global subelements seeding failed:', error);
    process.exit(1);
  });
