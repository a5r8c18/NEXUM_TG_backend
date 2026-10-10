import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Account } from './entities/account.entity';
import { Repository } from 'typeorm';
import { Company } from './entities/company.entity';
import { AccountMappingService } from './accounting/account-mapping.service';
import { seedChartOfAccountsForCompany } from './accounting/chart-of-accounts-seeder';

// ──────────────────────────────────────────────────────────────────────────────
// SEEDING FUNCTION
// ──────────────────────────────────────────────────────────────────────────────

async function seedAccounts2016() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const accountRepo = app.get('AccountRepository') as Repository<Account>;
  const companyRepo = app.get('CompanyRepository') as Repository<Company>;
  const mappingService = app.get(AccountMappingService);

  try {
    console.log('🌱 Seeding Cuban Chart of Accounts 2016 (GOC-2016-EX39)');
    const companies = await companyRepo.find();
    if (companies.length === 0) {
      console.log('❌ No companies found. Please seed companies first.');
      return;
    }

    for (const company of companies) {
      // El tipo de empresa se lee de tenantType ('state' | 'non-state').
      // Si no está definido, se toma la variable de entorno DEFAULT_COMPANY_TYPE
      // o 'state' por omisión.
      const rawType = (company as any).tenantType ?? process.env.DEFAULT_COMPANY_TYPE ?? 'state';
      const companyType: 'state' | 'non-state' = rawType === 'non-state' ? 'non-state' : 'state';

      console.log(`🏢 Processing company: ${company.name} (ID: ${company.id}, Type: ${companyType})`);

      const result = await seedChartOfAccountsForCompany(accountRepo, company.id, companyType);
      console.log(`   Existing: ${result.existing} | To insert: ${result.toInsert} | To update: ${result.toUpdate} | Total in seed: ${result.totalInSeed}`);
      console.log(`✅ Inserted ${result.inserted} new | Updated ${result.updated} names for company ${company.name}`);

      // Validar mapeos por defecto contra el plan de cuentas recién sembrado
      const validation = await mappingService.validateDefaultMappings(company.id);
      if (!validation.ok) {
        console.warn(`⚠️ Mapeos inválidos para ${company.name}:`);
        for (const error of validation.errors) {
          console.warn(`   - ${error}`);
        }
      } else {
        console.log(`✅ Mapeos por defecto validados para ${company.name}`);
      }
    }

    console.log('🎉 Seeding completed successfully!');
    console.log(`   - Total accounts seeded: ${(await accountRepo.find()).length}`);
  } catch (error) {
    console.error('❌ Error seeding accounts:', error);
  } finally {
    await app.close();
  }
}

// Ejecutar
seedAccounts2016().catch(console.error);
