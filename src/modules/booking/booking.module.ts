import { Module } from '@nestjs/common';
import { BookingController } from './booking.controller';
import { BookingService } from './booking.service';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { RoomModule } from '../room/room.module';
import { BookingCronService } from './booking.crons';

@Module({
  controllers: [BookingController],
  providers: [BookingService, BookingCronService],
  exports: [BookingService],
  imports: [AuditLogModule, RoomModule],
})
export class BookingModule {}
