/**
 * Catálogo oficial de tipos de movimiento de inventario
 * Basado en normativa contable cubana (NCC)
 *
 * Estructura de códigos:
 *   Entradas: 1xx (Insumo), 2xx (Mercancía), 3xx (Producción), 4xx (Presupuesto)
 *   Salidas:  1xxx (Insumo), 2xxx (Mercancía), 3xxx (Producción)
 */

export type MovementDirection = 'entry' | 'exit';
export type InventoryCategory = 'insumo' | 'mercancia' | 'produccion';

export interface MovementTypeDefinition {
  code: string;
  description: string;
  direction: MovementDirection;
  category: InventoryCategory;
}

// ══════════════════════════════════════════════════════════
// ── ENTRADAS ──
// ══════════════════════════════════════════════════════════

const ENTRY_TYPES: MovementTypeDefinition[] = [
  // ── Insumo (101–112) ──
  { code: '101', description: 'Carga inicial de inventarios en almacén', direction: 'entry', category: 'insumo' },
  { code: '102', description: 'Compras a proveedores (EMP)', direction: 'entry', category: 'insumo' },
  { code: '103', description: 'Transferencia recibida en almacén', direction: 'entry', category: 'insumo' },
  { code: '105', description: 'Sobrante en inventario sujeto a investigación', direction: 'entry', category: 'insumo' },
  { code: '106', description: 'Devolución de ventas efectuadas a trabajadores', direction: 'entry', category: 'insumo' },
  { code: '107', description: 'Devolución de ventas a entidades', direction: 'entry', category: 'insumo' },
  { code: '108', description: 'Entrada de centro de costo', direction: 'entry', category: 'insumo' },
  { code: '112', description: 'Donaciones recibidas', direction: 'entry', category: 'insumo' },
  { code: '113', description: 'Ajuste de inventario (entrada)', direction: 'entry', category: 'insumo' },

  // ── Mercancía (201–210) ──
  { code: '201', description: 'Carga inicial de inventarios en almacén', direction: 'entry', category: 'mercancia' },
  { code: '202', description: 'Compras a proveedores (EMP)', direction: 'entry', category: 'mercancia' },
  { code: '203', description: 'Transferencia recibida en almacén', direction: 'entry', category: 'mercancia' },
  { code: '205', description: 'Sobrante en inventario sujeto a investigación', direction: 'entry', category: 'mercancia' },
  { code: '206', description: 'Devolución de ventas efectuadas a trabajadores', direction: 'entry', category: 'mercancia' },
  { code: '207', description: 'Devolución de ventas a entidades', direction: 'entry', category: 'mercancia' },
  { code: '208', description: 'Entrada de centro de costo', direction: 'entry', category: 'mercancia' },
  { code: '210', description: 'Entrada de almacén de producción terminados', direction: 'entry', category: 'mercancia' },
  { code: '213', description: 'Ajuste de inventario (entrada)', direction: 'entry', category: 'mercancia' },

  // ── Insumo (301) ──
  { code: '301', description: 'Carga inicial de inventarios en almacén', direction: 'entry', category: 'insumo' },

  // ── Producción (305–311) ──
  { code: '305', description: 'Sobrante en inventario sujeto a investigación', direction: 'entry', category: 'produccion' },
  { code: '306', description: 'Devolución de ventas efectuadas a trabajadores', direction: 'entry', category: 'produccion' },
  { code: '307', description: 'Devolución de ventas a entidades', direction: 'entry', category: 'produccion' },
  { code: '308', description: 'Entrada de centro de costo', direction: 'entry', category: 'produccion' },
  { code: '310', description: 'Entrada al almacén de producción terminados', direction: 'entry', category: 'produccion' },
  { code: '311', description: 'Ajuste incremento al terminar el proceso', direction: 'entry', category: 'produccion' },
  { code: '313', description: 'Ajuste de inventario (entrada)', direction: 'entry', category: 'produccion' },

  // ── Mercancía presupuesto (402) ──
  { code: '402', description: 'Compras a proveedores (Presup.)', direction: 'entry', category: 'mercancia' },
];

// ══════════════════════════════════════════════════════════
// ── SALIDAS ──
// ══════════════════════════════════════════════════════════

const EXIT_TYPES: MovementTypeDefinition[] = [
  // ── Insumo (1101–1107) ──
  { code: '1101', description: 'Venta a trabajadores', direction: 'exit', category: 'insumo' },
  { code: '1102', description: 'Transferencia enviadas', direction: 'exit', category: 'insumo' },
  { code: '1104', description: 'Faltante en inventario', direction: 'exit', category: 'insumo' },
  { code: '1105', description: 'Salida a centro de costo', direction: 'exit', category: 'insumo' },
  { code: '1106', description: 'Salida para custodio', direction: 'exit', category: 'insumo' },
  { code: '1107', description: 'Devolución de compra a entidades', direction: 'exit', category: 'insumo' },
  { code: '1110', description: 'Ajuste de inventario (salida)', direction: 'exit', category: 'insumo' },

  // ── Mercancía (2100–2109) ──
  { code: '2100', description: 'Ventas a clientes', direction: 'exit', category: 'mercancia' },
  { code: '2101', description: 'Venta a trabajadores', direction: 'exit', category: 'mercancia' },
  { code: '2102', description: 'Transferencia enviadas', direction: 'exit', category: 'mercancia' },
  { code: '2104', description: 'Faltante en inventario', direction: 'exit', category: 'mercancia' },
  { code: '2105', description: 'Salida a centro de costo', direction: 'exit', category: 'mercancia' },
  { code: '2107', description: 'Devolución de compra a entidades', direction: 'exit', category: 'mercancia' },
  { code: '2108', description: 'Salida de producción terminados del almacén', direction: 'exit', category: 'mercancia' },
  { code: '2109', description: 'Salida de producción terminados del almacén', direction: 'exit', category: 'mercancia' },
  { code: '2110', description: 'Ajuste de inventario (salida)', direction: 'exit', category: 'mercancia' },

  // ── Producción (3100–3109) ──
  { code: '3100', description: 'Ventas a clientes', direction: 'exit', category: 'produccion' },
  { code: '3101', description: 'Venta a trabajadores', direction: 'exit', category: 'produccion' },
  { code: '3102', description: 'Transferencia enviadas', direction: 'exit', category: 'produccion' },
  { code: '3104', description: 'Faltante en inventario', direction: 'exit', category: 'produccion' },
  { code: '3105', description: 'Salida a centro de costo', direction: 'exit', category: 'produccion' },
  { code: '3109', description: 'Ajuste disminución al terminar el proceso', direction: 'exit', category: 'produccion' },
  { code: '3110', description: 'Ajuste de inventario (salida)', direction: 'exit', category: 'produccion' },
];

/** Códigos de ajuste de inventario por dirección. */
export const ADJUSTMENT_ENTRY_CODES = ['113', '213', '313'];
export const ADJUSTMENT_EXIT_CODES = ['1110', '2110', '3110'];

export function isAdjustmentCode(code: string): boolean {
  return ADJUSTMENT_ENTRY_CODES.includes(code) || ADJUSTMENT_EXIT_CODES.includes(code);
}

/**
 * Códigos de devolución.
 *
 * La devolución no es un tipo de operación aparte: es un movimiento de entrada o
 * de salida cuyo código pertenece a estas listas. El reporte de devolución
 * (WarehouseReturn) y la cancelación de la cuenta correspondiente se derivan del
 * código, no de un formulario separado.
 */

/** Salidas por devolución de compra a entidades (proveedores). */
export const PURCHASE_RETURN_EXIT_CODES = ['1107', '2107'];

/** Entradas por devolución de ventas efectuadas a trabajadores. */
export const WORKER_SALES_RETURN_ENTRY_CODES = ['106', '206', '306'];

/** Entradas por devolución de ventas a entidades (clientes). */
export const ENTITY_SALES_RETURN_ENTRY_CODES = ['107', '207', '307'];

/** Todas las entradas por devolución de ventas. */
export const SALES_RETURN_ENTRY_CODES = [
  ...WORKER_SALES_RETURN_ENTRY_CODES,
  ...ENTITY_SALES_RETURN_ENTRY_CODES,
];

/** Indica si el código corresponde a cualquier tipo de devolución. */
export function isReturnCode(code: string): boolean {
  return (
    PURCHASE_RETURN_EXIT_CODES.includes(code) ||
    SALES_RETURN_ENTRY_CODES.includes(code)
  );
}

/** Devolución de compra al proveedor: cancela la cuenta por pagar. */
export function isPurchaseReturnCode(code: string): boolean {
  return PURCHASE_RETURN_EXIT_CODES.includes(code);
}

/** Devolución de venta del cliente: cancela la cuenta por cobrar. */
export function isSalesReturnCode(code: string): boolean {
  return SALES_RETURN_ENTRY_CODES.includes(code);
}

/** Solo las devoluciones de ventas a entidades cancelan cuenta por cobrar. */
export function isEntitySalesReturnCode(code: string): boolean {
  return ENTITY_SALES_RETURN_ENTRY_CODES.includes(code);
}

// ══════════════════════════════════════════════════════════
// ── CATÁLOGO COMPLETO ──
// ══════════════════════════════════════════════════════════

export const MOVEMENT_TYPES_CATALOG: MovementTypeDefinition[] = [
  ...ENTRY_TYPES,
  ...EXIT_TYPES,
];

/** Mapa indexado por código para búsquedas rápidas */
export const MOVEMENT_TYPE_MAP: Record<string, MovementTypeDefinition> =
  Object.fromEntries(MOVEMENT_TYPES_CATALOG.map((t) => [t.code, t]));

// ══════════════════════════════════════════════════════════
// ── HELPERS ──
// ══════════════════════════════════════════════════════════

export function getMovementType(code: string): MovementTypeDefinition | undefined {
  return MOVEMENT_TYPE_MAP[code];
}

export function getEntryTypes(category?: InventoryCategory): MovementTypeDefinition[] {
  const entries = MOVEMENT_TYPES_CATALOG.filter((t) => t.direction === 'entry');
  return category ? entries.filter((t) => t.category === category) : entries;
}

export function getExitTypes(category?: InventoryCategory): MovementTypeDefinition[] {
  const exits = MOVEMENT_TYPES_CATALOG.filter((t) => t.direction === 'exit');
  return category ? exits.filter((t) => t.category === category) : exits;
}

export function isEntryCode(code: string): boolean {
  return MOVEMENT_TYPE_MAP[code]?.direction === 'entry';
}

export function isExitCode(code: string): boolean {
  return MOVEMENT_TYPE_MAP[code]?.direction === 'exit';
}

/**
 * Mapeo de tipo de movimiento → cuentas contables (Nomenclador cubano 2016)
 *
 * Cada movimiento tiene una cuenta de débito y una de crédito.
 * Los códigos deben coincidir con el plan de cuentas seeded en seed-accounts-2016.ts.
 */
export interface AccountingEntry {
  debitAccountCode: string;
  creditAccountCode: string;
  description: string;
}

/**
 * Devuelve la cuenta contable de INVENTARIO según la categoría.
 * Nomenclador cubano 2016:
 *   183 = Materias Primas y Materiales (Insumo)
 *   189 = Mercancías para la Venta (Mercancía)
 *   188 = Producción Terminada (Producción)
 */
export function getInventoryAccountByCategory(category: InventoryCategory): string {
  switch (category) {
    case 'insumo':     return '183';
    case 'mercancia':  return '189';
    case 'produccion': return '188';
  }
}

/**
 * Devuelve la cuenta contable de COSTO DE VENTAS según la categoría del
 * inventario vendido. Nomenclador cubano 2016:
 *   810 = Costo de Ventas de la Producción   → producción terminada (188)
 *   814 = Costo de Ventas de Mercancías      → mercancía para la venta (189)
 *   Insumo (183): no tiene cuenta propia de costo de venta porque no se
 *   vende habitualmente; si se vende, se trata como producción (810) y el
 *   contador puede sobreescribirlo por mapeo de empresa.
 */
export function getCostOfSalesAccountByCategory(category: InventoryCategory): string {
  switch (category) {
    case 'mercancia':  return '814';
    case 'produccion': return '810';
    case 'insumo':     return '810';
  }
}

export function getAccountingEntryForMovement(code: string): AccountingEntry | null {
  const type = MOVEMENT_TYPE_MAP[code];
  if (!type) return null;

  // ── ENTRADAS ──
  // Compras (102, 202, 402): Débito Inventario / Crédito Cuentas por Pagar
  if (['102', '202', '402'].includes(code)) {
    const inventoryAccount = getInventoryAccountByCategory(type.category);
    return {
      debitAccountCode: inventoryAccount,
      creditAccountCode: '410',  // Cuentas por Pagar a Proveedores
      description: type.description,
    };
  }

  // Carga inicial (101, 201, 301): Débito Inventario / Crédito Capital (patrimonio)
  if (['101', '201', '301'].includes(code)) {
    const inventoryAccount = getInventoryAccountByCategory(type.category);
    return {
      debitAccountCode: inventoryAccount,
      creditAccountCode: '600',  // Inversión Estatal
      description: type.description,
    };
  }

  // Transferencia recibida (103, 203): Débito Inventario destino / Crédito Inventario origen
  if (['103', '203'].includes(code)) {
    const inventoryAccount = getInventoryAccountByCategory(type.category);
    return {
      debitAccountCode: inventoryAccount,
      creditAccountCode: inventoryAccount, // Se ajusta en runtime con almacén origen
      description: type.description,
    };
  }

  // Sobrante (105, 205, 305): Débito Inventario / Crédito Sobrantes en Investigación
  if (['105', '205', '305'].includes(code)) {
    const inventoryAccount = getInventoryAccountByCategory(type.category);
    return {
      debitAccountCode: inventoryAccount,
      creditAccountCode: '555',  // Sobrantes en Investigación
      description: type.description,
    };
  }

  // Devolución de ventas a trabajadores (106, 206, 306): Débito Inventario / Crédito Costo Venta
  // El reverso del costo se hace contra la cuenta de costo de venta que se usó
  // al emitir la factura, no contra ventas: así el gasto y su reverso quedan en
  // la misma cuenta y no inflan el resultado del período.
  if (['106', '206', '306'].includes(code)) {
    const inventoryAccount = getInventoryAccountByCategory(type.category);
    return {
      debitAccountCode: inventoryAccount,
      creditAccountCode: getCostOfSalesAccountByCategory(type.category),
      description: type.description,
    };
  }

  // Devolución de ventas a entidades (107, 207, 307): Débito Inventario / Crédito Costo Venta
  if (['107', '207', '307'].includes(code)) {
    const inventoryAccount = getInventoryAccountByCategory(type.category);
    return {
      debitAccountCode: inventoryAccount,
      creditAccountCode: getCostOfSalesAccountByCategory(type.category),
      description: type.description,
    };
  }

  // Entrada de centro de costo (108, 208, 308): Débito Inventario / Crédito Gasto
  if (['108', '208', '308'].includes(code)) {
    const inventoryAccount = getInventoryAccountByCategory(type.category);
    return {
      debitAccountCode: inventoryAccount,
      creditAccountCode: '731',  // Gastos de Materiales
      description: type.description,
    };
  }

  // Donaciones recibidas (112): Débito Inventario / Crédito Donaciones
  if (code === '112') {
    return {
      debitAccountCode: '183',
      creditAccountCode: '620',  // Donaciones Recibidas
      description: type.description,
    };
  }

  // Entrada almacén producción terminados (210, 310): Débito Prod Terminada / Crédito Producción en Proceso
  if (['210', '310'].includes(code)) {
    return {
      debitAccountCode: '188',  // Producción Terminada
      creditAccountCode: '700',  // Producción Principal en Proceso
      description: type.description,
    };
  }

  // Ajuste de inventario entrada (113, 213, 313):
  //   Débito Inventario / Crédito 555 Sobrantes en Investigación
  if (ADJUSTMENT_ENTRY_CODES.includes(code)) {
    const inventoryAccount = getInventoryAccountByCategory(type.category);
    return {
      debitAccountCode: inventoryAccount,
      creditAccountCode: '555',
      description: type.description,
    };
  }

  // Ajuste incremento (311): Débito Inventario / Crédito Ajuste
  if (code === '311') {
    return {
      debitAccountCode: '188',  // Producción Terminada
      creditAccountCode: '700',  // Producción en Proceso
      description: type.description,
    };
  }

  // ── SALIDAS ──
  // Ventas a clientes (2100, 3100):
  //   DEBE Costo de Ventas de la categoría (810 prod, 814 mercancía)
  //   HABER Inventario de la categoría (188 prod, 189 mercancía)
  if (['2100', '3100'].includes(code)) {
    return {
      debitAccountCode: getCostOfSalesAccountByCategory(type.category),
      creditAccountCode: getInventoryAccountByCategory(type.category),
      description: type.description,
    };
  }

  // Venta a trabajadores (1101, 2101, 3101): igual que ventas a clientes,
  //   DEBE Costo de Ventas de la categoría / HABER Inventario de la categoría
  if (['1101', '2101', '3101'].includes(code)) {
    return {
      debitAccountCode: getCostOfSalesAccountByCategory(type.category),
      creditAccountCode: getInventoryAccountByCategory(type.category),
      description: type.description,
    };
  }

  // Transferencia enviada (1102, 2102, 3102): Débito Inventario destino / Crédito Inventario origen
  if (['1102', '2102', '3102'].includes(code)) {
    const inventoryAccount = getInventoryAccountByCategory(type.category);
    return {
      debitAccountCode: inventoryAccount,
      creditAccountCode: inventoryAccount,
      description: type.description,
    };
  }

  // Faltante en inventario (1104, 2104, 3104):
  //   Débito 332 Faltantes de Bienes en Investigación / Crédito Inventario
  //
  // El faltante NO se reconoce como gasto al detectarse: conforme a la
  // Res. 13/2006 MFP debe permanecer en investigación hasta que concluya el
  // expediente, y solo entonces se traslada a gasto (850) o al responsable
  // (335). Ese traslado lo realiza MovementsService.resolveShortage().
  if (['1104', '2104', '3104'].includes(code)) {
    const inventoryAccount = getInventoryAccountByCategory(type.category);
    return {
      debitAccountCode: '332',
      creditAccountCode: inventoryAccount,
      description: type.description,
    };
  }

  // Salida a centro de costo (1105, 2105, 3105): Débito Gasto / Crédito Inventario
  if (['1105', '2105', '3105'].includes(code)) {
    const inventoryAccount = getInventoryAccountByCategory(type.category);
    return {
      debitAccountCode: '731',  // Gastos de Materiales
      creditAccountCode: inventoryAccount,
      description: type.description,
    };
  }

  // Salida para custodio (1106): Débito Útiles en Uso / Crédito Inventario
  if (code === '1106') {
    return {
      debitAccountCode: '187',  // Útiles y Herramientas en Uso
      creditAccountCode: '183',
      description: type.description,
    };
  }

  // Devolución compra a entidades (1107, 2107): Débito Ctas por Pagar / Crédito Inventario
  if (['1107', '2107'].includes(code)) {
    const inventoryAccount = getInventoryAccountByCategory(type.category);
    return {
      debitAccountCode: '410',  // Cuentas por Pagar a Proveedores
      creditAccountCode: inventoryAccount,
      description: type.description,
    };
  }

  // Salida prod terminados (2108, 2109): Débito Costo Ventas / Crédito Prod Terminada
  if (['2108', '2109'].includes(code)) {
    return {
      debitAccountCode: getCostOfSalesAccountByCategory(type.category),
      creditAccountCode: '188',  // Producción Terminada
      description: type.description,
    };
  }

  // Ajuste de inventario salida (1110, 2110, 3110):
  //   Débito 332 Faltantes de Bienes en Investigación / Crédito Inventario
  if (ADJUSTMENT_EXIT_CODES.includes(code)) {
    const inventoryAccount = getInventoryAccountByCategory(type.category);
    return {
      debitAccountCode: '332',
      creditAccountCode: inventoryAccount,
      description: type.description,
    };
  }

  // Ajuste disminución (3109): Débito Producción en Proceso / Crédito Inventario
  if (code === '3109') {
    return {
      debitAccountCode: '700',
      creditAccountCode: '188',
      description: type.description,
    };
  }

  return null;
}

/**
 * Mapeo de códigos de transferencia: salida → entrada correspondiente.
 * Cada transferencia entre almacenes genera 2 movimientos:
 *   - Salida del almacén origen (código de salida)
 *   - Entrada al almacén destino (código de entrada)
 */
const TRANSFER_EXIT_TO_ENTRY: Record<string, string> = {
  '1102': '103',
  '2102': '203',
  '3102': '308',
};

export function getTransferEntryCode(exitCode: string): string | null {
  return TRANSFER_EXIT_TO_ENTRY[exitCode] || null;
}

export function isTransferExitCode(code: string): boolean {
  return ['1102', '2102', '3102'].includes(code);
}

export const TRANSFER_EXIT_CODES = Object.keys(TRANSFER_EXIT_TO_ENTRY);
export const TRANSFER_ENTRY_CODES = Object.values(TRANSFER_EXIT_TO_ENTRY);

export function isTransferEntryCode(code: string): boolean {
  return TRANSFER_ENTRY_CODES.includes(code);
}