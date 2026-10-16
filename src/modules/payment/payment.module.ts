import { Module } from '@nestjs/common';
import { PaymentController } from './payment.controller';
import { PaymentService } from './payment.service';
import { PayoutService } from './payout.service';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { EmailModule } from '../email/email.module';
import { RoomModule } from '../room/room.module';

@Module({
  imports: [AuditLogModule, EmailModule, RoomModule],
  controllers: [PaymentController],
  providers: [PaymentService, PayoutService],
  exports: [PaymentService],
})
export class PaymentModule {}