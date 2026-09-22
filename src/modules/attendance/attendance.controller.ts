// src/modules/attendance/attendance.controller.ts — FULL REPLACEMENT
// Added: PATCH/GET /attendance/settings/:hotelId — geofence config,
// restricted to HOTEL_DIRECTOR and ADMIN_HR only via RolesGuard.
// src/modules/attendance/attendance.controller.ts — FULL REPLACEMENT
// Geofence settings + toggle restricted to HOTEL_DIRECTOR and ADMIN only.

import { Controller, Get, Post, Patch, Body, Param, Query, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AttendanceService } from './attendance.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ClockInDto } from './dto/clock-in.dto';
import { ClockOutDto } from './dto/clock-out.dto';
import { SetAttendanceLocationDto } from './dto/set-attendance-loacation.dto';
import { ToggleGeofenceDto } from './dto/toggle-geofence.dto';
import { Role } from '@prisma/client';

@ApiTags('Attendance')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('attendance')
export class AttendanceController {
  constructor(private attendanceService: AttendanceService) {}

  @Post('clock-in')
  @ApiOperation({ summary: 'Clock in — requires GPS coordinates within hotel geofence' })
  clockIn(@CurrentUser('sub') userId: string, @Body() dto: ClockInDto, @Req() req: any) {
    return this.attendanceService.clockIn(userId, dto.staffId, dto.latitude, dto.longitude, req.ip);
  }

  @Post('clock-out')
  @ApiOperation({ summary: 'Clock out — requires GPS coordinates within hotel geofence' })
  clockOut(@CurrentUser('sub') userId: string, @Body() dto: ClockOutDto, @Req() req: any) {
    return this.attendanceService.clockOut(userId, dto.staffId, dto.latitude, dto.longitude, dto.note, req.ip);
  }

  @Get('today-status')
  @ApiOperation({ summary: 'Get today clock-in status' })
  getTodayStatus(@CurrentUser('sub') userId: string) {
    return this.attendanceService.getTodayStatus(userId);
  }

  @Get('daily/:hotelId')
  @ApiOperation({ summary: 'Get daily attendance records' })
  getDailyRecords(@Param('hotelId') hotelId: string, @Query('date') date?: string) {
    return this.attendanceService.getDailyRecords(hotelId, date);
  }

  @Get('weekly/:hotelId')
  @ApiOperation({ summary: 'Get weekly attendance report' })
  getWeeklyReport(@Param('hotelId') hotelId: string, @Query('weekStart') weekStart?: string) {
    return this.attendanceService.getWeeklyReport(hotelId, weekStart);
  }

  @Get('staff/:staffId')
  @ApiOperation({ summary: 'Get attendance records for a staff member' })
  getStaffAttendance(@Param('staffId') staffId: string, @Query('page') page = 1, @Query('limit') limit = 20) {
    return this.attendanceService.getStaffAttendance(staffId, +page, +limit);
  }

  // ── Geofence settings — DIRECTOR & ADMIN ONLY ─────────────────────────────

  @Get('settings/:hotelId')
  @UseGuards(RolesGuard)
  @Roles(Role.HOTEL_DIRECTOR, Role.ADMIN)
  @ApiOperation({ summary: 'Get attendance geofence settings (Director/Admin only)' })
  getAttendanceSettings(@Param('hotelId') hotelId: string) {
    return this.attendanceService.getAttendanceSettings(hotelId);
  }

 @Patch('settings/:hotelId')
@UseGuards(RolesGuard)
@Roles(Role.HOTEL_DIRECTOR, Role.ADMIN)
@ApiOperation({ summary: 'Set attendance geofence — circle or polygon (Director/Admin only)' })
setAttendanceLocation(@Param('hotelId') hotelId: string, @Body() dto: SetAttendanceLocationDto) {
  return this.attendanceService.setAttendanceLocation(hotelId, dto);
}

  @Patch('settings/:hotelId/toggle')
  @UseGuards(RolesGuard)
  @Roles(Role.HOTEL_DIRECTOR, Role.ADMIN)
  @ApiOperation({ summary: 'Turn attendance geofencing on/off (Director/Admin only)' })
  toggleGeofence(@Param('hotelId') hotelId: string, @Body() dto: ToggleGeofenceDto) {
    return this.attendanceService.toggleGeofence(hotelId, dto.enabled);
  }
}