import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { DashboardService } from './dashboard.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '@prisma/client';

@ApiTags('Dashboard')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('dashboard')
export class DashboardController {
  constructor(private dashboardService: DashboardService) {}

  @Get('hotel/:hotelId')
  @ApiOperation({ summary: 'Get hotel dashboard analytics' })
  getHotelDashboard(@Param('hotelId') hotelId: string) {
    return this.dashboardService.getHotelDashboard(hotelId);
  }

  @Get('super-admin')
  @Roles(Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Get super admin dashboard' })
  getSuperAdminDashboard() {
    return this.dashboardService.getSuperAdminDashboard();
  }

  @Get('hotel/:hotelId/revenue-chart')
  @ApiOperation({ summary: 'Get revenue chart data' })
  getRevenueChart(
    @Param('hotelId') hotelId: string,
    @Query('period') period: 'weekly' | 'monthly' | 'yearly' = 'monthly',
  ) {
    return this.dashboardService.getRevenueChart(hotelId, period);
  }
}
