import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HrController } from './hr.controller';
import { HrService } from './hr.service';
import { Employee } from '../entities/employee.entity';
import { Department } from '../entities/department.entity';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Employee, Department]),
    forwardRef(() => AuthModule),
  ],
  controllers: [HrController],
  providers: [HrService],
  exports: [HrService],
})
export class HrModule {}
