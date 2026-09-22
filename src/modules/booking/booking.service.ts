// src/modules/booking/booking.service.ts — FULL REPLACEMENT
// Key change: Room.status is never hardcoded here anymore. Every status
// transition calls roomService.syncRoomStatus(), which computes the correct
// value from live booking data. This fixes:
//   - CHECKED_IN not flipping the room to OCCUPIED (original bug)
//   - CANCELLED on an unrelated future booking incorrectly freeing a room
//     that has a *different*, currently active stay

import {
  Injectable, NotFoundException, ConflictException, BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { RoomService } from '@/modules/room/room.service';
import { ConfigService } from '@nestjs/config';
import { CreateBookingDto } from './dto/create-booking.dto';
import { paginate, getPaginationParams } from '../../common/helpers/pagination.helper';
import { BookingStatus, PaymentStatus, AuditAction } from '@prisma/client';

export interface StaffActor {
  userId: string;
  email:  string;
}

export interface CancelOptions {
  cancelType?:   'REFUND' | 'NO_REFUND' | 'WAIVER' | 'OTHER';
  refundAmount?: number;
}

interface ActorInfo {
  fullName:   string;
  role:       string;
  employeeId: string;
  position:   string;
  department: string;
  email:      string;
  display:    string;
}

@Injectable()
export class BookingService {
  constructor(
    private prisma:  PrismaService,
    private email:   EmailService,
    private auditLog: AuditLogService,
    private roomService: RoomService,
    private config:  ConfigService,
  ) {}

  // ── Private helpers ────────────────────────────────────────────────────────

  private async resolveActor(userId: string): Promise<ActorInfo> {
    const user = await this.prisma.user.findUnique({
      where:  { id: userId },
      select: {
        firstName: true,
        lastName:  true,
        email:     true,
        role:      true,
        staffOf: {
          select: { employeeId: true, position: true, department: true },
        },
      },
    });

    if (!user) {
      return {
        fullName: 'Unknown', role: '—', employeeId: '—',
        position: '—', department: '—', email: '—',
        display: 'Unknown',
      };
    }

    const s = user.staffOf;
    const fullName   = `${user.firstName} ${user.lastName}`;
    const employeeId = s?.employeeId ?? '—';
    const position   = s?.position   ?? '—';
    const department = s?.department ?? '—';

    return {
      fullName, role: user.role, employeeId, position, department,
      email: user.email,
      display: `${fullName} · ${user.role} · ${position} · ${employeeId} (${user.email})`,
    };
  }

  private async getStaffId(userId: string): Promise<string | null> {
    const staff = await this.prisma.staff.findUnique({
      where: { userId }, select: { id: true },
    });
    return staff?.id ?? null;
  }

  // ── Create ─────────────────────────────────────────────────────────────────

  async create(dto: CreateBookingDto) {
    const checkIn  = new Date(dto.checkIn);
    const checkOut = new Date(dto.checkOut);

    if (checkIn >= checkOut)
      throw new BadRequestException('Check-out must be after check-in');

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (checkIn < today)
      throw new BadRequestException('Check-in date cannot be in the past');

    const conflict = await this.prisma.booking.findFirst({
      where: {
        roomId: dto.roomId,
        OR:  [{ checkIn: { lte: checkOut }, checkOut: { gte: checkIn } }],
        AND: [{
          OR: [
            { status: { in: [BookingStatus.CONFIRMED, BookingStatus.CHECKED_IN] } },
            { status: BookingStatus.PENDING, timeoutAt: { gt: new Date() } },
          ],
        }],
      },
    });

    if (conflict) {
      if (
        conflict.status === BookingStatus.PENDING &&
        conflict.timeoutAt && conflict.timeoutAt <= new Date() &&
        conflict.guestEmail === dto.guestEmail
      ) {
        await this.prisma.booking.update({
          where: { id: conflict.id },
          data: {
            status:       BookingStatus.TIMEOUT,
            cancelReason: 'Auto-cancelled: payment not completed within hold window',
            cancelledAt:  new Date(),
          },
        });
      } else {
        throw new ConflictException('Room is not available for the selected dates');
      }
    }

    const nights = Math.ceil(
      (checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24),
    );

    const room = await this.prisma.room.findUnique({
      where:   { id: dto.roomId },
      include: { hotel: { include: { director: { select: { email: true } } } } },
    });
    if (!room) throw new NotFoundException('Room not found');

    const totalAmount = Number(room.pricePerNight) * nights;
    const bookingRef  = `BK${Date.now().toString(36).toUpperCase()}`;
    const timeoutAt   = new Date(Date.now() + 30 * 60 * 1000); // 30-min payment hold

    const booking = await this.prisma.booking.create({
      data: {
        bookingRef,
        hotelId:        dto.hotelId,
        roomId:         dto.roomId,
        guestId:        dto.guestId,
        guestName:      dto.guestName,
        guestEmail:     dto.guestEmail,
        guestPhone:     dto.guestPhone,
        checkIn,
        checkOut,
        nights,
        adults:         dto.adults   || 1,
        children:       dto.children || 0,
        totalAmount,
        specialRequests: dto.specialRequests,
        status:         BookingStatus.PENDING,
        timeoutAt,
      },
      include: {
        room:  true,
        hotel: { include: { director: { select: { email: true } } } },
      },
    });

    await this.auditLog.create({
      userId: dto.createdByUserId || undefined,
      hotelId: dto.hotelId,
      action: AuditAction.BOOKING,
      entity: 'Booking',
      entityId: booking.id,
      newValues: {
        bookingRef: booking.bookingRef,
        guestName: booking.guestName,
        guestEmail: booking.guestEmail,
        checkIn: booking.checkIn,
        checkOut: booking.checkOut,
        totalAmount: Number(booking.totalAmount),
        status: booking.status,
      },
    }).catch(() => {});

    const frontendUrl = this.config.get('FRONTEND_URL', 'http://localhost:5173');

    this.email.sendGuestBookingConfirmation({
      guestName:    booking.guestName,
      guestEmail:   booking.guestEmail,
      bookingRef:   booking.bookingRef,
      hotelName:    booking.hotel.name,
      hotelPhone:   booking.hotel.phone,
      hotelEmail:   booking.hotel.email,
      hotelAddress: booking.hotel.address,
      hotelCity:    booking.hotel.city,
      roomType:     booking.room.roomType,
      roomNumber:   booking.room.roomNumber,
      checkIn:      booking.checkIn,
      checkOut:     booking.checkOut,
      nights:       booking.nights,
      adults:       booking.adults,
      children:     booking.children,
      totalAmount:  Number(booking.totalAmount),
      specialRequests: booking.specialRequests ?? undefined,
    }).catch(() => {});

    const directorEmail = (booking.hotel as any).director?.email;
    if (directorEmail) {
      this.email.sendHotelNewBookingAlert({
        directorEmail,
        hotelName:    booking.hotel.name,
        bookingRef:   booking.bookingRef,
        guestName:    booking.guestName,
        guestEmail:   booking.guestEmail,
        guestPhone:   booking.guestPhone,
        roomType:     booking.room.roomType,
        roomNumber:   booking.room.roomNumber,
        checkIn:      booking.checkIn,
        checkOut:     booking.checkOut,
        nights:       booking.nights,
        adults:       booking.adults,
        children:     booking.children,
        totalAmount:  Number(booking.totalAmount),
        specialRequests: booking.specialRequests ?? undefined,
        dashboardUrl: frontendUrl,
      }).catch(() => {});
    }

    return booking;
  }

  // ── Find All ───────────────────────────────────────────────────────────────

  async findAll(hotelId: string, page = 1, limit = 10, status?: BookingStatus) {
    const { skip, take } = getPaginationParams(page, limit);
    const where: any = { hotelId };
    if (status) where.status = status;

    const [bookings, total] = await Promise.all([
      this.prisma.booking.findMany({
        where, skip, take,
        include: {
          room:     { select: { roomNumber: true, roomType: true } },
          payments: true,
          cancelledByUser: {
            select: { firstName: true, lastName: true, role: true, email: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.booking.count({ where }),
    ]);
    return paginate(bookings, total, page, limit);
  }

  // ── Find One ───────────────────────────────────────────────────────────────

  async findOne(id: string) {
    const booking = await this.prisma.booking.findUnique({
      where: { id },
      include: {
        room:  true,
        hotel: { select: { id: true, name: true } },
        payments: {
          include: {
            recordedByUser: {
              select: { firstName: true, lastName: true, email: true, role: true,
                staffOf: { select: { employeeId: true, position: true, department: true } },
              },
            },
            approvedByUser: {
              select: { firstName: true, lastName: true, email: true, role: true,
                staffOf: { select: { employeeId: true, position: true, department: true } },
              },
            },
          },
        },
        checkedInBy: {
          select: {
            id: true, employeeId: true, position: true, department: true,
            user: { select: { firstName: true, lastName: true, email: true, role: true } },
          },
        },
        checkedOutBy: {
          select: {
            id: true, employeeId: true, position: true, department: true,
            user: { select: { firstName: true, lastName: true, email: true, role: true } },
          },
        },
        cancelledByUser: {
          select: {
            firstName: true, lastName: true, email: true, role: true,
            staffOf: { select: { employeeId: true, position: true, department: true } },
          },
        },
      },
    });

    if (!booking) throw new NotFoundException('Booking not found');
    return booking;
  }

  // ── Update Status ────────────────────────────────────────────────────────

  async updateStatus(
    id:          string,
    status:      BookingStatus,
    reason?:     string,
    actor?:      StaffActor,
    cancelOpts?: CancelOptions,
  ) {
    const booking = await this.findOne(id);
    const now     = new Date();

    if (status === BookingStatus.CHECKED_IN) {
      const ci = new Date(booking.checkIn); ci.setHours(0,0,0,0);
      const td = new Date();                td.setHours(0,0,0,0);
      if (td < ci) throw new BadRequestException(
        `Cannot check in before ${ci.toDateString()}`,
      );
    }
    if (status === BookingStatus.CHECKED_OUT) {
      const co = new Date(booking.checkOut); co.setHours(0,0,0,0);
      const td = new Date();                 td.setHours(0,0,0,0);
      if (td < co) throw new BadRequestException(
        `Cannot check out before ${co.toDateString()}`,
      );
    }

    const actorInfo = actor ? await this.resolveActor(actor.userId) : null;
    const staffId   = actor ? await this.getStaffId(actor.userId)   : null;

    const updateData: any = { status };

    if (status === BookingStatus.CONFIRMED) {
      updateData.confirmedAt  = now;
      updateData.cancelReason = actorInfo
        ? `Confirmed by: ${actorInfo.display}`
        : 'Confirmed by: System';

      await this.auditLog.create({
        userId: actor?.userId,
        hotelId: booking.hotelId,
        action: AuditAction.BOOKING,
        entity: 'Booking',
        entityId: booking.id,
        newValues: {
          status: BookingStatus.CONFIRMED,
          confirmedAt: now,
          confirmedBy: actorInfo?.display ?? 'System',
        },
      }).catch(() => {});
    }

    if (status === BookingStatus.CHECKED_IN) {
      updateData.checkedInAt = now;
      if (staffId) updateData.checkedInById = staffId;
      updateData.cancelReason = actorInfo
        ? `Checked in by: ${actorInfo.display}`
        : 'Checked in';

      await this.auditLog.create({
        userId: actor?.userId,
        hotelId: booking.hotelId,
        action: AuditAction.BOOKING,
        entity: 'Booking',
        entityId: booking.id,
        newValues: {
          status: BookingStatus.CHECKED_IN,
          checkedInAt: now,
          checkedInBy: actorInfo?.display ?? 'Unknown',
          staffId: staffId ?? undefined,
        },
      }).catch(() => {});
    }

    if (status === BookingStatus.CHECKED_OUT) {
      updateData.checkedOutAt = now;
      if (staffId) updateData.checkedOutById = staffId;
      updateData.cancelReason = actorInfo
        ? `Checked out by: ${actorInfo.display}`
        : 'Checked out';

      await this.auditLog.create({
        userId: actor?.userId,
        hotelId: booking.hotelId,
        action: AuditAction.BOOKING,
        entity: 'Booking',
        entityId: booking.id,
        newValues: {
          status: BookingStatus.CHECKED_OUT,
          checkedOutAt: now,
          checkedOutBy: actorInfo?.display ?? 'Unknown',
          staffId: staffId ?? undefined,
        },
      }).catch(() => {});
    }

    if (status === BookingStatus.CANCELLED) {
      const type         = cancelOpts?.cancelType ?? 'NO_REFUND';
      const refundAmount = cancelOpts?.refundAmount;

      updateData.cancelledAt       = now;
      updateData.cancelType        = type;
      updateData.cancelledByUserId = actor?.userId ?? null;
      if (refundAmount !== undefined) updateData.refundAmount = refundAmount;

      const parts = [
        reason        ? `Reason: ${reason}` : null,
        `Type: ${type}`,
        refundAmount  ? `Refund: ₦${Number(refundAmount).toLocaleString()}` : null,
        actorInfo     ? `Cancelled by: ${actorInfo.display}` : null,
      ].filter(Boolean);

      updateData.cancelReason = parts.join(' | ');

      if (type === 'REFUND') {
        await this.prisma.payment.updateMany({
          where: { bookingId: id, status: PaymentStatus.SUCCESS },
          data:  { status: PaymentStatus.REFUNDED },
        });
      }

      await this.auditLog.create({
        userId: actor?.userId,
        hotelId: booking.hotelId,
        action: AuditAction.BOOKING,
        entity: 'Booking',
        entityId: booking.id,
        newValues: {
          status: BookingStatus.CANCELLED,
          cancelledAt: now,
          cancelReason: reason,
          cancelType: type,
          refundAmount: refundAmount,
          cancelledBy: actorInfo?.display ?? 'Unknown',
        },
      }).catch(() => {});
    }

    if (status === BookingStatus.TIMEOUT) {
      updateData.cancelledAt  = now;
      updateData.cancelReason = 'Payment not completed within hold window';

      await this.auditLog.create({
        userId: undefined,
        hotelId: booking.hotelId,
        action: AuditAction.BOOKING,
        entity: 'Booking',
        entityId: booking.id,
        newValues: {
          status: BookingStatus.TIMEOUT,
          cancelledAt: now,
          reason: 'Payment hold expired',
        },
      }).catch(() => {});
    }

    const updated = await this.prisma.booking.update({
      where: { id },
      data:  updateData,
      include: {
        room:     { select: { roomNumber: true, roomType: true } },
        payments: {
          include: {
            recordedByUser: {
              select: { firstName: true, lastName: true, email: true, role: true,
                staffOf: { select: { employeeId: true, position: true, department: true } },
              },
            },
            approvedByUser: {
              select: { firstName: true, lastName: true, email: true, role: true,
                staffOf: { select: { employeeId: true, position: true, department: true } },
              },
            },
          },
        },
        cancelledByUser: {
          select: { firstName: true, lastName: true, email: true, role: true,
            staffOf: { select: { employeeId: true, position: true, department: true } },
          },
        },
      },
    });

    // ── Room.status sync — single call, correct for every transition ─────────
    // Runs after the booking row is committed so syncRoomStatus() sees the
    // updated status when it queries for an active stay covering today.
    await this.roomService.syncRoomStatus(booking.roomId);

    return updated;
  }

  // ── Calendar ───────────────────────────────────────────────────────────────

  async getCalendar(hotelId: string, year: number, month: number) {
    const start = new Date(year, month - 1, 1);
    const end   = new Date(year, month, 0, 23, 59, 59);

    return this.prisma.booking.findMany({
      where: {
        hotelId,
        status: { in: ['CONFIRMED', 'CHECKED_IN', 'PENDING'] },
        OR:     [{ checkIn: { lte: end }, checkOut: { gte: start } }],
      },
      include: { room: { select: { roomNumber: true, roomType: true } } },
      orderBy: { checkIn: 'asc' },
    });
  }

  // ── Auto-expire abandoned payment holds ─────────────────────────────────────
  // Call this from a scheduled job (see notes below). Catches guests who
  // close the tab mid-payment — without this, only the *next* booking
  // attempt on that room triggers the timeout-conflict logic in create().
  // A sweep guarantees rooms/dates free up even with zero new traffic.

  async expireStaleHolds() {
    const stale = await this.prisma.booking.findMany({
      where: { status: BookingStatus.PENDING, timeoutAt: { lte: new Date() } },
      select: { id: true, roomId: true },
    });

    for (const b of stale) {
      await this.prisma.booking.update({
        where: { id: b.id },
        data: {
          status: BookingStatus.TIMEOUT,
          cancelledAt: new Date(),
          cancelReason: 'Payment not completed within hold window',
        },
      });
      await this.roomService.syncRoomStatus(b.roomId);
    }

    return { expired: stale.length };
  }
}