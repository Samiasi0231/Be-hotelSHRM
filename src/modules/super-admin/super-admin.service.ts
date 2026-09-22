import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SubscriptionPlan, SubscriptionStatus } from '@prisma/client';
import { getPaginationParams, paginate } from '../../common/helpers/pagination.helper';

@Injectable()
export class SuperAdminService {
  constructor(private prisma: PrismaService) {}

  async getAllHotels(page = 1, limit = 10, search?: string, status?: string) {
    const { skip, take } = getPaginationParams(page, limit);
    const where: any = {};
    if (search) where.OR = [{ name: { contains: search, mode: 'insensitive' } }, { city: { contains: search, mode: 'insensitive' } }];
    if (status) where.subscriptionStatus = status;

    const [hotels, total] = await Promise.all([
      this.prisma.hotel.findMany({
        where, skip, take,
        include: {
          director: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } },
          _count: { select: { rooms: true, staff: true, bookings: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.hotel.count({ where }),
    ]);
    return paginate(hotels, total, page, limit);
  }

  async suspendHotel(id: string, reason?: string) {
    const hotel = await this.prisma.hotel.findUnique({ where: { id } });
    if (!hotel) throw new NotFoundException('Hotel not found');
    return this.prisma.hotel.update({
      where: { id },
      data: { subscriptionStatus: SubscriptionStatus.SUSPENDED, isActive: false },
    });
  }

  async activateHotel(id: string) {
    const hotel = await this.prisma.hotel.findUnique({ where: { id } });
    if (!hotel) throw new NotFoundException('Hotel not found');
    return this.prisma.hotel.update({
      where: { id },
      data: { subscriptionStatus: SubscriptionStatus.ACTIVE, isActive: true },
    });
  }

  async updateSubscription(id: string, plan: SubscriptionPlan, months = 12) {
    const hotel = await this.prisma.hotel.findUnique({ where: { id } });
    if (!hotel) throw new NotFoundException('Hotel not found');

    const expiry = new Date();
    expiry.setMonth(expiry.getMonth() + months);

    return this.prisma.hotel.update({
      where: { id },
      data: {
        subscriptionPlan: plan,
        subscriptionStatus: SubscriptionStatus.ACTIVE,
        subscriptionExpiry: expiry,
        isActive: true,
      },
    });
  }

  async getAllUsers(page = 1, limit = 10, role?: string) {
    const { skip, take } = getPaginationParams(page, limit);
    const where: any = {};
    if (role) where.role = role;

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where, skip, take,
        select: { id: true, email: true, firstName: true, lastName: true, phone: true, role: true, isActive: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.user.count({ where }),
    ]);
    return paginate(users, total, page, limit);
  }

  async toggleUserStatus(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    return this.prisma.user.update({ where: { id: userId }, data: { isActive: !user.isActive } });
  }

  async getPlatformStats() {
    const [
      totalHotels, activeHotels,
      totalUsers, totalBookings, totalRevenue,
      subscriptionBreakdown,
    ] = await Promise.all([
      this.prisma.hotel.count(),
      this.prisma.hotel.count({ where: { isActive: true } }),
      this.prisma.user.count(),
      this.prisma.booking.count(),
      this.prisma.payment.aggregate({ where: { status: 'SUCCESS' }, _sum: { amount: true } }),
      this.prisma.hotel.groupBy({ by: ['subscriptionPlan', 'subscriptionStatus'], _count: true }),
    ]);

    return {
      totalHotels, activeHotels, inactiveHotels: totalHotels - activeHotels,
      totalUsers, totalBookings,
      totalRevenue: totalRevenue._sum.amount || 0,
      subscriptionBreakdown,
    };
  }
}
