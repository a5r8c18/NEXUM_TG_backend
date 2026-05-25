/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
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

export interface Efe5922Data {
  informeCorrespondiente: string;
  codigoCentroInformante: string;
  centroInformante: string;

  activosCorrientes: {
    efectivo: { planAnual: number; apertura: number; real: number };
    cuentasXCobrar: { planAnual: number; apertura: number; real: number };
    inventarios: { planAnual: number; apertura: number; real: number };
    pagosAnticipados: { planAnual: number; apertura: number; real: number };
    total: { planAnual: number; apertura: number; real: number };
  };

  activosNoCorrientes: {
    activosFijos: { planAnual: number; apertura: number; real: number };
    depreciacionAcumulada: { planAnual: number; apertura: number; real: number };
    activosIntangibles: { planAnual: number; apertura: number; real: number };
    otrosActivos: { planAnual: number; apertura: number; real: number };
    total: { planAnual: number; apertura: number; real: number };
  };

  pasivosCorrientes: {
    cuentasXPagar: { planAnual: number; apertura: number; real: number };
    prestamosCP: { planAnual: number; apertura: number; real: number };
    acumulaciones: { planAnual: number; apertura: number; real: number };
    total: { planAnual: number; apertura: number; real: number };
  };

  pasivosNoCorrientes: {
    prestamosLP: { planAnual: number; apertura: number; real: number };
    provisionesLP: { planAnual: number; apertura: number; real: number };
    total: { planAnual: number; apertura: number; real: number };
  };

  patrimonio: {
    capitalSocial: { planAnual: number; apertura: number; real: number };
    reservas: { planAnual: number; apertura: number; real: number };
    resultadosAcumulados: { planAnual: number; apertura: number; real: number };
    resultadoPeriodo: { planAnual: number; apertura: number; real: number };
    total: { planAnual: number; apertura: number; real: number };
  };

  totalPasivoPatrimonio: { planAnual: number; apertura: number; real: number };

  hechoNombre: string;
  aprobadoNombre: string;
  fechaDia: string;
  fechaMes: string;
  fechaAnio: string;
  observaciones?: string;
}

export interface Efe5923Data {
  informeCorrespondiente: string;
  codigoCentroInformante: string;
  centroInformante: string;

  ingresos: {
    ventasNetas: { planAnual: number; apertura: number; real: number };
    otrosIngresos: { planAnual: number; apertura: number; real: number };
    totalIngresos: { planAnual: number; apertura: number; real: number };
  };

  costoVentas: {
    costoMercanciasVendidas: { planAnual: number; apertura: number; real: number };
    costoServicios: { planAnual: number; apertura: number; real: number };
    totalCostoVentas: { planAnual: number; apertura: number; real: number };
  };

  utilidadBruta: { planAnual: number; apertura: number; real: number };

  gastosOperativos: {
    gastosVentas: { planAnual: number; apertura: number; real: number };
    gastosAdministrativos: { planAnual: number; apertura: number; real: number };
    gastosFinancieros: { planAnual: number; apertura: number; real: number };
    totalGastosOperativos: { planAnual: number; apertura: number; real: number };
  };

  utilidadOperativa: { planAnual: number; apertura: number; real: number };

  otrosIngresosGastos: {
    ingresosExtraordinarios: { planAnual: number; apertura: number; real: number };
    gastosExtraordinarios: { planAnual: number; apertura: number; real: number };
    totalOtros: { planAnual: number; apertura: number; real: number };
  };

  utilidadAntesImpuestos: { planAnual: number; apertura: number; real: number };

  impuestoRenta: { planAnual: number; apertura: number; real: number };

  utilidadNeta: { planAnual: number; apertura: number; real: number };

  hechoNombre: string;
  aprobadoNombre: string;
  fechaDia: string;
  fechaMes: string;
  fechaAnio: string;
  observaciones?: string;
}

export interface FlujoEfectivoData {
  informeCorrespondiente: string;
  codigoCentroInformante: string;
  centroInformante: string;

  actividadesOperativas: {
    cobroVentas: { planAnual: number; apertura: number; real: number };
    pagoProveedores: { planAnual: number; apertura: number; real: number };
    pagoPersonal: { planAnual: number; apertura: number; real: number };
    pagoImpuestos: { planAnual: number; apertura: number; real: number };
    otrosPagosOperativos: { planAnual: number; apertura: number; real: number };
    flujoNetoOperativo: { planAnual: number; apertura: number; real: number };
  };

  actividadesInversion: {
    compraActivosFijos: { planAnual: number; apertura: number; real: number };
    ventaActivosFijos: { planAnual: number; apertura: number; real: number };
    inversionesFinancieras: { planAnual: number; apertura: number; real: number };
    flujoNetoInversion: { planAnual: number; apertura: number; real: number };
  };

  actividadesFinanciamiento: {
    prestamosRecibidos: { planAnual: number; apertura: number; real: number };
    pagoPrestamos: { planAnual: number; apertura: number; real: number };
    pagoDividendos: { planAnual: number; apertura: number; real: number };
    aporteCapital: { planAnual: number; apertura: number; real: number };
    flujoNetoFinanciamiento: { planAnual: number; apertura: number; real: number };
  };

  variacionEfectivo: { planAnual: number; apertura: number; real: number };
  efectivoInicial: { planAnual: number; apertura: number; real: number };
  efectivoFinal: { planAnual: number; apertura: number; real: number };

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

  async generateEfe5922Pdf(data: Efe5922Data): Promise<Buffer> {
    const templatePath = path.join(
      __dirname,
      'templates',
      '5922.template.html',
    );
    const template = fs.existsSync(templatePath)
      ? fs.readFileSync(templatePath, 'utf-8')
      : this.getDefault5922Template();

    const ac = data.activosCorrientes;
    const anc = data.activosNoCorrientes;
    const pc = data.pasivosCorrientes;
    const pnc = data.pasivosNoCorrientes;
    const pat = data.patrimonio;

    const replacements: Record<string, string> = {
      '{{informeCorrespondiente}}': data.informeCorrespondiente,
      '{{codigoCentroInformante}}': data.codigoCentroInformante,
      '{{centroInformante}}': data.centroInformante,

      // Activos Corrientes
      '{{efectivo_plan}}': this.fmt(ac.efectivo.planAnual),
      '{{efectivo_apertura}}': this.fmt(ac.efectivo.apertura),
      '{{efectivo_real}}': this.fmt(ac.efectivo.real),
      '{{cuentasXCobrar_plan}}': this.fmt(ac.cuentasXCobrar.planAnual),
      '{{cuentasXCobrar_apertura}}': this.fmt(ac.cuentasXCobrar.apertura),
      '{{cuentasXCobrar_real}}': this.fmt(ac.cuentasXCobrar.real),
      '{{inventarios_plan}}': this.fmt(ac.inventarios.planAnual),
      '{{inventarios_apertura}}': this.fmt(ac.inventarios.apertura),
      '{{inventarios_real}}': this.fmt(ac.inventarios.real),
      '{{pagosAnticipados_plan}}': this.fmt(ac.pagosAnticipados.planAnual),
      '{{pagosAnticipados_apertura}}': this.fmt(ac.pagosAnticipados.apertura),
      '{{pagosAnticipados_real}}': this.fmt(ac.pagosAnticipados.real),
      '{{totalActivosCorrientes_plan}}': this.fmt(ac.total.planAnual),
      '{{totalActivosCorrientes_apertura}}': this.fmt(ac.total.apertura),
      '{{totalActivosCorrientes_real}}': this.fmt(ac.total.real),

      // Activos No Corrientes
      '{{activosFijos_plan}}': this.fmt(anc.activosFijos.planAnual),
      '{{activosFijos_apertura}}': this.fmt(anc.activosFijos.apertura),
      '{{activosFijos_real}}': this.fmt(anc.activosFijos.real),
      '{{depreciacionAcumulada_plan}}': this.fmt(anc.depreciacionAcumulada.planAnual),
      '{{depreciacionAcumulada_apertura}}': this.fmt(anc.depreciacionAcumulada.apertura),
      '{{depreciacionAcumulada_real}}': this.fmt(anc.depreciacionAcumulada.real),
      '{{activosIntangibles_plan}}': this.fmt(anc.activosIntangibles.planAnual),
      '{{activosIntangibles_apertura}}': this.fmt(anc.activosIntangibles.apertura),
      '{{activosIntangibles_real}}': this.fmt(anc.activosIntangibles.real),
      '{{otrosActivos_plan}}': this.fmt(anc.otrosActivos.planAnual),
      '{{otrosActivos_apertura}}': this.fmt(anc.otrosActivos.apertura),
      '{{otrosActivos_real}}': this.fmt(anc.otrosActivos.real),
      '{{totalActivosNoCorrientes_plan}}': this.fmt(anc.total.planAnual),
      '{{totalActivosNoCorrientes_apertura}}': this.fmt(anc.total.apertura),
      '{{totalActivosNoCorrientes_real}}': this.fmt(anc.total.real),

      // Pasivos Corrientes
      '{{cuentasXPagar_plan}}': this.fmt(pc.cuentasXPagar.planAnual),
      '{{cuentasXPagar_apertura}}': this.fmt(pc.cuentasXPagar.apertura),
      '{{cuentasXPagar_real}}': this.fmt(pc.cuentasXPagar.real),
      '{{prestamosCP_plan}}': this.fmt(pc.prestamosCP.planAnual),
      '{{prestamosCP_apertura}}': this.fmt(pc.prestamosCP.apertura),
      '{{prestamosCP_real}}': this.fmt(pc.prestamosCP.real),
      '{{acumulaciones_plan}}': this.fmt(pc.acumulaciones.planAnual),
      '{{acumulaciones_apertura}}': this.fmt(pc.acumulaciones.apertura),
      '{{acumulaciones_real}}': this.fmt(pc.acumulaciones.real),
      '{{totalPasivosCorrientes_plan}}': this.fmt(pc.total.planAnual),
      '{{totalPasivosCorrientes_apertura}}': this.fmt(pc.total.apertura),
      '{{totalPasivosCorrientes_real}}': this.fmt(pc.total.real),

      // Pasivos No Corrientes
      '{{prestamosLP_plan}}': this.fmt(pnc.prestamosLP.planAnual),
      '{{prestamosLP_apertura}}': this.fmt(pnc.prestamosLP.apertura),
      '{{prestamosLP_real}}': this.fmt(pnc.prestamosLP.real),
      '{{provisionesLP_plan}}': this.fmt(pnc.provisionesLP.planAnual),
      '{{provisionesLP_apertura}}': this.fmt(pnc.provisionesLP.apertura),
      '{{provisionesLP_real}}': this.fmt(pnc.provisionesLP.real),
      '{{totalPasivosNoCorrientes_plan}}': this.fmt(pnc.total.planAnual),
      '{{totalPasivosNoCorrientes_apertura}}': this.fmt(pnc.total.apertura),
      '{{totalPasivosNoCorrientes_real}}': this.fmt(pnc.total.real),

      // Patrimonio
      '{{capitalSocial_plan}}': this.fmt(pat.capitalSocial.planAnual),
      '{{capitalSocial_apertura}}': this.fmt(pat.capitalSocial.apertura),
      '{{capitalSocial_real}}': this.fmt(pat.capitalSocial.real),
      '{{reservas_plan}}': this.fmt(pat.reservas.planAnual),
      '{{reservas_apertura}}': this.fmt(pat.reservas.apertura),
      '{{reservas_real}}': this.fmt(pat.reservas.real),
      '{{resultadosAcumulados_plan}}': this.fmt(pat.resultadosAcumulados.planAnual),
      '{{resultadosAcumulados_apertura}}': this.fmt(pat.resultadosAcumulados.apertura),
      '{{resultadosAcumulados_real}}': this.fmt(pat.resultadosAcumulados.real),
      '{{resultadoPeriodo_plan}}': this.fmt(pat.resultadoPeriodo.planAnual),
      '{{resultadoPeriodo_apertura}}': this.fmt(pat.resultadoPeriodo.apertura),
      '{{resultadoPeriodo_real}}': this.fmt(pat.resultadoPeriodo.real),
      '{{totalPatrimonio_plan}}': this.fmt(pat.total.planAnual),
      '{{totalPatrimonio_apertura}}': this.fmt(pat.total.apertura),
      '{{totalPatrimonio_real}}': this.fmt(pat.total.real),

      // Total Pasivo y Patrimonio
      '{{totalPasivoPatrimonio_plan}}': this.fmt(data.totalPasivoPatrimonio.planAnual),
      '{{totalPasivoPatrimonio_apertura}}': this.fmt(data.totalPasivoPatrimonio.apertura),
      '{{totalPasivoPatrimonio_real}}': this.fmt(data.totalPasivoPatrimonio.real),

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

  async generateEfe5923Pdf(data: Efe5923Data): Promise<Buffer> {
    const templatePath = path.join(
      __dirname,
      'templates',
      '5923.template.html',
    );
    const template = fs.existsSync(templatePath)
      ? fs.readFileSync(templatePath, 'utf-8')
      : this.getDefault5923Template();

    const i = data.ingresos;
    const cv = data.costoVentas;
    const go = data.gastosOperativos;
    const oig = data.otrosIngresosGastos;

    const replacements: Record<string, string> = {
      '{{informeCorrespondiente}}': data.informeCorrespondiente,
      '{{codigoCentroInformante}}': data.codigoCentroInformante,
      '{{centroInformante}}': data.centroInformante,

      // Ingresos
      '{{ventasNetas_plan}}': this.fmt(i.ventasNetas.planAnual),
      '{{ventasNetas_apertura}}': this.fmt(i.ventasNetas.apertura),
      '{{ventasNetas_real}}': this.fmt(i.ventasNetas.real),
      '{{otrosIngresos_plan}}': this.fmt(i.otrosIngresos.planAnual),
      '{{otrosIngresos_apertura}}': this.fmt(i.otrosIngresos.apertura),
      '{{otrosIngresos_real}}': this.fmt(i.otrosIngresos.real),
      '{{totalIngresos_plan}}': this.fmt(i.totalIngresos.planAnual),
      '{{totalIngresos_apertura}}': this.fmt(i.totalIngresos.apertura),
      '{{totalIngresos_real}}': this.fmt(i.totalIngresos.real),

      // Costo de Ventas
      '{{costoMercancias_plan}}': this.fmt(cv.costoMercanciasVendidas.planAnual),
      '{{costoMercancias_apertura}}': this.fmt(cv.costoMercanciasVendidas.apertura),
      '{{costoMercancias_real}}': this.fmt(cv.costoMercanciasVendidas.real),
      '{{costoServicios_plan}}': this.fmt(cv.costoServicios.planAnual),
      '{{costoServicios_apertura}}': this.fmt(cv.costoServicios.apertura),
      '{{costoServicios_real}}': this.fmt(cv.costoServicios.real),
      '{{totalCostoVentas_plan}}': this.fmt(cv.totalCostoVentas.planAnual),
      '{{totalCostoVentas_apertura}}': this.fmt(cv.totalCostoVentas.apertura),
      '{{totalCostoVentas_real}}': this.fmt(cv.totalCostoVentas.real),

      // Utilidad Bruta
      '{{utilidadBruta_plan}}': this.fmt(data.utilidadBruta.planAnual),
      '{{utilidadBruta_apertura}}': this.fmt(data.utilidadBruta.apertura),
      '{{utilidadBruta_real}}': this.fmt(data.utilidadBruta.real),

      // Gastos Operativos
      '{{gastosVentas_plan}}': this.fmt(go.gastosVentas.planAnual),
      '{{gastosVentas_apertura}}': this.fmt(go.gastosVentas.apertura),
      '{{gastosVentas_real}}': this.fmt(go.gastosVentas.real),
      '{{gastosAdministrativos_plan}}': this.fmt(go.gastosAdministrativos.planAnual),
      '{{gastosAdministrativos_apertura}}': this.fmt(go.gastosAdministrativos.apertura),
      '{{gastosAdministrativos_real}}': this.fmt(go.gastosAdministrativos.real),
      '{{gastosFinancieros_plan}}': this.fmt(go.gastosFinancieros.planAnual),
      '{{gastosFinancieros_apertura}}': this.fmt(go.gastosFinancieros.apertura),
      '{{gastosFinancieros_real}}': this.fmt(go.gastosFinancieros.real),
      '{{totalGastosOperativos_plan}}': this.fmt(go.totalGastosOperativos.planAnual),
      '{{totalGastosOperativos_apertura}}': this.fmt(go.totalGastosOperativos.apertura),
      '{{totalGastosOperativos_real}}': this.fmt(go.totalGastosOperativos.real),

      // Utilidad Operativa
      '{{utilidadOperativa_plan}}': this.fmt(data.utilidadOperativa.planAnual),
      '{{utilidadOperativa_apertura}}': this.fmt(data.utilidadOperativa.apertura),
      '{{utilidadOperativa_real}}': this.fmt(data.utilidadOperativa.real),

      // Otros Ingresos/Gastos
      '{{ingresosExtraordinarios_plan}}': this.fmt(oig.ingresosExtraordinarios.planAnual),
      '{{ingresosExtraordinarios_apertura}}': this.fmt(oig.ingresosExtraordinarios.apertura),
      '{{ingresosExtraordinarios_real}}': this.fmt(oig.ingresosExtraordinarios.real),
      '{{gastosExtraordinarios_plan}}': this.fmt(oig.gastosExtraordinarios.planAnual),
      '{{gastosExtraordinarios_apertura}}': this.fmt(oig.gastosExtraordinarios.apertura),
      '{{gastosExtraordinarios_real}}': this.fmt(oig.gastosExtraordinarios.real),
      '{{totalOtros_plan}}': this.fmt(oig.totalOtros.planAnual),
      '{{totalOtros_apertura}}': this.fmt(oig.totalOtros.apertura),
      '{{totalOtros_real}}': this.fmt(oig.totalOtros.real),

      // Utilidad Antes Impuestos
      '{{utilidadAntesImpuestos_plan}}': this.fmt(data.utilidadAntesImpuestos.planAnual),
      '{{utilidadAntesImpuestos_apertura}}': this.fmt(data.utilidadAntesImpuestos.apertura),
      '{{utilidadAntesImpuestos_real}}': this.fmt(data.utilidadAntesImpuestos.real),

      // Impuesto Renta
      '{{impuestoRenta_plan}}': this.fmt(data.impuestoRenta.planAnual),
      '{{impuestoRenta_apertura}}': this.fmt(data.impuestoRenta.apertura),
      '{{impuestoRenta_real}}': this.fmt(data.impuestoRenta.real),

      // Utilidad Neta
      '{{utilidadNeta_plan}}': this.fmt(data.utilidadNeta.planAnual),
      '{{utilidadNeta_apertura}}': this.fmt(data.utilidadNeta.apertura),
      '{{utilidadNeta_real}}': this.fmt(data.utilidadNeta.real),

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

  async generateFlujoEfectivoPdf(data: FlujoEfectivoData): Promise<Buffer> {
    const templatePath = path.join(
      __dirname,
      'templates',
      'flujo-efectivo.template.html',
    );
    const template = fs.existsSync(templatePath)
      ? fs.readFileSync(templatePath, 'utf-8')
      : this.getDefaultFlujoEfectivoTemplate();

    const ao = data.actividadesOperativas;
    const ai = data.actividadesInversion;
    const af = data.actividadesFinanciamiento;

    const replacements: Record<string, string> = {
      '{{informeCorrespondiente}}': data.informeCorrespondiente,
      '{{codigoCentroInformante}}': data.codigoCentroInformante,
      '{{centroInformante}}': data.centroInformante,

      // Actividades Operativas
      '{{cobroVentas_plan}}': this.fmt(ao.cobroVentas.planAnual),
      '{{cobroVentas_apertura}}': this.fmt(ao.cobroVentas.apertura),
      '{{cobroVentas_real}}': this.fmt(ao.cobroVentas.real),
      '{{pagoProveedores_plan}}': this.fmt(ao.pagoProveedores.planAnual),
      '{{pagoProveedores_apertura}}': this.fmt(ao.pagoProveedores.apertura),
      '{{pagoProveedores_real}}': this.fmt(ao.pagoProveedores.real),
      '{{pagoPersonal_plan}}': this.fmt(ao.pagoPersonal.planAnual),
      '{{pagoPersonal_apertura}}': this.fmt(ao.pagoPersonal.apertura),
      '{{pagoPersonal_real}}': this.fmt(ao.pagoPersonal.real),
      '{{pagoImpuestos_plan}}': this.fmt(ao.pagoImpuestos.planAnual),
      '{{pagoImpuestos_apertura}}': this.fmt(ao.pagoImpuestos.apertura),
      '{{pagoImpuestos_real}}': this.fmt(ao.pagoImpuestos.real),
      '{{otrosPagosOperativos_plan}}': this.fmt(ao.otrosPagosOperativos.planAnual),
      '{{otrosPagosOperativos_apertura}}': this.fmt(ao.otrosPagosOperativos.apertura),
      '{{otrosPagosOperativos_real}}': this.fmt(ao.otrosPagosOperativos.real),
      '{{flujoNetoOperativo_plan}}': this.fmt(ao.flujoNetoOperativo.planAnual),
      '{{flujoNetoOperativo_apertura}}': this.fmt(ao.flujoNetoOperativo.apertura),
      '{{flujoNetoOperativo_real}}': this.fmt(ao.flujoNetoOperativo.real),

      // Actividades de Inversión
      '{{compraActivosFijos_plan}}': this.fmt(ai.compraActivosFijos.planAnual),
      '{{compraActivosFijos_apertura}}': this.fmt(ai.compraActivosFijos.apertura),
      '{{compraActivosFijos_real}}': this.fmt(ai.compraActivosFijos.real),
      '{{ventaActivosFijos_plan}}': this.fmt(ai.ventaActivosFijos.planAnual),
      '{{ventaActivosFijos_apertura}}': this.fmt(ai.ventaActivosFijos.apertura),
      '{{ventaActivosFijos_real}}': this.fmt(ai.ventaActivosFijos.real),
      '{{inversionesFinancieras_plan}}': this.fmt(ai.inversionesFinancieras.planAnual),
      '{{inversionesFinancieras_apertura}}': this.fmt(ai.inversionesFinancieras.apertura),
      '{{inversionesFinancieras_real}}': this.fmt(ai.inversionesFinancieras.real),
      '{{flujoNetoInversion_plan}}': this.fmt(ai.flujoNetoInversion.planAnual),
      '{{flujoNetoInversion_apertura}}': this.fmt(ai.flujoNetoInversion.apertura),
      '{{flujoNetoInversion_real}}': this.fmt(ai.flujoNetoInversion.real),

      // Actividades de Financiamiento
      '{{prestamosRecibidos_plan}}': this.fmt(af.prestamosRecibidos.planAnual),
      '{{prestamosRecibidos_apertura}}': this.fmt(af.prestamosRecibidos.apertura),
      '{{prestamosRecibidos_real}}': this.fmt(af.prestamosRecibidos.real),
      '{{pagoPrestamos_plan}}': this.fmt(af.pagoPrestamos.planAnual),
      '{{pagoPrestamos_apertura}}': this.fmt(af.pagoPrestamos.apertura),
      '{{pagoPrestamos_real}}': this.fmt(af.pagoPrestamos.real),
      '{{pagoDividendos_plan}}': this.fmt(af.pagoDividendos.planAnual),
      '{{pagoDividendos_apertura}}': this.fmt(af.pagoDividendos.apertura),
      '{{pagoDividendos_real}}': this.fmt(af.pagoDividendos.real),
      '{{aporteCapital_plan}}': this.fmt(af.aporteCapital.planAnual),
      '{{aporteCapital_apertura}}': this.fmt(af.aporteCapital.apertura),
      '{{aporteCapital_real}}': this.fmt(af.aporteCapital.real),
      '{{flujoNetoFinanciamiento_plan}}': this.fmt(af.flujoNetoFinanciamiento.planAnual),
      '{{flujoNetoFinanciamiento_apertura}}': this.fmt(af.flujoNetoFinanciamiento.apertura),
      '{{flujoNetoFinanciamiento_real}}': this.fmt(af.flujoNetoFinanciamiento.real),

      // Variación y Efectivo
      '{{variacionEfectivo_plan}}': this.fmt(data.variacionEfectivo.planAnual),
      '{{variacionEfectivo_apertura}}': this.fmt(data.variacionEfectivo.apertura),
      '{{variacionEfectivo_real}}': this.fmt(data.variacionEfectivo.real),
      '{{efectivoInicial_plan}}': this.fmt(data.efectivoInicial.planAnual),
      '{{efectivoInicial_apertura}}': this.fmt(data.efectivoInicial.apertura),
      '{{efectivoInicial_real}}': this.fmt(data.efectivoInicial.real),
      '{{efectivoFinal_plan}}': this.fmt(data.efectivoFinal.planAnual),
      '{{efectivoFinal_apertura}}': this.fmt(data.efectivoFinal.apertura),
      '{{efectivoFinal_real}}': this.fmt(data.efectivoFinal.real),

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

  private getDefault5922Template(): string {
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Modelo SIEN 5922 - Balance General</title>
  <style>
    body { font-family: Arial, sans-serif; font-size: 10px; }
    h1 { text-align: center; font-size: 14px; margin: 10px 0; }
    table { width: 100%; border-collapse: collapse; margin: 10px 0; }
    th, td { border: 1px solid #000; padding: 4px; text-align: right; }
    th { background-color: #f0f0f0; text-align: center; }
    .header { text-align: center; margin-bottom: 20px; }
    .footer { margin-top: 30px; }
  </style>
</head>
<body>
  <div class="header">
    <h1>MODELO SIEN 5922 - BALANCE GENERAL</h1>
    <p>Informe Correspondiente: {{informeCorrespondiente}}</p>
    <p>Código Centro Informante: {{codigoCentroInformante}} | Centro Informante: {{centroInformante}}</p>
  </div>
  <table>
    <tr><th>Concepto</th><th>Plan Anual</th><th>Apertura</th><th>Real</th></tr>
    <tr><td colspan="4"><strong>ACTIVOS CORRIENTES</strong></td></tr>
    <tr><td>Efectivo</td><td>{{efectivo_plan}}</td><td>{{efectivo_apertura}}</td><td>{{efectivo_real}}</td></tr>
    <tr><td>Cuentas por Cobrar</td><td>{{cuentasXCobrar_plan}}</td><td>{{cuentasXCobrar_apertura}}</td><td>{{cuentasXCobrar_real}}</td></tr>
    <tr><td>Inventarios</td><td>{{inventarios_plan}}</td><td>{{inventarios_apertura}}</td><td>{{inventarios_real}}</td></tr>
    <tr><td>Pagos Anticipados</td><td>{{pagosAnticipados_plan}}</td><td>{{pagosAnticipados_apertura}}</td><td>{{pagosAnticipados_real}}</td></tr>
    <tr><td><strong>Total Activos Corrientes</strong></td><td><strong>{{totalActivosCorrientes_plan}}</strong></td><td><strong>{{totalActivosCorrientes_apertura}}</strong></td><td><strong>{{totalActivosCorrientes_real}}</strong></td></tr>
    <tr><td colspan="4"><strong>ACTIVOS NO CORRIENTES</strong></td></tr>
    <tr><td>Activos Fijos</td><td>{{activosFijos_plan}}</td><td>{{activosFijos_apertura}}</td><td>{{activosFijos_real}}</td></tr>
    <tr><td>Depreciación Acumulada</td><td>{{depreciacionAcumulada_plan}}</td><td>{{depreciacionAcumulada_apertura}}</td><td>{{depreciacionAcumulada_real}}</td></tr>
    <tr><td>Activos Intangibles</td><td>{{activosIntangibles_plan}}</td><td>{{activosIntangibles_apertura}}</td><td>{{activosIntangibles_real}}</td></tr>
    <tr><td>Otros Activos</td><td>{{otrosActivos_plan}}</td><td>{{otrosActivos_apertura}}</td><td>{{otrosActivos_real}}</td></tr>
    <tr><td><strong>Total Activos No Corrientes</strong></td><td><strong>{{totalActivosNoCorrientes_plan}}</strong></td><td><strong>{{totalActivosNoCorrientes_apertura}}</strong></td><td><strong>{{totalActivosNoCorrientes_real}}</strong></td></tr>
    <tr><td colspan="4"><strong>PASIVOS CORRIENTES</strong></td></tr>
    <tr><td>Cuentas por Pagar</td><td>{{cuentasXPagar_plan}}</td><td>{{cuentasXPagar_apertura}}</td><td>{{cuentasXPagar_real}}</td></tr>
    <tr><td>Préstamos CP</td><td>{{prestamosCP_plan}}</td><td>{{prestamosCP_apertura}}</td><td>{{prestamosCP_real}}</td></tr>
    <tr><td>Acumulaciones</td><td>{{acumulaciones_plan}}</td><td>{{acumulaciones_apertura}}</td><td>{{acumulaciones_real}}</td></tr>
    <tr><td><strong>Total Pasivos Corrientes</strong></td><td><strong>{{totalPasivosCorrientes_plan}}</strong></td><td><strong>{{totalPasivosCorrientes_apertura}}</strong></td><td><strong>{{totalPasivosCorrientes_real}}</strong></td></tr>
    <tr><td colspan="4"><strong>PASIVOS NO CORRIENTES</strong></td></tr>
    <tr><td>Préstamos LP</td><td>{{prestamosLP_plan}}</td><td>{{prestamosLP_apertura}}</td><td>{{prestamosLP_real}}</td></tr>
    <tr><td>Provisiones LP</td><td>{{provisionesLP_plan}}</td><td>{{provisionesLP_apertura}}</td><td>{{provisionesLP_real}}</td></tr>
    <tr><td><strong>Total Pasivos No Corrientes</strong></td><td><strong>{{totalPasivosNoCorrientes_plan}}</strong></td><td><strong>{{totalPasivosNoCorrientes_apertura}}</strong></td><td><strong>{{totalPasivosNoCorrientes_real}}</strong></td></tr>
    <tr><td colspan="4"><strong>PATRIMONIO</strong></td></tr>
    <tr><td>Capital Social</td><td>{{capitalSocial_plan}}</td><td>{{capitalSocial_apertura}}</td><td>{{capitalSocial_real}}</td></tr>
    <tr><td>Reservas</td><td>{{reservas_plan}}</td><td>{{reservas_apertura}}</td><td>{{reservas_real}}</td></tr>
    <tr><td>Resultados Acumulados</td><td>{{resultadosAcumulados_plan}}</td><td>{{resultadosAcumulados_apertura}}</td><td>{{resultadosAcumulados_real}}</td></tr>
    <tr><td>Resultado del Período</td><td>{{resultadoPeriodo_plan}}</td><td>{{resultadoPeriodo_apertura}}</td><td>{{resultadoPeriodo_real}}</td></tr>
    <tr><td><strong>Total Patrimonio</strong></td><td><strong>{{totalPatrimonio_plan}}</strong></td><td><strong>{{totalPatrimonio_apertura}}</strong></td><td><strong>{{totalPatrimonio_real}}</strong></td></tr>
    <tr><td><strong>TOTAL PASIVO Y PATRIMONIO</strong></td><td><strong>{{totalPasivoPatrimonio_plan}}</strong></td><td><strong>{{totalPasivoPatrimonio_apertura}}</strong></td><td><strong>{{totalPasivoPatrimonio_real}}</strong></td></tr>
  </table>
  <div class="footer">
    <p>Elaborado por: {{hechoNombre}} | Aprobado por: {{aprobadoNombre}}</p>
    <p>Fecha: {{fechaDia}}/{{fechaMes}}/{{fechaAnio}}</p>
    <p>Observaciones: {{observaciones}}</p>
  </div>
</body>
</html>
    `;
  }

  private getDefault5923Template(): string {
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Modelo SIEN 5923 - Estado de Resultados</title>
  <style>
    body { font-family: Arial, sans-serif; font-size: 10px; }
    h1 { text-align: center; font-size: 14px; margin: 10px 0; }
    table { width: 100%; border-collapse: collapse; margin: 10px 0; }
    th, td { border: 1px solid #000; padding: 4px; text-align: right; }
    th { background-color: #f0f0f0; text-align: center; }
    .header { text-align: center; margin-bottom: 20px; }
    .footer { margin-top: 30px; }
  </style>
</head>
<body>
  <div class="header">
    <h1>MODELO SIEN 5923 - ESTADO DE RESULTADOS</h1>
    <p>Informe Correspondiente: {{informeCorrespondiente}}</p>
    <p>Código Centro Informante: {{codigoCentroInformante}} | Centro Informante: {{centroInformante}}</p>
  </div>
  <table>
    <tr><th>Concepto</th><th>Plan Anual</th><th>Apertura</th><th>Real</th></tr>
    <tr><td colspan="4"><strong>INGRESOS</strong></td></tr>
    <tr><td>Ventas Netas</td><td>{{ventasNetas_plan}}</td><td>{{ventasNetas_apertura}}</td><td>{{ventasNetas_real}}</td></tr>
    <tr><td>Otros Ingresos</td><td>{{otrosIngresos_plan}}</td><td>{{otrosIngresos_apertura}}</td><td>{{otrosIngresos_real}}</td></tr>
    <tr><td><strong>Total Ingresos</strong></td><td><strong>{{totalIngresos_plan}}</strong></td><td><strong>{{totalIngresos_apertura}}</strong></td><td><strong>{{totalIngresos_real}}</strong></td></tr>
    <tr><td colspan="4"><strong>COSTO DE VENTAS</strong></td></tr>
    <tr><td>Costo Mercancías Vendidas</td><td>{{costoMercancias_plan}}</td><td>{{costoMercancias_apertura}}</td><td>{{costoMercancias_real}}</td></tr>
    <tr><td>Costo Servicios</td><td>{{costoServicios_plan}}</td><td>{{costoServicios_apertura}}</td><td>{{costoServicios_real}}</td></tr>
    <tr><td><strong>Total Costo Ventas</strong></td><td><strong>{{totalCostoVentas_plan}}</strong></td><td><strong>{{totalCostoVentas_apertura}}</strong></td><td><strong>{{totalCostoVentas_real}}</strong></td></tr>
    <tr><td><strong>UTILIDAD BRUTA</strong></td><td><strong>{{utilidadBruta_plan}}</strong></td><td><strong>{{utilidadBruta_apertura}}</strong></td><td><strong>{{utilidadBruta_real}}</strong></td></tr>
    <tr><td colspan="4"><strong>GASTOS OPERATIVOS</strong></td></tr>
    <tr><td>Gastos de Ventas</td><td>{{gastosVentas_plan}}</td><td>{{gastosVentas_apertura}}</td><td>{{gastosVentas_real}}</td></tr>
    <tr><td>Gastos Administrativos</td><td>{{gastosAdministrativos_plan}}</td><td>{{gastosAdministrativos_apertura}}</td><td>{{gastosAdministrativos_real}}</td></tr>
    <tr><td>Gastos Financieros</td><td>{{gastosFinancieros_plan}}</td><td>{{gastosFinancieros_apertura}}</td><td>{{gastosFinancieros_real}}</td></tr>
    <tr><td><strong>Total Gastos Operativos</strong></td><td><strong>{{totalGastosOperativos_plan}}</strong></td><td><strong>{{totalGastosOperativos_apertura}}</strong></td><td><strong>{{totalGastosOperativos_real}}</strong></td></tr>
    <tr><td><strong>UTILIDAD OPERATIVA</strong></td><td><strong>{{utilidadOperativa_plan}}</strong></td><td><strong>{{utilidadOperativa_apertura}}</strong></td><td><strong>{{utilidadOperativa_real}}</strong></td></tr>
    <tr><td colspan="4"><strong>OTROS INGRESOS/GASTOS</strong></td></tr>
    <tr><td>Ingresos Extraordinarios</td><td>{{ingresosExtraordinarios_plan}}</td><td>{{ingresosExtraordinarios_apertura}}</td><td>{{ingresosExtraordinarios_real}}</td></tr>
    <tr><td>Gastos Extraordinarios</td><td>{{gastosExtraordinarios_plan}}</td><td>{{gastosExtraordinarios_apertura}}</td><td>{{gastosExtraordinarios_real}}</td></tr>
    <tr><td><strong>Total Otros</strong></td><td><strong>{{totalOtros_plan}}</strong></td><td><strong>{{totalOtros_apertura}}</strong></td><td><strong>{{totalOtros_real}}</strong></td></tr>
    <tr><td><strong>UTILIDAD ANTES IMPUESTOS</strong></td><td><strong>{{utilidadAntesImpuestos_plan}}</strong></td><td><strong>{{utilidadAntesImpuestos_apertura}}</strong></td><td><strong>{{utilidadAntesImpuestos_real}}</strong></td></tr>
    <tr><td>Impuesto Renta (35%)</td><td>{{impuestoRenta_plan}}</td><td>{{impuestoRenta_apertura}}</td><td>{{impuestoRenta_real}}</td></tr>
    <tr><td><strong>UTILIDAD NETA</strong></td><td><strong>{{utilidadNeta_plan}}</strong></td><td><strong>{{utilidadNeta_apertura}}</strong></td><td><strong>{{utilidadNeta_real}}</strong></td></tr>
  </table>
  <div class="footer">
    <p>Elaborado por: {{hechoNombre}} | Aprobado por: {{aprobadoNombre}}</p>
    <p>Fecha: {{fechaDia}}/{{fechaMes}}/{{fechaAnio}}</p>
    <p>Observaciones: {{observaciones}}</p>
  </div>
</body>
</html>
    `;
  }

  private getDefaultFlujoEfectivoTemplate(): string {
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Flujo de Efectivo</title>
  <style>
    body { font-family: Arial, sans-serif; font-size: 10px; }
    h1 { text-align: center; font-size: 14px; margin: 10px 0; }
    table { width: 100%; border-collapse: collapse; margin: 10px 0; }
    th, td { border: 1px solid #000; padding: 4px; text-align: right; }
    th { background-color: #f0f0f0; text-align: center; }
    .header { text-align: center; margin-bottom: 20px; }
    .footer { margin-top: 30px; }
  </style>
</head>
<body>
  <div class="header">
    <h1>FLUJO DE EFECTIVO</h1>
    <p>Informe Correspondiente: {{informeCorrespondiente}}</p>
    <p>Código Centro Informante: {{codigoCentroInformante}} | Centro Informante: {{centroInformante}}</p>
  </div>
  <table>
    <tr><th>Concepto</th><th>Plan Anual</th><th>Apertura</th><th>Real</th></tr>
    <tr><td colspan="4"><strong>ACTIVIDADES OPERATIVAS</strong></td></tr>
    <tr><td>Cobro de Ventas</td><td>{{cobroVentas_plan}}</td><td>{{cobroVentas_apertura}}</td><td>{{cobroVentas_real}}</td></tr>
    <tr><td>Pago a Proveedores</td><td>{{pagoProveedores_plan}}</td><td>{{pagoProveedores_apertura}}</td><td>{{pagoProveedores_real}}</td></tr>
    <tr><td>Pago de Personal</td><td>{{pagoPersonal_plan}}</td><td>{{pagoPersonal_apertura}}</td><td>{{pagoPersonal_real}}</td></tr>
    <tr><td>Pago de Impuestos</td><td>{{pagoImpuestos_plan}}</td><td>{{pagoImpuestos_apertura}}</td><td>{{pagoImpuestos_real}}</td></tr>
    <tr><td>Otros Pagos Operativos</td><td>{{otrosPagosOperativos_plan}}</td><td>{{otrosPagosOperativos_apertura}}</td><td>{{otrosPagosOperativos_real}}</td></tr>
    <tr><td><strong>Flujo Neto Operativo</strong></td><td><strong>{{flujoNetoOperativo_plan}}</strong></td><td><strong>{{flujoNetoOperativo_apertura}}</strong></td><td><strong>{{flujoNetoOperativo_real}}</strong></td></tr>
    <tr><td colspan="4"><strong>ACTIVIDADES DE INVERSIÓN</strong></td></tr>
    <tr><td>Compra de Activos Fijos</td><td>{{compraActivosFijos_plan}}</td><td>{{compraActivosFijos_apertura}}</td><td>{{compraActivosFijos_real}}</td></tr>
    <tr><td>Venta de Activos Fijos</td><td>{{ventaActivosFijos_plan}}</td><td>{{ventaActivosFijos_apertura}}</td><td>{{ventaActivosFijos_real}}</td></tr>
    <tr><td>Inversiones Financieras</td><td>{{inversionesFinancieras_plan}}</td><td>{{inversionesFinancieras_apertura}}</td><td>{{inversionesFinancieras_real}}</td></tr>
    <tr><td><strong>Flujo Neto Inversión</strong></td><td><strong>{{flujoNetoInversion_plan}}</strong></td><td><strong>{{flujoNetoInversion_apertura}}</strong></td><td><strong>{{flujoNetoInversion_real}}</strong></td></tr>
    <tr><td colspan="4"><strong>ACTIVIDADES DE FINANCIAMIENTO</strong></td></tr>
    <tr><td>Préstamos Recibidos</td><td>{{prestamosRecibidos_plan}}</td><td>{{prestamosRecibidos_apertura}}</td><td>{{prestamosRecibidos_real}}</td></tr>
    <tr><td>Pago de Préstamos</td><td>{{pagoPrestamos_plan}}</td><td>{{pagoPrestamos_apertura}}</td><td>{{pagoPrestamos_real}}</td></tr>
    <tr><td>Pago de Dividendos</td><td>{{pagoDividendos_plan}}</td><td>{{pagoDividendos_apertura}}</td><td>{{pagoDividendos_real}}</td></tr>
    <tr><td>Aporte de Capital</td><td>{{aporteCapital_plan}}</td><td>{{aporteCapital_apertura}}</td><td>{{aporteCapital_real}}</td></tr>
    <tr><td><strong>Flujo Neto Financiamiento</strong></td><td><strong>{{flujoNetoFinanciamiento_plan}}</strong></td><td><strong>{{flujoNetoFinanciamiento_apertura}}</strong></td><td><strong>{{flujoNetoFinanciamiento_real}}</strong></td></tr>
    <tr><td><strong>VARIACIÓN DE EFECTIVO</strong></td><td><strong>{{variacionEfectivo_plan}}</strong></td><td><strong>{{variacionEfectivo_apertura}}</strong></td><td><strong>{{variacionEfectivo_real}}</strong></td></tr>
    <tr><td>Efectivo Inicial</td><td>{{efectivoInicial_plan}}</td><td>{{efectivoInicial_apertura}}</td><td>{{efectivoInicial_real}}</td></tr>
    <tr><td><strong>Efectivo Final</strong></td><td><strong>{{efectivoFinal_plan}}</strong></td><td><strong>{{efectivoFinal_apertura}}</strong></td><td><strong>{{efectivoFinal_real}}</strong></td></tr>
  </table>
  <div class="footer">
    <p>Elaborado por: {{hechoNombre}} | Aprobado por: {{aprobadoNombre}}</p>
    <p>Fecha: {{fechaDia}}/{{fechaMes}}/{{fechaAnio}}</p>
    <p>Observaciones: {{observaciones}}</p>
  </div>
</body>
</html>
    `;
  }
}
