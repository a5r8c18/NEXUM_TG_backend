import { DataSource } from 'typeorm';
import { DepreciationCatalog } from '../entities/depreciation-catalog.entity';

/**
 * Catálogo de depreciación de Activos Fijos Tangibles según normativa cubana.
 * Tasas anuales orientativas basadas en la Resolución 235-2005 del MFP y
 * práctica contable cubana. Cada empresa puede ajustarlas en su catálogo.
 */
export const CUBAN_DEPRECIATION_CATALOG = [
  {
    groupNumber: 1,
    groupName: 'Edificaciones y construcciones',
    subgroups: [
      { subgroupName: 'Edificios', rate: 3.0 },
      { subgroupName: 'Construcciones', rate: 3.0 },
    ],
  },
  {
    groupNumber: 2,
    groupName: 'Instalaciones y maquinarias',
    subgroups: [
      { subgroupName: 'Instalaciones', rate: 10.0 },
      { subgroupName: 'Maquinaria de producción', rate: 10.0 },
      { subgroupName: 'Equipos industriales', rate: 10.0 },
    ],
  },
  {
    groupNumber: 3,
    groupName: 'Medios de transporte',
    subgroups: [
      { subgroupName: 'Vehículos', rate: 15.0 },
      { subgroupName: 'Equipos de transporte interno', rate: 15.0 },
    ],
  },
  {
    groupNumber: 4,
    groupName: 'Equipos informáticos y electrónicos',
    subgroups: [
      { subgroupName: 'Computadoras', rate: 25.0 },
      { subgroupName: 'Periféricos y accesorios', rate: 25.0 },
      { subgroupName: 'Electrodomésticos', rate: 25.0 },
    ],
  },
  {
    groupNumber: 5,
    groupName: 'Muebles, enseres y equipos de oficina',
    subgroups: [
      { subgroupName: 'Muebles', rate: 10.0 },
      { subgroupName: 'Equipos de oficina', rate: 10.0 },
      { subgroupName: 'Enseres', rate: 10.0 },
    ],
  },
  {
    groupNumber: 6,
    groupName: 'Herramientas y útiles',
    subgroups: [
      { subgroupName: 'Herramientas', rate: 20.0 },
      { subgroupName: 'Útiles menores', rate: 20.0 },
    ],
  },
];

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
        description: `Tasa anual ${sub.rate}% para ${sub.subgroupName} (grupo ${group.groupNumber})`,
        isActive: true,
      });
      await repo.save(catalog);
    }
  }
}
