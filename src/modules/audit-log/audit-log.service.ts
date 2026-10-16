import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditAction } from '@prisma/client';
import {
  getPaginationParams,
  paginate,
} from '../../common/helpers/pagination.helper';

export interface CreateAuditLogDto {
  userId?: string;
  hotelId?: string;
  action: AuditAction;
  entity: string;
  entityId?: string;
  oldValues?: any;
  newValues?: any;
  ipAddress?: string;
  userAgent?: string;
}

@Injectable()
export class AuditLogService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateAuditLogDto) {
    return this.prisma.auditLog.create({
      data: dto,
    });
  }

  async findAll(filters: {
    hotelId?: string;
    userId?: string;
    action?: AuditAction;
    entity?: string;
    search?: string;
    page?: number;
    limit?: number;
    from?: string;
    to?: string;
  }) {
    const {
      page = 1,
      limit = 20,
      hotelId,
      userId,
      action,
      entity,
      from,
      to,
    } = filters;

    const { skip, take } = getPaginationParams(page, limit);

    const where: any = {};

    if (hotelId) {
      where.hotelId = hotelId;
    }

    if (userId) {
      where.userId = userId;
    }

    if (action) {
      where.action = action;
    }

    if (entity) {
      where.entity = {
        equals: entity,
        mode: 'insensitive',
      };
    }

    if (from || to) {
      where.createdAt = {};

      if (from) {
        const fromDate = new Date(`${from}T00:00:00.000`);

        if (!Number.isNaN(fromDate.getTime())) {
          where.createdAt.gte = fromDate;
        }
      }

      if (to) {
        const toDate = new Date(`${to}T23:59:59.999`);

        if (!Number.isNaN(toDate.getTime())) {
          where.createdAt.lte = toDate;
        }
      }
    }

    const [logs, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        skip,
        take,
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
      }),

      this.prisma.auditLog.count({
        where,
      }),
    ]);

    return paginate(logs, total, page, limit);
  }
}

