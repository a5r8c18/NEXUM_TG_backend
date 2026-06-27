import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Account } from './entities/account.entity';
import { Repository } from 'typeorm';
import { Company } from './entities/company.entity';

// ──────────────────────────────────────────────────────────────────────────────
// HELPERS PARA GENERAR SUBCUENTAS SEGÚN EL NOMENCLADOR
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Genera subcuentas de contraparte (0010-0060) para cuentas que las requieran.
 * Aplica a: Efectos/Cuentas por Cobrar/Pagar, Pagos Anticipados, etc.
 */
function generateCounterpartySubaccounts(parentCode: string, parentName: string, type: string, nature: string) {
  const descriptions: Record<string, string> = {
    '0010': 'Dentro del Órgano u Organismo',
    '0020': 'Fuera del Órgano u Organismo',
    '0030': 'En el Extranjero',
    '0040': 'Dentro del Grupo Empresarial',
    '0050': 'Sector Cooperativo',
    '0060': 'Personas Naturales',
  };
  return Object.entries(descriptions).map(([sub, desc]) => ({
    code: `${parentCode}-${sub}`,
    name: desc,
    description: `Subcuenta ${sub} de ${parentName}`,
    type,
    nature,
    level: 4,
    groupNumber: parentCode.split('-')[0], // aproximación, se ajusta luego
    parentCode,
    allowsMovements: true,
  }));
}

/**
 * Genera subcuentas para Adeudos del Presupuesto (164-166) y Obligaciones con el Presupuesto (440-449)
 * según el Clasificador de Recursos Financieros (0001-0016, 0020-0090)
 */
function generateBudgetSubaccounts(parentCode: string, parentName: string, type: string, nature: string) {
  const items: Record<string, string> = {
    '0001': 'Impuesto sobre Ventas',
    '0002': 'Impuesto sobre los Servicios Públicos',
    '0003': 'Aranceles de Aduana',
    '0004': 'Impuesto sobre Utilidades',
    '0005': 'Impuesto sobre Ingresos Personales',
    '0006': 'Impuesto sobre los Recursos',
    '0007': 'Otros Impuestos',
    '0008': 'Contribuciones',
    '0009': 'Tasas',
    '0010': 'Ingresos No tributarios',
    '0011': 'Rentas de la Propiedad',
    '0012': 'Transferencias Corrientes',
    '0013': 'Ingresos de Operaciones',
    '0014': 'Recursos Propios de Capital',
    '0015': 'Transferencias de Capital',
    '0016': 'Otros Recursos Financieros',
    '0020': 'Invalidez Parcial',
    '0030': 'Licencias de Maternidad',
    '0040': 'Reintegro Aporte de Microbrigada',
    '0090': 'Otros',
  };
  return Object.entries(items).map(([sub, name]) => ({
    code: `${parentCode}-${sub}`,
    name,
    description: `Subcuenta ${sub} de ${parentName}`,
    type,
    nature,
    level: 4,
    groupNumber: parentCode.split('-')[0],
    parentCode,
    allowsMovements: true,
  }));
}

/**
 * Genera subcuentas de Nóminas por Pagar (455-459) según el Nomenclador 2016.
 * Subcuentas por categoría ocupacional: 0010 Dirigentes, 0020 Técnicos,
 * 0030 Trabajadores de Servicios, 0040 Obreros, 0050 Otros Trabajadores
 */
function generatePayrollSubaccounts(parentCode: string, parentName: string, type: string, nature: string) {
  const items: Record<string, string> = {
    '0010': 'Dirigentes',
    '0020': 'Técnicos',
    '0030': 'Trabajadores de Servicios',
    '0040': 'Obreros',
    '0050': 'Otros Trabajadores',
  };
  return Object.entries(items).map(([sub, name]) => ({
    code: `${parentCode}-${sub}`,
    name,
    description: `${name} — ${parentName}`,
    type,
    nature,
    level: 4,
    groupNumber: parentCode,
    parentCode,
    allowsMovements: true,
  }));
}

/**
 * Genera subcuentas de Retenciones por Pagar (460-469) según el Nomenclador 2016.
 * Subcuentas por tipo de retención.
 */
function generateWithholdingSubaccounts(parentCode: string, parentName: string, type: string, nature: string) {
  const items: Record<string, string> = {
    '0010': 'Impuesto sobre Ingresos Personales',
    '0020': 'Contribución a la Seguridad Social',
    '0030': 'Cuotas Sindicales',
    '0040': 'Préstamos y Créditos Bancarios',
    '0050': 'Otras Retenciones',
  };
  return Object.entries(items).map(([sub, name]) => ({
    code: `${parentCode}-${sub}`,
    name,
    description: `${name} — ${parentName}`,
    type,
    nature,
    level: 4,
    groupNumber: parentCode,
    parentCode,
    allowsMovements: true,
  }));
}

/**
 * Genera subcuentas de Gastos Acumulados por Pagar (480-489) según el Nomenclador 2016.
 * Subcuentas por elemento de gasto (01-08).
 */
function generateAccruedExpenseSubaccounts(parentCode: string, parentName: string, type: string, nature: string) {
  const items: Record<string, string> = {
    '0010': 'Materias Primas y Materiales',
    '0020': 'Combustibles',
    '0030': 'Energía',
    '0040': 'Salarios',
    '0050': 'Depreciación y Amortización',
    '0060': 'Servicios Recibidos',
    '0070': 'Transferencias y Subsidios',
    '0080': 'Otros Gastos Monetarios',
  };
  return Object.entries(items).map(([sub, name]) => ({
    code: `${parentCode}-${sub}`,
    name,
    description: `${name} — ${parentName}`,
    type,
    nature,
    level: 4,
    groupNumber: parentCode,
    parentCode,
    allowsMovements: true,
  }));
}

/**
 * Genera subcuentas de inversión con medios propios (0010, 0020, 0050)
 * para cuentas del grupo 700-729 según el Anexo 1 del Nomenclador 2016.
 * 0010 Saldo al Inicio del Año — misma naturaleza que la cuenta
 * 0020 Gastos del Período — misma naturaleza que la cuenta
 * 0050 Traspaso a Inversiones en Proceso — naturaleza opuesta (acreedora)
 */
function generateInvestmentSubaccounts(parentCode: string, parentName: string, type: string, nature: string) {
  return [
    { code: `${parentCode}-0010`, name: 'Saldo al Inicio del Año', description: `Saldo al Inicio del Año — ${parentName}`, type, nature, level: 4, groupNumber: parentCode, parentCode, allowsMovements: true },
    { code: `${parentCode}-0020`, name: 'Gastos del Período', description: `Gastos del Período — ${parentName}`, type, nature, level: 4, groupNumber: parentCode, parentCode, allowsMovements: true },
    { code: `${parentCode}-0050`, name: 'Traspaso a Inversiones en Proceso', description: `Traspaso a Inversiones en Proceso — ${parentName}`, type, nature: 'acreedora', level: 4, groupNumber: parentCode, parentCode, allowsMovements: true },
  ];
}

/**
 * Genera subcuentas para Producción Terminada (188) y Producción para Insumo (196)
 * que tienen subcuentas específicas (0020, 0040, 0050, 0099)
 */
function generateProductionInventorySubaccounts(parentCode: string, parentName: string, type: string, nature: string) {
  const items: Record<string, string> = {
    '0020': 'Producción y Ventas',
    '0040': 'Otros Aumentos',
    '0050': 'Otras Disminuciones',
    '0099': 'Contrapartida (Opcional)',
  };
  // Nota: la subcuenta 0099 tiene naturaleza mixta (según el documento)
  return Object.entries(items).map(([sub, name]) => ({
    code: `${parentCode}-${sub}`,
    name,
    description: `Subcuenta ${sub} de ${parentName}`,
    type,
    nature: sub === '0099' ? 'mixta' : nature,
    level: 4,
    groupNumber: parentCode.split('-')[0],
    parentCode,
    allowsMovements: true,
  }));
}

// ──────────────────────────────────────────────────────────────────────────────
// DEFINICIÓN DE LAS CUENTAS PRINCIPALES (SIN SUBCUENTAS)
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Cuentas base del nomenclador (nivel 3 y algunos nivel 2 como agrupadores).
 * Los agrupadores (10, 10.1, etc.) se crean con allowsMovements: false.
 */
const baseAccounts = [
  // GRUPO 10 - ACTIVOS
  { code: '10', name: 'ACTIVOS', description: 'Grupo 10 - Activos', type: 'asset', nature: 'deudora', level: 1, groupNumber: '10', parentCode: null, allowsMovements: false },
  { code: '10.1', name: 'ACTIVOS CIRCULANTES', description: 'Subgrupo 10.1 - Activos Circulantes', type: 'asset', nature: 'deudora', level: 2, groupNumber: '10', parentCode: '10', allowsMovements: false },
  // Efectivo en Caja (101-108)
  ...Array.from({ length: 8 }, (_, i) => ({
    code: `${101 + i}`,
    name: 'Efectivo en Caja',
    description: `Efectivo en Caja (${101 + i})`,
    type: 'asset',
    nature: 'deudora',
    level: 3,
    groupNumber: '10',
    parentCode: '10.1',
    allowsMovements: true,
  })),
  // Efectivo en Banco y en Otras Instituciones (109-119) – no tienen subcuentas obligatorias, solo análisis
  ...Array.from({ length: 11 }, (_, i) => ({
    code: `${109 + i}`,
    name: 'Efectivo en Banco y en Otras Instituciones',
    description: `Efectivo en Banco (${109 + i})`,
    type: 'asset',
    nature: 'deudora',
    level: 3,
    groupNumber: '10',
    parentCode: '10.1',
    allowsMovements: true,
  })),
  // Inversiones a Corto Plazo (120-129)
  ...Array.from({ length: 10 }, (_, i) => ({
    code: `${120 + i}`,
    name: 'Inversiones a Corto Plazo o Temporales',
    description: `Inversiones a Corto Plazo (${120 + i})`,
    type: 'asset',
    nature: 'deudora',
    level: 3,
    groupNumber: '10',
    parentCode: '10.1',
    allowsMovements: true,
  })),
  // Efectos por Cobrar (130-133) – estos sí requieren subcuentas 0010-0060
  { code: '130', name: 'Efectos por Cobrar a Corto Plazo', description: 'Efectos por Cobrar a Corto Plazo', type: 'asset', nature: 'deudora', level: 3, groupNumber: '10', parentCode: '10.1', allowsMovements: false }, // solo agrupador
  { code: '131', name: 'Efectos por Cobrar a Corto Plazo', description: 'Efectos por Cobrar a Corto Plazo', type: 'asset', nature: 'deudora', level: 3, groupNumber: '10', parentCode: '10.1', allowsMovements: false },
  { code: '132', name: 'Efectos por Cobrar a Corto Plazo', description: 'Efectos por Cobrar a Corto Plazo', type: 'asset', nature: 'deudora', level: 3, groupNumber: '10', parentCode: '10.1', allowsMovements: false },
  { code: '133', name: 'Efectos por Cobrar a Corto Plazo', description: 'Efectos por Cobrar a Corto Plazo', type: 'asset', nature: 'deudora', level: 3, groupNumber: '10', parentCode: '10.1', allowsMovements: false },
  // Cuenta en Participación (134)
  { code: '134', name: 'Cuenta en Participación', description: 'Cuenta en Participación', type: 'asset', nature: 'deudora', level: 3, groupNumber: '10', parentCode: '10.1', allowsMovements: true },
  // Cuentas por Cobrar (135-139)
  { code: '135', name: 'Cuentas por Cobrar a Corto Plazo', description: 'Cuentas por Cobrar a Corto Plazo', type: 'asset', nature: 'deudora', level: 3, groupNumber: '10', parentCode: '10.1', allowsMovements: false },
  { code: '136', name: 'Cuentas por Cobrar a Corto Plazo', description: 'Cuentas por Cobrar a Corto Plazo', type: 'asset', nature: 'deudora', level: 3, groupNumber: '10', parentCode: '10.1', allowsMovements: false },
  { code: '137', name: 'Cuentas por Cobrar a Corto Plazo', description: 'Cuentas por Cobrar a Corto Plazo', type: 'asset', nature: 'deudora', level: 3, groupNumber: '10', parentCode: '10.1', allowsMovements: false },
  { code: '138', name: 'Cuentas por Cobrar a Corto Plazo', description: 'Cuentas por Cobrar a Corto Plazo', type: 'asset', nature: 'deudora', level: 3, groupNumber: '10', parentCode: '10.1', allowsMovements: false },
  { code: '139', name: 'Cuentas por Cobrar a Corto Plazo', description: 'Cuentas por Cobrar a Corto Plazo', type: 'asset', nature: 'deudora', level: 3, groupNumber: '10', parentCode: '10.1', allowsMovements: false },
  // 140 Pagos por Cuenta de Terceros
  { code: '140', name: 'Pagos por Cuenta de Terceros', description: 'Pagos por Cuenta de Terceros', type: 'asset', nature: 'deudora', level: 3, groupNumber: '10', parentCode: '10.1', allowsMovements: true },
  // 141 Participación de Reaseguradores por Siniestros Pendientes
  { code: '141', name: 'Participación de Reaseguradores por Siniestros Pendientes', description: 'Participación de Reaseguradores por Siniestros Pendientes', type: 'asset', nature: 'deudora', level: 3, groupNumber: '10', parentCode: '10.1', allowsMovements: true },
  // 142 Préstamos y Otras Operaciones Crediticias a Cobrar a Corto Plazo
  { code: '142', name: 'Préstamos y Otras Operaciones Crediticias a Cobrar a Corto Plazo', description: 'Préstamos y Otras Operaciones Crediticias a Cobrar a Corto Plazo', type: 'asset', nature: 'deudora', level: 3, groupNumber: '10', parentCode: '10.1', allowsMovements: true },
  // 143 Suscriptores de Bonos
  { code: '143', name: 'Suscriptores de Bonos', description: 'Suscriptores de Bonos', type: 'asset', nature: 'deudora', level: 3, groupNumber: '10', parentCode: '10.1', allowsMovements: true },
  // 144 Bonos Emitidos en Cartera
  { code: '144', name: 'Bonos Emitidos en Cartera', description: 'Bonos Emitidos en Cartera', type: 'asset', nature: 'deudora', level: 3, groupNumber: '10', parentCode: '10.1', allowsMovements: true },
  // 146 a 149 Pagos Anticipados a Suministradores
  { code: '146', name: 'Pagos Anticipados a Suministradores', description: 'Pagos Anticipados a Suministradores', type: 'asset', nature: 'deudora', level: 3, groupNumber: '10', parentCode: '10.1', allowsMovements: false },
  { code: '147', name: 'Pagos Anticipados a Suministradores', description: 'Pagos Anticipados a Suministradores', type: 'asset', nature: 'deudora', level: 3, groupNumber: '10', parentCode: '10.1', allowsMovements: false },
  { code: '148', name: 'Pagos Anticipados a Suministradores', description: 'Pagos Anticipados a Suministradores', type: 'asset', nature: 'deudora', level: 3, groupNumber: '10', parentCode: '10.1', allowsMovements: false },
  { code: '149', name: 'Pagos Anticipados a Suministradores', description: 'Pagos Anticipados a Suministradores', type: 'asset', nature: 'deudora', level: 3, groupNumber: '10', parentCode: '10.1', allowsMovements: false },
  // 150 a 152 Pagos Anticipados del Proceso Inversionista
  { code: '150', name: 'Pagos Anticipados del Proceso Inversionista', description: 'Pagos Anticipados del Proceso Inversionista', type: 'asset', nature: 'deudora', level: 3, groupNumber: '10', parentCode: '10.1', allowsMovements: false },
  { code: '151', name: 'Pagos Anticipados del Proceso Inversionista', description: 'Pagos Anticipados del Proceso Inversionista', type: 'asset', nature: 'deudora', level: 3, groupNumber: '10', parentCode: '10.1', allowsMovements: false },
  { code: '152', name: 'Pagos Anticipados del Proceso Inversionista', description: 'Pagos Anticipados del Proceso Inversionista', type: 'asset', nature: 'deudora', level: 3, groupNumber: '10', parentCode: '10.1', allowsMovements: false },
  // 153 Materiales Anticipados del Proceso Inversionista
  { code: '153', name: 'Materiales Anticipados del Proceso Inversionista', description: 'Materiales Anticipados del Proceso Inversionista', type: 'asset', nature: 'deudora', level: 3, groupNumber: '10', parentCode: '10.1', allowsMovements: true },
  // 154 Adeudos con Cobros Diferidos (Uso Exclusivo de Empresas de Seguro)
  { code: '154', name: 'Adeudos con Cobros Diferidos', description: 'Adeudos con Cobros Diferidos (Uso Exclusivo de Empresas de Seguro)', type: 'asset', nature: 'deudora', level: 3, groupNumber: '10', parentCode: '10.1', allowsMovements: true },
  // 161 a 163 Anticipos a Justificar
  { code: '161', name: 'Anticipos a Justificar', description: 'Anticipos a Justificar', type: 'asset', nature: 'deudora', level: 3, groupNumber: '10', parentCode: '10.1', allowsMovements: true },
  { code: '162', name: 'Anticipos a Justificar', description: 'Anticipos a Justificar', type: 'asset', nature: 'deudora', level: 3, groupNumber: '10', parentCode: '10.1', allowsMovements: true },
  { code: '163', name: 'Anticipos a Justificar', description: 'Anticipos a Justificar', type: 'asset', nature: 'deudora', level: 3, groupNumber: '10', parentCode: '10.1', allowsMovements: true },
  // 164 a 166 Adeudos del Presupuesto del Estado (tienen subcuentas 0001-0016, 0020-0090)
  { code: '164', name: 'Adeudos del Presupuesto del Estado', description: 'Adeudos del Presupuesto del Estado', type: 'asset', nature: 'deudora', level: 3, groupNumber: '10', parentCode: '10.1', allowsMovements: false },
  { code: '165', name: 'Adeudos del Presupuesto del Estado', description: 'Adeudos del Presupuesto del Estado', type: 'asset', nature: 'deudora', level: 3, groupNumber: '10', parentCode: '10.1', allowsMovements: false },
  { code: '166', name: 'Adeudos del Presupuesto del Estado', description: 'Adeudos del Presupuesto del Estado', type: 'asset', nature: 'deudora', level: 3, groupNumber: '10', parentCode: '10.1', allowsMovements: false },
  // 167 a 170 Adeudos del Órgano u Organismo
  { code: '167', name: 'Adeudos del Órgano u Organismo', description: 'Adeudos del Órgano u Organismo', type: 'asset', nature: 'deudora', level: 3, groupNumber: '10', parentCode: '10.1', allowsMovements: true },
  { code: '168', name: 'Adeudos del Órgano u Organismo', description: 'Adeudos del Órgano u Organismo', type: 'asset', nature: 'deudora', level: 3, groupNumber: '10', parentCode: '10.1', allowsMovements: true },
  { code: '169', name: 'Adeudos del Órgano u Organismo', description: 'Adeudos del Órgano u Organismo', type: 'asset', nature: 'deudora', level: 3, groupNumber: '10', parentCode: '10.1', allowsMovements: true },
  { code: '170', name: 'Adeudos del Órgano u Organismo', description: 'Adeudos del Órgano u Organismo', type: 'asset', nature: 'deudora', level: 3, groupNumber: '10', parentCode: '10.1', allowsMovements: true },
  // 173 a 180 Ingresos Acumulados por Cobrar
  { code: '173', name: 'Ingresos Acumulados por Cobrar', description: 'Ingresos Acumulados por Cobrar', type: 'asset', nature: 'deudora', level: 3, groupNumber: '10', parentCode: '10.1', allowsMovements: false },
  { code: '174', name: 'Ingresos Acumulados por Cobrar', description: 'Ingresos Acumulados por Cobrar', type: 'asset', nature: 'deudora', level: 3, groupNumber: '10', parentCode: '10.1', allowsMovements: false },
  { code: '175', name: 'Ingresos Acumulados por Cobrar', description: 'Ingresos Acumulados por Cobrar', type: 'asset', nature: 'deudora', level: 3, groupNumber: '10', parentCode: '10.1', allowsMovements: false },
  { code: '176', name: 'Ingresos Acumulados por Cobrar', description: 'Ingresos Acumulados por Cobrar', type: 'asset', nature: 'deudora', level: 3, groupNumber: '10', parentCode: '10.1', allowsMovements: false },
  { code: '177', name: 'Ingresos Acumulados por Cobrar', description: 'Ingresos Acumulados por Cobrar', type: 'asset', nature: 'deudora', level: 3, groupNumber: '10', parentCode: '10.1', allowsMovements: false },
  { code: '178', name: 'Ingresos Acumulados por Cobrar', description: 'Ingresos Acumulados por Cobrar', type: 'asset', nature: 'deudora', level: 3, groupNumber: '10', parentCode: '10.1', allowsMovements: false },
  { code: '179', name: 'Ingresos Acumulados por Cobrar', description: 'Ingresos Acumulados por Cobrar', type: 'asset', nature: 'deudora', level: 3, groupNumber: '10', parentCode: '10.1', allowsMovements: false },
  { code: '180', name: 'Ingresos Acumulados por Cobrar', description: 'Ingresos Acumulados por Cobrar', type: 'asset', nature: 'deudora', level: 3, groupNumber: '10', parentCode: '10.1', allowsMovements: false },
  // 181 Dividendos y Participaciones por Cobrar
  { code: '181', name: 'Dividendos y Participaciones por Cobrar', description: 'Dividendos y Participaciones por Cobrar', type: 'asset', nature: 'deudora', level: 3, groupNumber: '10', parentCode: '10.1', allowsMovements: true },
  // 182 Ingresos Acumulados por Cobrar – Reaseguros Aceptados
  { code: '182', name: 'Ingresos Acumulados por Cobrar – Reaseguros Aceptados', description: 'Ingresos Acumulados por Cobrar – Reaseguros Aceptados', type: 'asset', nature: 'deudora', level: 3, groupNumber: '10', parentCode: '10.1', allowsMovements: true },
  // Inventarios (183-196, 205-209, 211)
  { code: '183', name: 'Materias Primas y Materiales', description: 'Materias Primas y Materiales', type: 'asset', nature: 'deudora', level: 3, groupNumber: '10', parentCode: '10.1', allowsMovements: true },
  { code: '184', name: 'Combustibles y Lubricantes', description: 'Combustibles y Lubricantes', type: 'asset', nature: 'deudora', level: 3, groupNumber: '10', parentCode: '10.1', allowsMovements: true },
  { code: '185', name: 'Partes y Piezas de Repuesto', description: 'Partes y Piezas de Repuesto', type: 'asset', nature: 'deudora', level: 3, groupNumber: '10', parentCode: '10.1', allowsMovements: true },
  { code: '186', name: 'Envases y Embalajes', description: 'Envases y Embalajes', type: 'asset', nature: 'deudora', level: 3, groupNumber: '10', parentCode: '10.1', allowsMovements: true },
  { code: '187', name: 'Útiles, Herramientas y Otros', description: 'Útiles, Herramientas y Otros', type: 'asset', nature: 'deudora', level: 3, groupNumber: '10', parentCode: '10.1', allowsMovements: true },
  { code: '188', name: 'Producción Terminada', description: 'Producción Terminada', type: 'asset', nature: 'deudora', level: 3, groupNumber: '10', parentCode: '10.1', allowsMovements: false }, // tiene subcuentas
  { code: '189', name: 'Mercancías para la Venta', description: 'Mercancías para la Venta', type: 'asset', nature: 'deudora', level: 3, groupNumber: '10', parentCode: '10.1', allowsMovements: true },
  { code: '190', name: 'Medicamentos', description: 'Medicamentos', type: 'asset', nature: 'deudora', level: 3, groupNumber: '10', parentCode: '10.1', allowsMovements: true },
  { code: '191', name: 'Base Material de Estudio', description: 'Base Material de Estudio', type: 'asset', nature: 'deudora', level: 3, groupNumber: '10', parentCode: '10.1', allowsMovements: true },
  { code: '192', name: 'Vestuario y Lencería', description: 'Vestuario y Lencería', type: 'asset', nature: 'deudora', level: 3, groupNumber: '10', parentCode: '10.1', allowsMovements: true },
  { code: '193', name: 'Alimentos', description: 'Alimentos', type: 'asset', nature: 'deudora', level: 3, groupNumber: '10', parentCode: '10.1', allowsMovements: true },
  { code: '194', name: 'Inventarios de Mercancías de Importación', description: 'Inventarios de Mercancías de Importación', type: 'asset', nature: 'deudora', level: 3, groupNumber: '10', parentCode: '10.1', allowsMovements: true },
  { code: '195', name: 'Inventarios de Mercancías de Exportación', description: 'Inventarios de Mercancías de Exportación', type: 'asset', nature: 'deudora', level: 3, groupNumber: '10', parentCode: '10.1', allowsMovements: true },
  { code: '196', name: 'Producción para Insumo o Autoconsumo', description: 'Producción para Insumo o Autoconsumo', type: 'asset', nature: 'deudora', level: 3, groupNumber: '10', parentCode: '10.1', allowsMovements: false }, // tiene subcuentas
  { code: '205', name: 'Otros Inventarios', description: 'Otros Inventarios', type: 'asset', nature: 'deudora', level: 3, groupNumber: '10', parentCode: '10.1', allowsMovements: false },
  { code: '206', name: 'Otros Inventarios', description: 'Otros Inventarios', type: 'asset', nature: 'deudora', level: 3, groupNumber: '10', parentCode: '10.1', allowsMovements: false },
  { code: '207', name: 'Otros Inventarios', description: 'Otros Inventarios', type: 'asset', nature: 'deudora', level: 3, groupNumber: '10', parentCode: '10.1', allowsMovements: false },
  { code: '208', name: 'Inventarios Ociosos', description: 'Inventarios Ociosos', type: 'asset', nature: 'deudora', level: 3, groupNumber: '10', parentCode: '10.1', allowsMovements: true },
  { code: '209', name: 'Inventarios de Lento Movimiento', description: 'Inventarios de Lento Movimiento', type: 'asset', nature: 'deudora', level: 3, groupNumber: '10', parentCode: '10.1', allowsMovements: true },
  { code: '211', name: 'Créditos Documentarios', description: 'Créditos Documentarios', type: 'asset', nature: 'deudora', level: 3, groupNumber: '10', parentCode: '10.1', allowsMovements: true },

  // 10.2 Activo a Largo Plazo
  { code: '10.2', name: 'ACTIVO A LARGO PLAZO', description: 'Subgrupo 10.2 - Activo a Largo Plazo', type: 'asset', nature: 'deudora', level: 2, groupNumber: '10', parentCode: '10', allowsMovements: false },
  // 215-217 Efectos por Cobrar a Largo Plazo
  { code: '215', name: 'Efectos por Cobrar a Largo Plazo', description: 'Efectos por Cobrar a Largo Plazo', type: 'asset', nature: 'deudora', level: 3, groupNumber: '10', parentCode: '10.2', allowsMovements: false },
  { code: '216', name: 'Efectos por Cobrar a Largo Plazo', description: 'Efectos por Cobrar a Largo Plazo', type: 'asset', nature: 'deudora', level: 3, groupNumber: '10', parentCode: '10.2', allowsMovements: false },
  { code: '217', name: 'Efectos por Cobrar a Largo Plazo', description: 'Efectos por Cobrar a Largo Plazo', type: 'asset', nature: 'deudora', level: 3, groupNumber: '10', parentCode: '10.2', allowsMovements: false },
  // 218-220 Cuentas por Cobrar a Largo Plazo
  { code: '218', name: 'Cuentas por Cobrar a Largo Plazo', description: 'Cuentas por Cobrar a Largo Plazo', type: 'asset', nature: 'deudora', level: 3, groupNumber: '10', parentCode: '10.2', allowsMovements: false },
  { code: '219', name: 'Cuentas por Cobrar a Largo Plazo', description: 'Cuentas por Cobrar a Largo Plazo', type: 'asset', nature: 'deudora', level: 3, groupNumber: '10', parentCode: '10.2', allowsMovements: false },
  { code: '220', name: 'Cuentas por Cobrar a Largo Plazo', description: 'Cuentas por Cobrar a Largo Plazo', type: 'asset', nature: 'deudora', level: 3, groupNumber: '10', parentCode: '10.2', allowsMovements: false },
  // 221-224 Préstamos Concedidos a Cobrar a Largo Plazo
  { code: '221', name: 'Préstamos Concedidos a Cobrar a Largo Plazo', description: 'Préstamos Concedidos a Cobrar a Largo Plazo', type: 'asset', nature: 'deudora', level: 3, groupNumber: '10', parentCode: '10.2', allowsMovements: false },
  { code: '222', name: 'Préstamos Concedidos a Cobrar a Largo Plazo', description: 'Préstamos Concedidos a Cobrar a Largo Plazo', type: 'asset', nature: 'deudora', level: 3, groupNumber: '10', parentCode: '10.2', allowsMovements: false },
  { code: '223', name: 'Préstamos Concedidos a Cobrar a Largo Plazo', description: 'Préstamos Concedidos a Cobrar a Largo Plazo', type: 'asset', nature: 'deudora', level: 3, groupNumber: '10', parentCode: '10.2', allowsMovements: false },
  { code: '224', name: 'Préstamos Concedidos a Cobrar a Largo Plazo', description: 'Préstamos Concedidos a Cobrar a Largo Plazo', type: 'asset', nature: 'deudora', level: 3, groupNumber: '10', parentCode: '10.2', allowsMovements: false },
  // 225-234 Inversiones a Largo Plazo o Permanentes
  ...Array.from({ length: 10 }, (_, i) => ({
    code: `${225 + i}`,
    name: 'Inversiones a Largo Plazo o Permanentes',
    description: `Inversiones a Largo Plazo (${225 + i})`,
    type: 'asset',
    nature: 'deudora',
    level: 3,
    groupNumber: '10',
    parentCode: '10.2',
    allowsMovements: true,
  })),

  // 10.3 Activos Fijos
  { code: '10.3', name: 'ACTIVOS FIJOS', description: 'Subgrupo 10.3 - Activos Fijos', type: 'asset', nature: 'deudora', level: 2, groupNumber: '10', parentCode: '10', allowsMovements: false },
  // 240-251 Activos Fijos Tangibles
  ...Array.from({ length: 12 }, (_, i) => ({
    code: `${240 + i}`,
    name: 'Activos Fijos Tangibles',
    description: `Activos Fijos Tangibles (${240 + i})`,
    type: 'asset',
    nature: 'deudora',
    level: 3,
    groupNumber: '10',
    parentCode: '10.3',
    allowsMovements: true,
  })),
  // 252 Fondos Bibliotecarios
  { code: '252', name: 'Fondos Bibliotecarios', description: 'Fondos Bibliotecarios', type: 'asset', nature: 'deudora', level: 3, groupNumber: '10', parentCode: '10.3', allowsMovements: true },
  // 253 Medios y Equipos para Alquilar
  { code: '253', name: 'Medios y Equipos para Alquilar', description: 'Medios y Equipos para Alquilar', type: 'asset', nature: 'deudora', level: 3, groupNumber: '10', parentCode: '10.3', allowsMovements: true },
  // 254 Monumentos y Obras de Arte
  { code: '254', name: 'Monumentos y Obras de Arte', description: 'Monumentos y Obras de Arte', type: 'asset', nature: 'deudora', level: 3, groupNumber: '10', parentCode: '10.3', allowsMovements: true },
  // 255-263 Activos Fijos Intangibles
  ...Array.from({ length: 9 }, (_, i) => ({
    code: `${255 + i}`,
    name: 'Activos Fijos Intangibles',
    description: `Activos Fijos Intangibles (${255 + i})`,
    type: 'asset',
    nature: 'deudora',
    level: 3,
    groupNumber: '10',
    parentCode: '10.3',
    allowsMovements: true,
  })),
  // 264 Activos Fijos Intangibles en Proceso
  { code: '264', name: 'Activos Fijos Intangibles en Proceso', description: 'Activos Fijos Intangibles en Proceso', type: 'asset', nature: 'deudora', level: 3, groupNumber: '10', parentCode: '10.3', allowsMovements: true },
  // 265-278 Inversiones en Proceso
  ...Array.from({ length: 14 }, (_, i) => ({
    code: `${265 + i}`,
    name: 'Inversiones en Proceso',
    description: `Inversiones en Proceso (${265 + i})`,
    type: 'asset',
    nature: 'deudora',
    level: 3,
    groupNumber: '10',
    parentCode: '10.3',
    allowsMovements: true,
  })),
  // 279 Plan de Preparación de Inversiones
  { code: '279', name: 'Plan de Preparación de Inversiones', description: 'Plan de Preparación de Inversiones', type: 'asset', nature: 'deudora', level: 3, groupNumber: '10', parentCode: '10.3', allowsMovements: true },
  // 280-289 Equipos por Instalar y Materiales para el Proceso Inversionista
  ...Array.from({ length: 10 }, (_, i) => ({
    code: `${280 + i}`,
    name: 'Equipos por Instalar y Materiales para el Proceso Inversionista',
    description: `Equipos por Instalar (${280 + i})`,
    type: 'asset',
    nature: 'deudora',
    level: 3,
    groupNumber: '10',
    parentCode: '10.3',
    allowsMovements: true,
  })),
  // 290 Adquisición de Activos Fijos Tangibles Nuevos
  { code: '290', name: 'Adquisición de Activos Fijos Tangibles Nuevos', description: 'Adquisición de Activos Fijos Tangibles Nuevos', type: 'asset', nature: 'deudora', level: 3, groupNumber: '10', parentCode: '10.3', allowsMovements: true },
  // 291 Compra de Activos Fijos Tangibles de Uso
  { code: '291', name: 'Compra de Activos Fijos Tangibles de Uso', description: 'Compra de Activos Fijos Tangibles de Uso', type: 'asset', nature: 'deudora', level: 3, groupNumber: '10', parentCode: '10.3', allowsMovements: true },
  // 292 Compra de Activos Fijos Intangibles
  { code: '292', name: 'Compra de Activos Fijos Intangibles', description: 'Compra de Activos Fijos Intangibles', type: 'asset', nature: 'deudora', level: 3, groupNumber: '10', parentCode: '10.3', allowsMovements: true },

  // 10.4 Activos Diferidos
  { code: '10.4', name: 'ACTIVOS DIFERIDOS', description: 'Subgrupo 10.4 - Activos Diferidos', type: 'asset', nature: 'deudora', level: 2, groupNumber: '10', parentCode: '10', allowsMovements: false },
  // 300-305 Gastos de Producción y Servicios Diferidos
  ...Array.from({ length: 6 }, (_, i) => ({
    code: `${300 + i}`,
    name: 'Gastos de Producción y Servicios Diferidos',
    description: `Gastos de Producción Diferidos (${300 + i})`,
    type: 'asset',
    nature: 'deudora',
    level: 3,
    groupNumber: '10',
    parentCode: '10.4',
    allowsMovements: true,
  })),
  // 306-307 Gastos Financieros Diferidos
  { code: '306', name: 'Gastos Financieros Diferidos', description: 'Gastos Financieros Diferidos', type: 'asset', nature: 'deudora', level: 3, groupNumber: '10', parentCode: '10.4', allowsMovements: true },
  { code: '307', name: 'Gastos Financieros Diferidos', description: 'Gastos Financieros Diferidos', type: 'asset', nature: 'deudora', level: 3, groupNumber: '10', parentCode: '10.4', allowsMovements: true },
  // 310-311 Gastos del Proceso Inversionista Diferidos
  { code: '310', name: 'Gastos del Proceso Inversionista Diferidos', description: 'Gastos del Proceso Inversionista Diferidos', type: 'asset', nature: 'deudora', level: 3, groupNumber: '10', parentCode: '10.4', allowsMovements: true },
  { code: '311', name: 'Gastos del Proceso Inversionista Diferidos', description: 'Gastos del Proceso Inversionista Diferidos', type: 'asset', nature: 'deudora', level: 3, groupNumber: '10', parentCode: '10.4', allowsMovements: true },
  // 312 Gastos por Faltantes y Pérdidas Diferidos
  { code: '312', name: 'Gastos por Faltantes y Pérdidas Diferidos', description: 'Gastos por Faltantes y Pérdidas Diferidos', type: 'asset', nature: 'deudora', level: 3, groupNumber: '10', parentCode: '10.4', allowsMovements: true },

  // 10.5 Otros Activos
  { code: '10.5', name: 'OTROS ACTIVOS', description: 'Subgrupo 10.5 - Otros Activos', type: 'asset', nature: 'deudora', level: 2, groupNumber: '10', parentCode: '10', allowsMovements: false },
  // 330-331 Pérdidas en Investigación
  { code: '330', name: 'Pérdidas en Investigación', description: 'Pérdidas en Investigación', type: 'asset', nature: 'deudora', level: 3, groupNumber: '10', parentCode: '10.5', allowsMovements: false },
  { code: '331', name: 'Pérdidas en Investigación', description: 'Pérdidas en Investigación', type: 'asset', nature: 'deudora', level: 3, groupNumber: '10', parentCode: '10.5', allowsMovements: false },
  // 332-333 Faltantes de Bienes en Investigación
  { code: '332', name: 'Faltantes de Bienes en Investigación', description: 'Faltantes de Bienes en Investigación', type: 'asset', nature: 'deudora', level: 3, groupNumber: '10', parentCode: '10.5', allowsMovements: false },
  { code: '333', name: 'Faltantes de Bienes en Investigación', description: 'Faltantes de Bienes en Investigación', type: 'asset', nature: 'deudora', level: 3, groupNumber: '10', parentCode: '10.5', allowsMovements: false },
  // 334-341 Cuentas por Cobrar Diversas - Operaciones Corrientes
  { code: '334', name: 'Cuentas por Cobrar Diversas - Operaciones Corrientes', description: 'Cuentas por Cobrar Diversas', type: 'asset', nature: 'deudora', level: 3, groupNumber: '10', parentCode: '10.5', allowsMovements: false },
  { code: '335', name: 'Cuentas por Cobrar Diversas - Operaciones Corrientes', description: 'Cuentas por Cobrar Diversas', type: 'asset', nature: 'deudora', level: 3, groupNumber: '10', parentCode: '10.5', allowsMovements: false },
  { code: '336', name: 'Cuentas por Cobrar Diversas - Operaciones Corrientes', description: 'Cuentas por Cobrar Diversas', type: 'asset', nature: 'deudora', level: 3, groupNumber: '10', parentCode: '10.5', allowsMovements: false },
  { code: '337', name: 'Cuentas por Cobrar Diversas - Operaciones Corrientes', description: 'Cuentas por Cobrar Diversas', type: 'asset', nature: 'deudora', level: 3, groupNumber: '10', parentCode: '10.5', allowsMovements: false },
  { code: '338', name: 'Cuentas por Cobrar Diversas - Operaciones Corrientes', description: 'Cuentas por Cobrar Diversas', type: 'asset', nature: 'deudora', level: 3, groupNumber: '10', parentCode: '10.5', allowsMovements: false },
  { code: '339', name: 'Cuentas por Cobrar Diversas - Operaciones Corrientes', description: 'Cuentas por Cobrar Diversas', type: 'asset', nature: 'deudora', level: 3, groupNumber: '10', parentCode: '10.5', allowsMovements: false },
  { code: '340', name: 'Cuentas por Cobrar Diversas - Operaciones Corrientes', description: 'Cuentas por Cobrar Diversas', type: 'asset', nature: 'deudora', level: 3, groupNumber: '10', parentCode: '10.5', allowsMovements: false },
  { code: '341', name: 'Cuentas por Cobrar Diversas - Operaciones Corrientes', description: 'Cuentas por Cobrar Diversas', type: 'asset', nature: 'deudora', level: 3, groupNumber: '10', parentCode: '10.5', allowsMovements: false },
  // 342 Cuentas por Cobrar - Compra de Monedas
  { code: '342', name: 'Cuentas por Cobrar - Compra de Monedas', description: 'Cuentas por Cobrar - Compra de Monedas', type: 'asset', nature: 'deudora', level: 3, groupNumber: '10', parentCode: '10.5', allowsMovements: true },
  // 343-345 Cuentas por Cobrar del Proceso Inversionista
  { code: '343', name: 'Cuentas por Cobrar del Proceso Inversionista', description: 'Cuentas por Cobrar del Proceso Inversionista', type: 'asset', nature: 'deudora', level: 3, groupNumber: '10', parentCode: '10.5', allowsMovements: false },
  { code: '344', name: 'Cuentas por Cobrar del Proceso Inversionista', description: 'Cuentas por Cobrar del Proceso Inversionista', type: 'asset', nature: 'deudora', level: 3, groupNumber: '10', parentCode: '10.5', allowsMovements: false },
  { code: '345', name: 'Cuentas por Cobrar del Proceso Inversionista', description: 'Cuentas por Cobrar del Proceso Inversionista', type: 'asset', nature: 'deudora', level: 3, groupNumber: '10', parentCode: '10.5', allowsMovements: false },
  // 346 Efectos por Cobrar en Litigio
  { code: '346', name: 'Efectos por Cobrar en Litigio', description: 'Efectos por Cobrar en Litigio', type: 'asset', nature: 'deudora', level: 3, groupNumber: '10', parentCode: '10.5', allowsMovements: false },
  // 347 Cuentas por Cobrar en Litigio
  { code: '347', name: 'Cuentas por Cobrar en Litigio', description: 'Cuentas por Cobrar en Litigio', type: 'asset', nature: 'deudora', level: 3, groupNumber: '10', parentCode: '10.5', allowsMovements: false },
  // 348 Efectos por Cobrar Protestados
  { code: '348', name: 'Efectos por Cobrar Protestados', description: 'Efectos por Cobrar Protestados', type: 'asset', nature: 'deudora', level: 3, groupNumber: '10', parentCode: '10.5', allowsMovements: false },
  // 349 Cuentas por Cobrar en Proceso Judicial
  { code: '349', name: 'Cuentas por Cobrar en Proceso Judicial', description: 'Cuentas por Cobrar en Proceso Judicial', type: 'asset', nature: 'deudora', level: 3, groupNumber: '10', parentCode: '10.5', allowsMovements: false },
  // 354-355 Depósitos y Fianzas
  { code: '354', name: 'Depósitos y Fianzas', description: 'Depósitos y Fianzas', type: 'asset', nature: 'deudora', level: 3, groupNumber: '10', parentCode: '10.5', allowsMovements: false },
  { code: '355', name: 'Depósitos y Fianzas', description: 'Depósitos y Fianzas', type: 'asset', nature: 'deudora', level: 3, groupNumber: '10', parentCode: '10.5', allowsMovements: false },
  // 363 Bonos Redimidos
  { code: '363', name: 'Bonos Redimidos', description: 'Bonos Redimidos', type: 'asset', nature: 'deudora', level: 3, groupNumber: '10', parentCode: '10.5', allowsMovements: true },
  // 364 Fondo de Amortización de Bonos – Efectivo y Valores
  { code: '364', name: 'Fondo de Amortización de Bonos – Efectivo y Valores', description: 'Fondo de Amortización de Bonos – Efectivo y Valores', type: 'asset', nature: 'deudora', level: 3, groupNumber: '10', parentCode: '10.5', allowsMovements: true },

  // 10.6 Cuentas Reguladoras de Activos (Todas son Acreedoras)
  { code: '10.6', name: 'CUENTAS REGULADORAS DE ACTIVOS', description: 'Subgrupo 10.6 - Cuentas Reguladoras de Activos', type: 'asset', nature: 'acreedora', level: 2, groupNumber: '10', parentCode: '10', allowsMovements: false },
  { code: '365', name: 'Efectos por Cobrar Descontados', description: 'Efectos por Cobrar Descontados', type: 'asset', nature: 'acreedora', level: 3, groupNumber: '10', parentCode: '10.6', allowsMovements: true },
  { code: '366', name: 'Desgaste de Base Material de Estudio', description: 'Desgaste de Base Material de Estudio', type: 'asset', nature: 'acreedora', level: 3, groupNumber: '10', parentCode: '10.6', allowsMovements: true },
  { code: '367', name: 'Desgaste de Vestuario y Lencería', description: 'Desgaste de Vestuario y Lencería', type: 'asset', nature: 'acreedora', level: 3, groupNumber: '10', parentCode: '10.6', allowsMovements: true },
  { code: '369', name: 'Provisión para Cuentas Incobrables', description: 'Provisión para Cuentas Incobrables', type: 'asset', nature: 'acreedora', level: 3, groupNumber: '10', parentCode: '10.6', allowsMovements: true },
  { code: '370', name: 'Descuento Comercial e Impuesto', description: 'Descuento Comercial e Impuesto', type: 'asset', nature: 'acreedora', level: 3, groupNumber: '10', parentCode: '10.6', allowsMovements: false },
  { code: '371', name: 'Descuento Comercial e Impuesto', description: 'Descuento Comercial e Impuesto', type: 'asset', nature: 'acreedora', level: 3, groupNumber: '10', parentCode: '10.6', allowsMovements: false },
  { code: '372', name: 'Descuento Comercial e Impuesto', description: 'Descuento Comercial e Impuesto', type: 'asset', nature: 'acreedora', level: 3, groupNumber: '10', parentCode: '10.6', allowsMovements: false },
  { code: '373', name: 'Desgaste de Útiles y Herramientas', description: 'Desgaste de Útiles y Herramientas', type: 'asset', nature: 'acreedora', level: 3, groupNumber: '10', parentCode: '10.6', allowsMovements: true },
  { code: '374', name: 'Otras Provisiones Reguladoras de Activos', description: 'Otras Provisiones Reguladoras de Activos', type: 'asset', nature: 'acreedora', level: 3, groupNumber: '10', parentCode: '10.6', allowsMovements: true },
  // 375-388 Depreciación de Activos Fijos Tangibles
  ...Array.from({ length: 14 }, (_, i) => ({
    code: `${375 + i}`,
    name: 'Depreciación de Activos Fijos Tangibles',
    description: `Depreciación de Activos Fijos Tangibles (${375 + i})`,
    type: 'asset',
    nature: 'acreedora',
    level: 3,
    groupNumber: '10',
    parentCode: '10.6',
    allowsMovements: true,
  })),
  { code: '389', name: 'Desgaste de Medios y Equipos para Alquilar', description: 'Desgaste de Medios y Equipos para Alquilar', type: 'asset', nature: 'acreedora', level: 3, groupNumber: '10', parentCode: '10.6', allowsMovements: true },
  // 390-399 Amortización de Activos Fijos Intangibles
  ...Array.from({ length: 10 }, (_, i) => ({
    code: `${390 + i}`,
    name: 'Amortización de Activos Fijos Intangibles',
    description: `Amortización de Activos Fijos Intangibles (${390 + i})`,
    type: 'asset',
    nature: 'acreedora',
    level: 3,
    groupNumber: '10',
    parentCode: '10.6',
    allowsMovements: true,
  })),

  // ────────────────────────────────────────────────────────────────────────────
  // GRUPO 20 - PASIVOS
  // ────────────────────────────────────────────────────────────────────────────
  { code: '20', name: 'PASIVOS', description: 'Grupo 20 - Pasivos', type: 'liability', nature: 'acreedora', level: 1, groupNumber: '20', parentCode: null, allowsMovements: false },
  { code: '20.1', name: 'PASIVOS CIRCULANTES', description: 'Subgrupo 20.1 - Pasivos Circulantes', type: 'liability', nature: 'acreedora', level: 2, groupNumber: '20', parentCode: '20', allowsMovements: false },
  { code: '400', name: 'Sobregiro Bancario', description: 'Sobregiro Bancario', type: 'liability', nature: 'acreedora', level: 3, groupNumber: '20', parentCode: '20.1', allowsMovements: true },
  // 401-404 Efectos por Pagar a Corto Plazo
  { code: '401', name: 'Efectos por Pagar a Corto Plazo', description: 'Efectos por Pagar a Corto Plazo', type: 'liability', nature: 'acreedora', level: 3, groupNumber: '20', parentCode: '20.1', allowsMovements: false },
  { code: '402', name: 'Efectos por Pagar a Corto Plazo', description: 'Efectos por Pagar a Corto Plazo', type: 'liability', nature: 'acreedora', level: 3, groupNumber: '20', parentCode: '20.1', allowsMovements: false },
  { code: '403', name: 'Efectos por Pagar a Corto Plazo', description: 'Efectos por Pagar a Corto Plazo', type: 'liability', nature: 'acreedora', level: 3, groupNumber: '20', parentCode: '20.1', allowsMovements: false },
  { code: '404', name: 'Efectos por Pagar a Corto Plazo', description: 'Efectos por Pagar a Corto Plazo', type: 'liability', nature: 'acreedora', level: 3, groupNumber: '20', parentCode: '20.1', allowsMovements: false },
  // 405-415 Cuentas por Pagar a Corto Plazo
  { code: '405', name: 'Cuentas por Pagar a Corto Plazo', description: 'Cuentas por Pagar a Corto Plazo', type: 'liability', nature: 'acreedora', level: 3, groupNumber: '20', parentCode: '20.1', allowsMovements: false },
  { code: '406', name: 'Cuentas por Pagar a Corto Plazo', description: 'Cuentas por Pagar a Corto Plazo', type: 'liability', nature: 'acreedora', level: 3, groupNumber: '20', parentCode: '20.1', allowsMovements: false },
  { code: '407', name: 'Cuentas por Pagar a Corto Plazo', description: 'Cuentas por Pagar a Corto Plazo', type: 'liability', nature: 'acreedora', level: 3, groupNumber: '20', parentCode: '20.1', allowsMovements: false },
  { code: '408', name: 'Cuentas por Pagar a Corto Plazo', description: 'Cuentas por Pagar a Corto Plazo', type: 'liability', nature: 'acreedora', level: 3, groupNumber: '20', parentCode: '20.1', allowsMovements: false },
  { code: '409', name: 'Cuentas por Pagar a Corto Plazo', description: 'Cuentas por Pagar a Corto Plazo', type: 'liability', nature: 'acreedora', level: 3, groupNumber: '20', parentCode: '20.1', allowsMovements: false },
  { code: '410', name: 'Cuentas por Pagar a Corto Plazo', description: 'Cuentas por Pagar a Corto Plazo', type: 'liability', nature: 'acreedora', level: 3, groupNumber: '20', parentCode: '20.1', allowsMovements: false },
  { code: '411', name: 'Cuentas por Pagar a Corto Plazo', description: 'Cuentas por Pagar a Corto Plazo', type: 'liability', nature: 'acreedora', level: 3, groupNumber: '20', parentCode: '20.1', allowsMovements: false },
  { code: '412', name: 'Cuentas por Pagar a Corto Plazo', description: 'Cuentas por Pagar a Corto Plazo', type: 'liability', nature: 'acreedora', level: 3, groupNumber: '20', parentCode: '20.1', allowsMovements: false },
  { code: '413', name: 'Cuentas por Pagar a Corto Plazo', description: 'Cuentas por Pagar a Corto Plazo', type: 'liability', nature: 'acreedora', level: 3, groupNumber: '20', parentCode: '20.1', allowsMovements: false },
  { code: '414', name: 'Cuentas por Pagar a Corto Plazo', description: 'Cuentas por Pagar a Corto Plazo', type: 'liability', nature: 'acreedora', level: 3, groupNumber: '20', parentCode: '20.1', allowsMovements: false },
  { code: '415', name: 'Cuentas por Pagar a Corto Plazo', description: 'Cuentas por Pagar a Corto Plazo', type: 'liability', nature: 'acreedora', level: 3, groupNumber: '20', parentCode: '20.1', allowsMovements: false },
  // 416 Cobros por Cuenta de Terceros
  { code: '416', name: 'Cobros por Cuenta de Terceros', description: 'Cobros por Cuenta de Terceros', type: 'liability', nature: 'acreedora', level: 3, groupNumber: '20', parentCode: '20.1', allowsMovements: true },
  // 417 Dividendos y Participaciones por Pagar
  { code: '417', name: 'Dividendos y Participaciones por Pagar', description: 'Dividendos y Participaciones por Pagar', type: 'liability', nature: 'acreedora', level: 3, groupNumber: '20', parentCode: '20.1', allowsMovements: true },
  // 418-420 Cuentas en Participación
  { code: '418', name: 'Cuentas en Participación', description: 'Cuentas en Participación', type: 'liability', nature: 'acreedora', level: 3, groupNumber: '20', parentCode: '20.1', allowsMovements: false },
  { code: '419', name: 'Cuentas en Participación', description: 'Cuentas en Participación', type: 'liability', nature: 'acreedora', level: 3, groupNumber: '20', parentCode: '20.1', allowsMovements: false },
  { code: '420', name: 'Cuentas en Participación', description: 'Cuentas en Participación', type: 'liability', nature: 'acreedora', level: 3, groupNumber: '20', parentCode: '20.1', allowsMovements: false },
  // 421-424 Cuentas por Pagar - Activos Fijos Tangibles
  { code: '421', name: 'Cuentas por Pagar - Activos Fijos Tangibles', description: 'Cuentas por Pagar - Activos Fijos Tangibles', type: 'liability', nature: 'acreedora', level: 3, groupNumber: '20', parentCode: '20.1', allowsMovements: false },
  { code: '422', name: 'Cuentas por Pagar - Activos Fijos Tangibles', description: 'Cuentas por Pagar - Activos Fijos Tangibles', type: 'liability', nature: 'acreedora', level: 3, groupNumber: '20', parentCode: '20.1', allowsMovements: false },
  { code: '423', name: 'Cuentas por Pagar - Activos Fijos Tangibles', description: 'Cuentas por Pagar - Activos Fijos Tangibles', type: 'liability', nature: 'acreedora', level: 3, groupNumber: '20', parentCode: '20.1', allowsMovements: false },
  { code: '424', name: 'Cuentas por Pagar - Activos Fijos Tangibles', description: 'Cuentas por Pagar - Activos Fijos Tangibles', type: 'liability', nature: 'acreedora', level: 3, groupNumber: '20', parentCode: '20.1', allowsMovements: false },
  // 425-429 Cuentas por Pagar del Proceso Inversionista
  { code: '425', name: 'Cuentas por Pagar del Proceso Inversionista', description: 'Cuentas por Pagar del Proceso Inversionista', type: 'liability', nature: 'acreedora', level: 3, groupNumber: '20', parentCode: '20.1', allowsMovements: false },
  { code: '426', name: 'Cuentas por Pagar del Proceso Inversionista', description: 'Cuentas por Pagar del Proceso Inversionista', type: 'liability', nature: 'acreedora', level: 3, groupNumber: '20', parentCode: '20.1', allowsMovements: false },
  { code: '427', name: 'Cuentas por Pagar del Proceso Inversionista', description: 'Cuentas por Pagar del Proceso Inversionista', type: 'liability', nature: 'acreedora', level: 3, groupNumber: '20', parentCode: '20.1', allowsMovements: false },
  { code: '428', name: 'Cuentas por Pagar del Proceso Inversionista', description: 'Cuentas por Pagar del Proceso Inversionista', type: 'liability', nature: 'acreedora', level: 3, groupNumber: '20', parentCode: '20.1', allowsMovements: false },
  { code: '429', name: 'Cuentas por Pagar del Proceso Inversionista', description: 'Cuentas por Pagar del Proceso Inversionista', type: 'liability', nature: 'acreedora', level: 3, groupNumber: '20', parentCode: '20.1', allowsMovements: false },
  // 430-433 Cobros Anticipados
  { code: '430', name: 'Cobros Anticipados', description: 'Cobros Anticipados', type: 'liability', nature: 'acreedora', level: 3, groupNumber: '20', parentCode: '20.1', allowsMovements: false },
  { code: '431', name: 'Cobros Anticipados', description: 'Cobros Anticipados', type: 'liability', nature: 'acreedora', level: 3, groupNumber: '20', parentCode: '20.1', allowsMovements: false },
  { code: '432', name: 'Cobros Anticipados', description: 'Cobros Anticipados', type: 'liability', nature: 'acreedora', level: 3, groupNumber: '20', parentCode: '20.1', allowsMovements: false },
  { code: '433', name: 'Cobros Anticipados', description: 'Cobros Anticipados', type: 'liability', nature: 'acreedora', level: 3, groupNumber: '20', parentCode: '20.1', allowsMovements: false },
  // 434 Materiales Recibidos de Forma Anticipada
  { code: '434', name: 'Materiales Recibidos de Forma Anticipada', description: 'Materiales Recibidos de Forma Anticipada', type: 'liability', nature: 'acreedora', level: 3, groupNumber: '20', parentCode: '20.1', allowsMovements: true },
  // 435-439 Depósitos Recibidos
  { code: '435', name: 'Depósitos Recibidos', description: 'Depósitos Recibidos', type: 'liability', nature: 'acreedora', level: 3, groupNumber: '20', parentCode: '20.1', allowsMovements: false },
  { code: '436', name: 'Depósitos Recibidos', description: 'Depósitos Recibidos', type: 'liability', nature: 'acreedora', level: 3, groupNumber: '20', parentCode: '20.1', allowsMovements: false },
  { code: '437', name: 'Depósitos Recibidos', description: 'Depósitos Recibidos', type: 'liability', nature: 'acreedora', level: 3, groupNumber: '20', parentCode: '20.1', allowsMovements: false },
  { code: '438', name: 'Depósitos Recibidos', description: 'Depósitos Recibidos', type: 'liability', nature: 'acreedora', level: 3, groupNumber: '20', parentCode: '20.1', allowsMovements: false },
  { code: '439', name: 'Depósitos Recibidos', description: 'Depósitos Recibidos', type: 'liability', nature: 'acreedora', level: 3, groupNumber: '20', parentCode: '20.1', allowsMovements: false },
  // 440-449 Obligaciones con el Presupuesto del Estado (con subcuentas)
  { code: '440', name: 'Obligaciones con el Presupuesto del Estado', description: 'Obligaciones con el Presupuesto del Estado', type: 'liability', nature: 'acreedora', level: 3, groupNumber: '20', parentCode: '20.1', allowsMovements: false },
  { code: '441', name: 'Obligaciones con el Presupuesto del Estado', description: 'Obligaciones con el Presupuesto del Estado', type: 'liability', nature: 'acreedora', level: 3, groupNumber: '20', parentCode: '20.1', allowsMovements: false },
  { code: '442', name: 'Obligaciones con el Presupuesto del Estado', description: 'Obligaciones con el Presupuesto del Estado', type: 'liability', nature: 'acreedora', level: 3, groupNumber: '20', parentCode: '20.1', allowsMovements: false },
  { code: '443', name: 'Obligaciones con el Presupuesto del Estado', description: 'Obligaciones con el Presupuesto del Estado', type: 'liability', nature: 'acreedora', level: 3, groupNumber: '20', parentCode: '20.1', allowsMovements: false },
  { code: '444', name: 'Obligaciones con el Presupuesto del Estado', description: 'Obligaciones con el Presupuesto del Estado', type: 'liability', nature: 'acreedora', level: 3, groupNumber: '20', parentCode: '20.1', allowsMovements: false },
  { code: '445', name: 'Obligaciones con el Presupuesto del Estado', description: 'Obligaciones con el Presupuesto del Estado', type: 'liability', nature: 'acreedora', level: 3, groupNumber: '20', parentCode: '20.1', allowsMovements: false },
  { code: '446', name: 'Obligaciones con el Presupuesto del Estado', description: 'Obligaciones con el Presupuesto del Estado', type: 'liability', nature: 'acreedora', level: 3, groupNumber: '20', parentCode: '20.1', allowsMovements: false },
  { code: '447', name: 'Obligaciones con el Presupuesto del Estado', description: 'Obligaciones con el Presupuesto del Estado', type: 'liability', nature: 'acreedora', level: 3, groupNumber: '20', parentCode: '20.1', allowsMovements: false },
  { code: '448', name: 'Obligaciones con el Presupuesto del Estado', description: 'Obligaciones con el Presupuesto del Estado', type: 'liability', nature: 'acreedora', level: 3, groupNumber: '20', parentCode: '20.1', allowsMovements: false },
  { code: '449', name: 'Obligaciones con el Presupuesto del Estado', description: 'Obligaciones con el Presupuesto del Estado', type: 'liability', nature: 'acreedora', level: 3, groupNumber: '20', parentCode: '20.1', allowsMovements: false },
  // 450-453 Obligaciones con el Órgano u Organismo
  { code: '450', name: 'Obligaciones con el Órgano u Organismo', description: 'Obligaciones con el Órgano u Organismo', type: 'liability', nature: 'acreedora', level: 3, groupNumber: '20', parentCode: '20.1', allowsMovements: false },
  { code: '451', name: 'Obligaciones con el Órgano u Organismo', description: 'Obligaciones con el Órgano u Organismo', type: 'liability', nature: 'acreedora', level: 3, groupNumber: '20', parentCode: '20.1', allowsMovements: false },
  { code: '452', name: 'Obligaciones con el Órgano u Organismo', description: 'Obligaciones con el Órgano u Organismo', type: 'liability', nature: 'acreedora', level: 3, groupNumber: '20', parentCode: '20.1', allowsMovements: false },
  { code: '453', name: 'Obligaciones con el Órgano u Organismo', description: 'Obligaciones con el Órgano u Organismo', type: 'liability', nature: 'acreedora', level: 3, groupNumber: '20', parentCode: '20.1', allowsMovements: false },
  // 455-459 Nóminas por Pagar
  { code: '455', name: 'Nóminas por Pagar', description: 'Nóminas por Pagar', type: 'liability', nature: 'acreedora', level: 3, groupNumber: '20', parentCode: '20.1', allowsMovements: false },
  { code: '456', name: 'Nóminas por Pagar', description: 'Nóminas por Pagar', type: 'liability', nature: 'acreedora', level: 3, groupNumber: '20', parentCode: '20.1', allowsMovements: false },
  { code: '457', name: 'Nóminas por Pagar', description: 'Nóminas por Pagar', type: 'liability', nature: 'acreedora', level: 3, groupNumber: '20', parentCode: '20.1', allowsMovements: false },
  { code: '458', name: 'Nóminas por Pagar', description: 'Nóminas por Pagar', type: 'liability', nature: 'acreedora', level: 3, groupNumber: '20', parentCode: '20.1', allowsMovements: false },
  { code: '459', name: 'Nóminas por Pagar', description: 'Nóminas por Pagar', type: 'liability', nature: 'acreedora', level: 3, groupNumber: '20', parentCode: '20.1', allowsMovements: false },
  // 460-469 Retenciones por Pagar
  ...Array.from({ length: 10 }, (_, i) => ({
    code: `${460 + i}`,
    name: 'Retenciones por Pagar',
    description: `Retenciones por Pagar (${460 + i})`,
    type: 'liability',
    nature: 'acreedora',
    level: 3,
    groupNumber: '20',
    parentCode: '20.1',
    allowsMovements: true,
  })),
  // 470-479 Préstamos Recibidos y Otras Operaciones Crediticias por Pagar
  ...Array.from({ length: 10 }, (_, i) => ({
    code: `${470 + i}`,
    name: 'Préstamos Recibidos y Otras Operaciones Crediticias por Pagar',
    description: `Préstamos Recibidos (${470 + i})`,
    type: 'liability',
    nature: 'acreedora',
    level: 3,
    groupNumber: '20',
    parentCode: '20.1',
    allowsMovements: true,
  })),
  // 480-489 Gastos Acumulados por Pagar
  ...Array.from({ length: 10 }, (_, i) => ({
    code: `${480 + i}`,
    name: 'Gastos Acumulados por Pagar',
    description: `Gastos Acumulados por Pagar (${480 + i})`,
    type: 'liability',
    nature: 'acreedora',
    level: 3,
    groupNumber: '20',
    parentCode: '20.1',
    allowsMovements: true,
  })),
  // 492 Provisión para Vacaciones
  { code: '492', name: 'Provisión para Vacaciones', description: 'Provisión para Vacaciones', type: 'liability', nature: 'acreedora', level: 3, groupNumber: '20', parentCode: '20.1', allowsMovements: true },
  // 493-499 Otras Provisiones Operacionales
  { code: '493', name: 'Otras Provisiones Operacionales', description: 'Otras Provisiones Operacionales', type: 'liability', nature: 'acreedora', level: 3, groupNumber: '20', parentCode: '20.1', allowsMovements: false },
  { code: '494', name: 'Otras Provisiones Operacionales', description: 'Otras Provisiones Operacionales', type: 'liability', nature: 'acreedora', level: 3, groupNumber: '20', parentCode: '20.1', allowsMovements: false },
  { code: '495', name: 'Otras Provisiones Operacionales', description: 'Otras Provisiones Operacionales', type: 'liability', nature: 'acreedora', level: 3, groupNumber: '20', parentCode: '20.1', allowsMovements: false },
  { code: '496', name: 'Otras Provisiones Operacionales', description: 'Otras Provisiones Operacionales', type: 'liability', nature: 'acreedora', level: 3, groupNumber: '20', parentCode: '20.1', allowsMovements: false },
  { code: '497', name: 'Otras Provisiones Operacionales', description: 'Otras Provisiones Operacionales', type: 'liability', nature: 'acreedora', level: 3, groupNumber: '20', parentCode: '20.1', allowsMovements: false },
  { code: '498', name: 'Otras Provisiones Operacionales', description: 'Otras Provisiones Operacionales', type: 'liability', nature: 'acreedora', level: 3, groupNumber: '20', parentCode: '20.1', allowsMovements: false },
  { code: '499', name: 'Otras Provisiones Operacionales', description: 'Otras Provisiones Operacionales', type: 'liability', nature: 'acreedora', level: 3, groupNumber: '20', parentCode: '20.1', allowsMovements: false },
  // 500 Provisión para Pagos de los Subsidios de Seguridad Social a Corto Plazo
  { code: '500', name: 'Provisión para Pagos de los Subsidios de Seguridad Social a Corto Plazo', description: 'Provisión para Pagos de los Subsidios de Seguridad Social a Corto Plazo', type: 'liability', nature: 'acreedora', level: 3, groupNumber: '20', parentCode: '20.1', allowsMovements: true },
  // 501 Fondo de Compensación para Desbalances Financieros (uso OSDE)
  { code: '501', name: 'Fondo de Compensación para Desbalances Financieros (uso OSDE)', description: 'Fondo de Compensación para Desbalances Financieros', type: 'liability', nature: 'acreedora', level: 3, groupNumber: '20', parentCode: '20.1', allowsMovements: true },

  // 20.2 Pasivos a Largo Plazo
  { code: '20.2', name: 'PASIVOS A LARGO PLAZO', description: 'Subgrupo 20.2 - Pasivos a Largo Plazo', type: 'liability', nature: 'acreedora', level: 2, groupNumber: '20', parentCode: '20', allowsMovements: false },
  // 510-514 Efectos por Pagar a Largo Plazo
  { code: '510', name: 'Efectos por Pagar a Largo Plazo', description: 'Efectos por Pagar a Largo Plazo', type: 'liability', nature: 'acreedora', level: 3, groupNumber: '20', parentCode: '20.2', allowsMovements: false },
  { code: '511', name: 'Efectos por Pagar a Largo Plazo', description: 'Efectos por Pagar a Largo Plazo', type: 'liability', nature: 'acreedora', level: 3, groupNumber: '20', parentCode: '20.2', allowsMovements: false },
  { code: '512', name: 'Efectos por Pagar a Largo Plazo', description: 'Efectos por Pagar a Largo Plazo', type: 'liability', nature: 'acreedora', level: 3, groupNumber: '20', parentCode: '20.2', allowsMovements: false },
  { code: '513', name: 'Efectos por Pagar a Largo Plazo', description: 'Efectos por Pagar a Largo Plazo', type: 'liability', nature: 'acreedora', level: 3, groupNumber: '20', parentCode: '20.2', allowsMovements: false },
  { code: '514', name: 'Efectos por Pagar a Largo Plazo', description: 'Efectos por Pagar a Largo Plazo', type: 'liability', nature: 'acreedora', level: 3, groupNumber: '20', parentCode: '20.2', allowsMovements: false },
  // 515-518 Cuentas por Pagar a Largo Plazo
  { code: '515', name: 'Cuentas por Pagar a Largo Plazo', description: 'Cuentas por Pagar a Largo Plazo', type: 'liability', nature: 'acreedora', level: 3, groupNumber: '20', parentCode: '20.2', allowsMovements: false },
  { code: '516', name: 'Cuentas por Pagar a Largo Plazo', description: 'Cuentas por Pagar a Largo Plazo', type: 'liability', nature: 'acreedora', level: 3, groupNumber: '20', parentCode: '20.2', allowsMovements: false },
  { code: '517', name: 'Cuentas por Pagar a Largo Plazo', description: 'Cuentas por Pagar a Largo Plazo', type: 'liability', nature: 'acreedora', level: 3, groupNumber: '20', parentCode: '20.2', allowsMovements: false },
  { code: '518', name: 'Cuentas por Pagar a Largo Plazo', description: 'Cuentas por Pagar a Largo Plazo', type: 'liability', nature: 'acreedora', level: 3, groupNumber: '20', parentCode: '20.2', allowsMovements: false },
  // 520-524 Préstamos Recibidos por Pagar a Largo Plazo
  { code: '520', name: 'Préstamos Recibidos por Pagar a Largo Plazo', description: 'Préstamos Recibidos a Largo Plazo', type: 'liability', nature: 'acreedora', level: 3, groupNumber: '20', parentCode: '20.2', allowsMovements: false },
  { code: '521', name: 'Préstamos Recibidos por Pagar a Largo Plazo', description: 'Préstamos Recibidos a Largo Plazo', type: 'liability', nature: 'acreedora', level: 3, groupNumber: '20', parentCode: '20.2', allowsMovements: false },
  { code: '522', name: 'Préstamos Recibidos por Pagar a Largo Plazo', description: 'Préstamos Recibidos a Largo Plazo', type: 'liability', nature: 'acreedora', level: 3, groupNumber: '20', parentCode: '20.2', allowsMovements: false },
  { code: '523', name: 'Préstamos Recibidos por Pagar a Largo Plazo', description: 'Préstamos Recibidos a Largo Plazo', type: 'liability', nature: 'acreedora', level: 3, groupNumber: '20', parentCode: '20.2', allowsMovements: false },
  { code: '524', name: 'Préstamos Recibidos por Pagar a Largo Plazo', description: 'Préstamos Recibidos a Largo Plazo', type: 'liability', nature: 'acreedora', level: 3, groupNumber: '20', parentCode: '20.2', allowsMovements: false },
  // 525-532 Obligaciones a Largo Plazo
  { code: '525', name: 'Obligaciones a Largo Plazo', description: 'Obligaciones a Largo Plazo', type: 'liability', nature: 'acreedora', level: 3, groupNumber: '20', parentCode: '20.2', allowsMovements: false },
  { code: '526', name: 'Obligaciones a Largo Plazo', description: 'Obligaciones a Largo Plazo', type: 'liability', nature: 'acreedora', level: 3, groupNumber: '20', parentCode: '20.2', allowsMovements: false },
  { code: '527', name: 'Obligaciones a Largo Plazo', description: 'Obligaciones a Largo Plazo', type: 'liability', nature: 'acreedora', level: 3, groupNumber: '20', parentCode: '20.2', allowsMovements: false },
  { code: '528', name: 'Obligaciones a Largo Plazo', description: 'Obligaciones a Largo Plazo', type: 'liability', nature: 'acreedora', level: 3, groupNumber: '20', parentCode: '20.2', allowsMovements: false },
  { code: '529', name: 'Obligaciones a Largo Plazo', description: 'Obligaciones a Largo Plazo', type: 'liability', nature: 'acreedora', level: 3, groupNumber: '20', parentCode: '20.2', allowsMovements: false },
  { code: '530', name: 'Obligaciones a Largo Plazo', description: 'Obligaciones a Largo Plazo', type: 'liability', nature: 'acreedora', level: 3, groupNumber: '20', parentCode: '20.2', allowsMovements: false },
  { code: '531', name: 'Obligaciones a Largo Plazo', description: 'Obligaciones a Largo Plazo', type: 'liability', nature: 'acreedora', level: 3, groupNumber: '20', parentCode: '20.2', allowsMovements: false },
  { code: '532', name: 'Obligaciones a Largo Plazo', description: 'Obligaciones a Largo Plazo', type: 'liability', nature: 'acreedora', level: 3, groupNumber: '20', parentCode: '20.2', allowsMovements: false },
  // 533-539 Otras Provisiones a Largo Plazo
  { code: '533', name: 'Otras Provisiones a Largo Plazo', description: 'Otras Provisiones a Largo Plazo', type: 'liability', nature: 'acreedora', level: 3, groupNumber: '20', parentCode: '20.2', allowsMovements: false },
  { code: '534', name: 'Otras Provisiones a Largo Plazo', description: 'Otras Provisiones a Largo Plazo', type: 'liability', nature: 'acreedora', level: 3, groupNumber: '20', parentCode: '20.2', allowsMovements: false },
  { code: '535', name: 'Otras Provisiones a Largo Plazo', description: 'Otras Provisiones a Largo Plazo', type: 'liability', nature: 'acreedora', level: 3, groupNumber: '20', parentCode: '20.2', allowsMovements: false },
  { code: '536', name: 'Otras Provisiones a Largo Plazo', description: 'Otras Provisiones a Largo Plazo', type: 'liability', nature: 'acreedora', level: 3, groupNumber: '20', parentCode: '20.2', allowsMovements: false },
  { code: '537', name: 'Otras Provisiones a Largo Plazo', description: 'Otras Provisiones a Largo Plazo', type: 'liability', nature: 'acreedora', level: 3, groupNumber: '20', parentCode: '20.2', allowsMovements: false },
  { code: '538', name: 'Otras Provisiones a Largo Plazo', description: 'Otras Provisiones a Largo Plazo', type: 'liability', nature: 'acreedora', level: 3, groupNumber: '20', parentCode: '20.2', allowsMovements: false },
  { code: '539', name: 'Otras Provisiones a Largo Plazo', description: 'Otras Provisiones a Largo Plazo', type: 'liability', nature: 'acreedora', level: 3, groupNumber: '20', parentCode: '20.2', allowsMovements: false },
  // 540 Bonos por Pagar
  { code: '540', name: 'Bonos por Pagar', description: 'Bonos por Pagar', type: 'liability', nature: 'acreedora', level: 3, groupNumber: '20', parentCode: '20.2', allowsMovements: true },
  // 541 Bonos Suscritos
  { code: '541', name: 'Bonos Suscritos', description: 'Bonos Suscritos', type: 'liability', nature: 'acreedora', level: 3, groupNumber: '20', parentCode: '20.2', allowsMovements: true },

  // 20.3 Pasivos Diferidos
  { code: '20.3', name: 'PASIVOS DIFERIDOS', description: 'Subgrupo 20.3 - Pasivos Diferidos', type: 'liability', nature: 'acreedora', level: 2, groupNumber: '20', parentCode: '20', allowsMovements: false },
  // 545-548 Ingresos Diferidos
  { code: '545', name: 'Ingresos Diferidos', description: 'Ingresos Diferidos', type: 'liability', nature: 'acreedora', level: 3, groupNumber: '20', parentCode: '20.3', allowsMovements: false },
  { code: '546', name: 'Ingresos Diferidos', description: 'Ingresos Diferidos', type: 'liability', nature: 'acreedora', level: 3, groupNumber: '20', parentCode: '20.3', allowsMovements: false },
  { code: '547', name: 'Ingresos Diferidos', description: 'Ingresos Diferidos', type: 'liability', nature: 'acreedora', level: 3, groupNumber: '20', parentCode: '20.3', allowsMovements: false },
  { code: '548', name: 'Ingresos Diferidos', description: 'Ingresos Diferidos', type: 'liability', nature: 'acreedora', level: 3, groupNumber: '20', parentCode: '20.3', allowsMovements: false },
  // 549 Ingresos Diferidos por Donaciones Recibidas
  { code: '549', name: 'Ingresos Diferidos por Donaciones Recibidas', description: 'Ingresos Diferidos por Donaciones Recibidas', type: 'liability', nature: 'acreedora', level: 3, groupNumber: '20', parentCode: '20.3', allowsMovements: true },

  // 20.4 Otros Pasivos
  { code: '20.4', name: 'OTROS PASIVOS', description: 'Subgrupo 20.4 - Otros Pasivos', type: 'liability', nature: 'acreedora', level: 2, groupNumber: '20', parentCode: '20', allowsMovements: false },
  // 555-564 Sobrantes en Investigación
  { code: '555', name: 'Sobrantes en Investigación', description: 'Sobrantes en Investigación', type: 'liability', nature: 'acreedora', level: 3, groupNumber: '20', parentCode: '20.4', allowsMovements: false },
  { code: '556', name: 'Sobrantes en Investigación', description: 'Sobrantes en Investigación', type: 'liability', nature: 'acreedora', level: 3, groupNumber: '20', parentCode: '20.4', allowsMovements: false },
  { code: '557', name: 'Sobrantes en Investigación', description: 'Sobrantes en Investigación', type: 'liability', nature: 'acreedora', level: 3, groupNumber: '20', parentCode: '20.4', allowsMovements: false },
  { code: '558', name: 'Sobrantes en Investigación', description: 'Sobrantes en Investigación', type: 'liability', nature: 'acreedora', level: 3, groupNumber: '20', parentCode: '20.4', allowsMovements: false },
  { code: '559', name: 'Sobrantes en Investigación', description: 'Sobrantes en Investigación', type: 'liability', nature: 'acreedora', level: 3, groupNumber: '20', parentCode: '20.4', allowsMovements: false },
  { code: '560', name: 'Sobrantes en Investigación', description: 'Sobrantes en Investigación', type: 'liability', nature: 'acreedora', level: 3, groupNumber: '20', parentCode: '20.4', allowsMovements: false },
  { code: '561', name: 'Sobrantes en Investigación', description: 'Sobrantes en Investigación', type: 'liability', nature: 'acreedora', level: 3, groupNumber: '20', parentCode: '20.4', allowsMovements: false },
  { code: '562', name: 'Sobrantes en Investigación', description: 'Sobrantes en Investigación', type: 'liability', nature: 'acreedora', level: 3, groupNumber: '20', parentCode: '20.4', allowsMovements: false },
  { code: '563', name: 'Sobrantes en Investigación', description: 'Sobrantes en Investigación', type: 'liability', nature: 'acreedora', level: 3, groupNumber: '20', parentCode: '20.4', allowsMovements: false },
  { code: '564', name: 'Sobrantes en Investigación', description: 'Sobrantes en Investigación', type: 'liability', nature: 'acreedora', level: 3, groupNumber: '20', parentCode: '20.4', allowsMovements: false },
  // 565-568 Cuentas por Pagar Diversas
  { code: '565', name: 'Cuentas por Pagar Diversas', description: 'Cuentas por Pagar Diversas', type: 'liability', nature: 'acreedora', level: 3, groupNumber: '20', parentCode: '20.4', allowsMovements: false },
  { code: '566', name: 'Cuentas por Pagar Diversas', description: 'Cuentas por Pagar Diversas', type: 'liability', nature: 'acreedora', level: 3, groupNumber: '20', parentCode: '20.4', allowsMovements: false },
  { code: '567', name: 'Cuentas por Pagar Diversas', description: 'Cuentas por Pagar Diversas', type: 'liability', nature: 'acreedora', level: 3, groupNumber: '20', parentCode: '20.4', allowsMovements: false },
  { code: '568', name: 'Cuentas por Pagar Diversas', description: 'Cuentas por Pagar Diversas', type: 'liability', nature: 'acreedora', level: 3, groupNumber: '20', parentCode: '20.4', allowsMovements: false },
  // 569 Cuentas por Pagar - Compra de Monedas
  { code: '569', name: 'Cuentas por Pagar - Compra de Monedas', description: 'Cuentas por Pagar - Compra de Monedas', type: 'liability', nature: 'acreedora', level: 3, groupNumber: '20', parentCode: '20.4', allowsMovements: true },
  // 570-574 Ingresos de Períodos Futuros
  { code: '570', name: 'Ingresos de Períodos Futuros', description: 'Ingresos de Períodos Futuros', type: 'liability', nature: 'acreedora', level: 3, groupNumber: '20', parentCode: '20.4', allowsMovements: false },
  { code: '571', name: 'Ingresos de Períodos Futuros', description: 'Ingresos de Períodos Futuros', type: 'liability', nature: 'acreedora', level: 3, groupNumber: '20', parentCode: '20.4', allowsMovements: false },
  { code: '572', name: 'Ingresos de Períodos Futuros', description: 'Ingresos de Períodos Futuros', type: 'liability', nature: 'acreedora', level: 3, groupNumber: '20', parentCode: '20.4', allowsMovements: false },
  { code: '573', name: 'Ingresos de Períodos Futuros', description: 'Ingresos de Períodos Futuros', type: 'liability', nature: 'acreedora', level: 3, groupNumber: '20', parentCode: '20.4', allowsMovements: false },
  { code: '574', name: 'Ingresos de Períodos Futuros', description: 'Ingresos de Períodos Futuros', type: 'liability', nature: 'acreedora', level: 3, groupNumber: '20', parentCode: '20.4', allowsMovements: false },
  // 575 Obligación con el Presupuesto del Estado por Garantía Activada
  { code: '575', name: 'Obligación con el Presupuesto del Estado por Garantía Activada', description: 'Obligación con el Presupuesto del Estado por Garantía Activada', type: 'liability', nature: 'acreedora', level: 3, groupNumber: '20', parentCode: '20.4', allowsMovements: true },
];

// ──────────────────────────────────────────────────────────────────────────────
// DEFINICIÓN DE LAS CUENTAS DE PATRIMONIO NETO (ENTIDADES ESTATALES)
// ──────────────────────────────────────────────────────────────────────────────

const stateEquityAccounts = [
  { code: '30', name: 'PATRIMONIO NETO (Entidades Estatales)', description: 'Grupo 30 - Patrimonio Neto (Entidades Estatales)', type: 'equity', nature: 'acreedora', level: 1, groupNumber: '30', parentCode: null, allowsMovements: false },
  // 600-612 Inversión Estatal
  ...Array.from({ length: 13 }, (_, i) => ({
    code: `${600 + i}`,
    name: 'Inversión Estatal',
    description: `Inversión Estatal (${600 + i})`,
    type: 'equity',
    nature: 'acreedora',
    level: 2,
    groupNumber: '30',
    parentCode: '30',
    allowsMovements: true,
  })),
  // 613-615 Revalorización de Activos Fijos Tangibles (mixta)
  { code: '613', name: 'Revalorización de Activos Fijos Tangibles', description: 'Revalorización de Activos Fijos Tangibles', type: 'equity', nature: 'mixta', level: 2, groupNumber: '30', parentCode: '30', allowsMovements: true },
  { code: '614', name: 'Revalorización de Activos Fijos Tangibles', description: 'Revalorización de Activos Fijos Tangibles', type: 'equity', nature: 'mixta', level: 2, groupNumber: '30', parentCode: '30', allowsMovements: true },
  { code: '615', name: 'Revalorización de Activos Fijos Tangibles', description: 'Revalorización de Activos Fijos Tangibles', type: 'equity', nature: 'mixta', level: 2, groupNumber: '30', parentCode: '30', allowsMovements: true },
  // 616 Otras Operaciones de Capital (mixta)
  { code: '616', name: 'Otras Operaciones de Capital', description: 'Otras Operaciones de Capital', type: 'equity', nature: 'mixta', level: 2, groupNumber: '30', parentCode: '30', allowsMovements: false },
  // 617-618 Recursos Recibidos
  { code: '617', name: 'Recursos Recibidos', description: 'Recursos Recibidos', type: 'equity', nature: 'acreedora', level: 2, groupNumber: '30', parentCode: '30', allowsMovements: true },
  { code: '618', name: 'Recursos Recibidos', description: 'Recursos Recibidos', type: 'equity', nature: 'acreedora', level: 2, groupNumber: '30', parentCode: '30', allowsMovements: true },
  // 619 Recursos Entregados (deudora)
  { code: '619', name: 'Recursos Entregados', description: 'Recursos Entregados', type: 'equity', nature: 'deudora', level: 2, groupNumber: '30', parentCode: '30', allowsMovements: true },
  // 620 Donaciones Recibidas-Nacionales
  { code: '620', name: 'Donaciones Recibidas-Nacionales', description: 'Donaciones Recibidas-Nacionales', type: 'equity', nature: 'acreedora', level: 2, groupNumber: '30', parentCode: '30', allowsMovements: true },
  // 621 Donaciones Recibidas-Exterior
  { code: '621', name: 'Donaciones Recibidas-Exterior', description: 'Donaciones Recibidas-Exterior', type: 'equity', nature: 'acreedora', level: 2, groupNumber: '30', parentCode: '30', allowsMovements: true },
  // 626 Donaciones Entregadas-Nacionales (deudora)
  { code: '626', name: 'Donaciones Entregadas-Nacionales', description: 'Donaciones Entregadas-Nacionales', type: 'equity', nature: 'deudora', level: 2, groupNumber: '30', parentCode: '30', allowsMovements: true },
  // 627 Donaciones Entregadas-Exterior (deudora)
  { code: '627', name: 'Donaciones Entregadas-Exterior', description: 'Donaciones Entregadas-Exterior', type: 'equity', nature: 'deudora', level: 2, groupNumber: '30', parentCode: '30', allowsMovements: true },
  // 630-634 Utilidades Retenidas
  { code: '630', name: 'Utilidades Retenidas', description: 'Utilidades Retenidas', type: 'equity', nature: 'acreedora', level: 2, groupNumber: '30', parentCode: '30', allowsMovements: false },
  { code: '631', name: 'Utilidades Retenidas', description: 'Utilidades Retenidas', type: 'equity', nature: 'acreedora', level: 2, groupNumber: '30', parentCode: '30', allowsMovements: false },
  { code: '632', name: 'Utilidades Retenidas', description: 'Utilidades Retenidas', type: 'equity', nature: 'acreedora', level: 2, groupNumber: '30', parentCode: '30', allowsMovements: false },
  { code: '633', name: 'Utilidades Retenidas', description: 'Utilidades Retenidas', type: 'equity', nature: 'acreedora', level: 2, groupNumber: '30', parentCode: '30', allowsMovements: false },
  { code: '634', name: 'Utilidades Retenidas', description: 'Utilidades Retenidas', type: 'equity', nature: 'acreedora', level: 2, groupNumber: '30', parentCode: '30', allowsMovements: false },
  // 635-639 Subvención por Pérdida
  { code: '635', name: 'Subvención por Pérdida', description: 'Subvención por Pérdida', type: 'equity', nature: 'acreedora', level: 2, groupNumber: '30', parentCode: '30', allowsMovements: false },
  { code: '636', name: 'Subvención por Pérdida', description: 'Subvención por Pérdida', type: 'equity', nature: 'acreedora', level: 2, groupNumber: '30', parentCode: '30', allowsMovements: false },
  { code: '637', name: 'Subvención por Pérdida', description: 'Subvención por Pérdida', type: 'equity', nature: 'acreedora', level: 2, groupNumber: '30', parentCode: '30', allowsMovements: false },
  { code: '638', name: 'Subvención por Pérdida', description: 'Subvención por Pérdida', type: 'equity', nature: 'acreedora', level: 2, groupNumber: '30', parentCode: '30', allowsMovements: false },
  { code: '639', name: 'Subvención por Pérdida', description: 'Subvención por Pérdida', type: 'equity', nature: 'acreedora', level: 2, groupNumber: '30', parentCode: '30', allowsMovements: false },
  // 640-644 Pérdida (deudora)
  { code: '640', name: 'Pérdida', description: 'Pérdida', type: 'equity', nature: 'deudora', level: 2, groupNumber: '30', parentCode: '30', allowsMovements: false },
  { code: '641', name: 'Pérdida', description: 'Pérdida', type: 'equity', nature: 'deudora', level: 2, groupNumber: '30', parentCode: '30', allowsMovements: false },
  { code: '642', name: 'Pérdida', description: 'Pérdida', type: 'equity', nature: 'deudora', level: 2, groupNumber: '30', parentCode: '30', allowsMovements: false },
  { code: '643', name: 'Pérdida', description: 'Pérdida', type: 'equity', nature: 'deudora', level: 2, groupNumber: '30', parentCode: '30', allowsMovements: false },
  { code: '644', name: 'Pérdida', description: 'Pérdida', type: 'equity', nature: 'deudora', level: 2, groupNumber: '30', parentCode: '30', allowsMovements: false },
  // 645 Reservas para Contingencias
  { code: '645', name: 'Reservas para Contingencias', description: 'Reservas para Contingencias', type: 'equity', nature: 'acreedora', level: 2, groupNumber: '30', parentCode: '30', allowsMovements: true },
  // 646-654 Otras Reservas Patrimoniales
  ...Array.from({ length: 9 }, (_, i) => ({
    code: `${646 + i}`,
    name: 'Otras Reservas Patrimoniales',
    description: `Otras Reservas Patrimoniales (${646 + i})`,
    type: 'equity',
    nature: 'acreedora',
    level: 2,
    groupNumber: '30',
    parentCode: '30',
    allowsMovements: true,
  })),
  // 688 Fondo de Contravalor para Proyectos de Inversión
  { code: '688', name: 'Fondo de Contravalor para Proyectos de Inversión', description: 'Fondo de Contravalor para Proyectos de Inversión', type: 'equity', nature: 'acreedora', level: 2, groupNumber: '30', parentCode: '30', allowsMovements: true },
  // 690 Pago a Cuenta de las Utilidades (deudora)
  { code: '690', name: 'Pago a Cuenta de las Utilidades', description: 'Pago a Cuenta de las Utilidades', type: 'equity', nature: 'deudora', level: 2, groupNumber: '30', parentCode: '30', allowsMovements: true },
  // 691 Pago a Cuenta de los Dividendos (deudora)
  { code: '691', name: 'Pago a Cuenta de los Dividendos', description: 'Pago a Cuenta de los Dividendos', type: 'equity', nature: 'deudora', level: 2, groupNumber: '30', parentCode: '30', allowsMovements: true },
  // 693 Pago a Cuenta de Utilidades Sector Cooperativo (deudora)
  { code: '693', name: 'Pago a Cuenta de Utilidades Sector Cooperativo', description: 'Pago a Cuenta de Utilidades Sector Cooperativo', type: 'equity', nature: 'deudora', level: 2, groupNumber: '30', parentCode: '30', allowsMovements: true },
  // 696 Operaciones entre Dependencias (mixta)
  { code: '696', name: 'Operaciones entre Dependencias', description: 'Operaciones entre Dependencias', type: 'equity', nature: 'mixta', level: 2, groupNumber: '30', parentCode: '30', allowsMovements: true },
  // 697 Revaluación de Inventarios (mixta)
  { code: '697', name: 'Revaluación de Inventarios', description: 'Revaluación de Inventarios', type: 'equity', nature: 'mixta', level: 2, groupNumber: '30', parentCode: '30', allowsMovements: true },
  // 698 Ganancia o Pérdida no Realizada (mixta)
  { code: '698', name: 'Ganancia o Pérdida no Realizada', description: 'Ganancia o Pérdida no Realizada', type: 'equity', nature: 'mixta', level: 2, groupNumber: '30', parentCode: '30', allowsMovements: true },
  // 699 Transitoria del Sistema Automatizado (mixta)
  { code: '699', name: 'Transitoria del Sistema Automatizado', description: 'Transitoria del Sistema Automatizado', type: 'equity', nature: 'mixta', level: 2, groupNumber: '30', parentCode: '30', allowsMovements: true },
];

// ──────────────────────────────────────────────────────────────────────────────
// DEFINICIÓN DE LAS CUENTAS DE CAPITAL CONTABLE (ENTIDADES NO ESTATALES)
// ──────────────────────────────────────────────────────────────────────────────

const nonStateEquityAccounts = [
  { code: '30', name: 'CAPITAL CONTABLE (Entidades no Estatales)', description: 'Grupo 30 - Capital Contable (Entidades no Estatales)', type: 'equity', nature: 'acreedora', level: 1, groupNumber: '30', parentCode: null, allowsMovements: false },
  // 600 Patrimonio y Fondo Común
  { code: '600', name: 'Patrimonio y Fondo Común', description: 'Patrimonio y Fondo Común', type: 'equity', nature: 'acreedora', level: 2, groupNumber: '30', parentCode: '30', allowsMovements: true },
  // 601-603 Capital Social Autorizado
  { code: '601', name: 'Capital Social Autorizado', description: 'Capital Social Autorizado', type: 'equity', nature: 'acreedora', level: 2, groupNumber: '30', parentCode: '30', allowsMovements: false },
  { code: '602', name: 'Capital Social Autorizado', description: 'Capital Social Autorizado', type: 'equity', nature: 'acreedora', level: 2, groupNumber: '30', parentCode: '30', allowsMovements: false },
  { code: '603', name: 'Capital Social Autorizado', description: 'Capital Social Autorizado', type: 'equity', nature: 'acreedora', level: 2, groupNumber: '30', parentCode: '30', allowsMovements: false },
  // 604-606 Acciones por Emitir (deudora)
  { code: '604', name: 'Acciones por Emitir', description: 'Acciones por Emitir', type: 'equity', nature: 'deudora', level: 2, groupNumber: '30', parentCode: '30', allowsMovements: false },
  { code: '605', name: 'Acciones por Emitir', description: 'Acciones por Emitir', type: 'equity', nature: 'deudora', level: 2, groupNumber: '30', parentCode: '30', allowsMovements: false },
  { code: '606', name: 'Acciones por Emitir', description: 'Acciones por Emitir', type: 'equity', nature: 'deudora', level: 2, groupNumber: '30', parentCode: '30', allowsMovements: false },
  // 607-609 Acciones Suscritas
  { code: '607', name: 'Acciones Suscritas', description: 'Acciones Suscritas', type: 'equity', nature: 'acreedora', level: 2, groupNumber: '30', parentCode: '30', allowsMovements: false },
  { code: '608', name: 'Acciones Suscritas', description: 'Acciones Suscritas', type: 'equity', nature: 'acreedora', level: 2, groupNumber: '30', parentCode: '30', allowsMovements: false },
  { code: '609', name: 'Acciones Suscritas', description: 'Acciones Suscritas', type: 'equity', nature: 'acreedora', level: 2, groupNumber: '30', parentCode: '30', allowsMovements: false },
  // 610 Subscriptores de Acciones (deudora)
  { code: '610', name: 'Subscriptores de Acciones', description: 'Subscriptores de Acciones', type: 'equity', nature: 'deudora', level: 2, groupNumber: '30', parentCode: '30', allowsMovements: true },
  // 611-612 Acciones en Tesorería (deudora)
  { code: '611', name: 'Acciones en Tesorería', description: 'Acciones en Tesorería', type: 'equity', nature: 'deudora', level: 2, groupNumber: '30', parentCode: '30', allowsMovements: false },
  { code: '612', name: 'Acciones en Tesorería', description: 'Acciones en Tesorería', type: 'equity', nature: 'deudora', level: 2, groupNumber: '30', parentCode: '30', allowsMovements: false },
  // 613-615 Revalorización de Activos Fijos Tangibles (mixta)
  { code: '613', name: 'Revalorización de Activos Fijos Tangibles', description: 'Revalorización de Activos Fijos Tangibles', type: 'equity', nature: 'mixta', level: 2, groupNumber: '30', parentCode: '30', allowsMovements: true },
  { code: '614', name: 'Revalorización de Activos Fijos Tangibles', description: 'Revalorización de Activos Fijos Tangibles', type: 'equity', nature: 'mixta', level: 2, groupNumber: '30', parentCode: '30', allowsMovements: true },
  { code: '615', name: 'Revalorización de Activos Fijos Tangibles', description: 'Revalorización de Activos Fijos Tangibles', type: 'equity', nature: 'mixta', level: 2, groupNumber: '30', parentCode: '30', allowsMovements: true },
  // 616-619 Otras Operaciones de Capital (mixta)
  { code: '616', name: 'Otras Operaciones de Capital', description: 'Otras Operaciones de Capital', type: 'equity', nature: 'mixta', level: 2, groupNumber: '30', parentCode: '30', allowsMovements: false },
  { code: '617', name: 'Otras Operaciones de Capital', description: 'Otras Operaciones de Capital', type: 'equity', nature: 'mixta', level: 2, groupNumber: '30', parentCode: '30', allowsMovements: false },
  { code: '618', name: 'Otras Operaciones de Capital', description: 'Otras Operaciones de Capital', type: 'equity', nature: 'mixta', level: 2, groupNumber: '30', parentCode: '30', allowsMovements: false },
  { code: '619', name: 'Otras Operaciones de Capital', description: 'Otras Operaciones de Capital', type: 'equity', nature: 'mixta', level: 2, groupNumber: '30', parentCode: '30', allowsMovements: false },
  // 620 Donaciones Recibidas-Nacionales
  { code: '620', name: 'Donaciones Recibidas-Nacionales', description: 'Donaciones Recibidas-Nacionales', type: 'equity', nature: 'acreedora', level: 2, groupNumber: '30', parentCode: '30', allowsMovements: true },
  // 621 Donaciones Recibidas-Exterior
  { code: '621', name: 'Donaciones Recibidas-Exterior', description: 'Donaciones Recibidas-Exterior', type: 'equity', nature: 'acreedora', level: 2, groupNumber: '30', parentCode: '30', allowsMovements: true },
  // 626 Donaciones Entregadas-Nacionales (deudora)
  { code: '626', name: 'Donaciones Entregadas-Nacionales', description: 'Donaciones Entregadas-Nacionales', type: 'equity', nature: 'deudora', level: 2, groupNumber: '30', parentCode: '30', allowsMovements: true },
  // 627 Donaciones Entregadas-Exterior (deudora)
  { code: '627', name: 'Donaciones Entregadas-Exterior', description: 'Donaciones Entregadas-Exterior', type: 'equity', nature: 'deudora', level: 2, groupNumber: '30', parentCode: '30', allowsMovements: true },
  // 630-634 Utilidades Retenidas
  ...Array.from({ length: 5 }, (_, i) => ({
    code: `${630 + i}`,
    name: 'Utilidades Retenidas',
    description: `Utilidades Retenidas (${630 + i})`,
    type: 'equity',
    nature: 'acreedora',
    level: 2,
    groupNumber: '30',
    parentCode: '30',
    allowsMovements: true,
  })),
  // 635-639 Subvención por Pérdida
  ...Array.from({ length: 5 }, (_, i) => ({
    code: `${635 + i}`,
    name: 'Subvención por Pérdida',
    description: `Subvención por Pérdida (${635 + i})`,
    type: 'equity',
    nature: 'acreedora',
    level: 2,
    groupNumber: '30',
    parentCode: '30',
    allowsMovements: true,
  })),
  // 640-644 Pérdida (deudora)
  ...Array.from({ length: 5 }, (_, i) => ({
    code: `${640 + i}`,
    name: 'Pérdida',
    description: `Pérdida (${640 + i})`,
    type: 'equity',
    nature: 'deudora',
    level: 2,
    groupNumber: '30',
    parentCode: '30',
    allowsMovements: true,
  })),
  // 645 Reservas para Contingencias
  { code: '645', name: 'Reservas para Contingencias', description: 'Reservas para Contingencias', type: 'equity', nature: 'acreedora', level: 2, groupNumber: '30', parentCode: '30', allowsMovements: true },
  // 646-654 Otras Reservas Patrimoniales
  ...Array.from({ length: 9 }, (_, i) => ({
    code: `${646 + i}`,
    name: 'Otras Reservas Patrimoniales',
    description: `Otras Reservas Patrimoniales (${646 + i})`,
    type: 'equity',
    nature: 'acreedora',
    level: 2,
    groupNumber: '30',
    parentCode: '30',
    allowsMovements: true,
  })),
  // 688 Fondo de Contravalor para Proyectos de Inversión
  { code: '688', name: 'Fondo de Contravalor para Proyectos de Inversión', description: 'Fondo de Contravalor para Proyectos de Inversión', type: 'equity', nature: 'acreedora', level: 2, groupNumber: '30', parentCode: '30', allowsMovements: true },
  // 690 Pago a Cuenta de las Utilidades Sociedades Mercantiles (deudora)
  { code: '690', name: 'Pago a Cuenta de las Utilidades Sociedades Mercantiles', description: 'Pago a Cuenta de las Utilidades Sociedades Mercantiles', type: 'equity', nature: 'deudora', level: 2, groupNumber: '30', parentCode: '30', allowsMovements: true },
  // 691 Pago a Cuenta de los Dividendos (deudora)
  { code: '691', name: 'Pago a Cuenta de los Dividendos', description: 'Pago a Cuenta de los Dividendos', type: 'equity', nature: 'deudora', level: 2, groupNumber: '30', parentCode: '30', allowsMovements: true },
  // 693 Pago a Cuenta de Utilidades Sector Cooperativo (deudora)
  { code: '693', name: 'Pago a Cuenta de Utilidades Sector Cooperativo', description: 'Pago a Cuenta de Utilidades Sector Cooperativo', type: 'equity', nature: 'deudora', level: 2, groupNumber: '30', parentCode: '30', allowsMovements: true },
  // 696 Operaciones entre Dependencias (mixta, solo cooperativas)
  { code: '696', name: 'Operaciones entre Dependencias', description: 'Operaciones entre Dependencias (solo Cooperativas)', type: 'equity', nature: 'mixta', level: 2, groupNumber: '30', parentCode: '30', allowsMovements: true },
  // 697 Revaluación de Inventarios (mixta)
  { code: '697', name: 'Revaluación de Inventarios', description: 'Revaluación de Inventarios', type: 'equity', nature: 'mixta', level: 2, groupNumber: '30', parentCode: '30', allowsMovements: true },
  // 698 Ganancia o Pérdida no Realizada (mixta)
  { code: '698', name: 'Ganancia o Pérdida no Realizada', description: 'Ganancia o Pérdida no Realizada', type: 'equity', nature: 'mixta', level: 2, groupNumber: '30', parentCode: '30', allowsMovements: true },
  // 699 Transitoria del Sistema Automatizado (mixta)
  { code: '699', name: 'Transitoria del Sistema Automatizado', description: 'Transitoria del Sistema Automatizado', type: 'equity', nature: 'mixta', level: 2, groupNumber: '30', parentCode: '30', allowsMovements: true },
];

// ──────────────────────────────────────────────────────────────────────────────
// GRUPO 40 - GASTOS DE PRODUCCIÓN
// ──────────────────────────────────────────────────────────────────────────────

const productionExpenseAccounts = [
  { code: '40', name: 'GASTOS DE PRODUCCIÓN', description: 'Grupo 40 - Gastos de Producción', type: 'expense', nature: 'deudora', level: 1, groupNumber: '40', parentCode: null, allowsMovements: false },
  // 700-724 Producción en Proceso (level 3 = cuentas dentro del grupo 40)
  ...Array.from({ length: 25 }, (_, i) => ({
    code: `${700 + i}`,
    name: 'Producción en Proceso',
    description: `Producción en Proceso (${700 + i})`,
    type: 'expense',
    nature: 'deudora',
    level: 3,
    groupNumber: '40',
    parentCode: '40',
    allowsMovements: true,
  })),
  // 725 Producción Propia para Insumos
  { code: '725', name: 'Producción Propia para Insumos', description: 'Producción Propia para Insumos', type: 'expense', nature: 'deudora', level: 3, groupNumber: '40', parentCode: '40', allowsMovements: true },
  // 726 Reparaciones Capitales con Medios Propios
  { code: '726', name: 'Reparaciones Capitales con Medios Propios', description: 'Reparaciones Capitales con Medios Propios', type: 'expense', nature: 'deudora', level: 3, groupNumber: '40', parentCode: '40', allowsMovements: true },
  // 727 Inversiones con Medios Propios Activos Fijos Intangibles
  { code: '727', name: 'Inversiones con Medios Propios Activos Fijos Intangibles', description: 'Inversiones con Medios Propios Activos Fijos Intangibles', type: 'expense', nature: 'deudora', level: 3, groupNumber: '40', parentCode: '40', allowsMovements: true },
  // 728 Inversiones con Medios Propios
  { code: '728', name: 'Inversiones con Medios Propios', description: 'Inversiones con Medios Propios', type: 'expense', nature: 'deudora', level: 3, groupNumber: '40', parentCode: '40', allowsMovements: true },
  // 731-739 Gastos Asociados a la Producción
  ...Array.from({ length: 9 }, (_, i) => ({
    code: `${731 + i}`,
    name: 'Gastos Asociados a la Producción',
    description: `Gastos Asociados a la Producción (${731 + i})`,
    type: 'expense',
    nature: 'deudora',
    level: 3,
    groupNumber: '40',
    parentCode: '40',
    allowsMovements: true,
  })),
];

// ──────────────────────────────────────────────────────────────────────────────
// GRUPO 50 - CUENTAS NOMINALES (DEUDORAS Y ACREEDORAS)
// ──────────────────────────────────────────────────────────────────────────────

const nominalAccounts = [
  { code: '50', name: 'CUENTAS NOMINALES', description: 'Grupo 50 - Cuentas Nominales', type: 'income', nature: 'mixta', level: 1, groupNumber: '50', parentCode: null, allowsMovements: false },
  { code: '50.1', name: 'CUENTAS NOMINALES DEUDORAS (Excepto Seguros)', description: 'Subgrupo 50.1 - Cuentas Nominales Deudoras', type: 'expense', nature: 'deudora', level: 2, groupNumber: '50', parentCode: '50', allowsMovements: false },
  // 800-804 Devoluciones y Rebajas en Ventas
  ...Array.from({ length: 5 }, (_, i) => ({
    code: `${800 + i}`,
    name: 'Devoluciones y Rebajas en Ventas',
    description: `Devoluciones/Rebajas en Ventas (${800 + i})`,
    type: 'expense',
    nature: 'deudora',
    level: 3,
    groupNumber: '50',
    parentCode: '50.1',
    allowsMovements: true,
  })),
  // 805-809 Impuesto por las Ventas
  ...Array.from({ length: 5 }, (_, i) => ({
    code: `${805 + i}`,
    name: 'Impuesto por las Ventas',
    description: `Impuesto por las Ventas (${805 + i})`,
    type: 'expense',
    nature: 'deudora',
    level: 3,
    groupNumber: '50',
    parentCode: '50.1',
    allowsMovements: true,
  })),
  // 810-813 Costo de Ventas de la Producción
  ...Array.from({ length: 4 }, (_, i) => ({
    code: `${810 + i}`,
    name: 'Costo de Ventas de la Producción',
    description: `Costo de Ventas de la Producción (${810 + i})`,
    type: 'expense',
    nature: 'deudora',
    level: 3,
    groupNumber: '50',
    parentCode: '50.1',
    allowsMovements: true,
  })),
  // 814-817 Costo de Ventas de Mercancías
  ...Array.from({ length: 4 }, (_, i) => ({
    code: `${814 + i}`,
    name: 'Costo de Ventas de Mercancías',
    description: `Costo de Ventas de Mercancías (${814 + i})`,
    type: 'expense',
    nature: 'deudora',
    level: 3,
    groupNumber: '50',
    parentCode: '50.1',
    allowsMovements: true,
  })),
  // 818 Costo por Exportación de Servicios
  { code: '818', name: 'Costo por Exportación de Servicios', description: 'Costo por Exportación de Servicios', type: 'expense', nature: 'deudora', level: 3, groupNumber: '50', parentCode: '50.1', allowsMovements: true },
  // 819-821 Gastos de Distribución y Ventas
  ...Array.from({ length: 3 }, (_, i) => ({
    code: `${819 + i}`,
    name: 'Gastos de Distribución y Ventas',
    description: `Gastos de Distribución/Ventas (${819 + i})`,
    type: 'expense',
    nature: 'deudora',
    level: 3,
    groupNumber: '50',
    parentCode: '50.1',
    allowsMovements: true,
  })),
  // 822-824 Gastos Generales y de Administración
  ...Array.from({ length: 3 }, (_, i) => ({
    code: `${822 + i}`,
    name: 'Gastos Generales y de Administración',
    description: `Gastos Generales y de Administración (${822 + i})`,
    type: 'expense',
    nature: 'deudora',
    level: 3,
    groupNumber: '50',
    parentCode: '50.1',
    allowsMovements: true,
  })),
  // 825 Gastos de Proyectos
  { code: '825', name: 'Gastos de Proyectos', description: 'Gastos de Proyectos', type: 'expense', nature: 'deudora', level: 3, groupNumber: '50', parentCode: '50.1', allowsMovements: true },
  // 826-833 Gastos de Operación
  ...Array.from({ length: 8 }, (_, i) => ({
    code: `${826 + i}`,
    name: 'Gastos de Operación',
    description: `Gastos de Operación (${826 + i})`,
    type: 'expense',
    nature: 'deudora',
    level: 3,
    groupNumber: '50',
    parentCode: '50.1',
    allowsMovements: true,
  })),
  // 834 Gastos de Administración de la OSDE
  { code: '834', name: 'Gastos de Administración de la OSDE', description: 'Gastos de Administración de la OSDE', type: 'expense', nature: 'deudora', level: 3, groupNumber: '50', parentCode: '50.1', allowsMovements: true },
  // 835-838 Gastos Financieros
  ...Array.from({ length: 4 }, (_, i) => ({
    code: `${835 + i}`,
    name: 'Gastos Financieros',
    description: `Gastos Financieros (${835 + i})`,
    type: 'expense',
    nature: 'deudora',
    level: 3,
    groupNumber: '50',
    parentCode: '50.1',
    allowsMovements: true,
  })),
  // 839 Gastos por Pérdidas en Tasas de Cambio
  { code: '839', name: 'Gastos por Pérdidas en Tasas de Cambio', description: 'Gastos por Pérdidas en Tasas de Cambio', type: 'expense', nature: 'deudora', level: 3, groupNumber: '50', parentCode: '50.1', allowsMovements: true },
  // 840 Financiamiento Entregado a la OSDE
  { code: '840', name: 'Financiamiento Entregado a la OSDE', description: 'Financiamiento Entregado a la OSDE', type: 'expense', nature: 'deudora', level: 3, groupNumber: '50', parentCode: '50.1', allowsMovements: true },
  // 841 Gastos por Estadía - Importadores
  { code: '841', name: 'Gastos por Estadía - Importadores', description: 'Gastos por Estadía - Importadores', type: 'expense', nature: 'deudora', level: 3, groupNumber: '50', parentCode: '50.1', allowsMovements: true },
  // 843 Gastos por Estadía - Otras Entidades
  { code: '843', name: 'Gastos por Estadía - Otras Entidades', description: 'Gastos por Estadía - Otras Entidades', type: 'expense', nature: 'deudora', level: 3, groupNumber: '50', parentCode: '50.1', allowsMovements: true },
  // 845-848 Gastos por Pérdidas
  ...Array.from({ length: 4 }, (_, i) => ({
    code: `${845 + i}`,
    name: 'Gastos por Pérdidas',
    description: `Gastos por Pérdidas (${845 + i})`,
    type: 'expense',
    nature: 'deudora',
    level: 3,
    groupNumber: '50',
    parentCode: '50.1',
    allowsMovements: true,
  })),
  // 849 Gastos por Pérdidas - Desastres
  { code: '849', name: 'Gastos por Pérdidas - Desastres', description: 'Gastos por Pérdidas - Desastres', type: 'expense', nature: 'deudora', level: 3, groupNumber: '50', parentCode: '50.1', allowsMovements: true },
  // 850-854 Gastos por Faltantes de Bienes
  ...Array.from({ length: 5 }, (_, i) => ({
    code: `${850 + i}`,
    name: 'Gastos por Faltantes de Bienes',
    description: `Gastos por Faltantes de Bienes (${850 + i})`,
    type: 'expense',
    nature: 'deudora',
    level: 3,
    groupNumber: '50',
    parentCode: '50.1',
    allowsMovements: true,
  })),
  // 855-864 Otros Impuestos, Tasas y Contribuciones
  ...Array.from({ length: 10 }, (_, i) => ({
    code: `${855 + i}`,
    name: 'Otros Impuestos, Tasas y Contribuciones',
    description: `Otros Impuestos/Tasas (${855 + i})`,
    type: 'expense',
    nature: 'deudora',
    level: 3,
    groupNumber: '50',
    parentCode: '50.1',
    allowsMovements: true,
  })),
  // 865-866 Otros Gastos
  { code: '865', name: 'Otros Gastos', description: 'Otros Gastos', type: 'expense', nature: 'deudora', level: 3, groupNumber: '50', parentCode: '50.1', allowsMovements: true },
  { code: '866', name: 'Otros Gastos', description: 'Otros Gastos', type: 'expense', nature: 'deudora', level: 3, groupNumber: '50', parentCode: '50.1', allowsMovements: true },
  // 867 Gastos de Eventos
  { code: '867', name: 'Gastos de Eventos', description: 'Gastos de Eventos', type: 'expense', nature: 'deudora', level: 3, groupNumber: '50', parentCode: '50.1', allowsMovements: true },
  // 873 Gastos de Recuperación de Desastres
  { code: '873', name: 'Gastos de Recuperación de Desastres', description: 'Gastos de Recuperación de Desastres', type: 'expense', nature: 'deudora', level: 3, groupNumber: '50', parentCode: '50.1', allowsMovements: true },

  // 50.2 Cuentas Nominales Acreedoras (Excepto Seguros)
  { code: '50.2', name: 'CUENTAS NOMINALES ACREEDORAS (Excepto Seguros)', description: 'Subgrupo 50.2 - Cuentas Nominales Acreedoras', type: 'income', nature: 'acreedora', level: 2, groupNumber: '50', parentCode: '50', allowsMovements: false },
  // 900-913 Ventas
  ...Array.from({ length: 14 }, (_, i) => ({
    code: `${900 + i}`,
    name: 'Ventas',
    description: `Ventas (${900 + i})`,
    type: 'income',
    nature: 'acreedora',
    level: 3,
    groupNumber: '50',
    parentCode: '50.2',
    allowsMovements: true,
  })),
  // 914 Ventas de Bienes con destino a la Exportación
  { code: '914', name: 'Ventas de Bienes con destino a la Exportación', description: 'Ventas de Bienes con destino a la Exportación', type: 'income', nature: 'acreedora', level: 3, groupNumber: '50', parentCode: '50.2', allowsMovements: true },
  // 915 Ventas por Exportación de Servicios
  { code: '915', name: 'Ventas por Exportación de Servicios', description: 'Ventas por Exportación de Servicios', type: 'income', nature: 'acreedora', level: 3, groupNumber: '50', parentCode: '50.2', allowsMovements: true },
  // 916-919 Subvenciones
  ...Array.from({ length: 4 }, (_, i) => ({
    code: `${916 + i}`,
    name: 'Subvenciones',
    description: `Subvenciones (${916 + i})`,
    type: 'income',
    nature: 'acreedora',
    level: 3,
    groupNumber: '50',
    parentCode: '50.2',
    allowsMovements: true,
  })),
  // 920-922 Ingresos Financieros
  ...Array.from({ length: 3 }, (_, i) => ({
    code: `${920 + i}`,
    name: 'Ingresos Financieros',
    description: `Ingresos Financieros (${920 + i})`,
    type: 'income',
    nature: 'acreedora',
    level: 3,
    groupNumber: '50',
    parentCode: '50.2',
    allowsMovements: true,
  })),
  // 923 Financiamiento Recibido de las Empresas (OSDE)
  { code: '923', name: 'Financiamiento Recibido de las Empresas (OSDE)', description: 'Financiamiento Recibido de las Empresas (OSDE)', type: 'income', nature: 'acreedora', level: 3, groupNumber: '50', parentCode: '50.2', allowsMovements: true },
  // 924 Ingresos por Variación de Tasas de Cambio
  { code: '924', name: 'Ingresos por Variación de Tasas de Cambio', description: 'Ingresos por Variación de Tasas de Cambio', type: 'income', nature: 'acreedora', level: 3, groupNumber: '50', parentCode: '50.2', allowsMovements: true },
  // 925 Ingresos por Dividendos Ganados
  { code: '925', name: 'Ingresos por Dividendos Ganados', description: 'Ingresos por Dividendos Ganados', type: 'income', nature: 'acreedora', level: 3, groupNumber: '50', parentCode: '50.2', allowsMovements: true },
  // 926-927 Ingresos por Estadía (navieras y operadores)
  { code: '926', name: 'Ingresos por Estadía (navieras y operadores)', description: 'Ingresos por Estadía (navieras y operadores)', type: 'income', nature: 'acreedora', level: 3, groupNumber: '50', parentCode: '50.2', allowsMovements: true },
  { code: '927', name: 'Ingresos por Estadía (navieras y operadores)', description: 'Ingresos por Estadía (navieras y operadores)', type: 'income', nature: 'acreedora', level: 3, groupNumber: '50', parentCode: '50.2', allowsMovements: true },
  // 928-929 Ingresos por Recobro de Estadía (importadores y otras entidades)
  { code: '928', name: 'Ingresos por Recobro de Estadía (importadores y otras entidades)', description: 'Ingresos por Recobro de Estadía', type: 'income', nature: 'acreedora', level: 3, groupNumber: '50', parentCode: '50.2', allowsMovements: true },
  { code: '929', name: 'Ingresos por Recobro de Estadía (importadores y otras entidades)', description: 'Ingresos por Recobro de Estadía', type: 'income', nature: 'acreedora', level: 3, groupNumber: '50', parentCode: '50.2', allowsMovements: true },
  // 930-939 Ingresos por Sobrantes
  ...Array.from({ length: 10 }, (_, i) => ({
    code: `${930 + i}`,
    name: 'Ingresos por Sobrantes',
    description: `Ingresos por Sobrantes (${930 + i})`,
    type: 'income',
    nature: 'acreedora',
    level: 3,
    groupNumber: '50',
    parentCode: '50.2',
    allowsMovements: true,
  })),
  // 950-952 Otros Ingresos
  { code: '950', name: 'Otros Ingresos', description: 'Otros Ingresos', type: 'income', nature: 'acreedora', level: 3, groupNumber: '50', parentCode: '50.2', allowsMovements: true },
  { code: '951', name: 'Otros Ingresos', description: 'Otros Ingresos', type: 'income', nature: 'acreedora', level: 3, groupNumber: '50', parentCode: '50.2', allowsMovements: true },
  { code: '952', name: 'Otros Ingresos', description: 'Otros Ingresos', type: 'income', nature: 'acreedora', level: 3, groupNumber: '50', parentCode: '50.2', allowsMovements: true },
  // 953 Ingresos por Donaciones Recibidas
  { code: '953', name: 'Ingresos por Donaciones Recibidas', description: 'Ingresos por Donaciones Recibidas', type: 'income', nature: 'acreedora', level: 3, groupNumber: '50', parentCode: '50.2', allowsMovements: true },

  // 50.3 Cuentas Nominales Deudoras (Empresas de Seguro) - omitido por brevedad, pero se puede agregar similar
  // 50.4 Cuentas Nominales Acreedoras (Empresas de Seguro) - omitido

  // ────────────────────────────────────────────────────────────────────────────
  // GRUPO 60 - CUENTA DE CIERRE
  // ────────────────────────────────────────────────────────────────────────────
  { code: '60', name: 'CUENTA DE CIERRE', description: 'Grupo 60 - Cuenta de Cierre', type: 'income', nature: 'mixta', level: 1, groupNumber: '60', parentCode: null, allowsMovements: false },
  { code: '999', name: 'Resultado', description: 'Cuenta de resultado del período', type: 'income', nature: 'mixta', level: 2, groupNumber: '60', parentCode: '60', allowsMovements: true },
];

// ──────────────────────────────────────────────────────────────────────────────
// COMBINAR Y GENERAR SUBCUENTAS
// ──────────────────────────────────────────────────────────────────────────────

function generateAllAccounts(companyType: 'state' | 'non-state') {
  const base = [...baseAccounts];
  const equity = companyType === 'state' ? stateEquityAccounts : nonStateEquityAccounts;
  const production = productionExpenseAccounts;
  const nominal = nominalAccounts;

  // Combinar todas las cuentas base
  const allBase = [...base, ...equity, ...production, ...nominal];

  // Ahora generar subcuentas para las cuentas que las requieren
  const allWithSubs: any[] = [];

  // Función para agregar una cuenta y sus subcuentas si las tiene
  function addAccount(account: any) {
    allWithSubs.push(account);
    // Si la cuenta es de las que tienen subcuentas, generarlas
    const code = account.code;
    const parentName = account.name;
    const type = account.type;
    const nature = account.nature;

    // 1. Cuentas con subcuentas de contraparte (0010-0060)
    const counterpartyCodes = ['130', '131', '132', '133', '135', '136', '137', '138', '139',
                               '146', '147', '148', '149', '150', '151', '152',
                               '215', '216', '217', '218', '219', '220', '221', '222', '223', '224',
                               '401', '402', '403', '404', '405', '406', '407', '408', '409', '410', '411', '412', '413', '414', '415',
                               '421', '422', '423', '424', '425', '426', '427', '428', '429',
                               '510', '511', '512', '513', '514', '515', '516', '517', '518',
                               '525', '526', '527', '528', '529', '530', '531', '532',
                               '343', '344', '345', '346', '347', '348', '349',
                               '565', '566', '567', '568'];
    if (counterpartyCodes.includes(code)) {
      const subs = generateCounterpartySubaccounts(code, parentName, type, nature);
      allWithSubs.push(...subs);
    }

    // 2. Cuentas de presupuesto (164-166, 440-449)
    const budgetCodes = ['164', '165', '166', '440', '441', '442', '443', '444', '445', '446', '447', '448', '449'];
    if (budgetCodes.includes(code)) {
      const subs = generateBudgetSubaccounts(code, parentName, type, nature);
      allWithSubs.push(...subs);
    }

    // 3. Cuentas de producción terminada (188) y producción para insumo (196)
    if (code === '188' || code === '196') {
      const subs = generateProductionInventorySubaccounts(code, parentName, type, nature);
      allWithSubs.push(...subs);
    }

    // 4.a Ingresos Acumulados por Cobrar (173-180) — subcuentas de contraparte
    const accrRevCodes = ['173', '174', '175', '176', '177', '178', '179', '180'];
    if (accrRevCodes.includes(code)) {
      const subs = generateCounterpartySubaccounts(code, parentName, type, nature);
      allWithSubs.push(...subs);
    }

    // 4.b Sobrantes en Investigación (555-564) — subcuentas de contraparte
    const surplusCodes = ['555', '556', '557', '558', '559', '560', '561', '562', '563', '564'];
    if (surplusCodes.includes(code)) {
      const subs = generateCounterpartySubaccounts(code, parentName, type, nature);
      allWithSubs.push(...subs);
    }

    // 4.c Nóminas por Pagar (455-459) — subcuentas por categoría ocupacional
    const payrollCodes = ['455', '456', '457', '458', '459'];
    if (payrollCodes.includes(code)) {
      const subs = generatePayrollSubaccounts(code, parentName, type, nature);
      allWithSubs.push(...subs);
    }

    // 4.d Retenciones por Pagar (460-469) — subcuentas por tipo de retención
    const withholdingNum = parseInt(code, 10);
    if (!isNaN(withholdingNum) && withholdingNum >= 460 && withholdingNum <= 469) {
      const subs = generateWithholdingSubaccounts(code, parentName, type, nature);
      allWithSubs.push(...subs);
    }

    // 4.e Gastos Acumulados por Pagar (480-489) — subcuentas por elemento de gasto
    const accruedExpNum = parseInt(code, 10);
    if (!isNaN(accruedExpNum) && accruedExpNum >= 480 && accruedExpNum <= 489) {
      const subs = generateAccruedExpenseSubaccounts(code, parentName, type, nature);
      allWithSubs.push(...subs);
    }

    // 5. Cuentas de inversión con medios propios (700-729)
    // Subcuentas obligatorias según Anexo 1: 0010 Saldo Inicio, 0020 Gastos Período, 0050 Traspaso
    const investmentCodeNums = parseInt(code, 10);
    if (!isNaN(investmentCodeNums) && investmentCodeNums >= 700 && investmentCodeNums <= 729) {
      const subs = generateInvestmentSubaccounts(code, parentName, type, nature);
      allWithSubs.push(...subs);
    }
  }

  // Agregar todas las cuentas base
  allBase.forEach(acc => addAccount(acc));

  return allWithSubs;
}

// ──────────────────────────────────────────────────────────────────────────────
// SEEDING FUNCTION
// ──────────────────────────────────────────────────────────────────────────────

async function seedAccounts2016() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const accountRepo = app.get('AccountRepository') as Repository<Account>;
  const companyRepo = app.get('CompanyRepository') as Repository<Company>;

  try {
    console.log('🌱 Seeding Cuban Chart of Accounts 2016 (GOC-2016-EX39)');
    const companies = await companyRepo.find();
    if (companies.length === 0) {
      console.log('❌ No companies found. Please seed companies first.');
      return;
    }

    for (const company of companies) {
      // Determinar el tipo de empresa (asumiendo que tienes un campo 'type' en Company)
      // Si no, puedes pasar un parámetro o decidir según el nombre.
      // Por defecto, usamos 'state' para empresas estatales.
      const companyType: 'state' | 'non-state' = (company as any).type === 'non-state' ? 'non-state' : 'state';

      console.log(`🏢 Processing company: ${company.name} (ID: ${company.id}, Type: ${companyType})`);

      // Generar todas las cuentas para este tipo de empresa
      const accountsToSeed = generateAllAccounts(companyType);

      // Obtener cuentas ya existentes para esta empresa (con id y code)
      const existingAccounts = await accountRepo.find({
        where: { companyId: company.id },
        select: ['id', 'code', 'name', 'description', 'nature', 'allowsMovements'],
      });
      const existingMap = new Map(existingAccounts.map((a) => [a.code, a]));

      const toInsert = accountsToSeed.filter((a) => !existingMap.has(a.code));
      const toUpdate = accountsToSeed.filter((a) => {
        const ex = existingMap.get(a.code);
        if (!ex) return false;
        return ex.name !== a.name || ex.description !== a.description || (ex as any).nature !== a.nature;
      });

      console.log(`   Existing: ${existingMap.size} | To insert: ${toInsert.length} | To update: ${toUpdate.length} | Total in seed: ${accountsToSeed.length}`);

      let inserted = 0;
      for (const accountData of toInsert) {
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
        account.parentAccountId = null;
        account.balance = 0;
        account.isActive = true;
        account.allowsMovements = accountData.allowsMovements;
        await accountRepo.save(account);
        inserted++;
      }

      let updated = 0;
      for (const accountData of toUpdate) {
        const existing = existingMap.get(accountData.code)!;
        await accountRepo.update(
          { id: existing.id },
          { name: accountData.name, description: accountData.description, nature: accountData.nature as any, allowsMovements: accountData.allowsMovements },
        );
        updated++;
      }

      console.log(`✅ Inserted ${inserted} new | Updated ${updated} names for company ${company.name}`);
    }

    console.log('🎉 Seeding completed successfully!');
    console.log(`   - Total accounts seeded: ${(await accountRepo.find()).length}`);
  } catch (error) {
    console.error('❌ Error seeding accounts:', error);
  } finally {
    await app.close();
  }
}

// Ejecutar
seedAccounts2016().catch(console.error);
