/**
 * Fichero de acreditación de salarios para el banco en formato dBase
 * (Visual FoxPro), con la misma estructura que la muestra entregada por el
 * banco (`nominalimpia.dbf`):
 *
 *   NUM_IDEPER  C 15   carné de identidad del trabajador
 *   CTA_MNAC    C 16   cuenta o tarjeta en moneda nacional
 *   IMPORTE_N   N 16,2 importe a acreditar en CUP
 *   CTA_MLC     C 16   cuenta en MLC (vacía)
 *   IMPORTE_D   N 16,2 importe en MLC (0.00)
 *   COD_TIPID   C 2    tipo de identificación ('CI')
 *   COD_PAEXID  C 3    código fijo '247'
 */

export interface AccreditationDbfRow {
  documentId: string;
  bankAccount: string;
  amount: number;
}

interface DbfField {
  name: string;
  type: 'C' | 'N';
  length: number;
  decimals: number;
}

const FIELDS: DbfField[] = [
  { name: 'NUM_IDEPER', type: 'C', length: 15, decimals: 0 },
  { name: 'CTA_MNAC', type: 'C', length: 16, decimals: 0 },
  { name: 'IMPORTE_N', type: 'N', length: 16, decimals: 2 },
  { name: 'CTA_MLC', type: 'C', length: 16, decimals: 0 },
  { name: 'IMPORTE_D', type: 'N', length: 16, decimals: 2 },
  { name: 'COD_TIPID', type: 'C', length: 2, decimals: 0 },
  { name: 'COD_PAEXID', type: 'C', length: 3, decimals: 0 },
];

/** Tipo de identificación y código que la muestra del banco fija en cada fila. */
export const ACCREDITATION_ID_TYPE = 'CI';
export const ACCREDITATION_COUNTRY_CODE = '247';

/** Visual FoxPro reserva 263 bytes tras los descriptores (backlink a la base). */
const VFP_BACKLINK_SIZE = 263;
const HEADER_PREFIX_SIZE = 32;
const FIELD_DESCRIPTOR_SIZE = 32;
/** Windows ANSI (cp1252), el mismo marcador de idioma que trae la muestra. */
const LANGUAGE_DRIVER = 0x03;

function charField(value: string, length: number): string {
  return value.slice(0, length).padEnd(length, ' ');
}

function numericField(value: number, length: number, decimals: number): string {
  const text = (Math.round(value * 100) / 100).toFixed(decimals);
  if (text.length > length) {
    throw new Error(`El importe ${text} no cabe en ${length} posiciones`);
  }
  return text.padStart(length, ' ');
}

export function buildAccreditationDbf(
  rows: AccreditationDbfRow[],
  date: Date = new Date(),
): Buffer {
  const recordLength = 1 + FIELDS.reduce((s, f) => s + f.length, 0);
  const headerLength =
    HEADER_PREFIX_SIZE +
    FIELDS.length * FIELD_DESCRIPTOR_SIZE +
    1 +
    VFP_BACKLINK_SIZE;

  const header = Buffer.alloc(headerLength, 0);
  header[0] = 0x30; // Visual FoxPro
  // La muestra del banco guarda el año con dos dígitos (2025 → 25).
  header[1] = date.getFullYear() % 100;
  header[2] = date.getMonth() + 1;
  header[3] = date.getDate();
  header.writeUInt32LE(rows.length, 4);
  header.writeUInt16LE(headerLength, 8);
  header.writeUInt16LE(recordLength, 10);
  header[29] = LANGUAGE_DRIVER;

  let displacement = 1;
  FIELDS.forEach((field, index) => {
    const offset = HEADER_PREFIX_SIZE + index * FIELD_DESCRIPTOR_SIZE;
    header.write(field.name, offset, 'latin1');
    header[offset + 11] = field.type.charCodeAt(0);
    header.writeUInt32LE(displacement, offset + 12);
    header[offset + 16] = field.length;
    header[offset + 17] = field.decimals;
    displacement += field.length;
  });
  header[HEADER_PREFIX_SIZE + FIELDS.length * FIELD_DESCRIPTOR_SIZE] = 0x0d;

  const records = rows.map((row) => {
    const values = [
      charField(row.documentId, 15),
      charField(row.bankAccount, 16),
      numericField(row.amount, 16, 2),
      charField('', 16),
      numericField(0, 16, 2),
      ACCREDITATION_ID_TYPE,
      ACCREDITATION_COUNTRY_CODE,
    ];
    return Buffer.from(' ' + values.join(''), 'latin1');
  });

  return Buffer.concat([header, ...records, Buffer.from([0x1a])]);
}
