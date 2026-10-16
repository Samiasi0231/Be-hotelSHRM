// src/modules/hotel/public-hotel.controller.ts — FULL REPLACEMENT
// All routes here are unauthenticated

import { Controller, Get, Post, Param, Query, Body ,BadRequestException} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { HotelService } from './hotel.service';
import { BookingService } from '../booking/booking.service';
import { PaymentService } from '../payment/payment.service';
import { CreateBookingDto } from '../booking/dto/create-booking.dto';

@ApiTags('Public')
@Controller('public/hotels')
export class PublicHotelController {
  constructor(
    private hotelService: HotelService,
    private bookingService: BookingService,
    private paymentService: PaymentService,
  ) {}

  @Get(':slug')
  @ApiOperation({ summary: 'Get hotel by slug (no auth)' })
  getBySlug(@Param('slug') slug: string) {
    return this.hotelService.findBySlug(slug);
  }

  @Get(':slug/rooms/available')
  @ApiOperation({ summary: 'Get available rooms for date range (no auth)' })
  @ApiQuery({ name: 'checkIn', required: true })
  @ApiQuery({ name: 'checkOut', required: true })
  getAvailableRooms(
    @Param('slug') slug: string,
    @Query('checkIn') checkIn: string,
    @Query('checkOut') checkOut: string,
  ) {
    return this.hotelService.getAvailableRooms(slug, checkIn, checkOut);
  }

 
@Post(':slug/book')
@ApiOperation({
  summary: 'Create booking (no auth) — returns booking + Paystack access code',
})
async createBooking(
  @Param('slug') slug: string,
  @Body() dto: CreateBookingDto,
) {
  // 1. Find the hotel by slug.
  // findBySlug() must enforce the public availability checks.
  const hotel = await this.hotelService.findBySlug(slug);

  // 2. Ensure the submitted hotel ID matches the URL.
  if (dto.hotelId !== hotel.id) {
    throw new BadRequestException(
      'The hotel ID does not match the requested hotel',
    );
  }

  // 3. Ensure the requested room belongs to this hotel.
  const roomBelongsToHotel = hotel.rooms.some(
    (room) => room.id === dto.roomId,
  );

  if (!roomBelongsToHotel) {
    throw new BadRequestException(
      'The selected room does not belong to this hotel',
    );
  }

  // 4. Create the booking only after validation.
  const booking = await this.bookingService.create(dto);

  // 5. Initiate payment only after booking creation succeeds.
  const payment = await this.paymentService.initiatePaystack({
    bookingId: booking.id,
  });

  return { booking, payment };
}
}
