import { Repository } from 'typeorm';
import { Account } from '../entities/account.entity';
import { generateAllAccounts } from './chart-of-accounts-2016';

export interface ChartOfAccountsSeedResult {
  existing: number;
  toInsert: number;
  toUpdate: number;
  totalInSeed: number;
  inserted: number;
  updated: number;
}

/**
 * Siembra el plan de cuentas cubano 2016 para una empresa.
 * Idempotente: inserta las cuentas que falten por código y actualiza
 * nombre/descripción/naturaleza de las existentes si difieren.
 */
export async function seedChartOfAccountsForCompany(
  accountRepo: Repository<Account>,
  companyId: number,
  companyType: 'state' | 'non-state' = 'state',
): Promise<ChartOfAccountsSeedResult> {
  const accountsToSeed = generateAllAccounts(companyType);

  const existingAccounts = await accountRepo.find({
    where: { companyId },
    select: ['id', 'code', 'name', 'description', 'nature', 'allowsMovements'],
  });
  const existingMap = new Map(existingAccounts.map((a) => [a.code, a]));

  const toInsert = accountsToSeed.filter((a) => !existingMap.has(a.code));
  const toUpdate = accountsToSeed.filter((a) => {
    const ex = existingMap.get(a.code);
    if (!ex) return false;
    return ex.name !== a.name || ex.description !== a.description || ex.nature !== a.nature;
  });

  let inserted = 0;
  for (const accountData of toInsert) {
    const account = new Account();
    account.companyId = companyId;
    account.code = accountData.code;
    account.name = accountData.name;
    account.description = accountData.description;
    account.type = accountData.type as any;
    account.nature = accountData.nature as any;
    account.level = accountData.level;
    account.groupNumber = accountData.groupNumber;
    account.parentCode = accountData.parentCode;
    account.parentAccountId = null;
    account.balance = 0;
    account.isActive = true;
    account.allowsMovements = accountData.allowsMovements;
    await accountRepo.save(account);
    inserted++;
  }

  let updated = 0;
  for (const accountData of toUpdate) {
    const existing = existingMap.get(accountData.code)!;
    await accountRepo.update(
      { id: existing.id },
      { name: accountData.name, description: accountData.description, nature: accountData.nature as any, allowsMovements: accountData.allowsMovements },
    );
    updated++;
  }

  return {
    existing: existingMap.size,
    toInsert: toInsert.length,
    toUpdate: toUpdate.length,
    totalInSeed: accountsToSeed.length,
    inserted,
    updated,
  };
}
