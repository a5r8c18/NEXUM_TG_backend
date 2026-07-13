import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HrController } from './hr.controller';
import { HrService } from './hr.service';
import { PayrollController } from './payroll.controller';
import { PayrollService } from './payroll.service';
import { Employee } from '../entities/employee.entity';
import { Department } from '../entities/department.entity';
import { Payroll } from '../entities/payroll.entity';
import { PayrollItem } from '../entities/payroll-item.entity';
import { AuthModule } from '../auth/auth.module';
import { AccountingModule } from '../accounting/accounting.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Employee, Department, Payroll, PayrollItem]),
    forwardRef(() => AuthModule),
    forwardRef(() => AccountingModule),
  ],
  controllers: [HrController, PayrollController],
  providers: [HrService, PayrollService],
  exports: [HrService, PayrollService],
})
export class HrModule {}
