// src/modules/roster/roster.controller.ts — FULL REPLACEMENT

import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { RosterService } from './roster.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CreateShiftTypeDto } from './dto/create-shift-type.dto';
import { UpsertRosterEntryDto } from './dto/upsert-entry-dto';
import { BulkUpsertEntriesDto } from './dto/bulk-upsert-enteries.dto';
import { CreateRosterColumnDto } from './dto/create-columns.dto';
import { ReorderColumnsDto } from './dto/recorder-columns.dto';
import { SetCellValueDto } from './dto/set-cell-value.dto';
import { ReorderStaffDto } from './dto/reorder-staff.dto';
import { ToggleStaffVisibilityDto } from './dto/toggle-staff-visibility.dto';
import { Role } from '@prisma/client';

const EDITOR_ROLES = [Role.HOTEL_DIRECTOR, Role.ADMIN];

@ApiTags('Roster')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('roster')
export class RosterController {
  constructor(private rosterService: RosterService) {}

  // ── Shift types ─────────────────────────────────────────────────────────

  @Post('hotel/:hotelId/shift-types')
  @UseGuards(RolesGuard)
  @Roles(...EDITOR_ROLES)
  @ApiOperation({ summary: 'Create a shift type (Director/Admin only)' })
  createShiftType(@Param('hotelId') hotelId: string, @Body() dto: CreateShiftTypeDto) {
    return this.rosterService.createShiftType(hotelId, dto);
  }

  @Get('hotel/:hotelId/shift-types')
  @ApiOperation({ summary: 'List shift types for a hotel' })
  getShiftTypes(@Param('hotelId') hotelId: string) {
    return this.rosterService.getShiftTypes(hotelId);
  }

  @Delete('shift-types/:id')
  @UseGuards(RolesGuard)
  @Roles(...EDITOR_ROLES)
  @ApiOperation({ summary: 'Deactivate a shift type (Director/Admin only)' })
  deactivateShiftType(@Param('id') id: string) {
    return this.rosterService.deactivateShiftType(id);
  }

  // ── Custom columns ─────────────────────────────────────────────────────

  @Post('hotel/:hotelId/columns')
  @UseGuards(RolesGuard)
  @Roles(...EDITOR_ROLES)
  @ApiOperation({ summary: 'Create a custom roster column (Director/Admin only)' })
  createColumn(@Param('hotelId') hotelId: string, @Body() dto: CreateRosterColumnDto) {
    return this.rosterService.createColumn(hotelId, dto);
  }

  @Get('hotel/:hotelId/columns')
  @ApiOperation({ summary: 'List custom roster columns for a hotel' })
  getColumns(@Param('hotelId') hotelId: string) {
    return this.rosterService.getColumns(hotelId);
  }

  @Delete('columns/:id')
  @UseGuards(RolesGuard)
  @Roles(...EDITOR_ROLES)
  @ApiOperation({ summary: 'Remove a custom column (Director/Admin only)' })
  deactivateColumn(@Param('id') id: string) {
    return this.rosterService.deactivateColumn(id);
  }

  @Patch('hotel/:hotelId/columns/reorder')
  @UseGuards(RolesGuard)
  @Roles(...EDITOR_ROLES)
  @ApiOperation({ summary: 'Reorder custom columns (Director/Admin only)' })
  reorderColumns(@Param('hotelId') hotelId: string, @Body() dto: ReorderColumnsDto) {
    return this.rosterService.reorderColumns(hotelId, dto.columnIds);
  }

  // ── Roster (week view) ─────────────────────────────────────────────────

  @Get('hotel/:hotelId/week')
  @UseGuards(RolesGuard)
  @Roles(...EDITOR_ROLES)
  @ApiOperation({ summary: 'Get full roster grid — Director/Admin only' })
  getWeek(
    @Param('hotelId') hotelId: string,
    @Query('weekStart') weekStart: string,
    @CurrentUser('sub') userId: string,
  ) {
    return this.rosterService.getOrCreateRoster(hotelId, weekStart, { userId });
  }

  @Get('hotel/:hotelId/my-week')
  @ApiOperation({ summary: 'Get my own shifts for a week — any authenticated staff' })
  getMyWeek(
    @Param('hotelId') hotelId: string,
    @Query('weekStart') weekStart: string,
    @CurrentUser('sub') userId: string,
  ) {
    return this.rosterService.getMyWeek(hotelId, weekStart, userId);
  }

  // ── Cell edits — Director/Admin only ───────────────────────────────────

  @Patch(':rosterId/entries')
  @UseGuards(RolesGuard)
  @Roles(...EDITOR_ROLES)
  @ApiOperation({ summary: 'Set/update a single roster cell (Director/Admin only)' })
  upsertEntry(
    @Param('rosterId') rosterId: string,
    @Body() dto: UpsertRosterEntryDto,
    @CurrentUser('sub') userId: string,
  ) {
    return this.rosterService.upsertEntry(rosterId, dto, { userId });
  }

  @Patch(':rosterId/entries/bulk')
  @UseGuards(RolesGuard)
  @Roles(...EDITOR_ROLES)
  @ApiOperation({ summary: 'Bulk-update multiple cells at once — used by drag-to-fill (Director/Admin only)' })
  bulkUpsert(
    @Param('rosterId') rosterId: string,
    @Body() dto: BulkUpsertEntriesDto,
    @CurrentUser('sub') userId: string,
  ) {
    return this.rosterService.bulkUpsertEntries(rosterId, dto.entries, { userId });
  }


@Patch(':rosterId/cell-values/bulk')
@UseGuards(RolesGuard)
@Roles(...EDITOR_ROLES)
@ApiOperation({ summary: 'Bulk-save custom column values (Director/Admin only)' })
bulkSetCellValues(
  @Param('rosterId') rosterId: string,
  @Body() dto: { values: { staffId: string; columnId: string; value?: string }[] },
  @CurrentUser('sub') userId: string,
) {
  return this.rosterService.bulkSetCellValues(rosterId, dto.values, { userId });
}

  @Patch(':rosterId/cell-values')
  @UseGuards(RolesGuard)
  @Roles(...EDITOR_ROLES)
  @ApiOperation({ summary: 'Set a custom column value for a staff row (Director/Admin only)' })
  setCellValue(
    @Param('rosterId') rosterId: string,
    @Body() dto: SetCellValueDto,
    @CurrentUser('sub') userId: string,
  ) {
    return this.rosterService.setCellValue(rosterId, dto, { userId });
  }

  // ── Staff row ordering / visibility — Director/Admin only ──────────────

  @Patch('staff/reorder')
  @UseGuards(RolesGuard)
  @Roles(...EDITOR_ROLES)
  @ApiOperation({ summary: 'Reorder staff rows on the roster (Director/Admin only)' })
  reorderStaff(@Body() dto: ReorderStaffDto) {
    return this.rosterService.reorderStaff(dto.staffIds);
  }

  @Patch('staff/:staffId/visibility')
  @UseGuards(RolesGuard)
  @Roles(...EDITOR_ROLES)
  @ApiOperation({ summary: 'Show/hide a staff row on the roster (Director/Admin only)' })
  toggleStaffVisibility(@Param('staffId') staffId: string, @Body() dto: ToggleStaffVisibilityDto) {
    return this.rosterService.toggleStaffVisibility(staffId, dto.hidden);
  }

  // ── Status transitions — Director/Admin only ───────────────────────────

  @Patch(':rosterId/publish')
  @UseGuards(RolesGuard)
  @Roles(...EDITOR_ROLES)
  @ApiOperation({ summary: 'Publish the roster, making it visible to staff (Director/Admin only)' })
  publish(@Param('rosterId') rosterId: string, @CurrentUser('sub') userId: string) {
    return this.rosterService.publish(rosterId, { userId });
  }

  @Patch(':rosterId/lock')
  @UseGuards(RolesGuard)
  @Roles(...EDITOR_ROLES)
  @ApiOperation({ summary: 'Lock the roster, preventing further edits (Director/Admin only)' })
  lock(@Param('rosterId') rosterId: string, @CurrentUser('sub') userId: string) {
    return this.rosterService.lock(rosterId, { userId });
  }

  @Patch(':rosterId/unlock')
  @UseGuards(RolesGuard)
  @Roles(...EDITOR_ROLES)
  @ApiOperation({ summary: 'Unlock the roster back to draft (Director/Admin only)' })
  unlock(@Param('rosterId') rosterId: string, @CurrentUser('sub') userId: string) {
    return this.rosterService.unlock(rosterId, { userId });
  }
}