import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as PDFDocument from 'pdfkit';
import { Voucher } from '../entities/voucher.entity';
import { Account } from '../entities/account.entity';
import { LoggerService } from '../common/logger.service';

@Injectable()
export class PdfReportService {
  constructor(
    @InjectRepository(Voucher)
    private readonly voucherRepo: Repository<Voucher>,
    @InjectRepository(Account)
    private readonly accountRepo: Repository<Account>,
    private logger: LoggerService,
  ) {
    this.logger.setContext('PdfReportService');
  }

  async generateLibroDiario(
    companyId: number,
    startDate: Date,
    endDate: Date,
  ): Promise<Buffer> {
    this.logger.logAudit(
      'LIBRO_DIARIO_GENERATED',
      'Voucher',
      {
        companyId: companyId.toString(),
        startDate,
        endDate,
      }
    );

    const vouchers = await this.voucherRepo.find({
      where: {
        companyId,
        createdAt: { $gte: startDate, $lte: endDate } as any,
      },
      relations: ['lines', 'lines.account'],
      order: { createdAt: 'ASC', voucherNumber: 'ASC' },
    });

    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks: Buffer[] = [];

    doc.on('data', (chunk) => chunks.push(chunk));

    // Header
    doc.fontSize(18).font('Helvetica-Bold').text('LIBRO DIARIO', { align: 'center' });
    doc.moveDown();
    doc.fontSize(10).font('Helvetica').text(`Período: ${startDate.toLocaleDateString()} - ${endDate.toLocaleDateString()}`, { align: 'center' });
    doc.moveDown();

    // Table header
    const tableTop = doc.y;
    const headers = ['Fecha', 'N° Comprobante', 'Cuenta', 'Descripción', 'Debe', 'Haber'];
    const columnWidths = [80, 100, 80, 120, 60, 60];
    let xPos = 50;

    doc.fontSize(9).font('Helvetica-Bold');
    headers.forEach((header, i) => {
      doc.text(header, xPos, tableTop, { width: columnWidths[i] });
      xPos += columnWidths[i];
    });

    doc.moveDown();
    let yPos = doc.y;

    // Table content
    doc.fontSize(8).font('Helvetica');
    let totalDebe = 0;
    let totalHaber = 0;

    for (const voucher of vouchers) {
      for (const line of voucher.lines) {
        if (yPos > 700) {
          doc.addPage();
          yPos = 50;
        }

        xPos = 50;
        doc.text(voucher.createdAt.toLocaleDateString(), xPos, yPos, { width: columnWidths[0] });
        xPos += columnWidths[0];
        doc.text(voucher.voucherNumber, xPos, yPos, { width: columnWidths[1] });
        xPos += columnWidths[1];
        doc.text(line.account?.code || '', xPos, yPos, { width: columnWidths[2] });
        xPos += columnWidths[2];
        doc.text(line.description || voucher.description, xPos, yPos, { width: columnWidths[3] });
        xPos += columnWidths[3];
        
        if (line.debit > 0) {
          doc.text(line.debit.toFixed(2), xPos, yPos, { width: columnWidths[4], align: 'right' });
          totalDebe += line.debit;
        }
        xPos += columnWidths[4];
        
        if (line.credit > 0) {
          doc.text(line.credit.toFixed(2), xPos, yPos, { width: columnWidths[5], align: 'right' });
          totalHaber += line.credit;
        }

        yPos += 20;
      }
    }

    // Totals
    doc.addPage();
    doc.fontSize(12).font('Helvetica-Bold').text('RESUMEN', { align: 'center' });
    doc.moveDown();
    doc.fontSize(10).font('Helvetica');
    doc.text(`Total Debe: ${totalDebe.toFixed(2)}`);
    doc.text(`Total Haber: ${totalHaber.toFixed(2)}`);
    doc.text(`Diferencia: ${(totalDebe - totalHaber).toFixed(2)}`);

    doc.end();

    return new Promise((resolve) => {
      doc.on('end', () => resolve(Buffer.concat(chunks)));
    });
  }

  async generateLibroMayor(
    companyId: number,
    startDate: Date,
    endDate: Date,
  ): Promise<Buffer> {
    this.logger.logAudit(
      'LIBRO_MAYOR_GENERATED',
      'Account',
      {
        companyId: companyId.toString(),
        startDate,
        endDate,
      }
    );

    const accounts = await this.accountRepo.find({
      where: { companyId },
      order: { code: 'ASC' },
    });

    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks: Buffer[] = [];

    doc.on('data', (chunk) => chunks.push(chunk));

    // Header
    doc.fontSize(18).font('Helvetica-Bold').text('LIBRO MAYOR', { align: 'center' });
    doc.moveDown();
    doc.fontSize(10).font('Helvetica').text(`Período: ${startDate.toLocaleDateString()} - ${endDate.toLocaleDateString()}`, { align: 'center' });
    doc.moveDown();

    for (const account of accounts) {
      // Get vouchers for this account
      const vouchers = await this.voucherRepo
        .createQueryBuilder('voucher')
        .leftJoin('voucher.lines', 'line')
        .leftJoin('line.account', 'account')
        .where('account.id = :accountId', { accountId: account.id })
        .andWhere('voucher.createdAt >= :startDate', { startDate })
        .andWhere('voucher.createdAt <= :endDate', { endDate })
        .orderBy('voucher.createdAt', 'ASC')
        .getMany();

      if (vouchers.length === 0) continue;

      // Account header
      if (doc.y > 700) {
        doc.addPage();
      }

      doc.fontSize(12).font('Helvetica-Bold').text(`${account.code} - ${account.name}`);
      doc.moveDown();

      // Table header
      const tableTop = doc.y;
      const headers = ['Fecha', 'N° Comprobante', 'Descripción', 'Debe', 'Haber', 'Saldo'];
      const columnWidths = [80, 100, 120, 60, 60, 60];
      let xPos = 50;

      doc.fontSize(9).font('Helvetica-Bold');
      headers.forEach((header, i) => {
        doc.text(header, xPos, tableTop, { width: columnWidths[i] });
        xPos += columnWidths[i];
      });

      doc.moveDown();
      let yPos = doc.y;
      let saldo = 0;

      // Table content
      doc.fontSize(8).font('Helvetica');
      for (const voucher of vouchers) {
        for (const line of voucher.lines) {
          if (line.accountId !== account.id) continue;

          if (yPos > 700) {
            doc.addPage();
            yPos = 50;
          }

          xPos = 50;
          doc.text(voucher.createdAt.toLocaleDateString(), xPos, yPos, { width: columnWidths[0] });
          xPos += columnWidths[0];
          doc.text(voucher.voucherNumber, xPos, yPos, { width: columnWidths[1] });
          xPos += columnWidths[1];
          doc.text(line.description || voucher.description, xPos, yPos, { width: columnWidths[2] });
          xPos += columnWidths[2];
          
          if (line.debit > 0) {
            doc.text(line.debit.toFixed(2), xPos, yPos, { width: columnWidths[3], align: 'right' });
            saldo += line.debit;
          }
          xPos += columnWidths[3];
          
          if (line.credit > 0) {
            doc.text(line.credit.toFixed(2), xPos, yPos, { width: columnWidths[4], align: 'right' });
            saldo -= line.credit;
          }
          xPos += columnWidths[4];
          
          doc.text(saldo.toFixed(2), xPos, yPos, { width: columnWidths[5], align: 'right' });

          yPos += 20;
        }
      }

      // Account total
      doc.moveDown();
      doc.fontSize(10).font('Helvetica-Bold').text(`Saldo Final: ${saldo.toFixed(2)}`);
      doc.moveDown();
    }

    doc.end();

    return new Promise((resolve) => {
      doc.on('end', () => resolve(Buffer.concat(chunks)));
    });
  }
}
