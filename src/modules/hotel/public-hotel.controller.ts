// src/modules/hotel/public-hotel.controller.ts — FULL REPLACEMENT
// All routes here are unauthenticated

import { Controller, Get, Post, Param, Query, Body } from '@nestjs/common';
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
  @ApiOperation({ summary: 'Create booking (no auth) — returns booking + Paystack access code' })
  async createBooking(
    @Param('slug') slug: string,
    @Body() dto: CreateBookingDto,
  ) {
    // 1. Create the booking
    const booking = await this.bookingService.create(dto);

    // 2. Initialize Paystack payment inline
    const payment = await this.paymentService.initiatePaystack({
      bookingId: booking.id,
    });

    // Return both so frontend can open the Paystack popup immediately
    return { booking, payment };
  }
}