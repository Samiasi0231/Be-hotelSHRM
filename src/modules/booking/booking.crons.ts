import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { BookingService } from './booking.service';

@Injectable()
export class BookingCronService {
  constructor(private bookingService: BookingService) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async sweepExpiredHolds() {
    const { expired } = await this.bookingService.expireStaleHolds();

    if (expired > 0) {
      console.log(
        `[BookingCron] Released ${expired} expired hold(s)`,
      );
    }
  }
}