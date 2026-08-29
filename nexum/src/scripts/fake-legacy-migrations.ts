import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';

dotenv.config();

const dataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  username: process.env.DB_USERNAME || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_NAME || 'nexum_db',
});

const LEGACY = [
  { timestamp: 1700000000000, name: 'AddSubelementToMovementItems1700000000000' },
  { timestamp: 1700000000001, name: 'UpdateDeliveryReportSC2081700000000001' },
  { timestamp: 1700000000001, name: 'IncreaseDecimalPrecisionTo81700000000001' },
  { timestamp: 1700000000002, name: 'UpdatePhysicalCountSC2221700000000002' },
  { timestamp: 1700000000003, name: 'CreateDeliveryInformSC2181700000000003' },
  { timestamp: 1700000000004, name: 'AddInvoiceFieldsToPurchase1700000000004' },
  { timestamp: 1700000000005, name: 'AddInventoryTransitAccount1700000000005' },
  { timestamp: 1730000000000, name: 'AddCostCenterToMovementItems1730000000000' },
  { timestamp: 1755500000000, name: 'AddRevaluationSurplusToFixedAssets1755500000000' },
  { timestamp: 1755777600000, name: 'AddAreaIdToVoucherLines1755777600000' },
];

async function main() {
  await dataSource.initialize();
  for (const m of LEGACY) {
    await dataSource.query(
      `INSERT INTO migrations (timestamp, name) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [m.timestamp, m.name],
    );
    console.log(`Marcada como aplicada: ${m.name}`);
  }
  await dataSource.destroy();
  console.log('Hecho.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
