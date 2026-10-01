import { Injectable, NotFoundException,ConflictException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { AuditAction, RosterStatus } from '@prisma/client';

interface Actor {
  userId: string;
}

@Injectable()
export class RosterService {
  constructor(
    private prisma: PrismaService,
    private auditLog: AuditLogService,
  ) {}

  // ── Shift Types ─────────────────────────────────────────────────────────

 async createShiftType(hotelId: string, dto: { name: string; code: string; startTime?: string; endTime?: string; color?: string }) {
  const code = dto.code.toUpperCase();

  const existing = await this.prisma.shiftType.findUnique({
    where: { hotelId_code: { hotelId, code } },
  });

  if (existing) {
    if (existing.isActive) {
      throw new ConflictException(`A shift type with code "${code}" already exists.`);
    }
    // Reactivate and update the soft-deleted row instead of inserting a duplicate
    return this.prisma.shiftType.update({
      where: { id: existing.id },
      data: { name: dto.name, code, startTime: dto.startTime, endTime: dto.endTime, color: dto.color ?? '#2563eb', isActive: true },
    });
  }

  return this.prisma.shiftType.create({
    data: { hotelId, name: dto.name, code, startTime: dto.startTime, endTime: dto.endTime, color: dto.color },
  });
}

  async getShiftTypes(hotelId: string) {
    return this.prisma.shiftType.findMany({
      where: { hotelId, isActive: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  async deactivateShiftType(id: string) {
    return this.prisma.shiftType.update({ where: { id }, data: { isActive: false } });
  }

  // ── Roster (week container) ────────────────────────────────────────────

  private normalizeWeekStart(date: Date): Date {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    const day = d.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    d.setDate(d.getDate() + diff);
    return d;
  }
  private toUTCMidnight(dateStr: string): Date {
  const datePart = dateStr.split('T')[0];
  return new Date(`${datePart}T00:00:00.000Z`);
}

  async getOrCreateRoster(hotelId: string, weekStartInput: string, actor: Actor) {
    const weekStart = this.normalizeWeekStart(new Date(weekStartInput));

    let roster = await this.prisma.roster.findUnique({
      where: { hotelId_weekStart: { hotelId, weekStart } },
      include: {
        entries: {
          include: { shiftType: true, staff: { include: { user: { select: { firstName: true, lastName: true } } } } },
        },
        cellValues: true,
      },
    });

    if (!roster) {
      roster = await this.prisma.roster.create({
        data: { hotelId, weekStart, status: RosterStatus.DRAFT, createdById: actor.userId },
        include: {
          entries: {
            include: { shiftType: true, staff: { include: { user: { select: { firstName: true, lastName: true } } } } },
          },
          cellValues: true,
        },
      });
    }

    return roster;
  }

 async getMyWeek(
  hotelId: string,
  weekStartInput: string,
  userId: string,
) {
  const weekStart = this.normalizeWeekStart(new Date(weekStartInput));

  // Find the staff profile belonging to the logged-in user
  const staff = await this.prisma.staff.findFirst({
    where: {
      userId,
      hotelId,
    },
  });

  if (!staff) {
    throw new NotFoundException(
      'Staff profile not found for this hotel',
    );
  }

  const roster = await this.prisma.roster.findUnique({
    where: {
      hotelId_weekStart: {
        hotelId,
        weekStart,
      },
    },
  });

  if (!roster || roster.status === RosterStatus.DRAFT) {
    return {
      status: RosterStatus.DRAFT,
      weekStart,
      entries: [],
    };
  }

  const entries = await this.prisma.rosterEntry.findMany({
    where: {
      rosterId: roster.id,
      staffId: staff.id,
    },
    include: {
      shiftType: true,
    },
    orderBy: {
      date: 'asc',
    },
  });

  return {
    status: roster.status,
    weekStart,
    entries,
  };
}

  private async assertEditable(rosterId: string) {
    const roster = await this.prisma.roster.findUnique({ where: { id: rosterId } });
    if (!roster) throw new NotFoundException('Roster not found');
    if (roster.status === RosterStatus.LOCKED) {
      throw new ForbiddenException('This roster is locked and cannot be edited.');
    }
    return roster;
  }

  // ── Cell edits (shift assignments) ────────────────────────────────────

  async upsertEntry(
    rosterId: string,
    data: { staffId: string; date: string; shiftTypeId?: string | null; note?: string },
    actor: Actor,
  ) {
    await this.assertEditable(rosterId);

   const date = this.toUTCMidnight(data.date);

    const existing = await this.prisma.rosterEntry.findUnique({
      where: { rosterId_staffId_date: { rosterId, staffId: data.staffId, date } },
    });

    const entry = await this.prisma.rosterEntry.upsert({
      where: { rosterId_staffId_date: { rosterId, staffId: data.staffId, date } },
      create: {
        rosterId, staffId: data.staffId, date,
        shiftTypeId: data.shiftTypeId ?? null,
        note: data.note,
        updatedById: actor.userId,
      },
      update: {
        shiftTypeId: data.shiftTypeId ?? null,
        note: data.note,
        updatedById: actor.userId,
      },
      include: { shiftType: true },
    });

    await this.auditLog.create({
      userId: actor.userId,
      action: AuditAction.UPDATE,
      entity: 'RosterEntry',
      entityId: entry.id,
      oldValues: existing ? { shiftTypeId: existing.shiftTypeId } : undefined,
      newValues: { shiftTypeId: entry.shiftTypeId, staffId: data.staffId, date: data.date },
    }).catch(() => {});

    return entry;
  }

  async bulkUpsertEntries(rosterId: string, entries: { staffId: string; date: string; shiftTypeId?: string | null; note?: string }[], actor: Actor) {
    await this.assertEditable(rosterId);

    const results = [];
    for (const e of entries) {
     const date = this.toUTCMidnight(e.date);

      const entry = await this.prisma.rosterEntry.upsert({
        where: { rosterId_staffId_date: { rosterId, staffId: e.staffId, date } },
        create: { rosterId, staffId: e.staffId, date, shiftTypeId: e.shiftTypeId ?? null, note: e.note, updatedById: actor.userId },
        update: { shiftTypeId: e.shiftTypeId ?? null, note: e.note, updatedById: actor.userId },
        include: { shiftType: true },
      });
      results.push(entry);
    }

    await this.auditLog.create({
      userId: actor.userId,
      action: AuditAction.UPDATE,
      entity: 'RosterEntry',
      entityId: rosterId,
      newValues: { bulkCount: entries.length, note: 'Drag-fill bulk update' },
    }).catch(() => {});

    return results;
  }

  async bulkSetCellValues(rosterId: string, values: { staffId: string; columnId: string; value?: string }[], actor: Actor) {
  await this.assertEditable(rosterId);

  const results = [];
  for (const v of values) {
    const result = await this.prisma.rosterCellValue.upsert({
      where: { rosterId_staffId_columnId: { rosterId, staffId: v.staffId, columnId: v.columnId } },
      create: { rosterId, staffId: v.staffId, columnId: v.columnId, value: v.value, updatedById: actor.userId },
      update: { value: v.value, updatedById: actor.userId },
    });
    results.push(result);
  }

  await this.auditLog.create({
    userId: actor.userId,
    action: AuditAction.UPDATE,
    entity: 'RosterCellValue',
    entityId: rosterId,
    newValues: { bulkCount: values.length, note: 'Bulk column value save' },
  }).catch(() => {});

  return results;
}
  // ── Custom columns ──────────────────────────────────────────────────────

  async createColumn(hotelId: string, dto: { label: string; type?: string }) {
    const maxOrder = await this.prisma.rosterColumn.aggregate({
      where: { hotelId }, _max: { order: true },
    });
    return this.prisma.rosterColumn.create({
      data: { hotelId, label: dto.label, type: dto.type ?? 'TEXT', order: (maxOrder._max.order ?? -1) + 1 },
    });
  }

  async getColumns(hotelId: string) {
    return this.prisma.rosterColumn.findMany({
      where: { hotelId, isActive: true },
      orderBy: { order: 'asc' },
    });
  }

  async deactivateColumn(id: string) {
    return this.prisma.rosterColumn.update({ where: { id }, data: { isActive: false } });
  }

  async reorderColumns(hotelId: string, columnIds: string[]) {
    await Promise.all(
      columnIds.map((id, index) =>
        this.prisma.rosterColumn.update({ where: { id }, data: { order: index } }),
      ),
    );
    return this.getColumns(hotelId);
  }

  async setCellValue(rosterId: string, data: { staffId: string; columnId: string; value?: string }, actor: Actor) {
    await this.assertEditable(rosterId);

    return this.prisma.rosterCellValue.upsert({
      where: { rosterId_staffId_columnId: { rosterId, staffId: data.staffId, columnId: data.columnId } },
      create: { rosterId, staffId: data.staffId, columnId: data.columnId, value: data.value, updatedById: actor.userId },
      update: { value: data.value, updatedById: actor.userId },
    });
  }

  // ── Staff row ordering / visibility ────────────────────────────────────

  async reorderStaff(staffIds: string[]) {
    await Promise.all(
      staffIds.map((id, index) =>
        this.prisma.staff.update({ where: { id }, data: { rosterOrder: index } }),
      ),
    );
    return { updated: staffIds.length };
  }

  async toggleStaffVisibility(staffId: string, hidden: boolean) {
    return this.prisma.staff.update({
      where: { id: staffId },
      data: { hiddenFromRoster: hidden },
      select: { id: true, hiddenFromRoster: true },
    });
  }

  // ── Status transitions ─────────────────────────────────────────────────

  async publish(rosterId: string, actor: Actor) {
    const roster = await this.prisma.roster.findUnique({ where: { id: rosterId } });
    if (!roster) throw new NotFoundException('Roster not found');
    if (roster.status === RosterStatus.LOCKED) {
      throw new BadRequestException('Cannot publish a locked roster.');
    }

    const updated = await this.prisma.roster.update({
      where: { id: rosterId },
      data: { status: RosterStatus.PUBLISHED, publishedAt: new Date(), publishedById: actor.userId },
    });

    await this.auditLog.create({
      userId: actor.userId,
      action: AuditAction.UPDATE,
      entity: 'Roster',
      entityId: rosterId,
      newValues: { status: 'PUBLISHED' },
    }).catch(() => {});

    return updated;
  }

  async lock(rosterId: string, actor: Actor) {
    const updated = await this.prisma.roster.update({
      where: { id: rosterId },
      data: { status: RosterStatus.LOCKED },
    });

    await this.auditLog.create({
      userId: actor.userId,
      action: AuditAction.UPDATE,
      entity: 'Roster',
      entityId: rosterId,
      newValues: { status: 'LOCKED' },
    }).catch(() => {});

    return updated;
  }

  async unlock(rosterId: string, actor: Actor) {
    const updated = await this.prisma.roster.update({
      where: { id: rosterId },
      data: { status: RosterStatus.DRAFT },
    });

    await this.auditLog.create({
      userId: actor.userId,
      action: AuditAction.UPDATE,
      entity: 'Roster',
      entityId: rosterId,
      newValues: { status: 'DRAFT (unlocked)' },
    }).catch(() => {});

    return updated;
  }
}