import { ForbiddenException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export async function assertActorInHotel(
  prisma: PrismaService,
  userId: string,
  hotelId: string,
) {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      role: true,
      hotel: { select: { id: true } },
      staffOf: { select: { hotelId: true, isActive: true } },
    },
  });

  if (!u) {
    throw new ForbiddenException('User not found');
  }

  if (u.role === Role.SUPER_ADMIN) {
    return { role: u.role };
  }

  const actorHotelId =
    u.hotel?.id ??
    (u.staffOf?.isActive ? u.staffOf.hotelId : undefined);

  if (actorHotelId !== hotelId) {
    throw new ForbiddenException(
      'You do not have access to this hotel',
    );
  }

  return { role: u.role };
}

export async function assertCanManagePayoutAccount(
  prisma: PrismaService,
  userId: string,
  hotelId: string,
) {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      role: true,
      hotel: { select: { id: true } },
      staffOf: { select: { hotelId: true, isActive: true } },
    },
  });

  if (!u) {
    throw new ForbiddenException('User not found');
  }

  // SUPER_ADMIN can manage any hotel's payout account.
  if (u.role === Role.SUPER_ADMIN) {
    return { role: u.role };
  }

  // Only HOTEL_DIRECTOR and ADMIN can change payout details.
  if (
    u.role !== Role.HOTEL_DIRECTOR &&
    u.role !== Role.ADMIN
  ) {
    throw new ForbiddenException(
      'Only the hotel director or admin can manage the payout account',
    );
  }

  const actorHotelId =
    u.hotel?.id ??
    (u.staffOf?.isActive ? u.staffOf.hotelId : undefined);

  // Director/Admin must belong to this exact hotel.
  if (actorHotelId !== hotelId) {
    throw new ForbiddenException(
      'You do not have access to this hotel',
    );
  }

  return { role: u.role };
}