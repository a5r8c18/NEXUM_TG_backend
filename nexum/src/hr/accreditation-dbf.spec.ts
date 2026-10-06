import { buildAccreditationDbf } from './accreditation-dbf';

/**
 * El fichero debe tener exactamente la estructura de la muestra del banco
 * (nominalimpia.dbf, Visual FoxPro): cabecera de 520 bytes, registros de 85
 * y los siete campos en el mismo orden y ancho.
 */
describe('Fichero DBF de acreditación bancaria', () => {
  const rows = [
    { documentId: '88021108437', bankAccount: '0598712087525119', amount: 17913 },
    { documentId: '69073031980', bankAccount: '0598712009633912', amount: 7273.8 },
  ];
  const file = buildAccreditationDbf(rows, new Date(2025, 0, 30));

  function fields() {
    const out: { name: string; type: string; len: number; dec: number }[] = [];
    for (let o = 32; file[o] !== 0x0d; o += 32) {
      out.push({
        name: file.subarray(o, o + 11).toString('latin1').replace(/\0.*$/, ''),
        type: String.fromCharCode(file[o + 11]),
        len: file[o + 16],
        dec: file[o + 17],
      });
    }
    return out;
  }

  function record(index: number) {
    const start = 520 + index * 85;
    return file.subarray(start, start + 85).toString('latin1');
  }

  it('reproduce la cabecera Visual FoxPro de la muestra', () => {
    expect(file[0]).toBe(0x30);
    expect([file[1], file[2], file[3]]).toEqual([25, 1, 30]);
    expect(file.readUInt32LE(4)).toBe(2);
    expect(file.readUInt16LE(8)).toBe(520);
    expect(file.readUInt16LE(10)).toBe(85);
    expect(file[29]).toBe(0x03);
    expect(file.length).toBe(520 + 2 * 85 + 1);
    expect(file[file.length - 1]).toBe(0x1a);
  });

  it('declara los siete campos del banco en su orden y ancho', () => {
    expect(fields()).toEqual([
      { name: 'COD_TIPID', type: 'C', len: 2, dec: 0 },
      { name: 'COD_PAEXID', type: 'C', len: 3, dec: 0 },
      { name: 'NUM_IDEPER', type: 'C', len: 15, dec: 0 },
      { name: 'CTA_MNAC', type: 'C', len: 16, dec: 0 },
      { name: 'IMPORTE_N', type: 'N', len: 16, dec: 2 },
      { name: 'CTA_MLC', type: 'C', len: 16, dec: 0 },
      { name: 'IMPORTE_D', type: 'N', len: 16, dec: 2 },
    ]);
  });

  it('escribe CI, cuenta e importe con los rellenos de la muestra', () => {
    expect(record(0)).toBe(
      ' ' +
        'CI' +
        '247' +
        '88021108437    ' +
        '0598712087525119' +
        '        17913.00' +
        '                ' +
        '            0.00',
    );
    expect(record(1).slice(37, 53)).toBe('         7273.80');
  });
});
