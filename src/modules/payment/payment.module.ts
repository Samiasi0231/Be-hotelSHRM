import { Module } from '@nestjs/common';
import { PaymentController } from './payment.controller';
import { PaymentService } from './payment.service';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { EmailModule } from '../email/email.module';

@Module({
  controllers: [PaymentController],
   imports:    [AuditLogModule, EmailModule], 
  providers: [PaymentService],
  exports: [PaymentService],
})
export class PaymentModule {}
