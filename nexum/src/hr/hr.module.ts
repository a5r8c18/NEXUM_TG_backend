import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HrController } from './hr.controller';
import { HrService } from './hr.service';
import { PayrollController } from './payroll.controller';
import { PayrollService } from './payroll.service';
import {
  AttendanceController,
  LeavesController,
} from './hr-management.controller';
import { HrManagementService } from './hr-management.service';
import { Employee } from '../entities/employee.entity';
import { Department } from '../entities/department.entity';
import { CostCenter } from '../entities/cost-center.entity';
import { Payroll } from '../entities/payroll.entity';
import { PayrollItem } from '../entities/payroll-item.entity';
import { EmployeeContract } from '../entities/employee-contract.entity';
import { Attendance } from '../entities/attendance.entity';
import { LeaveRequest } from '../entities/leave-request.entity';
import { EmployeeSalaryHistory } from '../entities/employee-salary-history.entity';
import { Payment } from '../entities/payment.entity';
import { AuthModule } from '../auth/auth.module';
import { AccountingModule } from '../accounting/accounting.module';
import { FinanceModule } from '../finance/finance.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Employee,
      Department,
      CostCenter,
      Payroll,
      PayrollItem,
      EmployeeContract,
      Attendance,
      LeaveRequest,
      EmployeeSalaryHistory,
      Payment,
    ]),
    forwardRef(() => AuthModule),
    forwardRef(() => AccountingModule),
    forwardRef(() => FinanceModule),
  ],
  controllers: [
    HrController,
    PayrollController,
    AttendanceController,
    LeavesController,
  ],
  providers: [HrService, PayrollService, HrManagementService],
  exports: [HrService, PayrollService, HrManagementService],
})
export class HrModule {}
