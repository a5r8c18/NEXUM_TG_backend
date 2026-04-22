import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DataSource } from 'typeorm';

async function fixSubelementsCompany() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const dataSource = app.get(DataSource);

  try {
    console.log('Updating subelements company_id to 2...');

    // Update all subelements to have company_id = 2
    const result = await dataSource.query(
      'UPDATE subelements SET company_id = 2 WHERE company_id = 1'
    );

    console.log('Updated subelements:', result);

    // Verify the update
    const count = await dataSource.query(
      'SELECT COUNT(*) as count FROM subelements WHERE company_id = 2'
    );

    console.log('Total subelements with company_id = 2:', count[0].count);

  } catch (error) {
    console.error('Error updating subelements:', error);
    throw error;
  } finally {
    await app.close();
  }
}

// Run the fix
fixSubelementsCompany()
  .then(() => {
    console.log('Subelements company_id fix completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Subelements company_id fix failed:', error);
    process.exit(1);
  });
