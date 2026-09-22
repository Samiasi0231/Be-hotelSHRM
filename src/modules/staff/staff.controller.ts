import { Controller, Get, Post, Put, Patch, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { StaffService } from './staff.service';
import { CreateStaffDto } from './dto/create-staff.dto';
import { UpdateStaffDto } from './dto/update-staff.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '@prisma/client';

@ApiTags('Staff')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('hotels/:hotelId/staff')
export class StaffController {
  constructor(private staffService: StaffService) {}

  @Post()
  @Roles(Role.HOTEL_DIRECTOR, Role.ADMIN, Role.ADMIN_HR, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Onboard new staff member' })
  onboard(@Param('hotelId') hotelId: string, @Body() dto: CreateStaffDto) {
    return this.staffService.onboard(hotelId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all staff for hotel' })
  findAll(@Param('hotelId') hotelId: string, @Query('page') page = 1, @Query('limit') limit = 10, @Query('department') department?: string) {
    return this.staffService.findAll(hotelId, +page, +limit, department);
  }

  @Get('departments')
  @ApiOperation({ summary: 'Get departments summary' })
  getDepartments(@Param('hotelId') hotelId: string) {
    return this.staffService.getDepartments(hotelId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get staff by ID' })
  findOne(@Param('id') id: string) {
    return this.staffService.findOne(id);
  }

  @Put(':id')
  @Roles(Role.HOTEL_DIRECTOR, Role.ADMIN, Role.ADMIN_HR, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Update staff' })
  update(@Param('id') id: string, @Body() dto: UpdateStaffDto) {
    return this.staffService.update(id, dto);
  }

  @Patch(':id/deactivate')
  @Roles(Role.HOTEL_DIRECTOR, Role.ADMIN_HR, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Deactivate staff member' })
  deactivate(@Param('id') id: string) {
    return this.staffService.deactivate(id);
  }
}
