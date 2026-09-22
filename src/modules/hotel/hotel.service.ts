// src/modules/hotel/hotel.service.ts
// FULL REPLACEMENT — drop this in place of your existing hotel.service.ts

import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateHotelDto, UpdatePoliciesDto } from './dto/create-hotel.dto';
import { UpdateHotelDto } from './dto/update-hotel.dto';
import { OnboardingStepDto } from './dto/onboarding.dto';
import { paginate, getPaginationParams } from '../../common/helpers/pagination.helper';
import { Role } from '@prisma/client';
import { CloudinaryService } from '@/cloudinary/cloudinary.service';

@Injectable()
export class HotelService {
  constructor(private prisma: PrismaService,
 private cloudinary: CloudinaryService,

  ) {}

  // ─── Slug helpers ─────────────────────────────────────────────────────────

  private generateSlug(name: string): string {
    return name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, '')   // remove special chars
      .replace(/\s+/g, '-')            // spaces → dashes
      .replace(/-+/g, '-')             // collapse multiple dashes
      .substring(0, 60);               // max 60 chars
  }

  private async ensureUniqueSlug(base: string, excludeId?: string): Promise<string> {
    let slug = base;
    let count = 0;
    while (true) {
      const existing = await this.prisma.hotel.findUnique({ where: { slug } });
      if (!existing || existing.id === excludeId) break;
      count++;
      slug = `${base}-${count}`;
    }
    return slug;
  }

  // ─── Core CRUD ────────────────────────────────────────────────────────────

  async create(dto: CreateHotelDto, directorId: string) {
    const existing = await this.prisma.hotel.findUnique({ where: { directorId } });
    if (existing) throw new ForbiddenException('Director already has a hotel');

    const baseSlug = this.generateSlug(dto.name);
    const slug = await this.ensureUniqueSlug(baseSlug);

    return this.prisma.hotel.create({
      data: { ...dto, directorId, slug, onboardingStep: 1, isOnboarded: false },
      include: {
        director: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });
  }

  async findAll(page = 1, limit = 10, search?: string) {
    const { skip, take } = getPaginationParams(page, limit);
    const where = search
      ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' as any } },
            { city: { contains: search, mode: 'insensitive' as any } },
          ],
        }
      : {};

    const [hotels, total] = await Promise.all([
      this.prisma.hotel.findMany({
        where,
        skip,
        take,
        include: {
          director: { select: { id: true, firstName: true, lastName: true, email: true } },
          _count: { select: { rooms: true, staff: true, bookings: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.hotel.count({ where }),
    ]);
    return paginate(hotels, total, page, limit);
  }

  async findOne(id: string) {
    const hotel = await this.prisma.hotel.findUnique({
      where: { id },
      include: {
        director: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } },
        _count: { select: { rooms: true, staff: true, bookings: true } },
      },
    });
    if (!hotel) throw new NotFoundException('Hotel not found');
    return hotel;
  }

  // async findBySlug(slug: string) {
  //   const hotel = await this.prisma.hotel.findUnique({
  //     where: { slug },
  //     include: {
  //       rooms: {
  //         where: { isActive: true, status: 'AVAILABLE' },
  //         orderBy: { pricePerNight: 'asc' },
  //       },
  //       _count: { select: { rooms: true } },
  //     },
  //   });
  //   if (!hotel) throw new NotFoundException('Hotel not found');
  //   return hotel;
  // }


  // In hotel.service.ts — ADD this method, keep findByDirector for other callers

async findByUser(userId: string, role: string) {
  // HOTEL_DIRECTOR → hotel is linked via directorId
  if (role === 'HOTEL_DIRECTOR') {
    const hotel = await this.prisma.hotel.findUnique({
      where: { directorId: userId },
      include: { _count: { select: { rooms: true, staff: true, bookings: true } } },
    });
    return hotel;
  }

  // STAFF / ADMIN / ADMIN_HR → hotel is linked via the Staff table
  const staffRecord = await this.prisma.staff.findFirst({
    where: { userId, isActive: true },
    include: {
      hotel: {
        include: { _count: { select: { rooms: true, staff: true, bookings: true } } },
      },
    },
  });

  return staffRecord?.hotel ?? null;
}


  // Only findBySlug changes — include full room data with images
 
async findBySlug(slug: string) {
  const hotel = await this.prisma.hotel.findUnique({
    where: { slug },
    include: {
      rooms: {
        where: { isActive: true },          // show all active rooms, not just AVAILABLE
        orderBy: { pricePerNight: 'asc' },
        select: {
          id: true,
          roomNumber: true,
          roomType: true,
          description: true,
          pricePerNight: true,
          capacity: true,
          floor: true,
          status: true,
          amenities: true,
          images: true,                      
        },
      },
      _count: { select: { rooms: true } },
    },
  });
  if (!hotel) throw new NotFoundException('Hotel not found');
  return hotel;
}
 
// ALSO add this new method for availability check (used by booking widget):
async getAvailableRooms(slug: string, checkIn: string, checkOut: string) {
  const hotel = await this.prisma.hotel.findUnique({ where: { slug } });
  if (!hotel) throw new NotFoundException('Hotel not found');
 
  const checkInDate = new Date(checkIn);
  const checkOutDate = new Date(checkOut);
 
  // Get rooms that have NO conflicting booking in the selected range
  const bookedRoomIds = await this.prisma.booking.findMany({
    where: {
      hotelId: hotel.id,
      status: { in: ['CONFIRMED', 'CHECKED_IN', 'PENDING'] },
      OR: [{ checkIn: { lte: checkOutDate }, checkOut: { gte: checkInDate } }],
    },
    select: { roomId: true },
  });
 
  const bookedIds = bookedRoomIds.map((b) => b.roomId);
 
  return this.prisma.room.findMany({
    where: {
      hotelId: hotel.id,
      isActive: true,
      status: 'AVAILABLE',
      id: { notIn: bookedIds },
    },
    orderBy: { pricePerNight: 'asc' },
  });
}

  async findByDirector(directorId: string) {
    return this.prisma.hotel.findUnique({
      where: { directorId },
      include: { _count: { select: { rooms: true, staff: true, bookings: true } } },
    });
  }

  async update(id: string, dto: UpdateHotelDto, userId: string, userRole: Role) {
    const hotel = await this.findOne(id);
    if (userRole !== Role.SUPER_ADMIN && hotel.directorId !== userId) {
      throw new ForbiddenException('Not authorized');
    }

    // If name changed, regenerate slug
    let slugUpdate: { slug?: string } = {};
    if (dto.name && dto.name !== hotel.name) {
      const base = this.generateSlug(dto.name);
      slugUpdate.slug = await this.ensureUniqueSlug(base, id);
    }

    return this.prisma.hotel.update({ where: { id }, data: { ...dto, ...slugUpdate } });
  }

  // async updateLogo(id: string, logoPath: string) {
  //   return this.prisma.hotel.update({ where: { id }, data: { logo: logoPath } });
  // }


    async updateLogo(hotelId: string, file: Express.Multer.File) {
    // Upload to Cloudinary under hotels/logos folder
    const url = await this.cloudinary.uploadImage(file, 'hotels/logos')
      .then(r => r.secure_url);
 
    return this.prisma.hotel.update({
      where: { id: hotelId },
      data: { logo: url },
      select: { id: true, logo: true },
    });
  }

  async getStats(hotelId: string) {
    const [totalRooms, availableRooms, activeBookings, totalStaff] = await Promise.all([
      this.prisma.room.count({ where: { hotelId } }),
      this.prisma.room.count({ where: { hotelId, status: 'AVAILABLE' } }),
      this.prisma.booking.count({ where: { hotelId, status: { in: ['CONFIRMED', 'CHECKED_IN'] } } }),
      this.prisma.staff.count({ where: { hotelId, isActive: true } }),
    ]);
    return {
      totalRooms,
      availableRooms,
      occupiedRooms: totalRooms - availableRooms,
      activeBookings,
      totalStaff,
    };
  }

  // ─── Onboarding ───────────────────────────────────────────────────────────

  /**
   * Save progress for a given onboarding step.
   * Steps:
   *   1 = Basic info (name, description, address, etc.)  ← created at register
   *   2 = Tagline + amenities
   *   3 = Policies (check-in/out times, cancellation)
   *   4 = Upload logo / cover image
   *   5 = Done → mark isOnboarded = true
   */
  async saveOnboardingStep(directorId: string, dto: OnboardingStepDto) {
    const hotel = await this.prisma.hotel.findUnique({ where: { directorId } });
    if (!hotel) throw new NotFoundException('Hotel not found. Complete step 1 first.');

    const { step, data } = dto;

    // Build the update payload based on step
    const updateData: Record<string, any> = { onboardingStep: step };

    if (step === 2) {
      if (data.tagline !== undefined) updateData.tagline = data.tagline;
      if (data.amenities !== undefined) updateData.amenities = data.amenities;
    }

    if (step === 3) {
      updateData.policies = data.policies;
    }

    if (step === 4) {
      // Logo/cover handled via file upload endpoints — just advance step
    }

    if (step === 5) {
      updateData.isOnboarded = true;
    }

    return this.prisma.hotel.update({
      where: { directorId },
      data: updateData,
    });
  }

  async getOnboardingStatus(directorId: string) {
    const hotel = await this.prisma.hotel.findUnique({
      where: { directorId },
      select: {
        id: true,
        name: true,
        slug: true,
        onboardingStep: true,
        isOnboarded: true,
        logo: true,
        coverImage: true,
        tagline: true,
        amenities: true,
        policies: true,
      },
    });
    return hotel ?? { onboardingStep: 0, isOnboarded: false };
  }
// FILE  HotelService pollices management
    async getPolicies(hotelId: string) {
    const hotel = await this.prisma.hotel.findUniqueOrThrow({
      where: { id: hotelId },
      select: { policies: true },
    });
    return hotel.policies ?? {};
  }
 
  async updatePolicies(hotelId: string, dto: UpdatePoliciesDto) {
    // Merge with existing policies so partial updates don't wipe other fields
    const existing = await this.prisma.hotel.findUniqueOrThrow({
      where: { id: hotelId },
      select: { policies: true },
    });
 
    const merged = {
      ...(existing.policies as object ?? {}),
      ...dto,
    };
 
    return this.prisma.hotel.update({
      where: { id: hotelId },
      data: { policies: merged },
      select: { id: true, policies: true, updatedAt: true },
    });
  }
}