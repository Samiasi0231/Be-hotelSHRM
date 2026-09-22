// src/modules/attendance/attendance.service.ts — FULL REPLACEMENT
// Key change: clockIn/clockOut now require latitude/longitude and validate
// the staff member is physically within the hotel's attendanceRadiusM.
import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AttendanceType } from '@prisma/client';
import { paginate, getPaginationParams } from '../../common/helpers/pagination.helper';
import { getDistanceInMeters,isPointInPolygon, GeoPoint  } from '../../common/utils/geo.utils';

@Injectable()
export class AttendanceService {
  constructor(private prisma: PrismaService) {}

  // ── Geofence check (shared by clockIn/clockOut) ────────────────────────────

  private async verifyWithinGeofence(
    staffId: string,
    latitude: number,
    longitude: number,
  ) {
    const staff = await this.prisma.staff.findUnique({
      where: { id: staffId },
      include: {
        hotel: {
          select: {
            latitude: true, longitude: true,
            attendanceRadiusM: true, attendanceGeofenceEnabled: true,
           attendanceGeofenceType: true, attendanceGeofencePoints: true,
            name: true,
          },
        },
      },
    });

    if (!staff) throw new NotFoundException('Staff record not found');

    const {
      latitude: hotelLat, longitude: hotelLng,
      attendanceRadiusM, attendanceGeofenceEnabled,
     attendanceGeofenceType, attendanceGeofencePoints,
    } = staff.hotel;

    // Geofencing turned off — allow clock in/out from anywhere.
    if (!attendanceGeofenceEnabled) return null;


      // ── Polygon mode ─────────────────────────────────────────────────────────
    if (attendanceGeofenceType === 'POLYGON') {
      const points = attendanceGeofencePoints as unknown as GeoPoint[] | null;

      if (!points || points.length < 3) {
        throw new BadRequestException(
          `${staff.hotel.name} has not set a valid attendance area. Contact your administrator.`,
        );
      }

      const inside = isPointInPolygon({ lat: latitude, lng: longitude }, points);

      if (!inside) {
        throw new ForbiddenException(
          `You must be within ${staff.hotel.name}'s marked attendance area to clock in/out.`,
        );
      }

      return null;
    }
  // ── Circle mode (default) ───────────────────────────────────────────────
    if (hotelLat == null || hotelLng == null) {
      throw new BadRequestException(
        `${staff.hotel.name} has not set a location for attendance verification. Contact your administrator.`,
      );
    }

    const distance = getDistanceInMeters(
      Number(hotelLat), Number(hotelLng),
      latitude, longitude,
    );

    if (distance > attendanceRadiusM) {
      throw new ForbiddenException(
        `You must be within ${attendanceRadiusM}m of ${staff.hotel.name} to clock in/out. You are approximately ${Math.round(distance)}m away.`,
      );
    }

    return distance;
  }



  // ── Geofence settings ────────────────────────────────────────────────────

  async getAttendanceSettings(hotelId: string) {
    const hotel = await this.prisma.hotel.findUnique({
      where: { id: hotelId },
      select: {
        latitude: true, longitude: true,
        attendanceRadiusM: true, attendanceGeofenceEnabled: true,
        attendanceGeofenceType: true, attendanceGeofencePoints: true,
      },
    });
    if (!hotel) throw new NotFoundException('Hotel not found');
    return hotel;
  }

  async setAttendanceLocation(
    hotelId: string,
    data: {
      latitude?: number;
      longitude?: number;
      attendanceRadiusM?: number;
      attendanceGeofenceEnabled?: boolean;
      attendanceGeofenceType?: 'CIRCLE' | 'POLYGON';
      attendanceGeofencePoints?: { lat: number; lng: number }[];
    },
  ) {
    return this.prisma.hotel.update({
      where: { id: hotelId },
      data: {
        ...(data.latitude !== undefined && { latitude: data.latitude }),
        ...(data.longitude !== undefined && { longitude: data.longitude }),
        ...(data.attendanceRadiusM !== undefined && { attendanceRadiusM: data.attendanceRadiusM }),
        ...(data.attendanceGeofenceEnabled !== undefined && { attendanceGeofenceEnabled: data.attendanceGeofenceEnabled }),
        ...(data.attendanceGeofenceType !== undefined && { attendanceGeofenceType: data.attendanceGeofenceType }),
        ...(data.attendanceGeofencePoints !== undefined && { attendanceGeofencePoints: data.attendanceGeofencePoints as any }),
      },
      select: {
        id: true, latitude: true, longitude: true,
        attendanceRadiusM: true, attendanceGeofenceEnabled: true,
        attendanceGeofenceType: true, attendanceGeofencePoints: true,
      },
    });
  }

  async toggleGeofence(hotelId: string, enabled: boolean) {
    return this.prisma.hotel.update({
      where: { id: hotelId },
      data: { attendanceGeofenceEnabled: enabled },
      select: { id: true, attendanceGeofenceEnabled: true },
    });
  }

  // ── Clock In/Out ─────────────────────────────────────────────────────────

  async clockIn(
    userId: string,
    staffId: string,
    latitude: number,
    longitude: number,
    ipAddress?: string,
  ) {
    await this.verifyWithinGeofence(staffId, latitude, longitude);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const lastRecord = await this.prisma.attendance.findFirst({
      where: { userId, timestamp: { gte: today, lt: tomorrow } },
      orderBy: { timestamp: 'desc' },
    });

    if (lastRecord?.type === AttendanceType.CLOCK_IN) {
      throw new BadRequestException('Already clocked in. Please clock out first.');
    }

    return this.prisma.attendance.create({
      data: { userId, staffId, type: AttendanceType.CLOCK_IN, ipAddress, latitude, longitude },
    });
  }

  async clockOut(
    userId: string,
    staffId: string,
    latitude: number,
    longitude: number,
    note?: string,
    ipAddress?: string,
  ) {
    await this.verifyWithinGeofence(staffId, latitude, longitude);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const lastRecord = await this.prisma.attendance.findFirst({
      where: { userId, timestamp: { gte: today, lt: tomorrow } },
      orderBy: { timestamp: 'desc' },
    });

    if (!lastRecord || lastRecord.type === AttendanceType.CLOCK_OUT) {
      throw new BadRequestException('Not clocked in. Please clock in first.');
    }

    return this.prisma.attendance.create({
      data: { userId, staffId, type: AttendanceType.CLOCK_OUT, note, ipAddress, latitude, longitude },
    });
  }
  // ── Everything below unchanged ───────────────────────────────────────────

  async getDailyRecords(hotelId: string, date?: string) {
    const targetDate = date ? new Date(date) : new Date();
    targetDate.setHours(0, 0, 0, 0);
    const nextDay = new Date(targetDate);
    nextDay.setDate(nextDay.getDate() + 1);

    const records = await this.prisma.attendance.findMany({
      where: { timestamp: { gte: targetDate, lt: nextDay }, staff: { hotelId } },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, email: true } },
        staff: { select: { id: true, employeeId: true, department: true, position: true } },
      },
      orderBy: { timestamp: 'asc' },
    });

    const staffMap = new Map();
    for (const record of records) {
      const key = record.userId;
      if (!staffMap.has(key)) {
        staffMap.set(key, { user: record.user, staff: record.staff, clockIn: null, clockOut: null, hoursWorked: null });
      }
      const entry = staffMap.get(key);
      if (record.type === AttendanceType.CLOCK_IN) entry.clockIn = record.timestamp;
      if (record.type === AttendanceType.CLOCK_OUT) {
        entry.clockOut = record.timestamp;
        if (entry.clockIn) {
          entry.hoursWorked = ((record.timestamp.getTime() - entry.clockIn.getTime()) / 3600000).toFixed(2);
        }
      }
    }

    return Array.from(staffMap.values());
  }

  async getWeeklyReport(hotelId: string, weekStart?: string) {
    const start = weekStart ? new Date(weekStart) : new Date();
    start.setHours(0, 0, 0, 0);
    const dayOfWeek = start.getDay();
    start.setDate(start.getDate() - dayOfWeek);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);

    const records = await this.prisma.attendance.findMany({
      where: { timestamp: { gte: start, lt: end }, staff: { hotelId } },
      include: {
        user: { select: { id: true, firstName: true, lastName: true } },
        staff: { select: { employeeId: true, department: true } },
      },
      orderBy: { timestamp: 'asc' },
    });

    return { weekStart: start, weekEnd: end, records, totalRecords: records.length };
  }

  async getStaffAttendance(staffId: string, page = 1, limit = 20) {
    const { skip, take } = getPaginationParams(page, limit);
    const [records, total] = await Promise.all([
      this.prisma.attendance.findMany({ where: { staffId }, skip, take, orderBy: { timestamp: 'desc' } }),
      this.prisma.attendance.count({ where: { staffId } }),
    ]);
    return paginate(records, total, page, limit);
  }

  async getTodayStatus(userId: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const lastRecord = await this.prisma.attendance.findFirst({
      where: { userId, timestamp: { gte: today, lt: tomorrow } },
      orderBy: { timestamp: 'desc' },
    });

    return {
      isClockedIn: lastRecord?.type === AttendanceType.CLOCK_IN,
      lastRecord,
    };
  }
}