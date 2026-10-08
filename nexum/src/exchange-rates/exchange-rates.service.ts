import { Injectable, Logger } from '@nestjs/common';

/**
 * Tasas de cambio USD → CUP agregadas desde las fuentes oficiales:
 *
 * - Banco Central de Cuba (api.bc.gob.cu): tasaOficial (Segmento I, sector
 *   estatal/gobierno), tasaPublica (Segmento II, población) y tasaEspecial
 *   (Segmento III).
 * - elToque (tasas.eltoque.com): tasa del mercado informal. Requiere la
 *   variable de entorno ELTOQUE_API_KEY (token Bearer de eltoque.com); si no
 *   está configurada, la tasa informal se devuelve como null.
 *
 * Se cachea 10 minutos para no golpear las APIs externas en cada consulta —
 * recomendación explícita del propio BCC.
 */
export interface ExchangeRatesResult {
  currency: string;
  /** Segmento I — tasa oficial del sector estatal/gobierno. */
  segmentoI: number | null;
  /** Segmento II — tasa pública (CADECA / población). */
  segmentoII: number | null;
  /** Segmento III — tasa especial. */
  segmentoIII: number | null;
  /** Mercado informal según elToque. */
  informal: number | null;
  /** Fecha de vigencia de las tasas del BCC. */
  fechaBcc: string | null;
  /** Fecha de la consulta del mercado informal. */
  fechaInformal: string | null;
  fetchedAt: string;
}

const BCC_URL = 'https://api.bc.gob.cu/v1/tasas-de-cambio/activas';
const ELTOQUE_URL = 'https://tasas.eltoque.com/v1/trmi';
const CACHE_TTL_MS = 10 * 60 * 1000;
const FETCH_TIMEOUT_MS = 10_000;

@Injectable()
export class ExchangeRatesService {
  private readonly logger = new Logger(ExchangeRatesService.name);
  private cache: { data: ExchangeRatesResult; at: number } | null = null;

  async getUsdRates(): Promise<ExchangeRatesResult> {
    if (this.cache && Date.now() - this.cache.at < CACHE_TTL_MS) {
      return this.cache.data;
    }

    const [bcc, informal] = await Promise.all([
      this.fetchBcc(),
      this.fetchElToque(),
    ]);

    const data: ExchangeRatesResult = {
      currency: 'USD',
      segmentoI: bcc.segmentoI,
      segmentoII: bcc.segmentoII,
      segmentoIII: bcc.segmentoIII,
      informal: informal.rate,
      fechaBcc: bcc.fecha,
      fechaInformal: informal.fecha,
      fetchedAt: new Date().toISOString(),
    };
    this.cache = { data, at: Date.now() };
    return data;
  }

  private async fetchBcc(): Promise<{
    segmentoI: number | null;
    segmentoII: number | null;
    segmentoIII: number | null;
    fecha: string | null;
  }> {
    try {
      const res = await fetch(BCC_URL, {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (!res.ok) {
        throw new Error(`BCC respondió ${res.status}`);
      }
      const body = await res.json();
      const rows: any[] = Array.isArray(body)
        ? body
        : body?.tasas || body?.data || [];
      const usd = rows.find(
        (r) =>
          String(r.codigoMoneda || r.moneda || r.currency || '')
            .toUpperCase() === 'USD',
      );
      if (!usd) {
        throw new Error('USD no encontrado en la respuesta del BCC');
      }
      return {
        segmentoI: toNumber(usd.tasaOficial),
        segmentoII: toNumber(usd.tasaPublica),
        segmentoIII: toNumber(usd.tasaEspecial),
        fecha: usd.fechaDia ?? usd.fecha ?? body?.fechaDia ?? null,
      };
    } catch (err) {
      this.logger.warn(
        `No se pudo obtener tasas del BCC: ${(err as Error).message}`,
      );
      return { segmentoI: null, segmentoII: null, segmentoIII: null, fecha: null };
    }
  }

  private async fetchElToque(): Promise<{
    rate: number | null;
    fecha: string | null;
  }> {
    try {
      const token = process.env.ELTOQUE_API_KEY;
      const res = await fetch(ELTOQUE_URL, {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) {
        throw new Error(
          `elToque respondió ${res.status}${!token ? ' (falta ELTOQUE_API_KEY)' : ''}`,
        );
      }
      const body = await res.json();
      return {
        rate: toNumber(body?.tasas?.USD ?? body?.USD),
        fecha: body?.date ?? null,
      };
    } catch (err) {
      this.logger.warn(
        `No se pudo obtener la tasa informal de elToque: ${(err as Error).message}`,
      );
      return { rate: null, fecha: null };
    }
  }
}

function toNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}
