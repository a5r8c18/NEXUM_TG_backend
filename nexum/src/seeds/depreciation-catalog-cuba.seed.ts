import { DataSource } from 'typeorm';
import { DepreciationCatalog } from '../entities/depreciation-catalog.entity';

export interface DepreciationCatalogSubgroup {
  subgroupName: string;
  /** Literal del inciso en la tabla oficial de tasas. */
  detail: string;
  /** Tasa anual de depreciación en por ciento. */
  rate: number;
}

export interface DepreciationCatalogGroup {
  groupNumber: number;
  groupName: string;
  subgroups: DepreciationCatalogSubgroup[];
}

/**
 * Catálogo oficial de tasas de depreciación de Activos Fijos Tangibles según la
 * Resolución 235-2005 del MFP (Normas Cubanas de Contabilidad).
 *
 * Es la ÚNICA fuente de datos del catálogo: `FixedAssetsService` la usa para
 * autoinicializar `depreciation_catalog` por empresa. Cada entidad puede
 * después ajustar sus tasas desde el catálogo persistido.
 */
export const CUBAN_DEPRECIATION_CATALOG: DepreciationCatalogGroup[] = [
  {
    groupNumber: 1,
    groupName: 'Edificaciones y otras construcciones',
    subgroups: [
      { subgroupName: 'Edificaciones de madera o plástico', detail: 'a) Edificaciones', rate: 6.0 },
      { subgroupName: 'Edificaciones de panelería', detail: 'a) Edificaciones', rate: 5.0 },
      { subgroupName: 'Edificaciones de mampostería y otros materiales', detail: 'a) Edificaciones', rate: 3.0 },
      { subgroupName: 'Puentes de acero, hierro u hormigón', detail: 'b) Otras construcciones', rate: 3.0 },
      { subgroupName: 'Puentes de madera', detail: 'b) Otras construcciones', rate: 6.0 },
      { subgroupName: 'Muelles, espigones o embarcaderos de madera', detail: 'b) Otras construcciones', rate: 6.0 },
      { subgroupName: 'Muelles, espigones o embarcaderos de hormigón reforzado', detail: 'b) Otras construcciones', rate: 3.0 },
      { subgroupName: 'Diques secos y flotantes, varaderos', detail: 'b) Otras construcciones', rate: 6.0 },
      { subgroupName: 'Silos y tanques', detail: 'b) Otras construcciones', rate: 6.0 },
      { subgroupName: 'Otras no clasificadas', detail: 'c) Otras', rate: 3.0 },
    ],
  },
  {
    groupNumber: 2,
    groupName: 'Muebles, enseres y equipos de oficina',
    subgroups: [
      { subgroupName: 'Muebles y estantes', detail: 'a)', rate: 10.0 },
      { subgroupName: 'Enseres y equipos de oficina', detail: 'b)', rate: 15.0 },
      { subgroupName: 'Equipos de computación', detail: 'c)', rate: 25.0 },
    ],
  },
  {
    groupNumber: 3,
    groupName: 'Equipos no tecnológicos',
    subgroups: [
      { subgroupName: 'Aéreo', detail: 'a)', rate: 20.0 },
      { subgroupName: 'Marítimo', detail: 'b)', rate: 6.0 },
      { subgroupName: 'Equipos de transporte ferroviario', detail: 'c) Terrestre I', rate: 6.0 },
      { subgroupName: 'Otros terrestres', detail: 'c) Terrestre Otros', rate: 20.0 },
    ],
  },
  {
    groupNumber: 4,
    groupName: 'Maquinaria en general',
    subgroups: [
      { subgroupName: 'Maquinaria en general', detail: '', rate: 6.0 },
    ],
  },
  {
    groupNumber: 5,
    groupName: 'Animales',
    subgroups: [
      { subgroupName: 'Animales de trabajo', detail: 'a)', rate: 10.0 },
      { subgroupName: 'Ganado mayor (recría, leche o carne)', detail: 'b)', rate: 100.0 },
    ],
  },
  {
    groupNumber: 6,
    groupName: 'Plantaciones agrícolas permanentes',
    subgroups: [
      { subgroupName: 'Plantaciones agrícolas permanentes', detail: 'General', rate: 15.0 },
      { subgroupName: 'Plantaciones de Piña', detail: 'a) Piña', rate: 50.0 },
    ],
  },
  {
    groupNumber: 7,
    groupName: 'Otros activos',
    subgroups: [
      { subgroupName: 'Otros activos', detail: '', rate: 15.0 },
    ],
  },
];

/** Tasa anual de un subgrupo del catálogo oficial, o `null` si no existe. */
export function getCubanDepreciationRate(
  groupNumber: number,
  subgroupName: string,
): number | null {
  const group = CUBAN_DEPRECIATION_CATALOG.find(
    (g) => g.groupNumber === groupNumber,
  );
  if (!group) return null;
  const sub = group.subgroups.find((s) => s.subgroupName === subgroupName);
  return sub ? sub.rate : null;
}

export async function seedCubanDepreciationCatalog(
  dataSource: DataSource,
  companyId: number,
) {
  const repo = dataSource.getRepository(DepreciationCatalog);

  for (const group of CUBAN_DEPRECIATION_CATALOG) {
    for (const sub of group.subgroups) {
      const existing = await repo.findOne({
        where: {
          companyId,
          groupNumber: group.groupNumber,
          subgroupName: sub.subgroupName,
        },
      });
      if (existing) continue;

      const usefulLifeYears = sub.rate > 0 ? Math.round(100 / sub.rate) : null;
      const catalog = repo.create({
        companyId,
        groupNumber: group.groupNumber,
        groupName: group.groupName,
        subgroupName: sub.subgroupName,
        depreciationRate: sub.rate,
        usefulLifeYears,
        description: sub.detail || null,
        isActive: true,
      });
      await repo.save(catalog);
    }
  }
}
