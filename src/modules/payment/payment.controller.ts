// src/modules/payment/payment.controller.ts — FULL REPLACEMENT
// Change: ALL hotel staff roles can now approve / reject manual payments.
// Front-desk STAFF no longer blocked — every action is fully audited with actor details.

// src/modules/payment/payment.controller.ts — FULL REPLACEMENT
// Endpoints:
//   POST   /payments/paystack/initiate                    (any authenticated user)
//   GET    /payments/paystack/verify/:reference           (PUBLIC — no auth)
//   POST   /payments/manual                                (any staff/admin)
//   PATCH  /payments/:id/approve                           (HOTEL_DIRECTOR, ADMIN)
//   PATCH  /payments/:id/reject                            (HOTEL_DIRECTOR, ADMIN)
//   GET    /payments/hotel/:hotelId/pending                (HOTEL_DIRECTOR, ADMIN)
//   GET    /payments/hotel/:hotelId                        (director + staff of hotel)

import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { PaymentService } from './payment.service';
import { InitiatePaymentDto } from './dto/initiate-payment.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorators';
import { Role } from '@prisma/client';

@ApiTags('Payments')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('payments')
export class PaymentController {
  constructor(private paymentService: PaymentService) {}

  // ──────────────────────────────────────────────────────────────────────────
  // ONLINE PAYMENTS (Paystack / Flutterwave)
  // ──────────────────────────────────────────────────────────────────────────

  @Post('paystack/initiate')
  @ApiOperation({ summary: 'Initiate Paystack payment (returns accessCode for inline popup)' })
  initiatePaystack(@Body() dto: InitiatePaymentDto) {
    return this.paymentService.initiatePaystack(dto);
  }

  @Get('paystack/verify/:reference')
  @Public()  // ← No auth required — called from booking page after Paystack popup
  @ApiOperation({ summary: 'Verify Paystack payment by reference (no auth)' })
  verifyPaystack(@Param('reference') reference: string) {
    return this.paymentService.verifyPaystack(reference);
  }

  @Post('flutterwave/initiate')
  @ApiOperation({ summary: 'Initiate Flutterwave payment' })
  initiateFlutterwave(@Body() dto: InitiatePaymentDto) {
    return this.paymentService.initiateFlutterwave(dto);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // MANUAL PAYMENTS (Cash / POS / Bank Transfer)
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * POST /payments/manual
   *
   * Any authenticated staff/admin can record a manual (cash/POS/bank) payment.
   * Payment goes to PENDING_APPROVAL until a director/admin approves.
   *
   * Body:
   *   bookingId:     string (required)
   *   paymentMethod: 'CASH' | 'POS' | 'BANK_TRANSFER' (required)
   *   note:          string (optional — notes for the approver)
   *   amount:        number (optional — defaults to booking.totalAmount)
   */
  @Post('manual')
  @ApiOperation({
    summary: 'Record a manual payment (cash/POS/bank-transfer) — goes to pending approval',
  })
  recordManualPayment(
    @Body() dto: any,  // RecordManualPaymentDto
    @CurrentUser() currentUser: { sub: string; email: string },
  ) {
    return this.paymentService.recordManualPayment(dto, currentUser.sub);
  }

  /**
   * PATCH /payments/:id/approve
   *
   * HOTEL_DIRECTOR or ADMIN only.
   * Approves a pending manual payment → booking confirmed, room marked OCCUPIED.
   *
   * Body:
   *   approvalNote: string (optional — comment for the record)
   */
  @Patch(':id/approve')
  @UseGuards(RolesGuard)
  @Roles(Role.HOTEL_DIRECTOR, Role.ADMIN)
  @ApiOperation({
    summary: 'Approve a pending manual payment (director/admin only)',
  })
  approveManualPayment(
    @Param('id') paymentId: string,
    @Body() dto: any,  // ApprovePaymentDto
    @CurrentUser() currentUser: { sub: string; email: string },
  ) {
    return this.paymentService.approveManualPayment(paymentId, dto, currentUser.sub);
  }

  /**
   * PATCH /payments/:id/reject
   *
   * HOTEL_DIRECTOR or ADMIN only.
   * Rejects a pending manual payment → booking stays PENDING.
   *
   * Body:
   *   reason: string (required — why rejected)
   */
  @Patch(':id/reject')
  @UseGuards(RolesGuard)
  @Roles(Role.HOTEL_DIRECTOR, Role.ADMIN)
  @ApiOperation({
    summary: 'Reject a pending manual payment (director/admin only)',
  })
  rejectManualPayment(
    @Param('id') paymentId: string,
    @Body() dto: any,  // RejectPaymentDto
    @CurrentUser() currentUser: { sub: string; email: string },
  ) {
    return this.paymentService.rejectManualPayment(paymentId, dto, currentUser.sub);
  }

  /**
   * GET /payments/hotel/:hotelId/pending
   *
   * HOTEL_DIRECTOR or ADMIN only.
   * Returns all manual payments awaiting approval for this hotel.
   * Used by the approval queue / pending payments page.
   */
  @Get('hotel/:hotelId/pending')
  @UseGuards(RolesGuard)
  @Roles(Role.HOTEL_DIRECTOR, Role.ADMIN)
  @ApiOperation({
    summary: 'Get all pending manual payment approvals for hotel (director/admin)',
  })
  getPendingApprovals(@Param('hotelId') hotelId: string) {
    return this.paymentService.getPendingApprovals(hotelId);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // LISTING & REPORTING
  // ──────────────────────────────────────────────────────────────────────────

  @Get('hotel/:hotelId')
  @ApiOperation({ summary: 'Get all payments for hotel (with pagination)' })
  getByHotel(
    @Param('hotelId') hotelId: string,
    @Query('page') page = 1,
    @Query('limit') limit = 10,
  ) {
    return this.paymentService.getPaymentsByHotel(hotelId, +page, +limit);
  }

  @Get('hotel/:hotelId/revenue')
  @ApiOperation({ summary: 'Get revenue stats (monthly, yearly, total)' })
  getRevenue(@Param('hotelId') hotelId: string) {
    return this.paymentService.getRevenueStats(hotelId);
  }
}