import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { DocumentSequence } from '../../entities/document-sequence.entity';

/**
 * Emisor de consecutivos de documentos.
 *
 * El incremento se realiza en una única sentencia atómica
 * (INSERT ... ON CONFLICT DO UPDATE ... RETURNING), de modo que dos peticiones
 * simultáneas nunca obtienen el mismo número y los borrados no reutilizan
 * consecutivos ya emitidos, tal como exige el control de documentos numerados.
 */
@Injectable()
export class DocumentSequenceService {
  constructor(
    @InjectRepository(DocumentSequence)
    private readonly sequenceRepo: Repository<DocumentSequence>,
  ) {}

  /**
   * Reserva y devuelve el siguiente número de la serie.
   *
   * @param companyId Empresa propietaria de la serie.
   * @param scope     Ámbito de la serie (p. ej. 'invoice', 'voucher:FAC').
   * @param year      Año de la serie; 0 para series continuas sin reinicio.
   * @param manager   EntityManager opcional para participar en una transacción.
   */
  async next(
    companyId: number,
    scope: string,
    year = 0,
    manager?: EntityManager,
  ): Promise<number> {
    const runner = manager
      ? manager.getRepository(DocumentSequence)
      : this.sequenceRepo;

    const rows: Array<{ last_number: number | string }> = await runner.query(
      `INSERT INTO document_sequences (company_id, scope, year, last_number)
       VALUES ($1, $2, $3, 1)
       ON CONFLICT (company_id, scope, year)
       DO UPDATE SET last_number = document_sequences.last_number + 1,
                     updated_at  = NOW()
       RETURNING last_number`,
      [companyId, scope, year],
    );

    return Number(rows[0].last_number);
  }

  /**
   * Devuelve el siguiente número ya formateado.
   *
   * @param prefix  Prefijo del documento (p. ej. 'INV', 'CXC').
   * @param padding Dígitos del consecutivo.
   * @param includeYear Si el año debe formar parte del código.
   */
  async nextFormatted(
    companyId: number,
    scope: string,
    prefix: string,
    options?: {
      year?: number;
      padding?: number;
      includeYear?: boolean;
      manager?: EntityManager;
    },
  ): Promise<string> {
    const year = options?.year ?? 0;
    const padding = options?.padding ?? 6;
    const number = await this.next(companyId, scope, year, options?.manager);
    const suffix = String(number).padStart(padding, '0');
    return options?.includeYear && year
      ? `${prefix}-${year}-${suffix}`
      : `${prefix}-${suffix}`;
  }

  /**
   * Alinea la serie con los documentos ya existentes.
   *
   * Se usa una sola vez al migrar módulos que numeraban con COUNT(*), para que
   * el primer consecutivo emitido no colisione con los documentos históricos.
   */
  async seed(
    companyId: number,
    scope: string,
    year: number,
    lastNumber: number,
  ): Promise<void> {
    await this.sequenceRepo.query(
      `INSERT INTO document_sequences (company_id, scope, year, last_number)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (company_id, scope, year)
       DO UPDATE SET last_number = GREATEST(document_sequences.last_number, $4),
                     updated_at  = NOW()`,
      [companyId, scope, year, lastNumber],
    );
  }
}
