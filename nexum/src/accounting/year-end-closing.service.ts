/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument */
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Account } from '../entities/account.entity';
import { VoucherLine } from '../entities/voucher-line.entity';
import { FiscalYear } from '../entities/fiscal-year.entity';
import { VoucherService } from './voucher.service';

/**
 * Cuenta puente de resultados del Nomenclador (cuenta 999 "Resultado").
 * Recoge el saldo de todas las cuentas nominales al cierre del ejercicio.
 */
const RESULT_ACCOUNT_CODE = '999';

/**
 * Cuenta de patrimonio a la que se traslada el resultado del ejercicio.
 * 630-634 "Utilidades Retenidas" (Grupo 30 - Patrimonio Neto).
 */
const RETAINED_EARNINGS_CODE = '630';

interface AccountBalanceRow {
  code: string;
  name: string;
  type: string;
  debit: string | number;
  credit: string | number;
}

/**
 * Servicio de cierre y apertura del ejercicio económico.
 *
 * Implementa los asientos obligatorios exigidos por las Normas Cubanas de
 * Contabilidad (Res. 235/2005 MFP):
 *
 *  1. Asiento de cierre: cancela todas las cuentas nominales (gastos e
 *     ingresos, grupos 40/50/60 del Nomenclador) contra la cuenta 999
 *     "Resultado".
 *  2. Asiento de determinación del resultado: traslada el saldo de la 999 a
 *     "Utilidades Retenidas" (630).
 *  3. Asiento de apertura: reproduce en el ejercicio siguiente los saldos de
 *     las cuentas reales (activo, pasivo y patrimonio) como primer documento
 *     del Libro Diario del nuevo año.
 */
@Injectable()
export class YearEndClosingService {
  private readonly logger = new Logger(YearEndClosingService.name);

  constructor(
    @InjectRepository(Account)
    private readonly accountRepo: Repository<Account>,
    @InjectRepository(VoucherLine)
    private readonly voucherLineRepo: Repository<VoucherLine>,
    private readonly voucherService: VoucherService,
  ) {}

  /**
   * Suma débitos y créditos contabilizados por cuenta en un rango de fechas.
   * Solo considera comprobantes en estado 'posted'.
   */
  private async getPostedBalances(
    companyId: number,
    fromDate: string | null,
    toDate: string,
    accountTypes: string[],
  ): Promise<AccountBalanceRow[]> {
    const qb = this.voucherLineRepo
      .createQueryBuilder('vl')
      .innerJoin('vl.voucher', 'v')
      .innerJoin('vl.account', 'a')
      .select('a.code', 'code')
      .addSelect('a.name', 'name')
      .addSelect('a.type', 'type')
      .addSelect('SUM(vl.debit)', 'debit')
      .addSelect('SUM(vl.credit)', 'credit')
      .where('v.companyId = :companyId', { companyId })
      .andWhere('v.status = :status', { status: 'posted' })
      .andWhere('v.date <= :toDate', { toDate })
      .andWhere('a.type IN (:...accountTypes)', { accountTypes })
      .groupBy('a.code')
      .addGroupBy('a.name')
      .addGroupBy('a.type')
      .orderBy('a.code', 'ASC');

    if (fromDate) {
      qb.andWhere('v.date >= :fromDate', { fromDate });
    }

    return qb.getRawMany<AccountBalanceRow>();
  }

  private async assertAccountExists(companyId: number, code: string) {
    const account = await this.accountRepo.findOneBy({ code, companyId });
    if (!account) {
      throw new BadRequestException(
        `No se puede cerrar el ejercicio: la cuenta ${code} no existe en el plan de cuentas de la empresa. ` +
          `Ejecute la carga del Nomenclador de Cuentas 2016 antes de cerrar.`,
      );
    }
    return account;
  }

  /**
   * Genera los asientos de cierre del ejercicio.
   *
   * Debe invocarse ANTES de cerrar los períodos contables, ya que el
   * comprobante se registra con fecha del último día del ejercicio.
   */
  async generateClosingEntries(
    companyId: number,
    fiscalYear: FiscalYear,
    closedBy?: string,
  ): Promise<{
    closingVoucherId: string | null;
    resultVoucherId: string | null;
    totalIncome: number;
    totalExpense: number;
    result: number;
  }> {
    await this.assertAccountExists(companyId, RESULT_ACCOUNT_CODE);
    await this.assertAccountExists(companyId, RETAINED_EARNINGS_CODE);

    const rows = await this.getPostedBalances(
      companyId,
      fiscalYear.startDate,
      fiscalYear.endDate,
      ['income', 'expense'],
    );

    const lines: Array<{
      accountCode: string;
      debit: number;
      credit: number;
      description: string;
    }> = [];

    let totalIncome = 0;
    let totalExpense = 0;
    // Saldo neto de las cuentas nominales: positivo = pérdida, negativo = utilidad.
    let net = 0;

    for (const row of rows) {
      // La cuenta 999 es la propia contrapartida del cierre: se excluye.
      if (row.code === RESULT_ACCOUNT_CODE) continue;

      const debit = Number(row.debit) || 0;
      const credit = Number(row.credit) || 0;
      const balance = Math.round((debit - credit) * 100) / 100;
      if (Math.abs(balance) < 0.01) continue;

      if (row.type === 'expense') {
        totalExpense += balance;
      } else {
        totalIncome += -balance;
      }
      net += balance;

      // Se cancela el saldo con un apunte de signo contrario.
      lines.push({
        accountCode: row.code,
        debit: balance < 0 ? -balance : 0,
        credit: balance > 0 ? balance : 0,
        description: `Cierre ${fiscalYear.name} - ${row.name}`,
      });
    }

    if (lines.length === 0) {
      this.logger.warn(
        `Ejercicio ${fiscalYear.name}: no hay movimiento en cuentas nominales, no se genera asiento de cierre`,
      );
      return {
        closingVoucherId: null,
        resultVoucherId: null,
        totalIncome: 0,
        totalExpense: 0,
        result: 0,
      };
    }

    net = Math.round(net * 100) / 100;
    totalIncome = Math.round(totalIncome * 100) / 100;
    totalExpense = Math.round(totalExpense * 100) / 100;

    // Contrapartida en la 999: débito si hay pérdida, crédito si hay utilidad.
    lines.push({
      accountCode: RESULT_ACCOUNT_CODE,
      debit: net > 0 ? net : 0,
      credit: net < 0 ? -net : 0,
      description:
        net > 0
          ? `Pérdida del ejercicio ${fiscalYear.name}`
          : `Utilidad del ejercicio ${fiscalYear.name}`,
    });

    const closingVoucher = await this.voucherService.createVoucher(companyId, {
      date: fiscalYear.endDate,
      description: `Asiento de cierre del ejercicio ${fiscalYear.name}`,
      type: 'cierre',
      reference: `CIERRE-${fiscalYear.name}`,
      sourceModule: 'manual',
      sourceDocumentId: `fiscal-year:${fiscalYear.id}`,
      createdBy: closedBy || 'Sistema',
      lines,
    });

    // Traslado del resultado a Utilidades Retenidas.
    const resultAmount = Math.abs(net);
    let resultVoucherId: string | null = null;
    if (resultAmount >= 0.01) {
      const resultVoucher = await this.voucherService.createVoucher(companyId, {
        date: fiscalYear.endDate,
        description: `Traslado del resultado del ejercicio ${fiscalYear.name} a Utilidades Retenidas`,
        type: 'cierre',
        reference: `RESULTADO-${fiscalYear.name}`,
        sourceModule: 'manual',
        sourceDocumentId: `fiscal-year-result:${fiscalYear.id}`,
        createdBy: closedBy || 'Sistema',
        lines: [
          {
            accountCode: RESULT_ACCOUNT_CODE,
            debit: net < 0 ? resultAmount : 0,
            credit: net > 0 ? resultAmount : 0,
            description: `Cancelación cuenta Resultado ${fiscalYear.name}`,
          },
          {
            accountCode: RETAINED_EARNINGS_CODE,
            debit: net > 0 ? resultAmount : 0,
            credit: net < 0 ? resultAmount : 0,
            description:
              net > 0
                ? `Pérdida del ejercicio ${fiscalYear.name}`
                : `Utilidad del ejercicio ${fiscalYear.name}`,
          },
        ],
      });
      resultVoucherId = resultVoucher.id;
    }

    this.logger.log(
      `Cierre ${fiscalYear.name}: ingresos ${totalIncome}, gastos ${totalExpense}, resultado ${-net}`,
    );

    return {
      closingVoucherId: closingVoucher.id,
      resultVoucherId,
      totalIncome,
      totalExpense,
      result: Math.round(-net * 100) / 100,
    };
  }

  /**
   * Genera el asiento de apertura de un ejercicio a partir de los saldos de las
   * cuentas reales al cierre del ejercicio anterior.
   *
   * El asiento se registra como documento del Libro Diario del nuevo año sin
   * volver a afectar los saldos de las cuentas, que ya vienen arrastrados.
   */
  async generateOpeningEntry(
    companyId: number,
    newFiscalYear: FiscalYear,
    previousFiscalYear: FiscalYear,
    createdBy?: string,
  ): Promise<string | null> {
    const rows = await this.getPostedBalances(
      companyId,
      null,
      previousFiscalYear.endDate,
      ['asset', 'liability', 'equity'],
    );

    const lines: Array<{
      accountCode: string;
      debit: number;
      credit: number;
      description: string;
    }> = [];

    let totalDebit = 0;
    let totalCredit = 0;

    for (const row of rows) {
      const debit = Number(row.debit) || 0;
      const credit = Number(row.credit) || 0;
      const balance = Math.round((debit - credit) * 100) / 100;
      if (Math.abs(balance) < 0.01) continue;

      if (balance > 0) totalDebit += balance;
      else totalCredit += -balance;

      lines.push({
        accountCode: row.code,
        debit: balance > 0 ? balance : 0,
        credit: balance < 0 ? -balance : 0,
        description: `Apertura ${newFiscalYear.name} - ${row.name}`,
      });
    }

    if (lines.length < 2) {
      this.logger.warn(
        `Ejercicio ${newFiscalYear.name}: sin saldos de balance que arrastrar, no se genera asiento de apertura`,
      );
      return null;
    }

    const difference = Math.round((totalDebit - totalCredit) * 100) / 100;
    if (Math.abs(difference) >= 0.01) {
      throw new BadRequestException(
        `No se puede generar el asiento de apertura de ${newFiscalYear.name}: los saldos de las cuentas reales ` +
          `del ejercicio ${previousFiscalYear.name} no cuadran (débito ${totalDebit.toFixed(2)} ≠ crédito ${totalCredit.toFixed(2)}). ` +
          `Verifique que el ejercicio anterior se haya cerrado correctamente.`,
      );
    }

    const voucher = await this.voucherService.createVoucher(companyId, {
      date: newFiscalYear.startDate,
      description: `Asiento de apertura del ejercicio ${newFiscalYear.name}`,
      type: 'apertura',
      reference: `APERTURA-${newFiscalYear.name}`,
      sourceModule: 'manual',
      sourceDocumentId: `fiscal-year-opening:${newFiscalYear.id}`,
      createdBy: createdBy || 'Sistema',
      // Los saldos ya están arrastrados en las cuentas: el asiento es documental.
      skipBalanceUpdate: true,
      lines,
    });

    this.logger.log(
      `Asiento de apertura ${newFiscalYear.name} generado con ${lines.length} cuentas (${totalDebit.toFixed(2)})`,
    );

    return voucher.id;
  }
}
