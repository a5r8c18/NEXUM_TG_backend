import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Subelement, SubelementCategory } from './entities/subelement.entity';
import { Company } from './entities/company.entity';
import { DataSource } from 'typeorm';

const SUBELEMENTS_DATA = [
  // Inventory Category
  { code: '11101', name: 'Alimento Consumo Humano', category: 'inventory' as SubelementCategory },
  { code: '11102', name: 'Alimento Consumo Animal', category: 'inventory' as SubelementCategory },
  { code: '11110', name: 'Materiales de la Construcción', category: 'inventory' as SubelementCategory },
  { code: '11111', name: 'Aridos', category: 'inventory' as SubelementCategory },
  { code: '11112', name: 'Aceros', category: 'inventory' as SubelementCategory },
  { code: '11113', name: 'Elaborados', category: 'inventory' as SubelementCategory },
  { code: '11114', name: 'Pinturas y otros', category: 'inventory' as SubelementCategory },
  { code: '11120', name: 'Vestuario y Lencería', category: 'inventory' as SubelementCategory },
  { code: '11121', name: 'Uniformes', category: 'inventory' as SubelementCategory },
  { code: '11122', name: 'Calzado', category: 'inventory' as SubelementCategory },
  { code: '11123', name: 'Lencería', category: 'inventory' as SubelementCategory },
  { code: '11130', name: 'Materiales para la Enseñanza', category: 'inventory' as SubelementCategory },
  { code: '11131', name: 'Cuadernos y libros', category: 'inventory' as SubelementCategory },
  { code: '11132', name: 'Juguetes', category: 'inventory' as SubelementCategory },
  { code: '11133', name: 'Audiovisuales', category: 'inventory' as SubelementCategory },
  { code: '11134', name: 'útiles, herramientas y materiales de laboratorios y talleres', category: 'inventory' as SubelementCategory },
  { code: '11140', name: 'Medicamentos y Materiales Afines', category: 'inventory' as SubelementCategory },
  { code: '11150', name: 'Materiales y Artículos de Consumo', category: 'inventory' as SubelementCategory },
  { code: '11151', name: 'Materiales y Artículos de Consumo', category: 'inventory' as SubelementCategory },
  { code: '11160', name: 'Libros y Revistas', category: 'inventory' as SubelementCategory },
  { code: '11161', name: 'Papel de Escritorio y Materiales Oficina', category: 'inventory' as SubelementCategory },
  { code: '11162', name: 'Artículos de Limpieza y Aseo', category: 'inventory' as SubelementCategory },
  { code: '11163', name: 'Mat p/ Mtto y Reparaciones, Mat Eléctricos', category: 'inventory' as SubelementCategory },
  { code: '11164', name: 'Libros y Revistas', category: 'inventory' as SubelementCategory },
  { code: '11170', name: 'Útiles y Herramientas', category: 'inventory' as SubelementCategory },
  { code: '11171', name: 'Útiles de escritorio y oficina', category: 'inventory' as SubelementCategory },
  { code: '11172', name: 'Utensilios de cocina', category: 'inventory' as SubelementCategory },
  { code: '11173', name: 'Utensilios deportivos', category: 'inventory' as SubelementCategory },
  { code: '11174', name: 'Depreciación de Útiles y Herramientas', category: 'inventory' as SubelementCategory },
  { code: '11180', name: 'Partes y Piezas de Repuestos', category: 'inventory' as SubelementCategory },
  { code: '11181', name: 'Piezas de repuesto y accesorios parque automotor', category: 'inventory' as SubelementCategory },
  { code: '11182', name: 'Piezas de repuesto y accesorios otros equipos', category: 'inventory' as SubelementCategory },
  { code: '11190', name: 'Otros Inventarios', category: 'inventory' as SubelementCategory },
  { code: '11200', name: 'Equipos de protección personal', category: 'inventory' as SubelementCategory },

  // Fuel Category
  { code: '30101', name: 'Gas Licuado', category: 'fuel' as SubelementCategory },
  { code: '30102', name: 'Gas Manufacturado', category: 'fuel' as SubelementCategory },
  { code: '30111', name: 'Gasolina Especial', category: 'fuel' as SubelementCategory },
  { code: '30112', name: 'Gasolina Regular', category: 'fuel' as SubelementCategory },
  { code: '30113', name: 'Diesel', category: 'fuel' as SubelementCategory },
  { code: '30120', name: 'Lubricantes y Aceites', category: 'fuel' as SubelementCategory },
  { code: '30130', name: 'Leña', category: 'fuel' as SubelementCategory },
  { code: '30140', name: 'Carbón', category: 'fuel' as SubelementCategory },

  // Energy Category
  { code: '40100', name: 'Energía Eléctrica', category: 'energy' as SubelementCategory },
  { code: '40200', name: 'Otras formas de energía', category: 'energy' as SubelementCategory },

  // Personnel Category
  { code: '50100', name: 'Salarios del personal contratado', category: 'personnel' as SubelementCategory },
  { code: '50200', name: 'Estimulación', category: 'personnel' as SubelementCategory },
  { code: '50300', name: 'Acumulación de vacaciones', category: 'personnel' as SubelementCategory },
  { code: '50400', name: 'Seguridad Social 12,5%', category: 'personnel' as SubelementCategory },
  { code: '50500', name: 'Otros conceptos de Salario', category: 'personnel' as SubelementCategory },

  // Depreciation Category
  { code: '70100', name: 'Depreciación Activos Fijos Tangibles', category: 'depreciation' as SubelementCategory },
  { code: '70200', name: 'Amortización de Activos Fijos Intangibles', category: 'depreciation' as SubelementCategory },

  // Services Category
  { code: '80010', name: 'Viáticos', category: 'services' as SubelementCategory },
  { code: '80011', name: 'Alimentación', category: 'services' as SubelementCategory },
  { code: '80012', name: 'Transportación', category: 'services' as SubelementCategory },
  { code: '80013', name: 'Alojamiento', category: 'services' as SubelementCategory },
  { code: '80014', name: 'Gastos de bolsillo', category: 'services' as SubelementCategory },
  { code: '80021', name: 'Prestación a Trabajadores', category: 'services' as SubelementCategory },
  { code: '80031', name: 'Estipendio a Estudiantes', category: 'services' as SubelementCategory },
  { code: '80040', name: 'Otros Servicios de Mantenimiento y Reparaciones Corrientes', category: 'services' as SubelementCategory },
  { code: '80041', name: 'Mantenimiento y Reparaciones muebles', category: 'services' as SubelementCategory },
  { code: '80042', name: 'Mantenimiento y Reparaciones de vehículos', category: 'services' as SubelementCategory },
  { code: '80043', name: 'Mantenimiento y Reparaciones de maquinarias y equipos', category: 'services' as SubelementCategory },
  { code: '80044', name: 'Mantenimientos y reparaciones de equipos de computación', category: 'services' as SubelementCategory },
  { code: '80050', name: 'Otros Servicios Contratados', category: 'services' as SubelementCategory },
  { code: '80051', name: 'Agua', category: 'services' as SubelementCategory },
  { code: '80052', name: 'Teléfono', category: 'services' as SubelementCategory },
  { code: '80053', name: 'Servicios gastronómicos', category: 'services' as SubelementCategory },
  { code: '80054', name: 'Servicios de telecomunicaciones', category: 'services' as SubelementCategory },
  { code: '80055', name: 'Servicios de transporte de personal y de carga', category: 'services' as SubelementCategory },
  { code: '80056', name: 'Talento artístico', category: 'services' as SubelementCategory },
  { code: '80057', name: 'Arrendamiento', category: 'services' as SubelementCategory },
  { code: '80058', name: 'Servicios de Seguridad y Protección', category: 'services' as SubelementCategory },
  { code: '80059', name: 'Servicios de Impresión y Reproducción de Documentos', category: 'services' as SubelementCategory },
  { code: '80060', name: 'Servicios Profesionales', category: 'services' as SubelementCategory },
  { code: '80061', name: 'Servicios Jurídicos', category: 'services' as SubelementCategory },
  { code: '80062', name: 'Contabilidad y Auditoría', category: 'services' as SubelementCategory },
  { code: '80063', name: 'Servicios de Procesamiento de Datos', category: 'services' as SubelementCategory },
  { code: '80064', name: 'Servicios de Ingeniería y Arquitectónicos', category: 'services' as SubelementCategory },
  { code: '80065', name: 'Servicios de Capacitación', category: 'services' as SubelementCategory },
  { code: '80066', name: 'Servicios Aduanales y Transitarios', category: 'services' as SubelementCategory },
  { code: '80067', name: 'Servicios de Lavandería y Tintorería', category: 'services' as SubelementCategory },
  { code: '80068', name: 'Seguros', category: 'services' as SubelementCategory },
  { code: '80070', name: 'Otros Gastos', category: 'services' as SubelementCategory },
  { code: '80071', name: 'Otros Gastos de almacenaje', category: 'services' as SubelementCategory },
  { code: '80072', name: 'Efecto económico de innovaciones y racionalizaciones', category: 'services' as SubelementCategory },
  { code: '80073', name: 'Compensación de vehículos vinculados', category: 'services' as SubelementCategory },
  { code: '80074', name: 'Pagos de derecho de autor', category: 'services' as SubelementCategory },
  { code: '80075', name: 'Pagos de inscripción en eventos nacionales e internacionales', category: 'services' as SubelementCategory },
  { code: '80080', name: 'Pagos a Organismos Internacionales', category: 'services' as SubelementCategory },
  { code: '80090', name: 'Reparación y Mantenimiento de Viales', category: 'services' as SubelementCategory },
  { code: '80100', name: 'Servicio de Mantenimiento y Reparación Constructivo', category: 'services' as SubelementCategory },
  { code: '80110', name: 'Financiamiento otorgado para compra de materiales de la construcción', category: 'services' as SubelementCategory },
  { code: '81100', name: 'Gastos por Importación de Servicios', category: 'services' as SubelementCategory },
  { code: '81200', name: 'Pagos de Servicios recibidos de embajadas, misiones diplomáticas y consulares', category: 'services' as SubelementCategory },
  { code: '81300', name: 'Pagos de Servicios recibidos de instituciones internacionales', category: 'services' as SubelementCategory },
  { code: '81400', name: 'Pagos de Servicios recibidos de personas naturales radicadas en el exterior', category: 'services' as SubelementCategory },
  { code: '81500', name: 'Pagos de Servicios recibidos de personas jurídicas radicadas en el exterior', category: 'services' as SubelementCategory },
  { code: '82100', name: 'Pensiones a Corto Plazo', category: 'services' as SubelementCategory },
  { code: '82200', name: 'Pensiones a Largo Plazo', category: 'services' as SubelementCategory },
  { code: '83100', name: 'Prestaciones en Efectivo', category: 'services' as SubelementCategory },
  { code: '83200', name: 'Prestaciones en Especies', category: 'services' as SubelementCategory },
  { code: '83300', name: 'Garantías de Ingreso', category: 'services' as SubelementCategory },
  { code: '84100', name: 'Subvención por Pérdidas', category: 'services' as SubelementCategory },
  { code: '84200', name: 'Subvención a Organizaciones y Asociaciones', category: 'services' as SubelementCategory },
  { code: '84300', name: 'Gastos Específicos en Organizaciones y Asociaciones', category: 'services' as SubelementCategory },
  { code: '84400', name: 'Financiamiento a la Exportación y Sustitución de Importaciones', category: 'services' as SubelementCategory },
  { code: '84500', name: 'Precios Minoristas Subsidiados', category: 'services' as SubelementCategory },
  { code: '84600', name: 'Rebajas de Precios Minoristas', category: 'services' as SubelementCategory },
  { code: '84700', name: 'Transferencias al Sector Cooperativo y Campesino', category: 'services' as SubelementCategory },
  { code: '84800', name: 'Compensación por Ventas Directas a Productores Agrícolas', category: 'services' as SubelementCategory },
  { code: '84900', name: 'Subvención por resultado negativo a Unidades Presupuestadas con Tratamiento Especial', category: 'services' as SubelementCategory },
  { code: '85000', name: 'Donaciones del Estado al Exterior', category: 'services' as SubelementCategory },
  { code: '85100', name: 'Compensaciones Estatales', category: 'services' as SubelementCategory },
  { code: '85200', name: 'Financiamiento de la Contribución Territorial', category: 'services' as SubelementCategory },
  { code: '85300', name: 'Indemnizaciones de la Caja de Resarcimiento', category: 'services' as SubelementCategory },
  { code: '85400', name: 'Otras Transferencias Corrientes', category: 'services' as SubelementCategory },

  // Transfers Category
  { code: '90100', name: 'Traspasos de gastos indirectos de producción', category: 'transfers' as SubelementCategory },
  { code: '90200', name: 'Traspasos por otros Conceptos', category: 'transfers' as SubelementCategory },
  { code: '90300', name: 'Cierre del Año', category: 'transfers' as SubelementCategory },
];

async function seedSubelements() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const dataSource = app.get(DataSource);

  try {
    console.log('Starting subelements seeding...');

    // Get the first company (or create one if none exists)
    const companyRepo = dataSource.getRepository(Company);
    let company = await companyRepo.findOne({ where: {} });
    
    if (!company) {
      console.log('No company found, creating default company...');
      company = companyRepo.create({
        name: 'Default Company',
        taxId: 'DEFAULT',
        address: 'Default Address',
        phone: '0000000000',
        email: 'default@example.com',
        isActive: true,
      });
      company = await companyRepo.save(company);
      console.log(`Created company with ID: ${company.id}`);
    }

    // Get subelement repository
    const subelementRepo = dataSource.getRepository(Subelement);

    // Check if subelements already exist
    const existingCount = await subelementRepo.count({
      where: { companyId: company.id }
    });

    if (existingCount > 0) {
      console.log(`Found ${existingCount} existing subelements. Skipping seeding.`);
      await app.close();
      return;
    }

    // Create subelements
    console.log(`Creating ${SUBELEMENTS_DATA.length} subelements for company ${company.id}...`);
    
    const subelements = SUBELEMENTS_DATA.map(data => 
      subelementRepo.create({
        ...data,
        companyId: company.id,
        isActive: true,
      })
    );

    await subelementRepo.save(subelements);

    console.log(`Successfully created ${subelements.length} subelements!`);

  } catch (error) {
    console.error('Error seeding subelements:', error);
    throw error;
  } finally {
    await app.close();
  }
}

// Run the seed
seedSubelements()
  .then(() => {
    console.log('Subelements seeding completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Subelements seeding failed:', error);
    process.exit(1);
  });
