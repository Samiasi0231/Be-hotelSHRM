

import {
  Controller, Get, Post, Put, Patch, Body,
  Param, Query, UseGuards, UploadedFile, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { HotelService } from './hotel.service';
import { CreateHotelDto, UpdatePoliciesDto } from './dto/create-hotel.dto'; 
import { UpdateHotelDto } from './dto/update-hotel.dto';
import { OnboardingStepDto } from './dto/onboarding.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Public } from '../../common/decorators/public.decorators';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Role } from '@prisma/client';
import { memoryStorage } from 'multer'

@ApiTags('Hotels')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard)  
@Controller('hotels')
export class HotelController {
  constructor(private hotelService: HotelService) {}

  // ─── Public (no auth) ────────────────────────────────────────────────────

  @Get('public/:slug')
  @Public()
  @ApiOperation({ summary: 'Get public hotel page by slug (no auth)' })
  getBySlug(@Param('slug') slug: string) {
    return this.hotelService.findBySlug(slug);
  }

  // ─── Onboarding ───────────────────────────────────────────────────────────

  @Get('onboarding/status')
  @Roles(Role.HOTEL_DIRECTOR)
  @ApiOperation({ summary: 'Get director onboarding progress' })
  getOnboardingStatus(@CurrentUser('sub') userId: string) {
    return this.hotelService.getOnboardingStatus(userId);
  }

  @Patch('onboarding/step')
  @Roles(Role.HOTEL_DIRECTOR)
  @ApiOperation({ summary: 'Save an onboarding step (2-5)' })
  saveOnboardingStep(
    @CurrentUser('sub') userId: string,
    @Body() dto: OnboardingStepDto,
  ) {
    return this.hotelService.saveOnboardingStep(userId, dto);
  }

  // ─── Policies — MUST come before :id routes ───────────────────────────────
  // If these were after GET :id, NestJS would treat "my" as the :id value

  @Get('my/policies')
  @Roles(Role.HOTEL_DIRECTOR, Role.ADMIN, Role.ADMIN_HR)
  @ApiOperation({ summary: 'Get hotel policies (Director/Admin only)' })
  async getPolicies(@CurrentUser('sub') userId: string) {
    const hotel = await this.hotelService.findByUser(userId, Role.HOTEL_DIRECTOR);
    return this.hotelService.getPolicies(hotel.id);
  }

  @Patch('my/policies')
  @Roles(Role.HOTEL_DIRECTOR, Role.ADMIN, Role.ADMIN_HR)
  @ApiOperation({ summary: 'Update hotel policies (Director/Admin only)' })
  async updatePolicies(
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
    @Body() dto: UpdatePoliciesDto,
  ) {
    const hotel = await this.hotelService.findByUser(userId, role);
    return this.hotelService.updatePolicies(hotel.id, dto);
  }

  // ─── My hotel ─────────────────────────────────────────────────────────────

  @Get('my-hotel')
  @Roles(Role.HOTEL_DIRECTOR, Role.ADMIN, Role.ADMIN_HR, Role.STAFF)
  @ApiOperation({ summary: 'Get my hotel (all roles)' })
  getMyHotel(
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
  ) {
    return this.hotelService.findByUser(userId, role);
  }

  // ─── CRUD ─────────────────────────────────────────────────────────────────

  @Post()
  @Roles(Role.HOTEL_DIRECTOR, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Create hotel (step 1 of onboarding)' })
  create(@Body() dto: CreateHotelDto, @CurrentUser('sub') userId: string) {
    return this.hotelService.create(dto, userId);
  }

  @Get()
  @ApiOperation({ summary: 'Get all hotels (Super Admin)' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'search', required: false })
  findAll(
    @Query('page') page = 1,
    @Query('limit') limit = 10,
    @Query('search') search?: string,
  ) {
    return this.hotelService.findAll(+page, +limit, search);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get hotel by ID' })
  findOne(@Param('id') id: string) {
    return this.hotelService.findOne(id);
  }

  @Put(':id')
  @Roles(Role.HOTEL_DIRECTOR, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Update hotel' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateHotelDto,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: Role,
  ) {
    return this.hotelService.update(id, dto, userId, role);
  }

  @Get(':id/stats')
  @ApiOperation({ summary: 'Get hotel statistics' })
  getStats(@Param('id') id: string) {
    return this.hotelService.getStats(id);
  }

   @Post(':id/logo')
  @UseInterceptors(
    FileInterceptor('logo', { storage: memoryStorage() }),  
  )
  @ApiOperation({ summary: 'Upload hotel logo to Cloudinary' })
  async uploadLogo(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.hotelService.updateLogo(id, file);
  }
}