import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';

import configuration from './common/config/configurtion';
import { validationSchema } from './common/config/validtion.schema';

import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { HotelModule } from './modules/hotel/hotel.module';
import { RoomModule } from './modules/room/room.module';
import { BookingModule } from './modules/booking/booking.module';
import { PaymentModule } from './modules/payment/payment.module';
import { InviteModule } from './modules/invite/invite.module';
import { StaffModule } from './modules/staff/staff.module';
import { RosterModule } from './modules/roster/roster.module';
import { AttendanceModule } from './modules/attendance/attendance.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { AuditLogModule } from './modules/audit-log/audit-log.module';
import { SuperAdminModule } from './modules/super-admin/super-admin.module';
import { EmailModule } from './modules/email/email.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validationSchema,
      envFilePath: '.env',
    }),

    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 100,
      },
    ]),

    PrismaModule,
    AuthModule,
    InviteModule,
    HotelModule,
    RoomModule,
    EmailModule,
    BookingModule,
    PaymentModule,
    StaffModule,
    RosterModule,
    AttendanceModule,
    DashboardModule,
    AuditLogModule,
    SuperAdminModule,
  ],
})
export class AppModule {}