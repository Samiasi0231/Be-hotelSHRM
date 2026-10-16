// src/modules/payment/payment.controller.ts — FULL REPLACEMENT
import {
  Controller, Get, Post, Put, Patch, Body, Param, Query, UseGuards,
  Req, Headers, HttpCode, RawBodyRequest,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Request } from 'express';
import { PaymentService } from './payment.service';
import { PayoutService } from './payout.service';
import { InitiatePaymentDto } from './dto/initiate-payment.dto';
import { SavePayoutAccountDto } from './dto/payout.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorators';
import { Role } from '@prisma/client';

type Actor = { sub: string; email: string };

@ApiTags('Payments')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('payments')
export class PaymentController {
  constructor(
    private paymentService: PaymentService,
    private payoutService: PayoutService,
  ) {}

  // ── Online payments ────────────────────────────────────────────────────────

  @Post('paystack/initiate')
  @ApiOperation({ summary: 'Initiate Paystack payment (split to the hotel subaccount)' })
  initiatePaystack(@Body() dto: InitiatePaymentDto) {
    return this.paymentService.initiatePaystack(dto);
  }

  @Get('paystack/verify/:reference')
  @Public()
  @ApiOperation({ summary: 'Verify Paystack payment by reference (no auth)' })
  verifyPaystack(@Param('reference') reference: string) {
    return this.paymentService.verifyPaystack(reference);
  }

  @Post('paystack/webhook')
  @Public()
  @HttpCode(200)
  @ApiOperation({ summary: 'Paystack webhook — signature verified, no JWT' })
  paystackWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-paystack-signature') signature?: string,
  ) {
    return this.paymentService.handlePaystackWebhook(req.rawBody, signature);
  }

  @Post('flutterwave/initiate')
  @ApiOperation({ summary: 'Initiate Flutterwave payment' })
  initiateFlutterwave(@Body() dto: InitiatePaymentDto) {
    return this.paymentService.initiateFlutterwave(dto);
  }

  // ── Manual payments — ANY logged-in staff of the hotel ─────────────────────

  @Post('manual')
  @ApiOperation({ summary: 'Record a manual payment — goes to pending approval' })
  recordManualPayment(@Body() dto: any, @CurrentUser() user: Actor) {
    return this.paymentService.recordManualPayment(dto, user.sub);
  }

  @Patch(':id/approve')
  @ApiOperation({ summary: 'Approve a pending manual payment (any staff of the hotel)' })
  approveManualPayment(@Param('id') id: string, @Body() dto: any, @CurrentUser() user: Actor) {
    return this.paymentService.approveManualPayment(id, dto, user.sub);
  }

  @Patch(':id/reject')
  @ApiOperation({ summary: 'Reject a pending manual payment (any staff of the hotel)' })
  rejectManualPayment(@Param('id') id: string, @Body() dto: any, @CurrentUser() user: Actor) {
    return this.paymentService.rejectManualPayment(id, dto, user.sub);
  }

  @Get('hotel/:hotelId/pending')
  @ApiOperation({ summary: 'Pending manual payment approvals (any staff of the hotel)' })
  getPendingApprovals(@Param('hotelId') hotelId: string, @CurrentUser() user: Actor) {
    return this.paymentService.getPendingApprovals(hotelId, user.sub);
  }

  // ── Payout account (Paystack subaccount) — director/admin only ──────────────
  // Static routes (banks, resolve) are declared BEFORE the :hotelId routes.

  @Get('payout/banks')
  @UseGuards(RolesGuard)
  @Roles(Role.HOTEL_DIRECTOR, Role.ADMIN)
  listBanks() {
    return this.payoutService.listBanks();
  }

  @Get('payout/resolve')
  @UseGuards(RolesGuard)
  @Roles(Role.HOTEL_DIRECTOR, Role.ADMIN)
  resolveAccount(@Query('bankCode') bankCode: string, @Query('accountNumber') accountNumber: string) {
    return this.payoutService.resolveAccount(bankCode, accountNumber);
  }

  @Get('payout/:hotelId')
  @UseGuards(RolesGuard)
  @Roles(Role.HOTEL_DIRECTOR, Role.ADMIN)
  getPayout(@Param('hotelId') hotelId: string, @CurrentUser() user: Actor) {
    return this.payoutService.getStatus(hotelId, user.sub);
  }

  @Put('payout/:hotelId')
  @UseGuards(RolesGuard)
  @Roles(Role.HOTEL_DIRECTOR, Role.ADMIN) // tighten to HOTEL_DIRECTOR only if you want
  savePayout(@Param('hotelId') hotelId: string, @Body() dto: SavePayoutAccountDto, @CurrentUser() user: Actor) {
    return this.payoutService.save(hotelId, dto, user.sub);
  }

  // ── Listing & reporting ────────────────────────────────────────────────────

  @Get('hotel/:hotelId')
  @ApiOperation({ summary: 'All payments for hotel' })
  getByHotel(
    @Param('hotelId') hotelId: string,
    @Query('page') page = 1,
    @Query('limit') limit = 10,
    @CurrentUser() user: Actor,
  ) {
    return this.paymentService.getPaymentsByHotel(hotelId, +page, +limit, user.sub);
  }

  @Get('hotel/:hotelId/revenue')
  @UseGuards(RolesGuard)
  @Roles(Role.HOTEL_DIRECTOR, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Revenue stats (director/admin)' })
  getRevenue(@Param('hotelId') hotelId: string, @CurrentUser() user: Actor) {
    return this.paymentService.getRevenueStats(hotelId, user.sub);
  }
}