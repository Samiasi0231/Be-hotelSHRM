// src/modules/super-admin/super-admin.controller.ts — FULL REPLACEMENT

import {
  Controller, Get, Post, Patch, Body, Param,
  Query, UseGuards, UseInterceptors, UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { SuperAdminService } from './super-admin.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Public } from '../../common/decorators/public.decorators';
import { Role, SubscriptionPlan } from '@prisma/client';
import { CloudinaryService } from '../../cloudinary/cloudinary.service';
import { PrismaService } from '../../prisma/prisma.service';

@ApiTags('Super Admin')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.SUPER_ADMIN)
@Controller('super-admin')
export class SuperAdminController {
  constructor(
    private superAdminService: SuperAdminService,
    private cloudinary: CloudinaryService,
    private prisma: PrismaService,
  ) {}

  // ─── Stats ────────────────────────────────────────────────────────────────

  @Get('stats')
  @ApiOperation({ summary: 'Get platform-wide statistics' })
  getPlatformStats() {
    return this.superAdminService.getPlatformStats();
  }

  // ─── Hotels ───────────────────────────────────────────────────────────────

  @Get('hotels')
  @ApiOperation({ summary: 'Get all hotels' })
  getAllHotels(
    @Query('page') page = 1,
    @Query('limit') limit = 10,
    @Query('search') search?: string,
    @Query('status') status?: string,
  ) {
    return this.superAdminService.getAllHotels(+page, +limit, search, status);
  }

  @Patch('hotels/:id/suspend')
  @ApiOperation({ summary: 'Suspend a hotel' })
  suspendHotel(@Param('id') id: string, @Body('reason') reason?: string) {
    return this.superAdminService.suspendHotel(id, reason);
  }

  @Patch('hotels/:id/activate')
  @ApiOperation({ summary: 'Activate a hotel' })
  activateHotel(@Param('id') id: string) {
    return this.superAdminService.activateHotel(id);
  }

  @Patch('hotels/:id/subscription')
  @ApiOperation({ summary: 'Update hotel subscription' })
  updateSubscription(
    @Param('id') id: string,
    @Body('plan') plan: SubscriptionPlan,
    @Body('months') months = 12,
  ) {
    return this.superAdminService.updateSubscription(id, plan, months);
  }

  // ─── Users ────────────────────────────────────────────────────────────────

  @Get('users')
  @ApiOperation({ summary: 'Get all users' })
  getAllUsers(
    @Query('page') page = 1,
    @Query('limit') limit = 10,
    @Query('role') role?: string,
  ) {
    return this.superAdminService.getAllUsers(+page, +limit, role);
  }

  @Patch('users/:id/toggle-status')
  @ApiOperation({ summary: 'Toggle user active status' })
  toggleUserStatus(@Param('id') id: string) {
    return this.superAdminService.toggleUserStatus(id);
  }

  // ─── Platform Branding ────────────────────────────────────────────────────

  @Post('branding/logo')
  @UseInterceptors(FileInterceptor('logo', { storage: memoryStorage() }))
  @ApiOperation({ summary: 'Upload platform brand logo (Super Admin only)' })
  async uploadPlatformLogo(@UploadedFile() file: Express.Multer.File) {
    const url = await this.cloudinary
      .uploadImage(file, 'platform/branding')
      .then(r => r.secure_url);

    await this.prisma.platformSettings.upsert({
      where:  { key: 'brandLogo' },
      update: { value: url },
      create: { key: 'brandLogo', value: url },
    });

    return { logo: url };
  }

  @Get('branding/logo')
  @Public()
  @ApiOperation({ summary: 'Get platform brand logo (public)' })
  async getPlatformLogo() {
    const setting = await this.prisma.platformSettings.findUnique({
      where: { key: 'brandLogo' },
    });
    return { logo: setting?.value ?? null };
  }
}