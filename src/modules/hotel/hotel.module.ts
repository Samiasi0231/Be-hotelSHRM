// src/modules/hotel/hotel.module.ts — FULL REPLACEMENT
import { Module } from '@nestjs/common';
import { HotelController } from './hotel.controller';
import { PublicHotelController } from './public-hotel.controller';
import { HotelService } from './hotel.service';
import { BookingModule } from '../booking/booking.module';
import { PaymentModule } from '../payment/payment.module';
import { MulterModule } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { v4 as uuid } from 'uuid';

@Module({
  imports: [
    BookingModule,
    PaymentModule,
    MulterModule.register({
      storage: diskStorage({
        destination: './uploads/hotels',
        filename: (_, file, cb) => cb(null, `${uuid()}${extname(file.originalname)}`),
      }),
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  ],
  controllers: [HotelController, PublicHotelController],
  providers: [HotelService],
  exports: [HotelService],
})
export class HotelModule {}