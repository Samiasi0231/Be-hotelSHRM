// src/modules/payment/payment.service.ts — FULL REPLACEMENT
//
// What this version does:
//   - Every method that touches a hotel's data first checks the caller actually
//     belongs to that hotel (assertActorInHotel). Roles are no longer the gate
//     for approve/reject/pending — hotel membership is.
//   - Online payments split to the hotel's Paystack subaccount.
//   - verifyPaystack is idempotent, checks the amount, and won't confirm a
//     booking whose hold already expired or was cancelled.
//   - Paystack webhook handler (signature-verified) so a closed browser tab
//     doesn't strand a paid booking.
//   - Room.status is never hardcoded here — RoomService.syncRoomStatus decides.

import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { RoomService } from '../room/room.service';
import { assertActorInHotel } from './hotel-access.helper';
import { InitiatePaymentDto } from './dto/initiate-payment.dto';
import {
  PaymentProvider,
  PaymentStatus,
  PaymentMethod,
  ManualPaymentStatus,
  BookingStatus,
  AuditAction,
} from '@prisma/client';

export interface RecordManualPaymentDto {
  bookingId: string;
  paymentMethod: PaymentMethod;
  note?: string;
  amount?: number;
}

export interface ApprovePaymentDto {
  approvalNote?: string;
}

export interface RejectPaymentDto {
  reason: string;
}

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);
  private readonly paystackSecret: string;
  private readonly frontendUrl: string;

  constructor(
    private prisma: PrismaService,
    private auditLog: AuditLogService,
    private roomService: RoomService,
    private config: ConfigService,
  ) {
    this.paystackSecret = this.config.get('PAYSTACK_SECRET_KEY', '');
    this.frontendUrl = this.config.get('FRONTEND_URL', 'http://localhost:5173');
  }

  private async actorDisplay(userId: string): Promise<string> {
    const u = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        firstName: true,
        lastName: true,
        email: true,
        role: true,
        staffOf: { select: { employeeId: true, position: true, department: true } },
      },
    });
    if (!u) return 'Unknown';
    const s = u.staffOf;
    return `${u.firstName} ${u.lastName} · ${u.role} · ${s?.position ?? '—'} · ${s?.employeeId ?? '—'} (${u.email})`;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // MANUAL PAYMENTS
  // ══════════════════════════════════════════════════════════════════════════

  // ── Record ─────────────────────────────────────────────────────────────────

  async recordManualPayment(dto: RecordManualPaymentDto, actorUserId: string) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: dto.bookingId },
      include: { hotel: { select: { name: true, id: true } } },
    });
    if (!booking) throw new NotFoundException('Booking not found');

    // Only staff of THIS hotel may record a payment against its booking.
    await assertActorInHotel(this.prisma, actorUserId, booking.hotelId);

    if (dto.paymentMethod === PaymentMethod.ONLINE) {
      throw new BadRequestException('Use the online payment flow for card payments');
    }
    if (dto.amount !== undefined && !(Number(dto.amount) > 0)) {
      throw new BadRequestException('Amount must be greater than zero');
    }

    if (booking.status === BookingStatus.CONFIRMED || booking.status === BookingStatus.CHECKED_IN) {
      throw new BadRequestException('Booking is already paid and active');
    }
    if (booking.status === BookingStatus.CANCELLED || booking.status === BookingStatus.TIMEOUT) {
      throw new BadRequestException('Cannot record payment for a cancelled booking');
    }

    const existingPending = await this.prisma.payment.findFirst({
      where: {
        bookingId: dto.bookingId,
        isManual: true,
        manualStatus: ManualPaymentStatus.PENDING_APPROVAL,
      },
    });
    if (existingPending) {
      throw new BadRequestException('A manual payment is already awaiting approval for this booking');
    }

    const actor = await this.actorDisplay(actorUserId);
    const reference = `MAN-${Date.now().toString(36).toUpperCase()}`;

    const payment = await this.prisma.payment.create({
      data: {
        bookingId: dto.bookingId,
        hotelId: booking.hotelId,
        amount: dto.amount ?? booking.totalAmount,
        currency: 'NGN',
        provider: PaymentProvider.MANUAL,
        providerRef: reference,
        status: PaymentStatus.PENDING,
        paymentMethod: dto.paymentMethod,
        isManual: true,
        manualStatus: ManualPaymentStatus.PENDING_APPROVAL,
        recordedByUserId: actorUserId,
        recordedAt: new Date(),
        providerData: {
          note: dto.note ?? null,
          recordedBy: actor,
          hotelName: booking.hotel.name,
        },
      },
      include: {
        booking: { select: { bookingRef: true, guestName: true, totalAmount: true } },
        recordedByUser: { select: { firstName: true, lastName: true, email: true, role: true } },
      },
    });

    await this.auditLog.create({
      userId: actorUserId,
      hotelId: booking.hotel.id,
      action: AuditAction.PAYMENT,
      entity: 'Payment',
      entityId: payment.id,
      newValues: {
        bookingRef: payment.booking.bookingRef,
        amount: Number(payment.amount),
        paymentMethod: dto.paymentMethod,
        manualStatus: ManualPaymentStatus.PENDING_APPROVAL,
        recordedBy: actor,
        note: dto.note ?? undefined,
      },
    }).catch(() => {});

    return { payment, message: 'Manual payment recorded — awaiting approval' };
  }

  // ── Approve ────────────────────────────────────────────────────────────────

  async approveManualPayment(paymentId: string, dto: ApprovePaymentDto, actorUserId: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: { booking: { select: { id: true, roomId: true, status: true } } },
    });
    if (!payment) throw new NotFoundException('Payment not found');
    if (!payment.isManual) throw new BadRequestException('Not a manual payment');
    if (payment.manualStatus !== ManualPaymentStatus.PENDING_APPROVAL) {
      throw new BadRequestException(
        `Payment is already ${payment.manualStatus?.toLowerCase().replace('_', ' ')}`,
      );
    }

    // Any active staff member of THIS hotel may approve — nobody else.
    await assertActorInHotel(this.prisma, actorUserId, payment.hotelId);

    // ── OPTIONAL maker-checker ──────────────────────────────────────────────
    // Uncomment to stop front-desk STAFF approving a payment they recorded
    // themselves (directors/admins stay unrestricted). To use it, change the
    // line above to: const { role } = await assertActorInHotel(...)
    //
    // if (payment.recordedByUserId === actorUserId && role === 'STAFF') {
    //   throw new ForbiddenException('Another staff member must approve a payment you recorded');
    // }

    // A dead booking must not be revived by an approval.
    if (payment.booking.status !== BookingStatus.PENDING) {
      throw new BadRequestException(
        `This booking is ${payment.booking.status.toLowerCase().replace('_', ' ')} and can no longer be confirmed`,
      );
    }

    const actor = await this.actorDisplay(actorUserId);

    // Claim the approval atomically so two people clicking Approve can't both win.
    const claimed = await this.prisma.payment.updateMany({
      where: { id: paymentId, manualStatus: ManualPaymentStatus.PENDING_APPROVAL },
      data: {
        status: PaymentStatus.SUCCESS,
        manualStatus: ManualPaymentStatus.APPROVED,
        approvedByUserId: actorUserId,
        approvedAt: new Date(),
        approvalNote: dto.approvalNote,
        paidAt: new Date(),
        providerData: {
          ...((payment.providerData as object) ?? {}),
          approvedBy: actor,
          approvalNote: dto.approvalNote ?? null,
        },
      },
    });
    if (claimed.count === 0) {
      throw new BadRequestException('This payment was just actioned by someone else');
    }

    await this.prisma.booking.update({
      where: { id: payment.bookingId },
      data: {
        status: BookingStatus.CONFIRMED,
        confirmedAt: new Date(),
        cancelReason: `Payment approved by: ${actor}${dto.approvalNote ? ` | Note: ${dto.approvalNote}` : ''}`,
      },
    });

    // Room.status is computed from bookings covering today — never hardcoded.
    await this.roomService.syncRoomStatus(payment.booking.roomId);

    await this.auditLog.create({
      userId: actorUserId,
      hotelId: payment.hotelId,
      action: AuditAction.PAYMENT,
      entity: 'Payment',
      entityId: payment.id,
      newValues: {
        status: PaymentStatus.SUCCESS,
        manualStatus: ManualPaymentStatus.APPROVED,
        bookingStatus: BookingStatus.CONFIRMED,
        approvedBy: actor,
        approvalNote: dto.approvalNote ?? undefined,
      },
    }).catch(() => {});

    const updated = await this.prisma.payment.findUnique({ where: { id: paymentId } });
    return { payment: updated, message: 'Payment approved — booking confirmed' };
  }

  // ── Reject ─────────────────────────────────────────────────────────────────

  async rejectManualPayment(paymentId: string, dto: RejectPaymentDto, actorUserId: string) {
    const payment = await this.prisma.payment.findUnique({ where: { id: paymentId } });
    if (!payment) throw new NotFoundException('Payment not found');
    if (!payment.isManual) throw new BadRequestException('Not a manual payment');
    if (payment.manualStatus !== ManualPaymentStatus.PENDING_APPROVAL) {
      throw new BadRequestException(
        `Payment is already ${payment.manualStatus?.toLowerCase().replace('_', ' ')}`,
      );
    }

    await assertActorInHotel(this.prisma, actorUserId, payment.hotelId);

    if (!dto.reason?.trim()) throw new BadRequestException('A rejection reason is required');

    const actor = await this.actorDisplay(actorUserId);

    const claimed = await this.prisma.payment.updateMany({
      where: { id: paymentId, manualStatus: ManualPaymentStatus.PENDING_APPROVAL },
      data: {
        status: PaymentStatus.FAILED,
        manualStatus: ManualPaymentStatus.REJECTED,
        approvedByUserId: actorUserId,
        approvedAt: new Date(),
        rejectionReason: dto.reason,
        providerData: {
          ...((payment.providerData as object) ?? {}),
          rejectedBy: actor,
          rejectionReason: dto.reason,
        },
      },
    });
    if (claimed.count === 0) {
      throw new BadRequestException('This payment was just actioned by someone else');
    }

    await this.auditLog.create({
      userId: actorUserId,
      hotelId: payment.hotelId,
      action: AuditAction.PAYMENT,
      entity: 'Payment',
      entityId: payment.id,
      newValues: {
        status: PaymentStatus.FAILED,
        manualStatus: ManualPaymentStatus.REJECTED,
        rejectionReason: dto.reason,
        rejectedBy: actor,
      },
    }).catch(() => {});

    return this.prisma.payment.findUnique({ where: { id: paymentId } });
  }

  // ── Pending approvals ──────────────────────────────────────────────────────

  async getPendingApprovals(hotelId: string, actorUserId: string) {
    await assertActorInHotel(this.prisma, actorUserId, hotelId);

    return this.prisma.payment.findMany({
      where: {
        hotelId,
        isManual: true,
        manualStatus: ManualPaymentStatus.PENDING_APPROVAL,
      },
      include: {
        booking: {
          select: {
            bookingRef: true,
            guestName: true,
            guestEmail: true,
            guestPhone: true,
            checkIn: true,
            checkOut: true,
            totalAmount: true,
          },
        },
        recordedByUser: {
          select: {
            firstName: true,
            lastName: true,
            email: true,
            role: true,
            staffOf: { select: { employeeId: true, position: true, department: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PAYSTACK
  // ══════════════════════════════════════════════════════════════════════════

  // ── Initiate (splits to the hotel's subaccount) ────────────────────────────

  async initiatePaystack(dto: InitiatePaymentDto) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: dto.bookingId },
      include: { hotel: { select: { name: true, id: true, paystackSubaccountCode: true } } },
    });
    if (!booking) throw new NotFoundException('Booking not found');
    if (booking.status === BookingStatus.CONFIRMED) {
      throw new BadRequestException('Booking is already paid and confirmed');
    }
    if (booking.status === BookingStatus.CANCELLED || booking.status === BookingStatus.TIMEOUT) {
      throw new BadRequestException('This booking is no longer active');
    }

    // No payout account = nowhere to send the money. Never fall back to the platform account.
    if (!booking.hotel.paystackSubaccountCode) {
      throw new BadRequestException(
        'This hotel has not set up its payout account yet, so online payment is unavailable. Please contact the hotel.',
      );
    }

    const reference = `PAY-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
    const amountKobo = Math.round(Number(booking.totalAmount) * 100);

    const response = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.paystackSecret}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: booking.guestEmail,
        amount: amountKobo,
        reference,
        currency: 'NGN',
        subaccount: booking.hotel.paystackSubaccountCode,
        bearer: 'subaccount', // Paystack's processing fee comes out of the hotel's share
        metadata: {
          bookingId: booking.id,
          bookingRef: booking.bookingRef,
          hotelName: booking.hotel.name,
          guestName: booking.guestName,
        },
        callback_url: dto.callbackUrl || `${this.frontendUrl}/book/payment-callback`,
      }),
    });

    const result = (await response.json()) as any;
    if (!result.status) {
      throw new BadRequestException(result.message || 'Paystack initialization failed');
    }

    const payment = await this.prisma.payment.create({
      data: {
        bookingId: dto.bookingId,
        hotelId: booking.hotel.id,
        amount: booking.totalAmount,
        currency: 'NGN',
        provider: PaymentProvider.PAYSTACK,
        providerRef: reference,
        status: PaymentStatus.PENDING,
        paymentMethod: PaymentMethod.ONLINE,
      },
    });

    await this.auditLog.create({
      hotelId: booking.hotel.id,
      action: AuditAction.PAYMENT,
      entity: 'Payment',
      entityId: payment.id,
      newValues: {
        provider: 'PAYSTACK',
        amount: Number(booking.totalAmount),
        reference,
        status: PaymentStatus.PENDING,
      },
    }).catch(() => {});

    return {
      payment,
      reference,
      authorizationUrl: result.data.authorization_url,
      accessCode: result.data.access_code,
      publicKey: this.config.get('PAYSTACK_PUBLIC_KEY'),
      amountKobo,
    };
  }

  // ── Verify (public — called by the booking page and by the webhook) ────────

  async verifyPaystack(reference: string) {
    const payment = await this.prisma.payment.findFirst({
      where: { providerRef: reference },
      include: { booking: { select: { hotelId: true, roomId: true } } },
    });
    if (!payment) throw new NotFoundException('Payment record not found');
    if (payment.status === PaymentStatus.SUCCESS) {
      return { message: 'Already verified', payment };
    }

    const response = await fetch(`https://api.paystack.co/transaction/verify/${reference}`, {
      headers: { Authorization: `Bearer ${this.paystackSecret}` },
    });
    const result = (await response.json()) as any;
    const txStatus: string | undefined = result?.data?.status;

    if (!result?.status || txStatus !== 'success') {
      // Only mark FAILED on a definitive failure. "pending" / "ongoing" must be left alone.
      if (txStatus && ['failed', 'abandoned', 'reversed'].includes(txStatus)) {
        await this.prisma.payment.update({
          where: { id: payment.id },
          data: { status: PaymentStatus.FAILED },
        });
        await this.auditLog.create({
          hotelId: payment.booking.hotelId,
          action: AuditAction.PAYMENT,
          entity: 'Payment',
          entityId: payment.id,
          newValues: { status: PaymentStatus.FAILED, reason: `Paystack status: ${txStatus}` },
        }).catch(() => {});
      }
      throw new BadRequestException('Payment has not been completed');
    }

    // Never confirm a booking for less money than it costs.
    const expectedKobo = Math.round(Number(payment.amount) * 100);
    if (result.data.amount < expectedKobo) {
      await this.auditLog.create({
        hotelId: payment.booking.hotelId,
        action: AuditAction.PAYMENT,
        entity: 'Payment',
        entityId: payment.id,
        newValues: {
          reason: 'Underpayment — not confirmed',
          expectedKobo,
          paidKobo: result.data.amount,
          reference,
        },
      }).catch(() => {});
      throw new BadRequestException('Paid amount is less than the booking total. Please contact the hotel.');
    }

    // Claim atomically so the webhook and the browser callback can't both process it.
    const claimed = await this.prisma.payment.updateMany({
      where: { id: payment.id, status: { not: PaymentStatus.SUCCESS } },
      data: { status: PaymentStatus.SUCCESS, paidAt: new Date(), providerData: result.data },
    });
    if (claimed.count === 0) return { message: 'Already verified', payment };

    // Only a still-PENDING booking may be confirmed. If the hold expired or the
    // booking was cancelled while the guest was paying, don't resurrect it.
    const confirmed = await this.prisma.booking.updateMany({
      where: { id: payment.bookingId, status: BookingStatus.PENDING },
      data: { status: BookingStatus.CONFIRMED, confirmedAt: new Date() },
    });

    if (confirmed.count > 0) {
      await this.roomService.syncRoomStatus(payment.booking.roomId);
    }

    await this.auditLog.create({
      hotelId: payment.booking.hotelId,
      action: AuditAction.PAYMENT,
      entity: 'Payment',
      entityId: payment.id,
      newValues: {
        status: PaymentStatus.SUCCESS,
        provider: 'PAYSTACK',
        bookingConfirmed: confirmed.count > 0,
        ...(confirmed.count === 0 && {
          needsReview:
            'Paid after the booking hold expired or the booking was cancelled — re-confirm availability or refund the guest',
        }),
      },
    }).catch(() => {});

    if (confirmed.count === 0) {
      throw new BadRequestException(
        `Your payment was received but the reservation hold had already expired. Please contact the hotel quoting reference ${reference}.`,
      );
    }

    return {
      message: 'Payment verified and booking confirmed',
      payment: await this.prisma.payment.findUnique({ where: { id: payment.id } }),
    };
  }

  // ── Webhook (signature-verified, no JWT) ───────────────────────────────────

  async handlePaystackWebhook(rawBody: Buffer | undefined, signature: string | undefined) {
    if (!rawBody || !signature) throw new BadRequestException('Missing signature');

    const expected = createHmac('sha512', this.paystackSecret).update(rawBody).digest('hex');
    const a = Buffer.from(expected);
    const b = Buffer.from(signature);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new ForbiddenException('Invalid signature');
    }

    const event = JSON.parse(rawBody.toString('utf8'));

    if (event.event === 'charge.success' && event.data?.reference) {
      // Never trust the webhook body for money — re-verify the reference with Paystack.
      await this.verifyPaystack(event.data.reference).catch((e) =>
        this.logger.warn(`Webhook verify failed for ${event.data.reference}: ${e?.message}`),
      );
    }

    return { received: true };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // FLUTTERWAVE (stub — creates the record + link only; no verify/webhook yet)
  // ══════════════════════════════════════════════════════════════════════════

  async initiateFlutterwave(dto: InitiatePaymentDto) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: dto.bookingId },
      include: { hotel: { select: { id: true } } },
    });
    if (!booking) throw new NotFoundException('Booking not found');
    if (booking.status !== BookingStatus.PENDING) {
      throw new BadRequestException('This booking is not awaiting payment');
    }

    const reference = `FLW-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

    const payment = await this.prisma.payment.create({
      data: {
        bookingId: dto.bookingId,
        hotelId: booking.hotel.id,
        amount: booking.totalAmount,
        currency: 'NGN',
        provider: PaymentProvider.FLUTTERWAVE,
        providerRef: reference,
        status: PaymentStatus.PENDING,
        paymentMethod: PaymentMethod.ONLINE,
      },
    });

    await this.auditLog.create({
      hotelId: booking.hotel.id,
      action: AuditAction.PAYMENT,
      entity: 'Payment',
      entityId: payment.id,
      newValues: {
        provider: 'FLUTTERWAVE',
        amount: Number(booking.totalAmount),
        reference,
        status: PaymentStatus.PENDING,
      },
    }).catch(() => {});

    return {
      payment,
      reference,
      paymentLink: `https://checkout.flutterwave.com/v3/hosted/pay/${reference}`,
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // LISTING & REPORTING
  // ══════════════════════════════════════════════════════════════════════════

  async getPaymentsByHotel(hotelId: string, page = 1, limit = 10, actorUserId: string) {
    await assertActorInHotel(this.prisma, actorUserId, hotelId);

    const skip = (page - 1) * limit;
    const [payments, total] = await Promise.all([
      this.prisma.payment.findMany({
        where: { hotelId },
        skip,
        take: limit,
        include: {
          booking: { select: { bookingRef: true, guestName: true } },
          recordedByUser: {
            select: {
              firstName: true,
              lastName: true,
              email: true,
              role: true,
              staffOf: { select: { employeeId: true, position: true, department: true } },
            },
          },
          approvedByUser: {
            select: {
              firstName: true,
              lastName: true,
              email: true,
              role: true,
              staffOf: { select: { employeeId: true, position: true, department: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.payment.count({ where: { hotelId } }),
    ]);

    return {
      data: payments,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async getRevenueStats(hotelId: string, actorUserId: string) {
    await assertActorInHotel(this.prisma, actorUserId, hotelId);

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfYear = new Date(now.getFullYear(), 0, 1);

    const [monthly, yearly, total] = await Promise.all([
      this.prisma.payment.aggregate({
        where: { hotelId, status: PaymentStatus.SUCCESS, paidAt: { gte: startOfMonth } },
        _sum: { amount: true },
      }),
      this.prisma.payment.aggregate({
        where: { hotelId, status: PaymentStatus.SUCCESS, paidAt: { gte: startOfYear } },
        _sum: { amount: true },
      }),
      this.prisma.payment.aggregate({
        where: { hotelId, status: PaymentStatus.SUCCESS },
        _sum: { amount: true },
      }),
    ]);

    return {
      monthlyRevenue: monthly._sum.amount || 0,
      yearlyRevenue: yearly._sum.amount || 0,
      totalRevenue: total._sum.amount || 0,
    };
  }
}