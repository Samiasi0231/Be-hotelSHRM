import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateStaffDto } from './dto/create-staff.dto';
import { UpdateStaffDto } from './dto/update-staff.dto';
import { paginate, getPaginationParams } from '../../common/helpers/pagination.helper';
import * as bcrypt from 'bcryptjs';
import { Role } from '@prisma/client';

@Injectable()
export class StaffService {
  constructor(private prisma: PrismaService) {}

  async onboard(hotelId: string, dto: CreateStaffDto) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) throw new ConflictException('Email already registered');

    const password = await bcrypt.hash(dto.password || 'Staff@123', 12);
    const user = await this.prisma.user.create({
      data: { email: dto.email, password, firstName: dto.firstName, lastName: dto.lastName, phone: dto.phone, role: dto.role as Role || Role.STAFF },
    });

    const staff = await this.prisma.staff.create({
      data: {
        userId: user.id,
        hotelId,
        employeeId: dto.employeeId,
        department: dto.department,
        position: dto.position,
        salary: dto.salary,
        managerId: dto.managerId,
      },
      include: { user: { select: { id: true, email: true, firstName: true, lastName: true, phone: true, avatar: true, role: true } } },
    });
    return staff;
  }

  async findAll(hotelId: string, page = 1, limit = 10, department?: string) {
    const { skip, take } = getPaginationParams(page, limit);
    const where: any = { hotelId };
    if (department) where.department = department;

    const [staff, total] = await Promise.all([
      this.prisma.staff.findMany({ where, skip, take, include: { user: { select: { id: true, email: true, firstName: true, lastName: true, phone: true, avatar: true, role: true, isActive: true } } }, orderBy: { createdAt: 'desc' } }),
      this.prisma.staff.count({ where }),
    ]);
    return paginate(staff, total, page, limit);
  }

  async findOne(id: string) {
    const staff = await this.prisma.staff.findUnique({
      where: { id },
      include: { user: { select: { id: true, email: true, firstName: true, lastName: true, phone: true, avatar: true, role: true } }, hotel: { select: { id: true, name: true } } },
    });
    if (!staff) throw new NotFoundException('Staff member not found');
    return staff;
  }

  async update(id: string, dto: UpdateStaffDto) {
    await this.findOne(id);
    return this.prisma.staff.update({ where: { id }, data: dto });
  }

  async deactivate(id: string) {
    const staff = await this.findOne(id);
    await this.prisma.user.update({ where: { id: staff.userId }, data: { isActive: false } });
    return this.prisma.staff.update({ where: { id }, data: { isActive: false } });
  }

  async getDepartments(hotelId: string) {
    const staff = await this.prisma.staff.groupBy({ by: ['department'], where: { hotelId }, _count: { department: true } });
    return staff.map(s => ({ department: s.department, count: s._count.department }));
  }
}
