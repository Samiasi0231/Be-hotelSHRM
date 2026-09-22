// src/rooms/room.controller.ts — FULL REPLACEMENT
// Added: GET /hotels/:hotelId/rooms/:id/booked-dates
// Intentionally left OUTSIDE the role restrictions below it — guests on the
// public booking portal need this to render a disabled-dates calendar.
// If your public routes are namespaced separately (/api/v1/public/*), mirror
// this same call there against roomService.getBookedDateRanges().

import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { RoomService } from './room.service';
import { CreateRoomDto } from './dto/create-room.dto';
import { UpdateRoomDto } from './dto/update-room.dto';
import { CheckAvailabilityDto } from './dto/check-availability.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '@prisma/client';

@ApiTags('Rooms')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('hotels/:hotelId/rooms')
export class RoomController {
  constructor(private roomService: RoomService) {}

  // ── CRUD ──────────────────────────────────────────────────────────────────

  @Post()
  @Roles(Role.HOTEL_DIRECTOR, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Create room' })
  create(@Param('hotelId') hotelId: string, @Body() dto: CreateRoomDto) {
    return this.roomService.create(hotelId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all rooms for hotel' })
  findAll(
    @Param('hotelId') hotelId: string,
    @Query('page') page = 1,
    @Query('limit') limit = 10,
    @Query('roomType') roomType?: string,
    @Query('status') status?: string,
  ) {
    return this.roomService.findAll(hotelId, +page, +limit, roomType, status);
  }

  @Post('availability')
  @ApiOperation({ summary: 'Check room availability for a date range' })
  checkAvailability(
    @Param('hotelId') hotelId: string,
    @Body() dto: CheckAvailabilityDto,
  ) {
    return this.roomService.checkAvailability({ ...dto, hotelId });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get room by ID' })
  findOne(@Param('id') id: string) {
    return this.roomService.findOne(id);
  }

  @Get(':id/booked-dates')
  @ApiOperation({ summary: 'Get booked date ranges for a room (drives date-picker blocking)' })
  getBookedDates(@Param('id') id: string) {
    return this.roomService.getBookedDateRanges(id);
  }

  @Put(':id')
  @Roles(Role.HOTEL_DIRECTOR, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Update room' })
  update(@Param('id') id: string, @Body() dto: UpdateRoomDto) {
    return this.roomService.update(id, dto);
  }

  @Delete(':id')
  @Roles(Role.HOTEL_DIRECTOR, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Delete room' })
  delete(@Param('id') id: string) {
    return this.roomService.delete(id);
  }

  // ── Images ────────────────────────────────────────────────────────────────

  @Post(':id/images')
  @Roles(Role.HOTEL_DIRECTOR, Role.ADMIN, Role.SUPER_ADMIN)
  @UseInterceptors(FilesInterceptor('images', 10))
  @ApiOperation({ summary: 'Upload room images to Cloudinary' })
  uploadImages(
    @Param('hotelId') hotelId: string,
    @Param('id') id: string,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    return this.roomService.addImages(id, files);
  }

  @Delete(':id/images')
  @Roles(Role.HOTEL_DIRECTOR, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Delete a single room image' })
  @ApiQuery({ name: 'url', description: 'URL-encoded Cloudinary secure_url to remove' })
  deleteImage(
    @Param('id') id: string,
    @Query('url') encodedUrl: string,
  ) {
    return this.roomService.removeImage(id, decodeURIComponent(encodedUrl));
  }
}