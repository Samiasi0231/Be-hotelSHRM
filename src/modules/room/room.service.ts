// src/rooms/room.service.ts — FULL REPLACEMENT
// Key changes:
//   - syncRoomStatus(): single source of truth for Room.status, computed from
//     active bookings covering *today*. Never manually set status elsewhere.
//   - getBookedDateRanges(): powers frontend date-picker blocking so User B
//     can't pick dates already held/confirmed for User A.
//   - MAINTENANCE is treated as a manual override — sync never clobbers it.
//   - create/update/delete now write to the audit log — previously room
//     changes were completely invisible in /audit-logs.

import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CloudinaryService } from '../../cloudinary/cloudinary.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { CreateRoomDto } from './dto/create-room.dto';
import { UpdateRoomDto } from './dto/update-room.dto';
import { CheckAvailabilityDto } from './dto/check-availability.dto';
import {
  paginate,
  getPaginationParams,
} from '../../common/helpers/pagination.helper';
import { RoomStatus, AuditAction } from '@prisma/client';

@Injectable()
export class RoomService {
  constructor(
    private prisma: PrismaService,
    private cloudinary: CloudinaryService,
    private auditLog: AuditLogService,
  ) {}

  // ── CRUD ──────────────────────────────────────────────────────────────────

  async create(hotelId: string, dto: CreateRoomDto, actorUserId?: string) {
    const exists = await this.prisma.room.findUnique({
      where: { hotelId_roomNumber: { hotelId, roomNumber: dto.roomNumber } },
    });
    if (exists) throw new ConflictException('Room number already exists in this hotel');

    const room = await this.prisma.room.create({ data: { ...dto, hotelId } });

    await this.auditLog.create({
      userId: actorUserId,
      hotelId,
      action: AuditAction.CREATE,
      entity: 'Room',
      entityId: room.id,
      newValues: {
        roomNumber: room.roomNumber,
        roomType: room.roomType,
        pricePerNight: Number(room.pricePerNight),
        status: room.status,
      },
    }).catch(() => {});

    return room;
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

  async update(id: string, dto: UpdateRoomDto, actorUserId?: string) {
    const existing = await this.findOne(id);
    // Manual status edits from staff (e.g. flipping to MAINTENANCE) go through
    // untouched here — syncRoomStatus() respects MAINTENANCE and won't override it.
    const room = await this.prisma.room.update({ where: { id }, data: dto });

    await this.auditLog.create({
      userId: actorUserId,
      hotelId: room.hotelId,
      action: AuditAction.UPDATE,
      entity: 'Room',
      entityId: room.id,
      oldValues: {
        status: existing.status,
        pricePerNight: Number(existing.pricePerNight),
        roomType: existing.roomType,
      },
      newValues: {
        status: room.status,
        pricePerNight: Number(room.pricePerNight),
        roomType: room.roomType,
      },
    }).catch(() => {});

    return room;
  }

  async delete(id: string, actorUserId?: string) {
    const room = await this.findOne(id);

    if (room.images?.length) {
      await Promise.allSettled(
        room.images.map((url: string) => {
          const publicId = this.cloudinary.extractPublicId(url);
          return publicId ? this.cloudinary.deleteImage(publicId) : Promise.resolve();
        }),
      );
    }

    const deleted = await this.prisma.room.delete({ where: { id } });

    await this.auditLog.create({
      userId: actorUserId,
      hotelId: room.hotelId,
      action: AuditAction.DELETE,
      entity: 'Room',
      entityId: id,
      oldValues: { roomNumber: room.roomNumber, roomType: room.roomType },
    }).catch(() => {});

    return deleted;
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

  async syncRoomStatus(roomId: string) {
    const room = await this.prisma.room.findUnique({ where: { id: roomId } });
    if (!room) return;

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