// src/modules/booking/booking.controller.ts — FULL REPLACEMENT

import {
  Controller, Get, Post, Patch, Body,
  Param, Query, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { BookingService } from './booking.service';
import { CreateBookingDto } from './dto/create-booking.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { BookingStatus } from '@prisma/client';

@ApiTags('Bookings')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('bookings')
export class BookingController {
  constructor(private bookingService: BookingService) {}

  @Post()
  @ApiOperation({ summary: 'Create a booking (internal — staff/admin)' })
  create(@Body() dto: CreateBookingDto) {
    return this.bookingService.create(dto);
  }

  @Get('hotel/:hotelId')
  @ApiOperation({ summary: 'Get bookings for hotel' })
  findAll(
    @Param('hotelId') hotelId: string,
    @Query('page')   page  = 1,
    @Query('limit')  limit = 10,
    @Query('status') status?: BookingStatus,
  ) {
    return this.bookingService.findAll(hotelId, +page, +limit, status);
  }

  @Get('calendar/:hotelId')
  @ApiOperation({ summary: 'Get booking calendar' })
  getCalendar(
    @Param('hotelId') hotelId: string,
    @Query('year')  year:  number,
    @Query('month') month: number,
  ) {
    return this.bookingService.getCalendar(hotelId, +year, +month);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get booking by ID' })
  findOne(@Param('id') id: string) {
    return this.bookingService.findOne(id);
  }

  /**
   * PATCH /bookings/:id/status
   *
   * Body fields:
   *   status       BookingStatus  (required)
   *   reason       string         (optional — human-readable note)
   *   cancelType   string         (optional — REFUND | NO_REFUND | WAIVER | OTHER)
   *   refundAmount number         (optional — only meaningful with cancelType=REFUND)
   *
   * The acting user's full name, email, and role are resolved server-side from
   * their JWT — they never need to supply identity themselves.
   */
  @Patch(':id/status')
  @ApiOperation({ summary: 'Update booking status — records full staff identity' })
  updateStatus(
    @Param('id') id: string,
    @Body('status')       status:       BookingStatus,
    @Body('reason')       reason:       string | undefined,
    @Body('cancelType')   cancelType:   string | undefined,
    @Body('refundAmount') refundAmount: number | undefined,
    @CurrentUser() currentUser: { sub: string; email: string },
  ) {
    return this.bookingService.updateStatus(
      id,
      status,
      reason,
      { userId: currentUser.sub, email: currentUser.email },
      cancelType && refundAmount !== undefined
        ? { cancelType: cancelType as any, refundAmount: +refundAmount }
        : cancelType
          ? { cancelType: cancelType as any }
          : undefined,
    );
  }
}