// src/rooms/room.service.ts — FULL REPLACEMENT
// Key changes:
//   - syncRoomStatus(): single source of truth for Room.status, computed from
//     active bookings covering *today*. Never manually set status elsewhere.
//   - getBookedDateRanges(): powers frontend date-picker blocking so User B
//     can't pick dates already held/confirmed for User A.
//   - MAINTENANCE is treated as a manual override — sync never clobbers it.

import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CloudinaryService } from '../../cloudinary/cloudinary.service';
import { CreateRoomDto } from './dto/create-room.dto';
import { UpdateRoomDto } from './dto/update-room.dto';
import { CheckAvailabilityDto } from './dto/check-availability.dto';
import {
  paginate,
  getPaginationParams,
} from '../../common/helpers/pagination.helper';
import { RoomStatus } from '@prisma/client';

@Injectable()
export class RoomService {
  constructor(
    private prisma: PrismaService,
    private cloudinary: CloudinaryService,
  ) {}

  // ── CRUD ──────────────────────────────────────────────────────────────────

  async create(hotelId: string, dto: CreateRoomDto) {
    const exists = await this.prisma.room.findUnique({
      where: { hotelId_roomNumber: { hotelId, roomNumber: dto.roomNumber } },
    });
    if (exists) throw new ConflictException('Room number already exists in this hotel');
    return this.prisma.room.create({ data: { ...dto, hotelId } });
  }

  async findAll(
    hotelId: string,
    page = 1,
    limit = 10,
    roomType?: string,
    status?: string,
  ) {
    const { skip, take } = getPaginationParams(page, limit);
    const where: any = { hotelId };
    if (roomType) where.roomType = roomType;
    if (status) where.status = status;

    const [rooms, total] = await Promise.all([
      this.prisma.room.findMany({ where, skip, take, orderBy: { roomNumber: 'asc' } }),
      this.prisma.room.count({ where }),
    ]);
    return paginate(rooms, total, page, limit);
  }

  async findOne(id: string) {
    const room = await this.prisma.room.findUnique({
      where: { id },
      include: { hotel: { select: { id: true, name: true } } },
    });
    if (!room) throw new NotFoundException('Room not found');
    return room;
  }

  async update(id: string, dto: UpdateRoomDto) {
    await this.findOne(id);
    // Manual status edits from staff (e.g. flipping to MAINTENANCE) go through
    // untouched here — syncRoomStatus() respects MAINTENANCE and won't override it.
    return this.prisma.room.update({ where: { id }, data: dto });
  }

  async delete(id: string) {
    const room = await this.findOne(id);

    if (room.images?.length) {
      await Promise.allSettled(
        room.images.map((url: string) => {
          const publicId = this.cloudinary.extractPublicId(url);
          return publicId ? this.cloudinary.deleteImage(publicId) : Promise.resolve();
        }),
      );
    }

    return this.prisma.room.delete({ where: { id } });
  }

  // ── Images ────────────────────────────────────────────────────────────────

  async addImages(id: string, files: Express.Multer.File[]) {
    const room = await this.findOne(id);
    const newUrls = await this.cloudinary.uploadImages(files, `hotels/rooms/${id}`);
    const updatedImages = [...(room.images ?? []), ...newUrls];
    return this.prisma.room.update({ where: { id }, data: { images: updatedImages } });
  }

  async removeImage(id: string, imageUrl: string) {
    const room = await this.findOne(id);
    const publicId = this.cloudinary.extractPublicId(imageUrl);
    if (publicId) await this.cloudinary.deleteImage(publicId);
    const updatedImages = (room.images ?? []).filter((u: string) => u !== imageUrl);
    return this.prisma.room.update({ where: { id }, data: { images: updatedImages } });
  }

  // ── Availability (date-range search, e.g. "rooms free Aug 20-25") ──────────

  async checkAvailability(dto: CheckAvailabilityDto) {
    const { hotelId, checkIn, checkOut, roomType } = dto;
    const where: any = { hotelId, isActive: true, status: { not: RoomStatus.MAINTENANCE } };
    if (roomType) where.roomType = roomType;

    const allRooms = await this.prisma.room.findMany({ where });

    const conflicting = await this.prisma.booking.findMany({
      where: {
        hotelId,
        OR: [
          { status: { in: ['CONFIRMED', 'CHECKED_IN'] } },
          { status: 'PENDING', timeoutAt: { gt: new Date() } },
        ],
        AND: [
          { checkIn: { lt: new Date(checkOut) } },
          { checkOut: { gt: new Date(checkIn) } },
        ],
      },
      select: { roomId: true },
    });

    const blockedIds = new Set(conflicting.map((b) => b.roomId));
    return allRooms.filter((r) => !blockedIds.has(r.id));
  }

  // ── Booked date ranges (drives frontend date-picker disabling) ─────────────
  // A room can be generally "available" while still having specific date
  // ranges locked by other guests' confirmed bookings or active payment holds.

  async getBookedDateRanges(roomId: string) {
    const bookings = await this.prisma.booking.findMany({
      where: {
        roomId,
        OR: [
          { status: { in: ['CONFIRMED', 'CHECKED_IN'] } },
          { status: 'PENDING', timeoutAt: { gt: new Date() } },
        ],
      },
      select: { checkIn: true, checkOut: true, status: true },
      orderBy: { checkIn: 'asc' },
    });

    return bookings.map((b) => ({
      checkIn: b.checkIn,
      checkOut: b.checkOut,
      status: b.status,
    }));
  }

  // ── Room.status sync (single source of truth) ───────────────────────────────
  // Call this after ANY booking status change instead of hardcoding
  // AVAILABLE/OCCUPIED directly. Computes truth from bookings covering *today*,
  // so it's correct even when a room has multiple overlapping-in-time bookings
  // (e.g. an active stay + an unrelated future reservation being cancelled).

  async syncRoomStatus(roomId: string) {
    const room = await this.prisma.room.findUnique({ where: { id: roomId } });
    if (!room) return;

    // MAINTENANCE is a manual staff decision — never auto-override it.
    if (room.status === RoomStatus.MAINTENANCE) return;

    const now = new Date();

    const activeStay = await this.prisma.booking.findFirst({
      where: {
        roomId,
        status: { in: ['CONFIRMED', 'CHECKED_IN'] },
        checkIn: { lte: now },
        checkOut: { gt: now },
      },
    });

    const correctStatus = activeStay ? RoomStatus.OCCUPIED : RoomStatus.AVAILABLE;

    if (room.status !== correctStatus) {
      await this.prisma.room.update({
        where: { id: roomId },
        data: { status: correctStatus },
      });
    }
  }
}