/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { Injectable } from '@nestjs/common';
import * as puppeteer from 'puppeteer';
import * as fs from 'fs';
import * as path from 'path';

export interface Efe5920Data {
  informeCorrespondiente: string;
  codigoCentroInformante: string;
  centroInformante: string;

  activos: {
    activosCirculantes: { planAnual: number; apertura: number; real: number };
    efectivoCaja: { planAnual: number; apertura: number; real: number };
    efectivoBanco: { planAnual: number; apertura: number; real: number };
    cuentasXCobrarCP: { planAnual: number; apertura: number; real: number };
    pagosAnticipadosSuministros: {
      planAnual: number;
      apertura: number;
      real: number;
    };
    adeudosPresupuesto: { planAnual: number; apertura: number; real: number };
    totalInventarios: { planAnual: number; apertura: number; real: number };
    materiasPrimas: { planAnual: number; apertura: number; real: number };
    utilesHerramientas: { planAnual: number; apertura: number; real: number };
    alimentos: { planAnual: number; apertura: number; real: number };
    activosFijos: { planAnual: number; apertura: number; real: number };
    activosFijosTangibles: {
      planAnual: number;
      apertura: number;
      real: number;
    };
    depreciacionAFT: { planAnual: number; apertura: number; real: number };
    activosDiferidos: { planAnual: number; apertura: number; real: number };
    gastosFaltantesDiferidos: {
      planAnual: number;
      apertura: number;
      real: number;
    };
    otrosActivos: { planAnual: number; apertura: number; real: number };
    cuentasXCobrarDiversas: {
      planAnual: number;
      apertura: number;
      real: number;
    };
    totalActivo: { planAnual: number; apertura: number; real: number };
  };

  pasivos: {
    pasivosCirculantes: { planAnual: number; apertura: number; real: number };
    cuentasXPagarCP: { planAnual: number; apertura: number; real: number };
    dividendosXPagar: { planAnual: number; apertura: number; real: number };
    obligacionesPresupuesto: {
      planAnual: number;
      apertura: number;
      real: number;
    };
    nominasXPagar: { planAnual: number; apertura: number; real: number };
    gastosAcumuladosXPagar: {
      planAnual: number;
      apertura: number;
      real: number;
    };
    provisionVacaciones: { planAnual: number; apertura: number; real: number };
    provisionSeguridadSocial: {
      planAnual: number;
      apertura: number;
      real: number;
    };
    otrosPasivos: { planAnual: number; apertura: number; real: number };
    cuentasXPagarDiversas: {
      planAnual: number;
      apertura: number;
      real: number;
    };
    totalPasivo: { planAnual: number; apertura: number; real: number };
  };

  patrimonio: {
    inversionEstatal: { planAnual: number; apertura: number; real: number };
    reservasContingencias: {
      planAnual: number;
      apertura: number;
      real: number;
    };
    otrasReservas: { planAnual: number; apertura: number; real: number };
    pagoUtilidades: { planAnual: number; apertura: number; real: number };
    pagoDividendos: { planAnual: number; apertura: number; real: number };
    resultadoPeriodo: { planAnual: number; apertura: number; real: number };
    totalPatrimonio: { planAnual: number; apertura: number; real: number };
    totalPasivoYPatrimonio: {
      planAnual: number;
      apertura: number;
      real: number;
    };
  };

  hechoNombre: string;
  aprobadoNombre: string;
  fechaDia: string;
  fechaMes: string;
  fechaAnio: string;
  observaciones?: string;
}

export interface Efe5921Data {
  informeCorrespondiente: string;
  codigoCentroInformante: string;
  centroInformante: string;

  ingresos: {
    ingresosOperacionales: {
      planAnual: number;
      apertura: number;
      real: number;
    };
    ventasBienesServicios: {
      planAnual: number;
      apertura: number;
      real: number;
    };
    ingresosActividadesFinancieras: {
      planAnual: number;
      apertura: number;
      real: number;
    };
    ingresosFinancierasPresupuesto: {
      planAnual: number;
      apertura: number;
      real: number;
    };
    ingresosSubvenciones: { planAnual: number; apertura: number; real: number };
    otrosIngresosOperacionales: {
      planAnual: number;
      apertura: number;
      real: number;
    };
  };

  gastos: {
    gastosOperacionales: { planAnual: number; apertura: number; real: number };
    costoVentas: { planAnual: number; apertura: number; real: number };
    gastosPersonal: { planAnual: number; apertura: number; real: number };
    gastosSuministrosServicios: {
      planAnual: number;
      apertura: number;
      real: number;
    };
    gastosActivosFijos: { planAnual: number; apertura: number; real: number };
    otrosGastosOperacionales: {
      planAnual: number;
      apertura: number;
      real: number;
    };
  };

  ingresosNoOperacionales: {
    ingresosNoOperacionales: {
      planAnual: number;
      apertura: number;
      real: number;
    };
    ventaActivosFijos: { planAnual: number; apertura: number; real: number };
    otrosIngresosNoOperacionales: {
      planAnual: number;
      apertura: number;
      real: number;
    };
  };

  gastosNoOperacionales: {
    gastosNoOperacionales: {
      planAnual: number;
      apertura: number;
      real: number;
    };
    ventaActivosFijosGastos: {
      planAnual: number;
      apertura: number;
      real: number;
    };
    otrosGastosNoOperacionales: {
      planAnual: number;
      apertura: number;
      real: number;
    };
  };

  resultado: {
    resultadoOperacional: { planAnual: number; apertura: number; real: number };
    resultadoAntesImpuestos: {
      planAnual: number;
      apertura: number;
      real: number;
    };
    impuestoRenta: { planAnual: number; apertura: number; real: number };
    resultadoNeto: { planAnual: number; apertura: number; real: number };
  };

  hechoNombre: string;
  aprobadoNombre: string;
  fechaDia: string;
  fechaMes: string;
  fechaAnio: string;
  observaciones?: string;
}

export interface Efe5924Data {
  informeCorrespondiente: string;
  codigoCentroInformante: string;
  centroInformante: string;

  gastos: {
    salariosSueldos: {
      planAnual: number;
      apertura: number;
      real: number;
      porcPlan: number;
      porcApertura: number;
      porcReal: number;
    };
    horasExtraordinarias: {
      planAnual: number;
      apertura: number;
      real: number;
      porcPlan: number;
      porcApertura: number;
      porcReal: number;
    };
    seguridadSocial: {
      planAnual: number;
      apertura: number;
      real: number;
      porcPlan: number;
      porcApertura: number;
      porcReal: number;
    };
    materiasPrimas: {
      planAnual: number;
      apertura: number;
      real: number;
      porcPlan: number;
      porcApertura: number;
      porcReal: number;
    };
    materialesConstruccion: {
      planAnual: number;
      apertura: number;
      real: number;
      porcPlan: number;
      porcApertura: number;
      porcReal: number;
    };
    suministrosOficina: {
      planAnual: number;
      apertura: number;
      real: number;
      porcPlan: number;
      porcApertura: number;
      porcReal: number;
    };
    serviciosBasicos: {
      planAnual: number;
      apertura: number;
      real: number;
      porcPlan: number;
      porcApertura: number;
      porcReal: number;
    };
    mantenimientoReparaciones: {
      planAnual: number;
      apertura: number;
      real: number;
      porcPlan: number;
      porcApertura: number;
      porcReal: number;
    };
    serviciosProfesionales: {
      planAnual: number;
      apertura: number;
      real: number;
      porcPlan: number;
      porcApertura: number;
      porcReal: number;
    };
    depreciacionActivosFijos: {
      planAnual: number;
      apertura: number;
      real: number;
      porcPlan: number;
      porcApertura: number;
      porcReal: number;
    };
    amortizacionActivosIntangibles: {
      planAnual: number;
      apertura: number;
      real: number;
      porcPlan: number;
      porcApertura: number;
      porcReal: number;
    };
    gastosRepresentacion: {
      planAnual: number;
      apertura: number;
      real: number;
      porcPlan: number;
      porcApertura: number;
      porcReal: number;
    };
    gastosTransporte: {
      planAnual: number;
      apertura: number;
      real: number;
      porcPlan: number;
      porcApertura: number;
      porcReal: number;
    };
    gastosComunicacion: {
      planAnual: number;
      apertura: number;
      real: number;
      porcPlan: number;
      porcApertura: number;
      porcReal: number;
    };
  };

  totales: {
    planAnual: number;
    apertura: number;
    real: number;
  };

  hechoNombre: string;
  aprobadoNombre: string;
  fechaDia: string;
  fechaMes: string;
  fechaAnio: string;
  observaciones?: string;
}

@Injectable()
export class PdfService {
  private templatePath = path.join(
    __dirname,
    'templates',
    '5920.template.html',
  );

  private fmt(value: number): string {
    if (value === 0 || value === null || value === undefined) return '0.00';
    return value.toLocaleString('es-CU', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  private buildHtml(data: Efe5920Data): string {
    const template = fs.readFileSync(this.templatePath, 'utf-8');
    const a = data.activos;
    const p = data.pasivos;
    const pa = data.patrimonio;

    const replacements: Record<string, string> = {
      '{{informeCorrespondiente}}': data.informeCorrespondiente,
      '{{codigoCentroInformante}}': data.codigoCentroInformante,
      '{{centroInformante}}': data.centroInformante,

      '{{planAnual_1}}': this.fmt(a.activosCirculantes.planAnual),
      '{{apertura_1}}': this.fmt(a.activosCirculantes.apertura),
      '{{real_1}}': this.fmt(a.activosCirculantes.real),

      '{{planAnual_2}}': this.fmt(a.efectivoCaja.planAnual),
      '{{apertura_2}}': this.fmt(a.efectivoCaja.apertura),
      '{{real_2}}': this.fmt(a.efectivoCaja.real),

      '{{planAnual_3}}': this.fmt(a.efectivoBanco.planAnual),
      '{{apertura_3}}': this.fmt(a.efectivoBanco.apertura),
      '{{real_3}}': this.fmt(a.efectivoBanco.real),

      '{{planAnual_8}}': this.fmt(a.cuentasXCobrarCP.planAnual),
      '{{apertura_8}}': this.fmt(a.cuentasXCobrarCP.apertura),
      '{{real_8}}': this.fmt(a.cuentasXCobrarCP.real),

      '{{planAnual_14}}': this.fmt(a.pagosAnticipadosSuministros.planAnual),
      '{{apertura_14}}': this.fmt(a.pagosAnticipadosSuministros.apertura),
      '{{real_14}}': this.fmt(a.pagosAnticipadosSuministros.real),

      '{{planAnual_18}}': this.fmt(a.adeudosPresupuesto.planAnual),
      '{{apertura_18}}': this.fmt(a.adeudosPresupuesto.apertura),
      '{{real_18}}': this.fmt(a.adeudosPresupuesto.real),

      '{{planAnual_23}}': this.fmt(a.totalInventarios.planAnual),
      '{{apertura_23}}': this.fmt(a.totalInventarios.apertura),
      '{{real_23}}': this.fmt(a.totalInventarios.real),

      '{{planAnual_24}}': this.fmt(a.materiasPrimas.planAnual),
      '{{apertura_24}}': this.fmt(a.materiasPrimas.apertura),
      '{{real_24}}': this.fmt(a.materiasPrimas.real),

      '{{planAnual_28}}': this.fmt(a.utilesHerramientas.planAnual),
      '{{apertura_28}}': this.fmt(a.utilesHerramientas.apertura),
      '{{real_28}}': this.fmt(a.utilesHerramientas.real),

      '{{planAnual_38}}': this.fmt(a.alimentos.planAnual),
      '{{apertura_38}}': this.fmt(a.alimentos.apertura),
      '{{real_38}}': this.fmt(a.alimentos.real),

      '{{planAnual_56}}': this.fmt(a.activosFijos.planAnual),
      '{{apertura_56}}': this.fmt(a.activosFijos.apertura),
      '{{real_56}}': this.fmt(a.activosFijos.real),

      '{{planAnual_57}}': this.fmt(a.activosFijosTangibles.planAnual),
      '{{apertura_57}}': this.fmt(a.activosFijosTangibles.apertura),
      '{{real_57}}': this.fmt(a.activosFijosTangibles.real),

      '{{planAnual_58}}': this.fmt(a.depreciacionAFT.planAnual),
      '{{apertura_58}}': this.fmt(a.depreciacionAFT.apertura),
      '{{real_58}}': this.fmt(a.depreciacionAFT.real),

      '{{planAnual_69}}': this.fmt(a.activosDiferidos.planAnual),
      '{{apertura_69}}': this.fmt(a.activosDiferidos.apertura),
      '{{real_69}}': this.fmt(a.activosDiferidos.real),

      '{{planAnual_73}}': this.fmt(a.gastosFaltantesDiferidos.planAnual),
      '{{apertura_73}}': this.fmt(a.gastosFaltantesDiferidos.apertura),
      '{{real_73}}': this.fmt(a.gastosFaltantesDiferidos.real),

      '{{planAnual_74}}': this.fmt(a.otrosActivos.planAnual),
      '{{apertura_74}}': this.fmt(a.otrosActivos.apertura),
      '{{real_74}}': this.fmt(a.otrosActivos.real),

      '{{planAnual_77}}': this.fmt(a.cuentasXCobrarDiversas.planAnual),
      '{{apertura_77}}': this.fmt(a.cuentasXCobrarDiversas.apertura),
      '{{real_77}}': this.fmt(a.cuentasXCobrarDiversas.real),

      '{{planAnual_87}}': this.fmt(a.totalActivo.planAnual),
      '{{apertura_87}}': this.fmt(a.totalActivo.apertura),
      '{{real_87}}': this.fmt(a.totalActivo.real),

      '{{planAnual_88}}': this.fmt(p.pasivosCirculantes.planAnual),
      '{{apertura_88}}': this.fmt(p.pasivosCirculantes.apertura),
      '{{real_88}}': this.fmt(p.pasivosCirculantes.real),

      '{{planAnual_91}}': this.fmt(p.cuentasXPagarCP.planAnual),
      '{{apertura_91}}': this.fmt(p.cuentasXPagarCP.apertura),
      '{{real_91}}': this.fmt(p.cuentasXPagarCP.real),

      '{{planAnual_93}}': this.fmt(p.dividendosXPagar.planAnual),
      '{{apertura_93}}': this.fmt(p.dividendosXPagar.apertura),
      '{{real_93}}': this.fmt(p.dividendosXPagar.real),

      '{{planAnual_100}}': this.fmt(p.obligacionesPresupuesto.planAnual),
      '{{apertura_100}}': this.fmt(p.obligacionesPresupuesto.apertura),
      '{{real_100}}': this.fmt(p.obligacionesPresupuesto.real),

      '{{planAnual_102}}': this.fmt(p.nominasXPagar.planAnual),
      '{{apertura_102}}': this.fmt(p.nominasXPagar.apertura),
      '{{real_102}}': this.fmt(p.nominasXPagar.real),

      '{{planAnual_105}}': this.fmt(p.gastosAcumuladosXPagar.planAnual),
      '{{apertura_105}}': this.fmt(p.gastosAcumuladosXPagar.apertura),
      '{{real_105}}': this.fmt(p.gastosAcumuladosXPagar.real),

      '{{planAnual_106}}': this.fmt(p.provisionVacaciones.planAnual),
      '{{apertura_106}}': this.fmt(p.provisionVacaciones.apertura),
      '{{real_106}}': this.fmt(p.provisionVacaciones.real),

      '{{planAnual_108}}': this.fmt(p.provisionSeguridadSocial.planAnual),
      '{{apertura_108}}': this.fmt(p.provisionSeguridadSocial.apertura),
      '{{real_108}}': this.fmt(p.provisionSeguridadSocial.real),

      '{{planAnual_121}}': this.fmt(p.otrosPasivos.planAnual),
      '{{apertura_121}}': this.fmt(p.otrosPasivos.apertura),
      '{{real_121}}': this.fmt(p.otrosPasivos.real),

      '{{planAnual_123}}': this.fmt(p.cuentasXPagarDiversas.planAnual),
      '{{apertura_123}}': this.fmt(p.cuentasXPagarDiversas.apertura),
      '{{real_123}}': this.fmt(p.cuentasXPagarDiversas.real),

      '{{planAnual_127}}': this.fmt(p.totalPasivo.planAnual),
      '{{apertura_127}}': this.fmt(p.totalPasivo.apertura),
      '{{real_127}}': this.fmt(p.totalPasivo.real),

      '{{planAnual_128}}': this.fmt(pa.inversionEstatal.planAnual),
      '{{apertura_128}}': this.fmt(pa.inversionEstatal.apertura),
      '{{real_128}}': this.fmt(pa.inversionEstatal.real),

      '{{planAnual_136}}': this.fmt(pa.reservasContingencias.planAnual),
      '{{apertura_136}}': this.fmt(pa.reservasContingencias.apertura),
      '{{real_136}}': this.fmt(pa.reservasContingencias.real),

      '{{planAnual_137}}': this.fmt(pa.otrasReservas.planAnual),
      '{{apertura_137}}': this.fmt(pa.otrasReservas.apertura),
      '{{real_137}}': this.fmt(pa.otrasReservas.real),

      '{{planAnual_142}}': this.fmt(pa.pagoUtilidades.planAnual),
      '{{apertura_142}}': this.fmt(pa.pagoUtilidades.apertura),
      '{{real_142}}': this.fmt(pa.pagoUtilidades.real),

      '{{planAnual_143}}': this.fmt(pa.pagoDividendos.planAnual),
      '{{apertura_143}}': this.fmt(pa.pagoDividendos.apertura),
      '{{real_143}}': this.fmt(pa.pagoDividendos.real),

      '{{planAnual_149}}': this.fmt(pa.resultadoPeriodo.planAnual),
      '{{apertura_149}}': this.fmt(pa.resultadoPeriodo.apertura),
      '{{real_149}}': this.fmt(pa.resultadoPeriodo.real),

      '{{planAnual_150}}': this.fmt(pa.totalPatrimonio.planAnual),
      '{{apertura_150}}': this.fmt(pa.totalPatrimonio.apertura),
      '{{real_150}}': this.fmt(pa.totalPatrimonio.real),

      '{{planAnual_151}}': this.fmt(pa.totalPasivoYPatrimonio.planAnual),
      '{{apertura_151}}': this.fmt(pa.totalPasivoYPatrimonio.apertura),
      '{{real_151}}': this.fmt(pa.totalPasivoYPatrimonio.real),

      '{{hechoNombre}}': data.hechoNombre,
      '{{aprobadoNombre}}': data.aprobadoNombre,
      '{{fechaDia}}': data.fechaDia,
      '{{fechaMes}}': data.fechaMes,
      '{{fechaAnio}}': data.fechaAnio,
      '{{observaciones}}': data.observaciones ?? '',
    };

    return Object.entries(replacements).reduce(
      (html, [key, val]) => html.replaceAll(key, val),
      template,
    );
  }

  async generateEfe5920Pdf(data: Efe5920Data): Promise<Buffer> {
    const html = this.buildHtml(data);

    const browser = await puppeteer.launch({
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
      executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    });

    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'networkidle0' });

      const pdf = await page.pdf({
        format: 'A4',
        landscape: false,
        printBackground: true,
        margin: { top: '5mm', bottom: '5mm', left: '5mm', right: '5mm' },
      });

      return Buffer.from(pdf);
    } catch (error) {
      console.error('Error generating PDF:', error);
      throw error;
    } finally {
      await browser.close();
    }
  }

  async generateEfe5921Pdf(data: Efe5921Data): Promise<Buffer> {
    const templatePath = path.join(
      __dirname,
      'templates',
      '5921.template.html',
    );
    console.log(' PDF 5921 - Template path:', templatePath);
    console.log(' PDF 5921 - Template exists:', fs.existsSync(templatePath));
    const template = fs.readFileSync(templatePath, 'utf-8');

    const i = data.ingresos;
    const g = data.gastos;
    const ino = data.ingresosNoOperacionales;
    const gno = data.gastosNoOperacionales;
    const r = data.resultado;

    const replacements: Record<string, string> = {
      '{{informeCorrespondiente}}': data.informeCorrespondiente,
      '{{codigoCentroInformante}}': data.codigoCentroInformante,
      '{{centroInformante}}': data.centroInformante,

      // Ingresos
      '{{planAnual_1}}': this.fmt(i.ingresosOperacionales.planAnual),
      '{{apertura_1}}': this.fmt(i.ingresosOperacionales.apertura),
      '{{real_1}}': this.fmt(i.ingresosOperacionales.real),

      '{{planAnual_2}}': this.fmt(i.ventasBienesServicios.planAnual),
      '{{apertura_2}}': this.fmt(i.ventasBienesServicios.apertura),
      '{{real_2}}': this.fmt(i.ventasBienesServicios.real),

      '{{planAnual_3}}': this.fmt(i.ingresosActividadesFinancieras.planAnual),
      '{{apertura_3}}': this.fmt(i.ingresosActividadesFinancieras.apertura),
      '{{real_3}}': this.fmt(i.ingresosActividadesFinancieras.real),

      '{{planAnual_4}}': this.fmt(i.ingresosFinancierasPresupuesto.planAnual),
      '{{apertura_4}}': this.fmt(i.ingresosFinancierasPresupuesto.apertura),
      '{{real_4}}': this.fmt(i.ingresosFinancierasPresupuesto.real),

      '{{planAnual_5}}': this.fmt(i.ingresosSubvenciones.planAnual),
      '{{apertura_5}}': this.fmt(i.ingresosSubvenciones.apertura),
      '{{real_5}}': this.fmt(i.ingresosSubvenciones.real),

      '{{planAnual_6}}': this.fmt(i.otrosIngresosOperacionales.planAnual),
      '{{apertura_6}}': this.fmt(i.otrosIngresosOperacionales.apertura),
      '{{real_6}}': this.fmt(i.otrosIngresosOperacionales.real),

      // Gastos
      '{{planAnual_7}}': this.fmt(g.gastosOperacionales.planAnual),
      '{{apertura_7}}': this.fmt(g.gastosOperacionales.apertura),
      '{{real_7}}': this.fmt(g.gastosOperacionales.real),

      '{{planAnual_8}}': this.fmt(g.costoVentas.planAnual),
      '{{apertura_8}}': this.fmt(g.costoVentas.apertura),
      '{{real_8}}': this.fmt(g.costoVentas.real),

      '{{planAnual_9}}': this.fmt(g.gastosPersonal.planAnual),
      '{{apertura_9}}': this.fmt(g.gastosPersonal.apertura),
      '{{real_9}}': this.fmt(g.gastosPersonal.real),

      '{{planAnual_10}}': this.fmt(g.gastosSuministrosServicios.planAnual),
      '{{apertura_10}}': this.fmt(g.gastosSuministrosServicios.apertura),
      '{{real_10}}': this.fmt(g.gastosSuministrosServicios.real),

      '{{planAnual_11}}': this.fmt(g.gastosActivosFijos.planAnual),
      '{{apertura_11}}': this.fmt(g.gastosActivosFijos.apertura),
      '{{real_11}}': this.fmt(g.gastosActivosFijos.real),

      '{{planAnual_12}}': this.fmt(g.otrosGastosOperacionales.planAnual),
      '{{apertura_12}}': this.fmt(g.otrosGastosOperacionales.apertura),
      '{{real_12}}': this.fmt(g.otrosGastosOperacionales.real),

      // Resultado Operacional
      '{{planAnual_13}}': this.fmt(r.resultadoOperacional.planAnual),
      '{{apertura_13}}': this.fmt(r.resultadoOperacional.apertura),
      '{{real_13}}': this.fmt(r.resultadoOperacional.real),

      // Ingresos No Operacionales
      '{{planAnual_14}}': this.fmt(ino.ingresosNoOperacionales.planAnual),
      '{{apertura_14}}': this.fmt(ino.ingresosNoOperacionales.apertura),
      '{{real_14}}': this.fmt(ino.ingresosNoOperacionales.real),

      '{{planAnual_15}}': this.fmt(ino.ventaActivosFijos.planAnual),
      '{{apertura_15}}': this.fmt(ino.ventaActivosFijos.apertura),
      '{{real_15}}': this.fmt(ino.ventaActivosFijos.real),

      '{{planAnual_16}}': this.fmt(ino.otrosIngresosNoOperacionales.planAnual),
      '{{apertura_16}}': this.fmt(ino.otrosIngresosNoOperacionales.apertura),
      '{{real_16}}': this.fmt(ino.otrosIngresosNoOperacionales.real),

      // Gastos No Operacionales
      '{{planAnual_17}}': this.fmt(gno.gastosNoOperacionales.planAnual),
      '{{apertura_17}}': this.fmt(gno.gastosNoOperacionales.apertura),
      '{{real_17}}': this.fmt(gno.gastosNoOperacionales.real),

      '{{planAnual_18}}': this.fmt(gno.ventaActivosFijosGastos.planAnual),
      '{{apertura_18}}': this.fmt(gno.ventaActivosFijosGastos.apertura),
      '{{real_18}}': this.fmt(gno.ventaActivosFijosGastos.real),

      '{{planAnual_19}}': this.fmt(gno.otrosGastosNoOperacionales.planAnual),
      '{{apertura_19}}': this.fmt(gno.otrosGastosNoOperacionales.apertura),
      '{{real_19}}': this.fmt(gno.otrosGastosNoOperacionales.real),

      // Resultados
      '{{planAnual_20}}': this.fmt(r.resultadoAntesImpuestos.planAnual),
      '{{apertura_20}}': this.fmt(r.resultadoAntesImpuestos.apertura),
      '{{real_20}}': this.fmt(r.resultadoAntesImpuestos.real),

      '{{planAnual_21}}': this.fmt(r.impuestoRenta.planAnual),
      '{{apertura_21}}': this.fmt(r.impuestoRenta.apertura),
      '{{real_21}}': this.fmt(r.impuestoRenta.real),

      '{{planAnual_22}}': this.fmt(r.resultadoNeto.planAnual),
      '{{apertura_22}}': this.fmt(r.resultadoNeto.apertura),
      '{{real_22}}': this.fmt(r.resultadoNeto.real),

      // Pie
      '{{hechoNombre}}': data.hechoNombre,
      '{{aprobadoNombre}}': data.aprobadoNombre,
      '{{fechaDia}}': data.fechaDia,
      '{{fechaMes}}': data.fechaMes,
      '{{fechaAnio}}': data.fechaAnio,
      '{{observaciones}}': data.observaciones ?? '',
    };

    const html = Object.entries(replacements).reduce(
      (h, [key, val]) => h.replaceAll(key, val),
      template,
    );

    const browser = await puppeteer.launch({
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
      executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    });

    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'networkidle0' });

      const pdf = await page.pdf({
        format: 'A4',
        landscape: false,
        printBackground: true,
        margin: { top: '5mm', bottom: '5mm', left: '5mm', right: '5mm' },
      });

      return Buffer.from(pdf);
    } finally {
      await browser.close();
    }
  }

  async generateEfe5924Pdf(data: Efe5924Data): Promise<Buffer> {
    const templatePath = path.join(
      __dirname,
      'templates',
      '5924.template.html',
    );
    const template = fs.readFileSync(templatePath, 'utf-8');

    const g = data.gastos;
    const t = data.totales;

    const replacements: Record<string, string> = {
      '{{informeCorrespondiente}}': data.informeCorrespondiente,
      '{{codigoCentroInformante}}': data.codigoCentroInformante,
      '{{centroInformante}}': data.centroInformante,

      // Gastos de Personal
      '{{planAnual_101}}': this.fmt(g.salariosSueldos.planAnual),
      '{{apertura_101}}': this.fmt(g.salariosSueldos.apertura),
      '{{real_101}}': this.fmt(g.salariosSueldos.real),
      '{{porcPlan_101}}': `${g.salariosSueldos.porcPlan.toFixed(2)}%`,
      '{{porcApertura_101}}': `${g.salariosSueldos.porcApertura.toFixed(2)}%`,
      '{{porcReal_101}}': `${g.salariosSueldos.porcReal.toFixed(2)}%`,

      '{{planAnual_102}}': this.fmt(g.horasExtraordinarias.planAnual),
      '{{apertura_102}}': this.fmt(g.horasExtraordinarias.apertura),
      '{{real_102}}': this.fmt(g.horasExtraordinarias.real),
      '{{porcPlan_102}}': `${g.horasExtraordinarias.porcPlan.toFixed(2)}%`,
      '{{porcApertura_102}}': `${g.horasExtraordinarias.porcApertura.toFixed(2)}%`,
      '{{porcReal_102}}': `${g.horasExtraordinarias.porcReal.toFixed(2)}%`,

      '{{planAnual_103}}': this.fmt(g.seguridadSocial.planAnual),
      '{{apertura_103}}': this.fmt(g.seguridadSocial.apertura),
      '{{real_103}}': this.fmt(g.seguridadSocial.real),
      '{{porcPlan_103}}': `${g.seguridadSocial.porcPlan.toFixed(2)}%`,
      '{{porcApertura_103}}': `${g.seguridadSocial.porcApertura.toFixed(2)}%`,
      '{{porcReal_103}}': `${g.seguridadSocial.porcReal.toFixed(2)}%`,

      // Gastos de Materiales
      '{{planAnual_201}}': this.fmt(g.materiasPrimas.planAnual),
      '{{apertura_201}}': this.fmt(g.materiasPrimas.apertura),
      '{{real_201}}': this.fmt(g.materiasPrimas.real),
      '{{porcPlan_201}}': `${g.materiasPrimas.porcPlan.toFixed(2)}%`,
      '{{porcApertura_201}}': `${g.materiasPrimas.porcApertura.toFixed(2)}%`,
      '{{porcReal_201}}': `${g.materiasPrimas.porcReal.toFixed(2)}%`,

      '{{planAnual_202}}': this.fmt(g.materialesConstruccion.planAnual),
      '{{apertura_202}}': this.fmt(g.materialesConstruccion.apertura),
      '{{real_202}}': this.fmt(g.materialesConstruccion.real),
      '{{porcPlan_202}}': `${g.materialesConstruccion.porcPlan.toFixed(2)}%`,
      '{{porcApertura_202}}': `${g.materialesConstruccion.porcApertura.toFixed(2)}%`,
      '{{porcReal_202}}': `${g.materialesConstruccion.porcReal.toFixed(2)}%`,

      '{{planAnual_203}}': this.fmt(g.suministrosOficina.planAnual),
      '{{apertura_203}}': this.fmt(g.suministrosOficina.apertura),
      '{{real_203}}': this.fmt(g.suministrosOficina.real),
      '{{porcPlan_203}}': `${g.suministrosOficina.porcPlan.toFixed(2)}%`,
      '{{porcApertura_203}}': `${g.suministrosOficina.porcApertura.toFixed(2)}%`,
      '{{porcReal_203}}': `${g.suministrosOficina.porcReal.toFixed(2)}%`,

      // Gastos de Servicios
      '{{planAnual_301}}': this.fmt(g.serviciosBasicos.planAnual),
      '{{apertura_301}}': this.fmt(g.serviciosBasicos.apertura),
      '{{real_301}}': this.fmt(g.serviciosBasicos.real),
      '{{porcPlan_301}}': `${g.serviciosBasicos.porcPlan.toFixed(2)}%`,
      '{{porcApertura_301}}': `${g.serviciosBasicos.porcApertura.toFixed(2)}%`,
      '{{porcReal_301}}': `${g.serviciosBasicos.porcReal.toFixed(2)}%`,

      '{{planAnual_302}}': this.fmt(g.mantenimientoReparaciones.planAnual),
      '{{apertura_302}}': this.fmt(g.mantenimientoReparaciones.apertura),
      '{{real_302}}': this.fmt(g.mantenimientoReparaciones.real),
      '{{porcPlan_302}}': `${g.mantenimientoReparaciones.porcPlan.toFixed(2)}%`,
      '{{porcApertura_302}}': `${g.mantenimientoReparaciones.porcApertura.toFixed(2)}%`,
      '{{porcReal_302}}': `${g.mantenimientoReparaciones.porcReal.toFixed(2)}%`,

      '{{planAnual_303}}': this.fmt(g.serviciosProfesionales.planAnual),
      '{{apertura_303}}': this.fmt(g.serviciosProfesionales.apertura),
      '{{real_303}}': this.fmt(g.serviciosProfesionales.real),
      '{{porcPlan_303}}': `${g.serviciosProfesionales.porcPlan.toFixed(2)}%`,
      '{{porcApertura_303}}': `${g.serviciosProfesionales.porcApertura.toFixed(2)}%`,
      '{{porcReal_303}}': `${g.serviciosProfesionales.porcReal.toFixed(2)}%`,

      // Gastos de Activos Fijos
      '{{planAnual_401}}': this.fmt(g.depreciacionActivosFijos.planAnual),
      '{{apertura_401}}': this.fmt(g.depreciacionActivosFijos.apertura),
      '{{real_401}}': this.fmt(g.depreciacionActivosFijos.real),
      '{{porcPlan_401}}': `${g.depreciacionActivosFijos.porcPlan.toFixed(2)}%`,
      '{{porcApertura_401}}': `${g.depreciacionActivosFijos.porcApertura.toFixed(2)}%`,
      '{{porcReal_401}}': `${g.depreciacionActivosFijos.porcReal.toFixed(2)}%`,

      '{{planAnual_402}}': this.fmt(g.amortizacionActivosIntangibles.planAnual),
      '{{apertura_402}}': this.fmt(g.amortizacionActivosIntangibles.apertura),
      '{{real_402}}': this.fmt(g.amortizacionActivosIntangibles.real),
      '{{porcPlan_402}}': `${g.amortizacionActivosIntangibles.porcPlan.toFixed(2)}%`,
      '{{porcApertura_402}}': `${g.amortizacionActivosIntangibles.porcApertura.toFixed(2)}%`,
      '{{porcReal_402}}': `${g.amortizacionActivosIntangibles.porcReal.toFixed(2)}%`,

      // Otros Gastos
      '{{planAnual_501}}': this.fmt(g.gastosRepresentacion.planAnual),
      '{{apertura_501}}': this.fmt(g.gastosRepresentacion.apertura),
      '{{real_501}}': this.fmt(g.gastosRepresentacion.real),
      '{{porcPlan_501}}': `${g.gastosRepresentacion.porcPlan.toFixed(2)}%`,
      '{{porcApertura_501}}': `${g.gastosRepresentacion.porcApertura.toFixed(2)}%`,
      '{{porcReal_501}}': `${g.gastosRepresentacion.porcReal.toFixed(2)}%`,

      '{{planAnual_502}}': this.fmt(g.gastosTransporte.planAnual),
      '{{apertura_502}}': this.fmt(g.gastosTransporte.apertura),
      '{{real_502}}': this.fmt(g.gastosTransporte.real),
      '{{porcPlan_502}}': `${g.gastosTransporte.porcPlan.toFixed(2)}%`,
      '{{porcApertura_502}}': `${g.gastosTransporte.porcApertura.toFixed(2)}%`,
      '{{porcReal_502}}': `${g.gastosTransporte.porcReal.toFixed(2)}%`,

      '{{planAnual_503}}': this.fmt(g.gastosComunicacion.planAnual),
      '{{apertura_503}}': this.fmt(g.gastosComunicacion.apertura),
      '{{real_503}}': this.fmt(g.gastosComunicacion.real),
      '{{porcPlan_503}}': `${g.gastosComunicacion.porcPlan.toFixed(2)}%`,
      '{{porcApertura_503}}': `${g.gastosComunicacion.porcApertura.toFixed(2)}%`,
      '{{porcReal_503}}': `${g.gastosComunicacion.porcReal.toFixed(2)}%`,

      // Totales
      '{{planAnual_total}}': this.fmt(t.planAnual),
      '{{apertura_total}}': this.fmt(t.apertura),
      '{{real_total}}': this.fmt(t.real),

      // Pie
      '{{hechoNombre}}': data.hechoNombre,
      '{{aprobadoNombre}}': data.aprobadoNombre,
      '{{fechaDia}}': data.fechaDia,
      '{{fechaMes}}': data.fechaMes,
      '{{fechaAnio}}': data.fechaAnio,
      '{{observaciones}}': data.observaciones ?? '',
    };

    const html = Object.entries(replacements).reduce(
      (h, [key, val]) => h.replaceAll(key, val),
      template,
    );

    const browser = await puppeteer.launch({
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
      executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    });

    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'networkidle0' });

      const pdf = await page.pdf({
        format: 'A4',
        landscape: false,
        printBackground: true,
        margin: { top: '5mm', bottom: '5mm', left: '5mm', right: '5mm' },
      });

      return Buffer.from(pdf);
    } finally {
      await browser.close();
    }
  }
}
