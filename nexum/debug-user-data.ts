import { NestFactory } from '@nestjs/core';
import { AppModule } from './src/app.module';
import { User } from './src/entities/user.entity';
import { Company } from './src/entities/company.entity';

async function debug() {
  const app = await NestFactory.createApplicationContext(AppModule);
  
  console.log('=== DEBUG USER AND COMPANY DATA ===');
  
  // Get repositories
  const userRepo = app.get('UserRepository');
  const companyRepo = app.get('CompanyRepository');
  
  // Find user by email
  const user = await userRepo.findOne({ 
    where: { email: 'developer@gmail.com' },
    relations: ['company']
  });
  
  if (user) {
    console.log('✅ User found:');
    console.log('  ID:', user.id);
    console.log('  Email:', user.email);
    console.log('  Name:', user.firstName, user.lastName);
    console.log('  Role:', user.role);
    console.log('  TenantId:', user.tenantId);
    console.log('  TenantName:', user.tenantName);
    console.log('  TenantType:', user.tenantType);
    console.log('  CompanyId:', user.companyId);
    console.log('  Password (length):', user.password.length);
    console.log('  Password (first 3):', user.password.substring(0, 3) + '...');
    console.log('  CurrentCompanyId:', (user as any).currentCompanyId || 'NOT SET');
    
    // Find the company
    if (user.companyId) {
      const company = await companyRepo.findOne({ where: { id: user.companyId } });
      if (company) {
        console.log('✅ Company found:');
        console.log('  ID:', company.id);
        console.log('  Name:', company.name);
        console.log('  TenantId:', company.tenantId);
        console.log('  TenantType:', company.tenantType);
      }
    }
  } else {
    console.log('❌ User not found');
  }
  
  await app.close();
}

debug().catch(console.error);
