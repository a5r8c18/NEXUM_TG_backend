import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DataSource } from 'typeorm';
import { GLOBAL_SUBELEMENTS } from './accounting/global-subelements.data';

const SUBELEMENTS_DATA = GLOBAL_SUBELEMENTS;

async function seedGlobalSubelements() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const dataSource = app.get(DataSource);

  try {
    console.log('Starting global subelements seeding...');

    // Clear existing subelements
    console.log('Clearing existing subelements...');
    await dataSource.query('DELETE FROM subelements');

    // Create global subelements (without companyId)
    console.log(`Creating ${SUBELEMENTS_DATA.length} global subelements...`);
    
    const subelements = SUBELEMENTS_DATA.map(data => ({
      ...data,
      companyId: null, // Global subelements
      isActive: true,
    }));

    // Insert all subelements
    await dataSource
      .createQueryBuilder()
      .insert()
      .into('subelements')
      .values(subelements)
      .execute();

    console.log(`Successfully created ${subelements.length} global subelements!`);

    // Verify creation
    const count = await dataSource.query('SELECT COUNT(*) as count FROM subelements WHERE company_id IS NULL');
    console.log(`Total global subelements in database: ${count[0].count}`);

  } catch (error) {
    console.error('Error seeding global subelements:', error);
    throw error;
  } finally {
    await app.close();
  }
}

// Run the seed
seedGlobalSubelements()
  .then(() => {
    console.log('Global subelements seeding completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Global subelements seeding failed:', error);
    process.exit(1);
  });
