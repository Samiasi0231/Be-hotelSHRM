// src/modules/dashboard/dashboard.service.ts — FULL REPLACEMENT

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { BookingStatus, PaymentStatus } from '@prisma/client';

@Injectable()
export class DashboardService {
  constructor(private prisma: PrismaService) {}

  async getHotelDashboard(hotelId: string) {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
    const todayEnd   = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

    const [
      totalRooms, availableRooms, occupiedRooms, maintenanceRooms,
      totalBookings, monthlyBookings, lastMonthBookings,
      monthlyRevenue, lastMonthRevenue, totalRevenue,
      totalStaff, activeStaff,
      pendingBookings, confirmedBookings, checkedInBookings,
      todayCheckIns, todayCheckOuts,
      recentBookings,
      staffActivity,                  
    ] = await Promise.all([

      // ── Rooms ──────────────────────────────────────────────────────────────
      this.prisma.room.count({ where: { hotelId } }),
      this.prisma.room.count({ where: { hotelId, status: 'AVAILABLE', isActive: true } }),
      this.prisma.room.count({ where: { hotelId, status: 'OCCUPIED' } }),
      this.prisma.room.count({ where: { hotelId, status: 'MAINTENANCE' } }),

      // ── Bookings ───────────────────────────────────────────────────────────
      this.prisma.booking.count({ where: { hotelId } }),
      this.prisma.booking.count({ where: { hotelId, createdAt: { gte: startOfMonth } } }),
      this.prisma.booking.count({ where: { hotelId, createdAt: { gte: startOfLastMonth, lte: endOfLastMonth } } }),

      // ── Revenue ────────────────────────────────────────────────────────────
      this.prisma.payment.aggregate({ where: { hotelId, status: PaymentStatus.SUCCESS, paidAt: { gte: startOfMonth } }, _sum: { amount: true } }),
      this.prisma.payment.aggregate({ where: { hotelId, status: PaymentStatus.SUCCESS, paidAt: { gte: startOfLastMonth, lte: endOfLastMonth } }, _sum: { amount: true } }),
      this.prisma.payment.aggregate({ where: { hotelId, status: PaymentStatus.SUCCESS }, _sum: { amount: true } }),

      // ── Staff ──────────────────────────────────────────────────────────────
      this.prisma.staff.count({ where: { hotelId } }),
      this.prisma.staff.count({ where: { hotelId, isActive: true } }),

      // ── Booking status counts ──────────────────────────────────────────────
      this.prisma.booking.count({ where: { hotelId, status: BookingStatus.PENDING } }),
      this.prisma.booking.count({ where: { hotelId, status: BookingStatus.CONFIRMED } }),
      this.prisma.booking.count({ where: { hotelId, status: BookingStatus.CHECKED_IN } }),

      // ── Today check-ins ────────────────────────────────────────────────────
      this.prisma.booking.count({
        where: {
          hotelId,
          status: { in: [BookingStatus.CONFIRMED, BookingStatus.CHECKED_IN] },
          checkIn: { gte: todayStart, lte: todayEnd },
        },
      }),

      // ── Today check-outs ───────────────────────────────────────────────────
      this.prisma.booking.count({
        where: {
          hotelId,
          status: BookingStatus.CHECKED_IN,
          checkOut: { gte: todayStart, lte: todayEnd },
        },
      }),

      // ── Recent bookings ────────────────────────────────────────────────────
      this.prisma.booking.findMany({
        where: { hotelId },
        take: 10,
        orderBy: { createdAt: 'desc' },
        include: {
          room:     { select: { roomNumber: true, roomType: true } },
          payments: { select: { status: true, amount: true } },
        },
      }),

      // ── Staff activity (check-ins / check-outs performed by staff) ─────────
      this.prisma.booking.findMany({
        where: {
          hotelId,
          status: { in: [BookingStatus.CHECKED_IN, BookingStatus.CHECKED_OUT] },
          OR: [
            { checkedInBy:  { isNot: null } },
            { checkedOutBy: { isNot: null } },
          ],
        },
        take: 20,
        orderBy: { updatedAt: 'desc' },
        select: {
          id:        true,
          guestName: true,
          status:    true,
          checkIn:   true,
          checkOut:  true,
          updatedAt: true,
          room: { select: { roomNumber: true } },
          checkedInBy: {
            select: {
              id:   true,
              user: { select: { firstName: true, lastName: true } },
            },
          },
          checkedOutBy: {
            select: {
              id:   true,
              user: { select: { firstName: true, lastName: true } },
            },
          },
        },
      }),
    ]);

    // ── Monthly bookings grouped by day (JS, no raw SQL) ──────────────────────
    const monthBookings = await this.prisma.booking.findMany({
      where: { hotelId, createdAt: { gte: startOfMonth } },
      select: { createdAt: true, totalAmount: true },
    });

    const dayMap = new Map<string, { count: number; revenue: number }>();
    for (const b of monthBookings) {
      const day      = b.createdAt.toISOString().split('T')[0];
      const existing = dayMap.get(day) ?? { count: 0, revenue: 0 };
      dayMap.set(day, {
        count:   existing.count + 1,
        revenue: existing.revenue + Number(b.totalAmount),
      });
    }
    const monthlyBookingsByDay = Array.from(dayMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, { count, revenue }]) => ({ date, count, revenue }));

    // ── Computed metrics ───────────────────────────────────────────────────────
    const occupancyRate = totalRooms > 0
      ? Math.round((occupiedRooms / totalRooms) * 100)
      : 0;

    const bookingGrowth = lastMonthBookings > 0
      ? Math.round(((monthlyBookings - lastMonthBookings) / lastMonthBookings) * 100)
      : 100;

    const revenueGrowth = Number(lastMonthRevenue._sum.amount || 0) > 0
      ? Math.round(
          ((Number(monthlyRevenue._sum.amount || 0) - Number(lastMonthRevenue._sum.amount || 0)) /
            Number(lastMonthRevenue._sum.amount || 0)) * 100,
        )
      : 100;

    return {
      overview: {
        totalRooms,
        availableRooms,
        occupiedRooms,
        maintenanceRooms,
        occupancyRate,
        totalBookings,
        monthlyBookings,
        bookingGrowth,
        pendingBookings,
        confirmedBookings,
        checkedInBookings,
        todayCheckIns,
        todayCheckOuts,
        monthlyRevenue: monthlyRevenue._sum.amount || 0,
        totalRevenue:   totalRevenue._sum.amount   || 0,
        revenueGrowth,
        totalStaff,
        activeStaff,
      },
      recentBookings,
      monthlyBookingsByDay,
      staffActivity,             // ← director sees who did what
    };
  }

  // ── Super Admin ─────────────────────────────────────────────────────────────
  async getSuperAdminDashboard() {
    const now          = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [
      totalHotels, activeHotels, suspendedHotels,
      totalUsers, totalBookings, monthlyRevenue,
      hotelsBySubscription, recentHotels,
    ] = await Promise.all([
      this.prisma.hotel.count(),
      this.prisma.hotel.count({ where: { isActive: true, subscriptionStatus: 'ACTIVE' } }),
      this.prisma.hotel.count({ where: { subscriptionStatus: 'SUSPENDED' } }),
      this.prisma.user.count(),
      this.prisma.booking.count(),
      this.prisma.payment.aggregate({
        where: { status: PaymentStatus.SUCCESS, paidAt: { gte: startOfMonth } },
        _sum: { amount: true },
      }),
      this.prisma.hotel.groupBy({
        by: ['subscriptionPlan'],
        _count: { subscriptionPlan: true },
      }),
      this.prisma.hotel.findMany({
        take: 5,
        orderBy: { createdAt: 'desc' },
        include: {
          director: { select: { firstName: true, lastName: true, email: true } },
          _count:   { select: { rooms: true, staff: true, bookings: true } },
        },
      }),
    ]);

    return {
      overview: {
        totalHotels, activeHotels, suspendedHotels,
        totalUsers, totalBookings,
        monthlyRevenue: monthlyRevenue._sum.amount || 0,
      },
      hotelsBySubscription,
      recentHotels,
    };
  }

  // ── Revenue chart ────────────────────────────────────────────────────────────
  async getRevenueChart(
    hotelId: string,
    period: 'weekly' | 'monthly' | 'yearly' = 'monthly',
  ) {
    const now = new Date();
    let startDate: Date;
    let groupBy: 'day' | 'month' | 'year';

    if (period === 'weekly') {
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      groupBy   = 'day';
    } else if (period === 'monthly') {
      startDate = new Date(now.getFullYear(), now.getMonth() - 11, 1);
      groupBy   = 'month';
    } else {
      startDate = new Date(now.getFullYear() - 4, 0, 1);
      groupBy   = 'year';
    }

    const payments = await this.prisma.payment.findMany({
      where: {
        hotelId,
        status: PaymentStatus.SUCCESS,
        paidAt: { gte: startDate },
      },
      select:  { amount: true, paidAt: true },
      orderBy: { paidAt: 'asc' },
    });

    const grouped = new Map<string, number>();
    for (const p of payments) {
      const d = p.paidAt!;
      let key: string;
      if (groupBy === 'day') {
        key = d.toISOString().split('T')[0];
      } else if (groupBy === 'month') {
        key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      } else {
        key = String(d.getFullYear());
      }
      grouped.set(key, (grouped.get(key) || 0) + Number(p.amount));
    }

    return Array.from(grouped.entries()).map(([period, revenue]) => ({
      period,
      revenue,
    }));
  }
}