// src/modules/payment/payment.service.ts — FULL REPLACEMENT
// New capabilities:
//   - recordManualPayment  → any staff records cash/POS/bank-transfer; goes PENDING_APPROVAL
//   - approveManualPayment → HOTEL_DIRECTOR or ADMIN approves; booking confirmed
//   - rejectManualPayment  → HOTEL_DIRECTOR or ADMIN rejects; booking stays PENDING
//   - getPendingApprovals  → list all awaiting-approval payments for a hotel


// src/modules/payment/payment.service.ts — COMPLETE WITH AUDIT LOGGING

import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { InitiatePaymentDto } from './dto/initiate-payment.dto';
import {
  PaymentProvider,
  PaymentStatus,
  PaymentMethod,
  ManualPaymentStatus,
  BookingStatus,
  RoomStatus,
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
  private readonly paystackSecret: string;
  private readonly frontendUrl: string;

  constructor(
    private prisma: PrismaService,
    private auditLog: AuditLogService,
    private config: ConfigService,
  ) {
    this.paystackSecret = this.config.get('PAYSTACK_SECRET_KEY', '');
    this.frontendUrl    = this.config.get('FRONTEND_URL', 'http://localhost:5173');
  }

  private async actorDisplay(userId: string): Promise<string> {
    const u = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        firstName: true,
        lastName:  true,
        email:     true,
        role:      true,
        staffOf:   { select: { employeeId: true, position: true, department: true } },
      },
    });
    if (!u) return 'Unknown';
    const s = u.staffOf;
    return `${u.firstName} ${u.lastName} · ${u.role} · ${s?.position ?? '—'} · ${s?.employeeId ?? '—'} (${u.email})`;
  }

  // ── MANUAL PAYMENT: Record ──────────────────────────────────────────────────

  async recordManualPayment(dto: RecordManualPaymentDto, actorUserId: string) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: dto.bookingId },
      include: { hotel: { select: { name: true, id: true } } },
    });
    if (!booking) throw new NotFoundException('Booking not found');

    if (
      booking.status === BookingStatus.CONFIRMED ||
      booking.status === BookingStatus.CHECKED_IN
    ) {
      throw new BadRequestException('Booking is already paid and active');
    }

    if (
      booking.status === BookingStatus.CANCELLED ||
      booking.status === BookingStatus.TIMEOUT
    ) {
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
      throw new BadRequestException(
        'A manual payment is already awaiting approval for this booking',
      );
    }

    const actor    = await this.actorDisplay(actorUserId);
    const reference = `MAN-${Date.now().toString(36).toUpperCase()}`;

    const payment = await this.prisma.payment.create({
      data: {
        bookingId:       dto.bookingId,
        hotelId:         booking.hotelId,
        amount:          dto.amount ?? booking.totalAmount,
        currency:        'NGN',
        provider:        PaymentProvider.MANUAL,
        providerRef:     reference,
        status:          PaymentStatus.PENDING,
        paymentMethod:   dto.paymentMethod,
        isManual:        true,
        manualStatus:    ManualPaymentStatus.PENDING_APPROVAL,
        recordedByUserId: actorUserId,
        recordedAt:      new Date(),
        providerData: {
          note:       dto.note ?? null,
          recordedBy: actor,
          hotelName:  booking.hotel.name,
        },
      },
      include: {
        booking: {
          select: { bookingRef: true, guestName: true, totalAmount: true },
        },
        recordedByUser: {
          select: { firstName: true, lastName: true, email: true, role: true },
        },
      },
    });

    // ── LOG: Manual payment recorded ────────────────────────────────────────
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

  // ── MANUAL PAYMENT: Approve ────────────────────────────────────────────────

  async approveManualPayment(
    paymentId: string,
    dto: ApprovePaymentDto,
    actorUserId: string,
  ) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: { booking: { include: { room: true } } },
    });
    if (!payment)                   throw new NotFoundException('Payment not found');
    if (!payment.isManual)          throw new BadRequestException('Not a manual payment');
    if (payment.manualStatus !== ManualPaymentStatus.PENDING_APPROVAL) {
      throw new BadRequestException(
        `Payment is already ${payment.manualStatus?.toLowerCase().replace('_', ' ')}`,
      );
    }

    const actor = await this.actorDisplay(actorUserId);

    // 1. Mark payment SUCCESS
    const updatedPayment = await this.prisma.payment.update({
      where: { id: paymentId },
      data: {
        status:          PaymentStatus.SUCCESS,
        manualStatus:    ManualPaymentStatus.APPROVED,
        approvedByUserId: actorUserId,
        approvedAt:      new Date(),
        approvalNote:    dto.approvalNote,
        paidAt:          new Date(),
        providerData: {
          ...(payment.providerData as object ?? {}),
          approvedBy:   actor,
          approvalNote: dto.approvalNote ?? null,
        },
      },
    });

    // 2. Confirm booking
    await this.prisma.booking.update({
      where: { id: payment.bookingId },
      data: {
        status:       BookingStatus.CONFIRMED,
        confirmedAt:  new Date(),
        cancelReason: `Payment approved by: ${actor}${dto.approvalNote ? ` | Note: ${dto.approvalNote}` : ''}`,
      },
    });

    // 3. Mark room OCCUPIED
    await this.prisma.room.update({
      where: { id: payment.booking.roomId },
      data: { status: RoomStatus.OCCUPIED },
    });

    // ── LOG: Manual payment approved ────────────────────────────────────────
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

    return { payment: updatedPayment, message: 'Payment approved — booking confirmed' };
  }

  // ── MANUAL PAYMENT: Reject ─────────────────────────────────────────────────

  async rejectManualPayment(
    paymentId: string,
    dto: RejectPaymentDto,
    actorUserId: string,
  ) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: { booking: { select: { hotelId: true } } },
    });
    if (!payment)          throw new NotFoundException('Payment not found');
    if (!payment.isManual) throw new BadRequestException('Not a manual payment');
    if (payment.manualStatus !== ManualPaymentStatus.PENDING_APPROVAL) {
      throw new BadRequestException(
        `Payment is already ${payment.manualStatus?.toLowerCase().replace('_', ' ')}`,
      );
    }

    const actor = await this.actorDisplay(actorUserId);

    const updated = await this.prisma.payment.update({
      where: { id: paymentId },
      data: {
        status:           PaymentStatus.FAILED,
        manualStatus:     ManualPaymentStatus.REJECTED,
        approvedByUserId: actorUserId,
        approvedAt:       new Date(),
        rejectionReason:  dto.reason,
        providerData: {
          ...(payment.providerData as object ?? {}),
          rejectedBy:      actor,
          rejectionReason: dto.reason,
        },
      },
    });

    // ── LOG: Manual payment rejected ────────────────────────────────────────
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

    return updated;
  }

  // ── Get pending approvals ──────────────────────────────────────────────────

  async getPendingApprovals(hotelId: string) {
    return this.prisma.payment.findMany({
      where: {
        hotelId,
        isManual:     true,
        manualStatus: ManualPaymentStatus.PENDING_APPROVAL,
      },
      include: {
        booking: {
          select: {
            bookingRef: true,
            guestName:  true,
            guestEmail: true,
            guestPhone: true,
            checkIn:    true,
            checkOut:   true,
            totalAmount: true,
          },
        },
        recordedByUser: {
          select: { firstName: true, lastName: true, email: true, role: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ── PAYSTACK: Initiate ─────────────────────────────────────────────────────

  async initiatePaystack(dto: InitiatePaymentDto) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: dto.bookingId },
      include: { hotel: { select: { name: true, id: true } } },
    });
    if (!booking) throw new NotFoundException('Booking not found');
    if (booking.status === BookingStatus.CONFIRMED)
      throw new BadRequestException('Booking is already paid and confirmed');

    const reference  = `PAY-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
    const amountKobo = Math.round(Number(booking.totalAmount) * 100);

    const response = await fetch('https://api.paystack.co/transaction/initialize', {
      method:  'POST',
      headers: {
        Authorization:  `Bearer ${this.paystackSecret}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email:        booking.guestEmail,
        amount:       amountKobo,
        reference,
        currency:     'NGN',
        metadata: {
          bookingId:  booking.id,
          bookingRef: booking.bookingRef,
          hotelName:  booking.hotel.name,
          guestName:  booking.guestName,
        },
        callback_url: dto.callbackUrl || `${this.frontendUrl}/book/payment-callback`,
      }),
    });

    const result = await response.json() as any;
    if (!result.status) {
      throw new BadRequestException(result.message || 'Paystack initialization failed');
    }

    const payment = await this.prisma.payment.create({
      data: {
        bookingId:    dto.bookingId,
        hotelId:      booking.hotel.id,
        amount:       booking.totalAmount,
        currency:     'NGN',
        provider:     PaymentProvider.PAYSTACK,
        providerRef:  reference,
        status:       PaymentStatus.PENDING,
        paymentMethod: PaymentMethod.ONLINE,
      },
    });

    // ── LOG: Paystack payment initiated ────────────────────────────────────
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
      accessCode:       result.data.access_code,
      publicKey:        this.config.get('PAYSTACK_PUBLIC_KEY'),
      amountKobo,
    };
  }

  // ── PAYSTACK: Verify ──────────────────────────────────────────────────────

  async verifyPaystack(reference: string) {
    const payment = await this.prisma.payment.findFirst({
      where: { providerRef: reference },
      include: { booking: { select: { hotelId: true } } },
    });
    if (!payment) throw new NotFoundException('Payment record not found');
    if (payment.status === PaymentStatus.SUCCESS)
      return { message: 'Already verified', payment };

    const response = await fetch(
      `https://api.paystack.co/transaction/verify/${reference}`,
      { headers: { Authorization: `Bearer ${this.paystackSecret}` } },
    );
    const result = await response.json() as any;

    if (!result.status || result.data?.status !== 'success') {
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: { status: PaymentStatus.FAILED },
      });

      await this.auditLog.create({
        hotelId: payment.booking.hotelId,
        action: AuditAction.PAYMENT,
        entity: 'Payment',
        entityId: payment.id,
        newValues: { status: PaymentStatus.FAILED, reason: 'Verification failed' },
      }).catch(() => {});

      throw new BadRequestException('Payment verification failed');
    }

    const updatedPayment = await this.prisma.payment.update({
      where: { id: payment.id },
      data: {
        status:       PaymentStatus.SUCCESS,
        paidAt:       new Date(),
        providerData: result.data,
      },
    });

    await this.prisma.booking.update({
      where: { id: payment.bookingId },
      data: { status: BookingStatus.CONFIRMED, confirmedAt: new Date() },
    });

    // ── LOG: Paystack payment verified and confirmed ────────────────────────
    await this.auditLog.create({
      hotelId: payment.booking.hotelId,
      action: AuditAction.PAYMENT,
      entity: 'Payment',
      entityId: payment.id,
      newValues: {
        status: PaymentStatus.SUCCESS,
        bookingStatus: BookingStatus.CONFIRMED,
        provider: 'PAYSTACK',
        verifiedAt: new Date(),
      },
    }).catch(() => {});

    return { message: 'Payment verified and booking confirmed', payment: updatedPayment };
  }

  // ── FLUTTERWAVE ───────────────────────────────────────────────────────────

  async initiateFlutterwave(dto: InitiatePaymentDto) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: dto.bookingId },
      include: { hotel: { select: { id: true } } },
    });
    if (!booking) throw new NotFoundException('Booking not found');

    const reference = `FLW-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

    const payment = await this.prisma.payment.create({
      data: {
        bookingId:    dto.bookingId,
        hotelId:      booking.hotel.id,
        amount:       booking.totalAmount,
        currency:     'NGN',
        provider:     PaymentProvider.FLUTTERWAVE,
        providerRef:  reference,
        status:       PaymentStatus.PENDING,
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

  // ── Helpers ───────────────────────────────────────────────────────────────

  async getPaymentsByHotel(hotelId: string, page = 1, limit = 10) {
    const skip = (page - 1) * limit;
    const [payments, total] = await Promise.all([
      this.prisma.payment.findMany({
        where:   { hotelId },
        skip,
        take:    limit,
        include: {
          booking:       { select: { bookingRef: true, guestName: true } },
          recordedByUser: { select: { firstName: true, lastName: true, role: true } },
          approvedByUser: { select: { firstName: true, lastName: true, role: true } },
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

  async getRevenueStats(hotelId: string) {
    const now          = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfYear  = new Date(now.getFullYear(), 0, 1);

    const [monthly, yearly, total] = await Promise.all([
      this.prisma.payment.aggregate({
        where: { hotelId, status: PaymentStatus.SUCCESS, paidAt: { gte: startOfMonth } },
        _sum:  { amount: true },
      }),
      this.prisma.payment.aggregate({
        where: { hotelId, status: PaymentStatus.SUCCESS, paidAt: { gte: startOfYear } },
        _sum:  { amount: true },
      }),
      this.prisma.payment.aggregate({
        where: { hotelId, status: PaymentStatus.SUCCESS },
        _sum:  { amount: true },
      }),
    ]);

    return {
      monthlyRevenue: monthly._sum.amount || 0,
      yearlyRevenue:  yearly._sum.amount  || 0,
      totalRevenue:   total._sum.amount   || 0,
    };
  }
}