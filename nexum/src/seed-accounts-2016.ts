import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Account } from './entities/account.entity';
import { Repository } from 'typeorm';
import { Company } from './entities/company.entity';

// Nomenclador Nacional de Cuentas - Cuba (Resolución 2016)
const cubanChartOfAccounts2016 = [
  // GRUPO 10 - ACTIVOS (Naturaleza Deudora)
  { code: '10', name: 'ACTIVOS', description: 'Grupo 10 - Activos', type: 'asset', nature: 'deudora', level: 1, groupNumber: '10', parentCode: null, allowsMovements: false },
  { code: '10.1', name: 'ACTIVOS CIRCULANTES', description: 'Grupo 10.1 - Activos Circulantes', type: 'asset', nature: 'deudora', level: 2, groupNumber: '10', parentCode: '10', allowsMovements: false },
  
  // Efectivo en Caja (101-108)
  { code: '101', name: 'Efectivo en Caja - Dentro del Órgano', description: 'Efectivo en caja dentro del órgano', type: 'asset', nature: 'deudora', level: 3, groupNumber: '10', parentCode: '10.1', allowsMovements: true },
  { code: '102', name: 'Efectivo en Caja - Fuera del Órgano', description: 'Efectivo en caja fuera del órgano', type: 'asset', nature: 'deudora', level: 3, groupNumber: '10', parentCode: '10.1', allowsMovements: true },
  { code: '103', name: 'Efectivo en Caja - En el Extranjero', description: 'Efectivo en caja en el extranjero', type: 'asset', nature: 'deudora', level: 3, groupNumber: '10', parentCode: '10.1', allowsMovements: true },
  { code: '104', name: 'Efectivo en Caja - Dentro del Grupo Empresarial', description: 'Efectivo en caja dentro del grupo empresarial', type: 'asset', nature: 'deudora', level: 3, groupNumber: '10', parentCode: '10.1', allowsMovements: true },
  { code: '105', name: 'Efectivo en Caja - Sector Cooperativo', description: 'Efectivo en caja sector cooperativo', type: 'asset', nature: 'deudora', level: 3, groupNumber: '10', parentCode: '10.1', allowsMovements: true },
  { code: '106', name: 'Efectivo en Caja - Personas Naturales', description: 'Efectivo en caja personas naturales', type: 'asset', nature: 'deudora', level: 3, groupNumber: '10', parentCode: '10.1', allowsMovements: true },
  
  // Efectivo en Banco (109-119)
  { code: '109', name: 'Efectivo en Banco - Dentro del Órgano', description: 'Efectivo en banco dentro del órgano', type: 'asset', nature: 'deudora', level: 3, groupNumber: '10', parentCode: '10.1', allowsMovements: true },
  { code: '110', name: 'Efectivo en Banco - Fuera del Órgano', description: 'Efectivo en banco fuera del órgano', type: 'asset', nature: 'deudora', level: 3, groupNumber: '10', parentCode: '10.1', allowsMovements: true },
  { code: '111', name: 'Efectivo en Banco - En el Extranjero', description: 'Efectivo en banco en el extranjero', type: 'asset', nature: 'deudora', level: 3, groupNumber: '10', parentCode: '10.1', allowsMovements: true },
  { code: '112', name: 'Efectivo en Banco - Dentro del Grupo Empresarial', description: 'Efectivo en banco dentro del grupo empresarial', type: 'asset', nature: 'deudora', level: 3, groupNumber: '10', parentCode: '10.1', allowsMovements: true },
  { code: '113', name: 'Efectivo en Banco - Sector Cooperativo', description: 'Efectivo en banco sector cooperativo', type: 'asset', nature: 'deudora', level: 3, groupNumber: '10', parentCode: '10.1', allowsMovements: true },
  { code: '114', name: 'Efectivo en Banco - Personas Naturales', description: 'Efectivo en banco personas naturales', type: 'asset', nature: 'deudora', level: 3, groupNumber: '10', parentCode: '10.1', allowsMovements: true },
  
  // Inversiones a Corto Plazo (120-129)
  { code: '120', name: 'Inversiones a Corto Plazo', description: 'Inversiones temporales', type: 'asset', nature: 'deudora', level: 3, groupNumber: '10', parentCode: '10.1', allowsMovements: true },
  
  // Efectos por Cobrar (130-133)
  { code: '130', name: 'Efectos por Cobrar - Dentro del Órgano', description: 'Efectos por cobrar dentro del órgano', type: 'asset', nature: 'deudora', level: 3, groupNumber: '10', parentCode: '10.1', allowsMovements: true },
  { code: '131', name: 'Efectos por Cobrar - Fuera del Órgano', description: 'Efectos por cobrar fuera del órgano', type: 'asset', nature: 'deudora', level: 3, groupNumber: '10', parentCode: '10.1', allowsMovements: true },
  { code: '132', name: 'Efectos por Cobrar - En el Extranjero', description: 'Efectos por cobrar en el extranjero', type: 'asset', nature: 'deudora', level: 3, groupNumber: '10', parentCode: '10.1', allowsMovements: true },
  { code: '133', name: 'Efectos por Cobrar - Dentro del Grupo Empresarial', description: 'Efectos por cobrar dentro del grupo empresarial', type: 'asset', nature: 'deudora', level: 3, groupNumber: '10', parentCode: '10.1', allowsMovements: true },
  
  // Cuentas por Cobrar (135-139)
  { code: '135', name: 'Cuentas por Cobrar - Dentro del Órgano', description: 'Cuentas por cobrar dentro del órgano', type: 'asset', nature: 'deudora', level: 3, groupNumber: '10', parentCode: '10.1', allowsMovements: true },
  { code: '136', name: 'Cuentas por Cobrar - Fuera del Órgano', description: 'Cuentas por cobrar fuera del órgano', type: 'asset', nature: 'deudora', level: 3, groupNumber: '10', parentCode: '10.1', allowsMovements: true },
  { code: '137', name: 'Cuentas por Cobrar - En el Extranjero', description: 'Cuentas por cobrar en el extranjero', type: 'asset', nature: 'deudora', level: 3, groupNumber: '10', parentCode: '10.1', allowsMovements: true },
  { code: '138', name: 'Cuentas por Cobrar - Dentro del Grupo Empresarial', description: 'Cuentas por cobrar dentro del grupo empresarial', type: 'asset', nature: 'deudora', level: 3, groupNumber: '10', parentCode: '10.1', allowsMovements: true },
  { code: '139', name: 'Cuentas por Cobrar - Sector Cooperativo', description: 'Cuentas por cobrar sector cooperativo', type: 'asset', nature: 'deudora', level: 3, groupNumber: '10', parentCode: '10.1', allowsMovements: true },
  
  // Inventarios (183-196)
  { code: '183', name: 'Materias Primas y Materiales', description: 'Materias primas y materiales', type: 'asset', nature: 'deudora', level: 3, groupNumber: '10', parentCode: '10.1', allowsMovements: true },
  { code: '184', name: 'Combustibles y Lubricantes', description: 'Combustibles y lubricantes', type: 'asset', nature: 'deudora', level: 3, groupNumber: '10', parentCode: '10.1', allowsMovements: true },
  { code: '185', name: 'Partes y Piezas de Repuesto', description: 'Partes y piezas de repuesto', type: 'asset', nature: 'deudora', level: 3, groupNumber: '10', parentCode: '10.1', allowsMovements: true },
  { code: '186', name: 'Envases y Embalajes', description: 'Envases y embalajes', type: 'asset', nature: 'deudora', level: 3, groupNumber: '10', parentCode: '10.1', allowsMovements: true },
  { code: '187', name: 'Útiles, Herramientas y Otros', description: 'Útiles, herramientas y otros', type: 'asset', nature: 'deudora', level: 3, groupNumber: '10', parentCode: '10.1', allowsMovements: true },
  { code: '188', name: 'Producción Terminada', description: 'Producción terminada', type: 'asset', nature: 'deudora', level: 3, groupNumber: '10', parentCode: '10.1', allowsMovements: true },
  { code: '189', name: 'Mercancías para la Venta', description: 'Mercancías para la venta', type: 'asset', nature: 'deudora', level: 3, groupNumber: '10', parentCode: '10.1', allowsMovements: true },
  { code: '190', name: 'Medicamentos', description: 'Medicamentos', type: 'asset', nature: 'deudora', level: 3, groupNumber: '10', parentCode: '10.1', allowsMovements: true },
  { code: '191', name: 'Base Material de Estudio', description: 'Base material de estudio', type: 'asset', nature: 'deudora', level: 3, groupNumber: '10', parentCode: '10.1', allowsMovements: true },
  { code: '192', name: 'Vestuario y Lencería', description: 'Vestuario y lencería', type: 'asset', nature: 'deudora', level: 3, groupNumber: '10', parentCode: '10.1', allowsMovements: true },
  { code: '193', name: 'Alimentos', description: 'Alimentos', type: 'asset', nature: 'deudora', level: 3, groupNumber: '10', parentCode: '10.1', allowsMovements: true },
  
  // GRUPO 10.2 - ACTIVO A LARGO PLAZO
  { code: '10.2', name: 'ACTIVO A LARGO PLAZO', description: 'Grupo 10.2 - Activo a Largo Plazo', type: 'asset', nature: 'deudora', level: 2, groupNumber: '10', parentCode: '10', allowsMovements: false },
  
  // Efectos por Cobrar a Largo Plazo (215-217)
  { code: '215', name: 'Efectos por Cobrar Largo Plazo - Dentro del Órgano', description: 'Efectos por cobrar largo plazo dentro del órgano', type: 'asset', nature: 'deudora', level: 3, groupNumber: '10', parentCode: '10.2', allowsMovements: true },
  { code: '216', name: 'Efectos por Cobrar Largo Plazo - Fuera del Órgano', description: 'Efectos por cobrar largo plazo fuera del órgano', type: 'asset', nature: 'deudora', level: 3, groupNumber: '10', parentCode: '10.2', allowsMovements: true },
  { code: '217', name: 'Efectos por Cobrar Largo Plazo - En el Extranjero', description: 'Efectos por cobrar largo plazo en el extranjero', type: 'asset', nature: 'deudora', level: 3, groupNumber: '10', parentCode: '10.2', allowsMovements: true },
  
  // Cuentas por Cobrar a Largo Plazo (218-220)
  { code: '218', name: 'Cuentas por Cobrar Largo Plazo - Dentro del Órgano', description: 'Cuentas por cobrar largo plazo dentro del órgano', type: 'asset', nature: 'deudora', level: 3, groupNumber: '10', parentCode: '10.2', allowsMovements: true },
  { code: '219', name: 'Cuentas por Cobrar Largo Plazo - Fuera del Órgano', description: 'Cuentas por cobrar largo plazo fuera del órgano', type: 'asset', nature: 'deudora', level: 3, groupNumber: '10', parentCode: '10.2', allowsMovements: true },
  { code: '220', name: 'Cuentas por Cobrar Largo Plazo - En el Extranjero', description: 'Cuentas por cobrar largo plazo en el extranjero', type: 'asset', nature: 'deudora', level: 3, groupNumber: '10', parentCode: '10.2', allowsMovements: true },
  
  // Préstamos Concedidos (221-224)
  { code: '221', name: 'Préstamos Concedidos - Dentro del Órgano', description: 'Préstamos concedidos dentro del órgano', type: 'asset', nature: 'deudora', level: 3, groupNumber: '10', parentCode: '10.2', allowsMovements: true },
  { code: '222', name: 'Préstamos Concedidos - Fuera del Órgano', description: 'Préstamos concedidos fuera del órgano', type: 'asset', nature: 'deudora', level: 3, groupNumber: '10', parentCode: '10.2', allowsMovements: true },
  { code: '223', name: 'Préstamos Concedidos - En el Extranjero', description: 'Préstamos concedidos en el extranjero', type: 'asset', nature: 'deudora', level: 3, groupNumber: '10', parentCode: '10.2', allowsMovements: true },
  { code: '224', name: 'Préstamos Concedidos - Dentro del Grupo Empresarial', description: 'Préstamos concedidos dentro del grupo empresarial', type: 'asset', nature: 'deudora', level: 3, groupNumber: '10', parentCode: '10.2', allowsMovements: true },
  
  // Inversiones a Largo Plazo (225-234)
  { code: '225', name: 'Inversiones a Largo Plazo', description: 'Inversiones permanentes', type: 'asset', nature: 'deudora', level: 3, groupNumber: '10', parentCode: '10.2', allowsMovements: true },
  
  // GRUPO 10.3 - ACTIVOS FIJOS
  { code: '10.3', name: 'ACTIVOS FIJOS', description: 'Grupo 10.3 - Activos Fijos', type: 'asset', nature: 'deudora', level: 2, groupNumber: '10', parentCode: '10', allowsMovements: false },
  
  // Activos Fijos Tangibles (240-251)
  { code: '240', name: 'Terrenos', description: 'Terrenos y bienes raíces', type: 'asset', nature: 'deudora', level: 3, groupNumber: '10', parentCode: '10.3', allowsMovements: true },
  { code: '241', name: 'Edificios', description: 'Edificios y construcciones', type: 'asset', nature: 'deudora', level: 3, groupNumber: '10', parentCode: '10.3', allowsMovements: true },
  { code: '242', name: 'Maquinaria y Equipo', description: 'Maquinaria y equipo industrial', type: 'asset', nature: 'deudora', level: 3, groupNumber: '10', parentCode: '10.3', allowsMovements: true },
  { code: '243', name: 'Equipos de Transporte', description: 'Vehículos y equipos de transporte', type: 'asset', nature: 'deudora', level: 3, groupNumber: '10', parentCode: '10.3', allowsMovements: true },
  { code: '244', name: 'Mobiliario y Enseres', description: 'Mobiliario y enseres', type: 'asset', nature: 'deudora', level: 3, groupNumber: '10', parentCode: '10.3', allowsMovements: true },
  { code: '245', name: 'Equipos de Computación', description: 'Equipos de cómputo y tecnología', type: 'asset', nature: 'deudora', level: 3, groupNumber: '10', parentCode: '10.3', allowsMovements: true },
  
  // Activos Fijos Intangibles (255-263)
  { code: '255', name: 'Patentes y Marcas', description: 'Patentes, marcas y derechos', type: 'asset', nature: 'deudora', level: 3, groupNumber: '10', parentCode: '10.3', allowsMovements: true },
  { code: '256', name: 'Software y Licencias', description: 'Software y licencias', type: 'asset', nature: 'deudora', level: 3, groupNumber: '10', parentCode: '10.3', allowsMovements: true },
  { code: '257', name: 'Derechos de Autor', description: 'Derechos de autor', type: 'asset', nature: 'deudora', level: 3, groupNumber: '10', parentCode: '10.3', allowsMovements: true },
  
  // CUENTAS REGULADORAS DE ACTIVOS (365-399)
  { code: '365', name: 'Efectos por Cobrar Descontados', description: 'Efectos por cobrar descontados', type: 'asset', nature: 'acreedora', level: 3, groupNumber: '10', parentCode: '10.3', allowsMovements: true },
  { code: '369', name: 'Provisión para Cuentas Incobrables', description: 'Provisión para cuentas incobrables', type: 'asset', nature: 'acreedora', level: 3, groupNumber: '10', parentCode: '10.3', allowsMovements: true },
  { code: '375', name: 'Depreciación Acumulada - Edificios', description: 'Depreciación acumulada de edificios', type: 'asset', nature: 'acreedora', level: 3, groupNumber: '10', parentCode: '10.3', allowsMovements: true },
  { code: '376', name: 'Depreciación Acumulada - Maquinaria', description: 'Depreciación acumulada de maquinaria', type: 'asset', nature: 'acreedora', level: 3, groupNumber: '10', parentCode: '10.3', allowsMovements: true },
  { code: '377', name: 'Depreciación Acumulada - Equipos', description: 'Depreciación acumulada de equipos', type: 'asset', nature: 'acreedora', level: 3, groupNumber: '10', parentCode: '10.3', allowsMovements: true },
  { code: '390', name: 'Amortización Acumulada - Intangibles', description: 'Amortización acumulada de intangibles', type: 'asset', nature: 'acreedora', level: 3, groupNumber: '10', parentCode: '10.3', allowsMovements: true },
  
  // GRUPO 20 - PASIVOS (Naturaleza Acreedora)
  { code: '20', name: 'PASIVOS', description: 'Grupo 20 - Pasivos', type: 'liability', nature: 'acreedora', level: 1, groupNumber: '20', parentCode: null, allowsMovements: false },
  { code: '20.1', name: 'PASIVOS CIRCULANTES', description: 'Grupo 20.1 - Pasivos Circulantes', type: 'liability', nature: 'acreedora', level: 2, groupNumber: '20', parentCode: '20', allowsMovements: false },
  
  // Sobregiro Bancario
  { code: '400', name: 'Sobregiro Bancario', description: 'Sobregiro bancario', type: 'liability', nature: 'acreedora', level: 3, groupNumber: '20', parentCode: '20.1', allowsMovements: true },
  
  // Efectos por Pagar (401-404)
  { code: '401', name: 'Efectos por Pagar - Dentro del Órgano', description: 'Efectos por pagar dentro del órgano', type: 'liability', nature: 'acreedora', level: 3, groupNumber: '20', parentCode: '20.1', allowsMovements: true },
  { code: '402', name: 'Efectos por Pagar - Fuera del Órgano', description: 'Efectos por pagar fuera del órgano', type: 'liability', nature: 'acreedora', level: 3, groupNumber: '20', parentCode: '20.1', allowsMovements: true },
  { code: '403', name: 'Efectos por Pagar - En el Extranjero', description: 'Efectos por pagar en el extranjero', type: 'liability', nature: 'acreedora', level: 3, groupNumber: '20', parentCode: '20.1', allowsMovements: true },
  { code: '404', name: 'Efectos por Pagar - Dentro del Grupo Empresarial', description: 'Efectos por pagar dentro del grupo empresarial', type: 'liability', nature: 'acreedora', level: 3, groupNumber: '20', parentCode: '20.1', allowsMovements: true },
  
  // Cuentas por Pagar (405-415)
  { code: '405', name: 'Cuentas por Pagar - Dentro del Órgano', description: 'Cuentas por pagar dentro del órgano', type: 'liability', nature: 'acreedora', level: 3, groupNumber: '20', parentCode: '20.1', allowsMovements: true },
  { code: '406', name: 'Cuentas por Pagar - Fuera del Órgano', description: 'Cuentas por pagar fuera del órgano', type: 'liability', nature: 'acreedora', level: 3, groupNumber: '20', parentCode: '20.1', allowsMovements: true },
  { code: '407', name: 'Cuentas por Pagar - En el Extranjero', description: 'Cuentas por pagar en el extranjero', type: 'liability', nature: 'acreedora', level: 3, groupNumber: '20', parentCode: '20.1', allowsMovements: true },
  { code: '408', name: 'Cuentas por Pagar - Dentro del Grupo Empresarial', description: 'Cuentas por pagar dentro del grupo empresarial', type: 'liability', nature: 'acreedora', level: 3, groupNumber: '20', parentCode: '20.1', allowsMovements: true },
  { code: '409', name: 'Cuentas por Pagar - Sector Cooperativo', description: 'Cuentas por pagar sector cooperativo', type: 'liability', nature: 'acreedora', level: 3, groupNumber: '20', parentCode: '20.1', allowsMovements: true },
  { code: '410', name: 'Cuentas por Pagar - Personas Naturales', description: 'Cuentas por pagar personas naturales', type: 'liability', nature: 'acreedora', level: 3, groupNumber: '20', parentCode: '20.1', allowsMovements: true },
  
  // Nóminas por Pagar (455-459)
  { code: '455', name: 'Salarios por Pagar', description: 'Salarios por pagar', type: 'liability', nature: 'acreedora', level: 3, groupNumber: '20', parentCode: '20.1', allowsMovements: true },
  { code: '456', name: 'Vacaciones por Pagar', description: 'Vacaciones por pagar', type: 'liability', nature: 'acreedora', level: 3, groupNumber: '20', parentCode: '20.1', allowsMovements: true },
  { code: '457', name: 'Seguridad Social por Pagar', description: 'Seguridad social por pagar', type: 'liability', nature: 'acreedora', level: 3, groupNumber: '20', parentCode: '20.1', allowsMovements: true },
  
  // Obligaciones con el Presupuesto del Estado (440-449)
  { code: '440', name: 'IVA por Pagar', description: 'IVA por pagar', type: 'liability', nature: 'acreedora', level: 3, groupNumber: '20', parentCode: '20.1', allowsMovements: true },
  { code: '441', name: 'Impuesto sobre Utilidades por Pagar', description: 'Impuesto sobre utilidades por pagar', type: 'liability', nature: 'acreedora', level: 3, groupNumber: '20', parentCode: '20.1', allowsMovements: true },
  { code: '442', name: 'Impuesto sobre Ingresos Personales por Pagar', description: 'Impuesto sobre ingresos personales por pagar', type: 'liability', nature: 'acreedora', level: 3, groupNumber: '20', parentCode: '20.1', allowsMovements: true },
  { code: '443', name: 'Contribuciones por Pagar', description: 'Contribuciones por pagar', type: 'liability', nature: 'acreedora', level: 3, groupNumber: '20', parentCode: '20.1', allowsMovements: true },
  
  // GRUPO 20.2 - PASIVOS A LARGO PLAZO
  { code: '20.2', name: 'PASIVOS A LARGO PLAZO', description: 'Grupo 20.2 - Pasivos a Largo Plazo', type: 'liability', nature: 'acreedora', level: 2, groupNumber: '20', parentCode: '20', allowsMovements: false },
  
  // Efectos por Pagar Largo Plazo (510-514)
  { code: '510', name: 'Efectos por Pagar Largo Plazo - Dentro del Órgano', description: 'Efectos por pagar largo plazo dentro del órgano', type: 'liability', nature: 'acreedora', level: 3, groupNumber: '20', parentCode: '20.2', allowsMovements: true },
  { code: '511', name: 'Efectos por Pagar Largo Plazo - Fuera del Órgano', description: 'Efectos por pagar largo plazo fuera del órgano', type: 'liability', nature: 'acreedora', level: 3, groupNumber: '20', parentCode: '20.2', allowsMovements: true },
  { code: '512', name: 'Efectos por Pagar Largo Plazo - En el Extranjero', description: 'Efectos por pagar largo plazo en el extranjero', type: 'liability', nature: 'acreedora', level: 3, groupNumber: '20', parentCode: '20.2', allowsMovements: true },
  { code: '513', name: 'Efectos por Pagar Largo Plazo - Dentro del Grupo Empresarial', description: 'Efectos por pagar largo plazo dentro del grupo empresarial', type: 'liability', nature: 'acreedora', level: 3, groupNumber: '20', parentCode: '20.2', allowsMovements: true },
  { code: '514', name: 'Efectos por Pagar Largo Plazo - Sector Cooperativo', description: 'Efectos por pagar largo plazo sector cooperativo', type: 'liability', nature: 'acreedora', level: 3, groupNumber: '20', parentCode: '20.2', allowsMovements: true },
  
  // Cuentas por Pagar Largo Plazo (515-518)
  { code: '515', name: 'Cuentas por Pagar Largo Plazo - Dentro del Órgano', description: 'Cuentas por pagar largo plazo dentro del órgano', type: 'liability', nature: 'acreedora', level: 3, groupNumber: '20', parentCode: '20.2', allowsMovements: true },
  { code: '516', name: 'Cuentas por Pagar Largo Plazo - Fuera del Órgano', description: 'Cuentas por pagar largo plazo fuera del órgano', type: 'liability', nature: 'acreedora', level: 3, groupNumber: '20', parentCode: '20.2', allowsMovements: true },
  { code: '517', name: 'Cuentas por Pagar Largo Plazo - En el Extranjero', description: 'Cuentas por pagar largo plazo en el extranjero', type: 'liability', nature: 'acreedora', level: 3, groupNumber: '20', parentCode: '20.2', allowsMovements: true },
  { code: '518', name: 'Cuentas por Pagar Largo Plazo - Dentro del Grupo Empresarial', description: 'Cuentas por pagar largo plazo dentro del grupo empresarial', type: 'liability', nature: 'acreedora', level: 3, groupNumber: '20', parentCode: '20.2', allowsMovements: true },
  
  // Préstamos Recibidos (520-524)
  { code: '520', name: 'Préstamos Bancarios Largo Plazo', description: 'Préstamos bancarios largo plazo', type: 'liability', nature: 'acreedora', level: 3, groupNumber: '20', parentCode: '20.2', allowsMovements: true },
  { code: '521', name: 'Préstamos Recibidos - Dentro del Órgano', description: 'Préstamos recibidos dentro del órgano', type: 'liability', nature: 'acreedora', level: 3, groupNumber: '20', parentCode: '20.2', allowsMovements: true },
  { code: '522', name: 'Préstamos Recibidos - Fuera del Órgano', description: 'Préstamos recibidos fuera del órgano', type: 'liability', nature: 'acreedora', level: 3, groupNumber: '20', parentCode: '20.2', allowsMovements: true },
  { code: '523', name: 'Préstamos Recibidos - En el Extranjero', description: 'Préstamos recibidos en el extranjero', type: 'liability', nature: 'acreedora', level: 3, groupNumber: '20', parentCode: '20.2', allowsMovements: true },
  { code: '524', name: 'Préstamos Recibidos - Dentro del Grupo Empresarial', description: 'Préstamos recibidos dentro del grupo empresarial', type: 'liability', nature: 'acreedora', level: 3, groupNumber: '20', parentCode: '20.2', allowsMovements: true },
  
  // GRUPO 30 - PATRIMONIO NETO (Entidades Estatales)
  { code: '30', name: 'PATRIMONIO NETO', description: 'Grupo 30 - Patrimonio Neto (Entidades Estatales)', type: 'equity', nature: 'acreedora', level: 1, groupNumber: '30', parentCode: null, allowsMovements: false },
  
  // Inversión Estatal (600-612)
  { code: '600', name: 'Inversión Estatal', description: 'Inversión estatal', type: 'equity', nature: 'acreedora', level: 2, groupNumber: '30', parentCode: '30', allowsMovements: true },
  { code: '610', name: 'Inversión Estatal - Capital', description: 'Inversión estatal en capital', type: 'equity', nature: 'acreedora', level: 3, groupNumber: '30', parentCode: '600', allowsMovements: true },
  
  // Revalorización de Activos (613-615)
  { code: '613', name: 'Revalorización de Activos Fijos Tangibles', description: 'Revalorización de activos fijos tangibles', type: 'equity', nature: 'mixta', level: 2, groupNumber: '30', parentCode: '30', allowsMovements: true },
  
  // Recursos Recibidos (617-618)
  { code: '617', name: 'Recursos Recibidos - Capital', description: 'Recursos recibidos como capital', type: 'equity', nature: 'acreedora', level: 2, groupNumber: '30', parentCode: '30', allowsMovements: true },
  { code: '618', name: 'Recursos Entregados', description: 'Recursos entregados', type: 'equity', nature: 'deudora', level: 2, groupNumber: '30', parentCode: '30', allowsMovements: true },
  
  // Donaciones (620-627)
  { code: '620', name: 'Donaciones Recibidas - Nacionales', description: 'Donaciones recibidas nacionales', type: 'equity', nature: 'acreedora', level: 2, groupNumber: '30', parentCode: '30', allowsMovements: true },
  { code: '621', name: 'Donaciones Recibidas - Exterior', description: 'Donaciones recibidas del exterior', type: 'equity', nature: 'acreedora', level: 2, groupNumber: '30', parentCode: '30', allowsMovements: true },
  { code: '626', name: 'Donaciones Entregadas - Nacionales', description: 'Donaciones entregadas nacionales', type: 'equity', nature: 'deudora', level: 2, groupNumber: '30', parentCode: '30', allowsMovements: true },
  { code: '627', name: 'Donaciones Entregadas - Exterior', description: 'Donaciones entregadas al exterior', type: 'equity', nature: 'deudora', level: 2, groupNumber: '30', parentCode: '30', allowsMovements: true },
  
  // Utilidades y Pérdidas (630-644)
  { code: '630', name: 'Utilidades Retenidas', description: 'Utilidades retenidas', type: 'equity', nature: 'acreedora', level: 2, groupNumber: '30', parentCode: '30', allowsMovements: true },
  { code: '635', name: 'Subvención por Pérdida', description: 'Subvención por pérdida', type: 'equity', nature: 'acreedora', level: 2, groupNumber: '30', parentCode: '30', allowsMovements: true },
  { code: '640', name: 'Pérdida', description: 'Pérdida del período', type: 'equity', nature: 'deudora', level: 2, groupNumber: '30', parentCode: '30', allowsMovements: true },
  { code: '645', name: 'Reservas para Contingencias', description: 'Reservas para contingencias', type: 'equity', nature: 'acreedora', level: 2, groupNumber: '30', parentCode: '30', allowsMovements: true },
  
  // GRUPO 30 - CAPITAL CONTABLE (Entidades no Estatales)
  { code: '30.1', name: 'CAPITAL CONTABLE', description: 'Grupo 30.1 - Capital Contable (Entidades no Estatales)', type: 'equity', nature: 'acreedora', level: 1, groupNumber: '30', parentCode: null, allowsMovements: false },
  
  // Capital Social (600-612)
  { code: '600.1', name: 'Patrimonio y Fondo Común', description: 'Patrimonio y fondo común', type: 'equity', nature: 'acreedora', level: 2, groupNumber: '30', parentCode: '30.1', allowsMovements: true },
  { code: '601', name: 'Capital Social Autorizado', description: 'Capital social autorizado', type: 'equity', nature: 'acreedora', level: 3, groupNumber: '30', parentCode: '30.1', allowsMovements: true },
  { code: '604', name: 'Acciones por Emitir', description: 'Acciones por emitir', type: 'equity', nature: 'deudora', level: 3, groupNumber: '30', parentCode: '30.1', allowsMovements: true },
  { code: '607', name: 'Acciones Suscritas', description: 'Acciones suscritas', type: 'equity', nature: 'acreedora', level: 3, groupNumber: '30', parentCode: '30.1', allowsMovements: true },
  { code: '610', name: 'Subscriptores de Acciones', description: 'Subscriptores de acciones', type: 'equity', nature: 'deudora', level: 3, groupNumber: '30', parentCode: '30.1', allowsMovements: true },
  { code: '611', name: 'Acciones en Tesorería', description: 'Acciones en tesorería', type: 'equity', nature: 'deudora', level: 3, groupNumber: '30', parentCode: '30.1', allowsMovements: true },
  
  // GRUPO 40 - GASTOS DE PRODUCCIÓN
  { code: '40', name: 'GASTOS DE PRODUCCIÓN', description: 'Grupo 40 - Gastos de Producción', type: 'expense', nature: 'deudora', level: 1, groupNumber: '40', parentCode: null, allowsMovements: false },
  
  // Producción en Proceso (700-724)
  { code: '700', name: 'Producción en Proceso', description: 'Producción en proceso', type: 'expense', nature: 'deudora', level: 2, groupNumber: '40', parentCode: '40', allowsMovements: true },
  { code: '701', name: 'Producción en Proceso - Saldo Inicial', description: 'Saldo al inicio del año', type: 'expense', nature: 'deudora', level: 3, groupNumber: '40', parentCode: '700', allowsMovements: true },
  { code: '702', name: 'Producción en Proceso - Gastos del Período', description: 'Gastos del período', type: 'expense', nature: 'deudora', level: 3, groupNumber: '40', parentCode: '700', allowsMovements: true },
  { code: '703', name: 'Producción en Proceso - Aumento', description: 'Aumento', type: 'expense', nature: 'deudora', level: 3, groupNumber: '40', parentCode: '700', allowsMovements: true },
  { code: '704', name: 'Producción en Proceso - Disminución', description: 'Disminución', type: 'expense', nature: 'acreedora', level: 3, groupNumber: '40', parentCode: '700', allowsMovements: true },
  { code: '705', name: 'Producción en Proceso - Traspaso a Terminada', description: 'Traspaso a producción terminada', type: 'expense', nature: 'acreedora', level: 3, groupNumber: '40', parentCode: '700', allowsMovements: true },
  
  // Producción Propia para Insumos (725)
  { code: '725', name: 'Producción Propia para Insumos', description: 'Producción propia para insumos', type: 'expense', nature: 'deudora', level: 2, groupNumber: '40', parentCode: '40', allowsMovements: true },
  
  // Gastos Asociados a la Producción (731-739)
  { code: '731', name: 'Gastos Asociados a la Producción', description: 'Gastos asociados a la producción', type: 'expense', nature: 'deudora', level: 2, groupNumber: '40', parentCode: '40', allowsMovements: true },
  
  // GRUPO 50 - CUENTAS NOMINALES
  { code: '50', name: 'CUENTAS NOMINALES', description: 'Grupo 50 - Cuentas Nominales', type: 'income', nature: 'mixta', level: 1, groupNumber: '50', parentCode: null, allowsMovements: false },
  { code: '50.1', name: 'CUENTAS NOMINALES DEUDORAS', description: 'Grupo 50.1 - Cuentas Nominales Deudoras', type: 'expense', nature: 'deudora', level: 2, groupNumber: '50', parentCode: '50', allowsMovements: false },
  
  // Devoluciones y Rebajas en Ventas (800-804)
  { code: '800', name: 'Devoluciones en Ventas', description: 'Devoluciones en ventas', type: 'expense', nature: 'deudora', level: 3, groupNumber: '50', parentCode: '50.1', allowsMovements: true },
  { code: '801', name: 'Rebajas en Ventas', description: 'Rebajas en ventas', type: 'expense', nature: 'deudora', level: 3, groupNumber: '50', parentCode: '50.1', allowsMovements: true },
  
  // Impuesto por las Ventas (805-809)
  { code: '805', name: 'Impuesto sobre Ventas', description: 'Impuesto sobre ventas', type: 'expense', nature: 'deudora', level: 3, groupNumber: '50', parentCode: '50.1', allowsMovements: true },
  
  // Costo de Ventas (810-818)
  { code: '810', name: 'Costo de Ventas de la Producción', description: 'Costo de ventas de la producción', type: 'expense', nature: 'deudora', level: 3, groupNumber: '50', parentCode: '50.1', allowsMovements: true },
  { code: '814', name: 'Costo de Ventas de Mercancías', description: 'Costo de ventas de mercancías', type: 'expense', nature: 'deudora', level: 3, groupNumber: '50', parentCode: '50.1', allowsMovements: true },
  { code: '818', name: 'Costo por Exportación de Servicios', description: 'Costo por exportación de servicios', type: 'expense', nature: 'deudora', level: 3, groupNumber: '50', parentCode: '50.1', allowsMovements: true },
  
  // Gastos de Distribución y Ventas (819-821)
  { code: '819', name: 'Gastos de Distribución', description: 'Gastos de distribución', type: 'expense', nature: 'deudora', level: 3, groupNumber: '50', parentCode: '50.1', allowsMovements: true },
  { code: '820', name: 'Gastos de Ventas', description: 'Gastos de ventas', type: 'expense', nature: 'deudora', level: 3, groupNumber: '50', parentCode: '50.1', allowsMovements: true },
  { code: '821', name: 'Comisiones de Ventas', description: 'Comisiones de ventas', type: 'expense', nature: 'deudora', level: 3, groupNumber: '50', parentCode: '50.1', allowsMovements: true },
  
  // Gastos Generales y de Administración (822-824)
  { code: '822', name: 'Gastos Generales', description: 'Gastos generales', type: 'expense', nature: 'deudora', level: 3, groupNumber: '50', parentCode: '50.1', allowsMovements: true },
  { code: '823', name: 'Gastos de Administración', description: 'Gastos de administración', type: 'expense', nature: 'deudora', level: 3, groupNumber: '50', parentCode: '50.1', allowsMovements: true },
  { code: '824', name: 'Gastos de Oficina', description: 'Gastos de oficina', type: 'expense', nature: 'deudora', level: 3, groupNumber: '50', parentCode: '50.1', allowsMovements: true },
  
  // Gastos de Operación (826-833)
  { code: '826', name: 'Gastos de Operación', description: 'Gastos de operación', type: 'expense', nature: 'deudora', level: 3, groupNumber: '50', parentCode: '50.1', allowsMovements: true },
  { code: '827', name: 'Gastos de Mantenimiento', description: 'Gastos de mantenimiento', type: 'expense', nature: 'deudora', level: 3, groupNumber: '50', parentCode: '50.1', allowsMovements: true },
  { code: '828', name: 'Gastos de Reparaciones', description: 'Gastos de reparaciones', type: 'expense', nature: 'deudora', level: 3, groupNumber: '50', parentCode: '50.1', allowsMovements: true },
  
  // Gastos Financieros (835-838)
  { code: '835', name: 'Intereses Pagados', description: 'Intereses pagados', type: 'expense', nature: 'deudora', level: 3, groupNumber: '50', parentCode: '50.1', allowsMovements: true },
  { code: '836', name: 'Comisiones Bancarias', description: 'Comisiones bancarias', type: 'expense', nature: 'deudora', level: 3, groupNumber: '50', parentCode: '50.1', allowsMovements: true },
  { code: '837', name: 'Gastos por Cambio de Moneda', description: 'Gastos por cambio de moneda', type: 'expense', nature: 'deudora', level: 3, groupNumber: '50', parentCode: '50.1', allowsMovements: true },
  { code: '838', name: 'Otros Gastos Financieros', description: 'Otros gastos financieros', type: 'expense', nature: 'deudora', level: 3, groupNumber: '50', parentCode: '50.1', allowsMovements: true },
  
  // Otros Impuestos, Tasas y Contribuciones (855-864)
  { code: '855', name: 'Impuesto sobre la Renta', description: 'Impuesto sobre la renta', type: 'expense', nature: 'deudora', level: 3, groupNumber: '50', parentCode: '50.1', allowsMovements: true },
  { code: '856', name: 'Contribuciones a la Seguridad Social', description: 'Contribuciones a la seguridad social', type: 'expense', nature: 'deudora', level: 3, groupNumber: '50', parentCode: '50.1', allowsMovements: true },
  { code: '857', name: 'Tasas Municipales', description: 'Tasas municipales', type: 'expense', nature: 'deudora', level: 3, groupNumber: '50', parentCode: '50.1', allowsMovements: true },
  { code: '858', name: 'Contribuciones Especiales', description: 'Contribuciones especiales', type: 'expense', nature: 'deudora', level: 3, groupNumber: '50', parentCode: '50.1', allowsMovements: true },
  
  // Otros Gastos (865-866)
  { code: '865', name: 'Gastos Diversos', description: 'Gastos diversos', type: 'expense', nature: 'deudora', level: 3, groupNumber: '50', parentCode: '50.1', allowsMovements: true },
  { code: '866', name: 'Gastos Extraordinarios', description: 'Gastos extraordinarios', type: 'expense', nature: 'deudora', level: 3, groupNumber: '50', parentCode: '50.1', allowsMovements: true },
  
  { code: '50.2', name: 'CUENTAS NOMINALES ACREEDORAS', description: 'Grupo 50.2 - Cuentas Nominales Acreedoras', type: 'income', nature: 'acreedora', level: 2, groupNumber: '50', parentCode: '50', allowsMovements: false },
  
  // Ventas (900-913)
  { code: '900', name: 'Ventas de Mercancías', description: 'Ventas de mercancías', type: 'income', nature: 'acreedora', level: 3, groupNumber: '50', parentCode: '50.2', allowsMovements: true },
  { code: '901', name: 'Ventas de Servicios', description: 'Ventas de servicios', type: 'income', nature: 'acreedora', level: 3, groupNumber: '50', parentCode: '50.2', allowsMovements: true },
  { code: '902', name: 'Ventas al por Mayor', description: 'Ventas al por mayor', type: 'income', nature: 'acreedora', level: 3, groupNumber: '50', parentCode: '50.2', allowsMovements: true },
  { code: '903', name: 'Ventas al por Menor', description: 'Ventas al por menor', type: 'income', nature: 'acreedora', level: 3, groupNumber: '50', parentCode: '50.2', allowsMovements: true },
  { code: '904', name: 'Ventas de Productos Agrícolas', description: 'Ventas de productos agrícolas', type: 'income', nature: 'acreedora', level: 3, groupNumber: '50', parentCode: '50.2', allowsMovements: true },
  { code: '905', name: 'Ventas de Productos Industriales', description: 'Ventas de productos industriales', type: 'income', nature: 'acreedora', level: 3, groupNumber: '50', parentCode: '50.2', allowsMovements: true },
  { code: '906', name: 'Ventas de Servicios Técnicos', description: 'Ventas de servicios técnicos', type: 'income', nature: 'acreedora', level: 3, groupNumber: '50', parentCode: '50.2', allowsMovements: true },
  { code: '907', name: 'Ventas de Servicios Profesionales', description: 'Ventas de servicios profesionales', type: 'income', nature: 'acreedora', level: 3, groupNumber: '50', parentCode: '50.2', allowsMovements: true },
  { code: '908', name: 'Ventas de Servicios de Consultoría', description: 'Ventas de servicios de consultoría', type: 'income', nature: 'acreedora', level: 3, groupNumber: '50', parentCode: '50.2', allowsMovements: true },
  { code: '909', name: 'Ventas de Servicios de Mantenimiento', description: 'Ventas de servicios de mantenimiento', type: 'income', nature: 'acreedora', level: 3, groupNumber: '50', parentCode: '50.2', allowsMovements: true },
  { code: '910', name: 'Ventas de Servicios de Transporte', description: 'Ventas de servicios de transporte', type: 'income', nature: 'acreedora', level: 3, groupNumber: '50', parentCode: '50.2', allowsMovements: true },
  { code: '911', name: 'Ventas de Servicios de Almacenaje', description: 'Ventas de servicios de almacenaje', type: 'income', nature: 'acreedora', level: 3, groupNumber: '50', parentCode: '50.2', allowsMovements: true },
  { code: '912', name: 'Ventas de Servicios de Comunicación', description: 'Ventas de servicios de comunicación', type: 'income', nature: 'acreedora', level: 3, groupNumber: '50', parentCode: '50.2', allowsMovements: true },
  { code: '913', name: 'Ventas de Otros Servicios', description: 'Ventas de otros servicios', type: 'income', nature: 'acreedora', level: 3, groupNumber: '50', parentCode: '50.2', allowsMovements: true },
  
  // Ventas de Exportación (914-915)
  { code: '914', name: 'Ventas de Bienes con destino a la Exportación', description: 'Ventas de bienes con destino a la exportación', type: 'income', nature: 'acreedora', level: 3, groupNumber: '50', parentCode: '50.2', allowsMovements: true },
  { code: '915', name: 'Ventas por Exportación de Servicios', description: 'Ventas por exportación de servicios', type: 'income', nature: 'acreedora', level: 3, groupNumber: '50', parentCode: '50.2', allowsMovements: true },
  
  // Subvenciones (916-919)
  { code: '916', name: 'Subvenciones del Estado', description: 'Subvenciones del estado', type: 'income', nature: 'acreedora', level: 3, groupNumber: '50', parentCode: '50.2', allowsMovements: true },
  { code: '917', name: 'Subvenciones de Organismos Internacionales', description: 'Subvenciones de organismos internacionales', type: 'income', nature: 'acreedora', level: 3, groupNumber: '50', parentCode: '50.2', allowsMovements: true },
  { code: '918', name: 'Subvenciones de Otras Entidades', description: 'Subvenciones de otras entidades', type: 'income', nature: 'acreedora', level: 3, groupNumber: '50', parentCode: '50.2', allowsMovements: true },
  { code: '919', name: 'Otras Subvenciones', description: 'Otras subvenciones', type: 'income', nature: 'acreedora', level: 3, groupNumber: '50', parentCode: '50.2', allowsMovements: true },
  
  // Ingresos Financieros (920-922)
  { code: '920', name: 'Intereses Ganados', description: 'Intereses ganados', type: 'income', nature: 'acreedora', level: 3, groupNumber: '50', parentCode: '50.2', allowsMovements: true },
  { code: '921', name: 'Dividendos Ganados', description: 'Dividendos ganados', type: 'income', nature: 'acreedora', level: 3, groupNumber: '50', parentCode: '50.2', allowsMovements: true },
  { code: '922', name: 'Otros Ingresos Financieros', description: 'Otros ingresos financieros', type: 'income', nature: 'acreedora', level: 3, groupNumber: '50', parentCode: '50.2', allowsMovements: true },
  
  // Ingresos por Variación de Tasas de Cambio (924)
  { code: '924', name: 'Ingresos por Variación de Tasas de Cambio', description: 'Ingresos por variación de tasas de cambio', type: 'income', nature: 'acreedora', level: 3, groupNumber: '50', parentCode: '50.2', allowsMovements: true },
  
  // Ingresos por Sobrantes (930-939)
  { code: '930', name: 'Sobrantes de Caja', description: 'Sobrantes de caja', type: 'income', nature: 'acreedora', level: 3, groupNumber: '50', parentCode: '50.2', allowsMovements: true },
  { code: '931', name: 'Sobrantes de Bancos', description: 'Sobrantes de bancos', type: 'income', nature: 'acreedora', level: 3, groupNumber: '50', parentCode: '50.2', allowsMovements: true },
  { code: '932', name: 'Sobrantes de Inventarios', description: 'Sobrantes de inventarios', type: 'income', nature: 'acreedora', level: 3, groupNumber: '50', parentCode: '50.2', allowsMovements: true },
  { code: '933', name: 'Sobrantes de Activos Fijos', description: 'Sobrantes de activos fijos', type: 'income', nature: 'acreedora', level: 3, groupNumber: '50', parentCode: '50.2', allowsMovements: true },
  { code: '934', name: 'Sobrantes de Otros Bienes', description: 'Sobrantes de otros bienes', type: 'income', nature: 'acreedora', level: 3, groupNumber: '50', parentCode: '50.2', allowsMovements: true },
  { code: '935', name: 'Recuperación de Pérdidas', description: 'Recuperación de pérdidas', type: 'income', nature: 'acreedora', level: 3, groupNumber: '50', parentCode: '50.2', allowsMovements: true },
  { code: '936', name: 'Ingresos por Recuperación de Deudas', description: 'Ingresos por recuperación de deudas', type: 'income', nature: 'acreedora', level: 3, groupNumber: '50', parentCode: '50.2', allowsMovements: true },
  { code: '937', name: 'Ingresos por Ventas de Activos', description: 'Ingresos por ventas de activos', type: 'income', nature: 'acreedora', level: 3, groupNumber: '50', parentCode: '50.2', allowsMovements: true },
  { code: '938', name: 'Ingresos por Alquileres', description: 'Ingresos por alquileres', type: 'income', nature: 'acreedora', level: 3, groupNumber: '50', parentCode: '50.2', allowsMovements: true },
  { code: '939', name: 'Otros Sobrantes', description: 'Otros sobrantes', type: 'income', nature: 'acreedora', level: 3, groupNumber: '50', parentCode: '50.2', allowsMovements: true },
  
  // Otros Ingresos (950-953)
  { code: '950', name: 'Ingresos por Servicios Varios', description: 'Ingresos por servicios varios', type: 'income', nature: 'acreedora', level: 3, groupNumber: '50', parentCode: '50.2', allowsMovements: true },
  { code: '951', name: 'Ingresos por Comisiones', description: 'Ingresos por comisiones', type: 'income', nature: 'acreedora', level: 3, groupNumber: '50', parentCode: '50.2', allowsMovements: true },
  { code: '952', name: 'Otros Ingresos Operacionales', description: 'Otros ingresos operacionales', type: 'income', nature: 'acreedora', level: 3, groupNumber: '50', parentCode: '50.2', allowsMovements: true },
  { code: '953', name: 'Ingresos por Donaciones Recibidas', description: 'Ingresos por donaciones recibidas', type: 'income', nature: 'acreedora', level: 3, groupNumber: '50', parentCode: '50.2', allowsMovements: true },
  
  // GRUPO 60 - CUENTA DE CIERRE
  { code: '60', name: 'CUENTA DE CIERRE', description: 'Grupo 60 - Cuenta de Cierre', type: 'income', nature: 'mixta', level: 1, groupNumber: '60', parentCode: null, allowsMovements: false },
  { code: '999', name: 'Resultado', description: 'Cuenta de resultado del período', type: 'income', nature: 'mixta', level: 2, groupNumber: '60', parentCode: '60', allowsMovements: true },
];

async function seedAccounts2016() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const accountRepo = app.get('AccountRepository') as Repository<Account>;
  const companyRepo = app.get('CompanyRepository') as Repository<Company>;

  try {
    console.log('🌱 Seeding Cuban Chart of Accounts 2016...');

    // Get all companies
    const companies = await companyRepo.find();
    if (companies.length === 0) {
      console.log('❌ No companies found. Please run seed.ts first.');
      return;
    }

    console.log(`📊 Found ${companies.length} companies. Creating accounts for each...`);

    for (const company of companies) {
      console.log(`🏢 Processing company: ${company.name} (ID: ${company.id})`);

      // Check if accounts already exist for this company
      const existingCount = await accountRepo.count({ where: { companyId: company.id } });
      if (existingCount > 0) {
        console.log(`⚠️  Company ${company.name} already has ${existingCount} accounts. Skipping...`);
        continue;
      }

      // Create accounts for this company
      for (const accountData of cubanChartOfAccounts2016) {
        const account = new Account();
        account.companyId = company.id;
        account.code = accountData.code;
        account.name = accountData.name;
        account.description = accountData.description;
        account.type = accountData.type as any;
        account.nature = accountData.nature as any;
        account.level = accountData.level;
        account.groupNumber = accountData.groupNumber;
        account.parentCode = accountData.parentCode;
        account.parentAccountId = null; // Will be populated later if needed
        account.balance = 0;
        account.isActive = true;
        account.allowsMovements = accountData.allowsMovements;
        
        await accountRepo.save(account);
      }

      console.log(`✅ Created ${cubanChartOfAccounts2016.length} accounts for company ${company.name}`);
    }

    console.log('🎉 Cuban Chart of Accounts 2016 seeding completed successfully!');
    console.log('\n📋 Summary:');
    console.log(`   - Total account templates: ${cubanChartOfAccounts2016.length}`);
    console.log(`   - Companies processed: ${companies.length}`);
    console.log(`   - Groups: 10 (Activos), 20 (Pasivos), 30 (Patrimonio), 40 (Gastos de Producción), 50 (Cuentas Nominales), 60 (Cierre)`);
    console.log(`   - Levels: 1-3 (hierarchical structure)`);
    console.log(`   - Nature: Deudora/Acreedora/Mixta (Cuban accounting standard)`);
    console.log(`   - Based on: Nomenclador Nacional de Cuentas 2016 (Gaceta Oficial)`);

  } catch (error) {
    console.error('❌ Error seeding accounts:', error);
    if (error instanceof Error) {
      console.error('Stack trace:', error.stack);
    }
  } finally {
    await app.close();
  }
}

// Run the seed
seedAccounts2016().catch(console.error);
