import {
  Injectable,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { CreateInviteDto } from './dto/create-invite.dto';
import { AcceptInviteDto } from './dto/accept-invite.dto';
import { Role, InviteStatus, Prisma, AuditAction } from '@prisma/client';

type TxClient = Prisma.TransactionClient;

const STAFF_ROLES: Role[] = [Role.STAFF, Role.ADMIN, Role.ADMIN_HR];
const INVITE_TTL_DAYS = 7;

@Injectable()
export class InviteService {
  constructor(
    private prisma: PrismaService,
    private email: EmailService,
    private auditLog: AuditLogService,
  ) {}

  // ─── Create invite = create the account NOW (inactive) + email a link ──────
  // The director/admin fills in the full employee form. The account exists
  // and shows up in the staff list immediately as Inactive. The emailed link
  // only lets the invitee set their own password and flips isActive to true.

  async createInvite(actorUserId: string, actorRole: Role, dto: CreateInviteDto) {
    if (
      actorRole !== Role.SUPER_ADMIN &&
      actorRole !== Role.HOTEL_DIRECTOR &&
      actorRole !== Role.ADMIN
    ) {
      throw new ForbiddenException('Not permitted to send invites');
    }

    if (!STAFF_ROLES.includes(dto.role)) {
      throw new BadRequestException('Invites can only be sent for STAFF, ADMIN, or ADMIN_HR roles');
    }

    // Resolve hotel — checks both staffOf (STAFF/ADMIN/ADMIN_HR) and the
    // director's own hotel relation (HOTEL_DIRECTOR has no staffOf row).
    let hotelId = dto.hotelId;
    let hotelName: string | undefined;

    if (actorRole !== Role.SUPER_ADMIN) {
      const actor = await this.prisma.user.findUnique({
        where: { id: actorUserId },
        include: { staffOf: { include: { hotel: true } }, hotel: true },
      });
      hotelId = actor?.staffOf?.hotelId ?? actor?.hotel?.id ?? undefined;
      hotelName = actor?.staffOf?.hotel?.name ?? actor?.hotel?.name;
      if (!hotelId) {
        throw new BadRequestException('Could not resolve inviting hotel');
      }
    } else if (dto.hotelId) {
      const hotel = await this.prisma.hotel.findUnique({ where: { id: dto.hotelId } });
      hotelName = hotel?.name;
    }

    const existingUser = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existingUser) throw new ConflictException('A user with this email already exists');

    if (dto.employeeId) {
      const existingEmployeeId = await this.prisma.staff.findUnique({
        where: { hotelId_employeeId: { hotelId: hotelId!, employeeId: dto.employeeId } },
      });
      if (existingEmployeeId) throw new ConflictException('This employee ID is already in use at this hotel');
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);

    // Placeholder password — unguessable and irrelevant, since login is
    // blocked by isActive=false regardless until the invite is accepted.
    const placeholderPassword = await bcrypt.hash(crypto.randomBytes(24).toString('hex'), 12);

    const result = await this.prisma.$transaction(async (tx: TxClient) => {
      const user = await tx.user.create({
        data: {
          email: dto.email,
          password: placeholderPassword,
          firstName: dto.firstName,
          lastName: dto.lastName,
          phone: dto.phone,
          role: dto.role,
          isActive: false,
        },
      });

      const employeeId = dto.employeeId ?? (await this.generateEmployeeId(tx, hotelId!));

      const staff = await tx.staff.create({
        data: {
          userId: user.id,
          hotelId: hotelId!,
          employeeId,
          department: dto.department ?? 'General',
          position: dto.position ?? 'Staff',
          gender: dto.gender,
          salary: dto.salary,
          isActive: false,
        },
      });

      const invite = await tx.invite.create({
        data: {
          token,
          userId: user.id,
          invitedById: actorUserId,
          expiresAt,
        },
      });

      return { user, staff, invite };
    });

    // Fire-and-forget — never let email delivery or logging block the response.
    this.email
      .sendInviteEmail(dto.email, {
        token,
        role: dto.role,
        inviteUrl: `${process.env.FRONTEND_URL}/accept-invite?token=${token}`,
        hotelName,
      })
      .catch(() => {});

    this.auditLog
      .create({
        userId: actorUserId,
        hotelId,
        action: AuditAction.INVITE,
        entity: 'Staff',
        entityId: result.staff.id,
        newValues: { email: dto.email, role: dto.role, status: 'PENDING' },
      })
      .catch(() => {});

    return {
      id: result.invite.id,
      staffId: result.staff.id,
      email: dto.email,
      role: dto.role,
      status: result.invite.status,
      expiresAt: result.invite.expiresAt,
    };
  }

  // ─── Validate token — for the accept-invite page to display who's activating ──

  async validateToken(token: string) {
    const invite = await this.findActiveInvite(token);

    return {
      email: invite.user.email,
      firstName: invite.user.firstName,
      lastName: invite.user.lastName,
      role: invite.user.role,
      hotel: invite.user.staffOf?.hotel
        ? { id: invite.user.staffOf.hotel.id, name: invite.user.staffOf.hotel.name }
        : null,
      expiresAt: invite.expiresAt,
    };
  }

  // ─── Accept — staff only sets a password, everything else already exists ──

  async acceptInvite(dto: AcceptInviteDto) {
    const invite = await this.findActiveInvite(dto.token);
    const hashedPassword = await bcrypt.hash(dto.password, 12);

    const user = await this.prisma.$transaction(async (tx: TxClient) => {
      const updatedUser = await tx.user.update({
        where: { id: invite.userId },
        data: { password: hashedPassword, isActive: true },
        select: { id: true, email: true, firstName: true, lastName: true, role: true },
      });

      await tx.staff.update({
        where: { userId: invite.userId },
        data: { isActive: true },
      });

      await tx.invite.update({
        where: { id: invite.id },
        data: { status: InviteStatus.ACCEPTED, acceptedAt: new Date() },
      });

      return updatedUser;
    });

    this.email.sendWelcomeEmail(user.email, user.firstName).catch(() => {});

    this.auditLog
      .create({
        userId: user.id,
        action: AuditAction.INVITE,
        entity: 'Staff',
        entityId: invite.userId,
        newValues: { status: 'ACCEPTED' },
      })
      .catch(() => {});

    return { message: 'Account activated. You can now log in.', user };
  }

  // ─── Grant / Revoke access — director/admin toggles isActive directly ──────
  // Works regardless of whether the invite was ever accepted, since login is
  // gated on User.isActive. Both User and Staff are flipped together so the
  // staff list badge and actual login access never disagree.

  async revokeAccess(actorUserId: string, actorRole: Role, staffId: string) {
    return this.setStaffAccess(actorUserId, actorRole, staffId, false);
  }

  async grantAccess(actorUserId: string, actorRole: Role, staffId: string) {
    return this.setStaffAccess(actorUserId, actorRole, staffId, true);
  }

  private async setStaffAccess(actorUserId: string, actorRole: Role, staffId: string, isActive: boolean) {
    if (
      actorRole !== Role.SUPER_ADMIN &&
      actorRole !== Role.HOTEL_DIRECTOR &&
      actorRole !== Role.ADMIN
    ) {
      throw new ForbiddenException('Not permitted to change staff access');
    }

    const staff = await this.prisma.staff.findUnique({ where: { id: staffId } });
    if (!staff) throw new NotFoundException('Staff member not found');

    await this.prisma.$transaction([
      this.prisma.staff.update({ where: { id: staffId }, data: { isActive } }),
      this.prisma.user.update({ where: { id: staff.userId }, data: { isActive } }),
    ]);

    this.auditLog
      .create({
        userId: actorUserId,
        hotelId: staff.hotelId,
        action: AuditAction.UPDATE,
        entity: 'Staff',
        entityId: staffId,
        newValues: { isActive },
      })
      .catch(() => {});

    return { message: isActive ? 'Access granted' : 'Access revoked', staffId, isActive };
  }

  // ─── Helpers ────────────────────────────────────────────────────────────────

  private async generateEmployeeId(tx: TxClient, hotelId: string): Promise<string> {
    const count = await tx.staff.count({ where: { hotelId } });
    let candidate = `EMP-${String(count + 1).padStart(4, '0')}`;

    let suffix = 1;
    while (await tx.staff.findUnique({ where: { hotelId_employeeId: { hotelId, employeeId: candidate } } })) {
      suffix += 1;
      candidate = `EMP-${String(count + 1).padStart(4, '0')}-${suffix}`;
    }
    return candidate;
  }

  private async findActiveInvite(token: string) {
    const invite = await this.prisma.invite.findUnique({
      where: { token },
      include: {
        user: { include: { staffOf: { include: { hotel: true } } } },
      },
    });

    if (!invite) throw new NotFoundException('Invite not found');

    if (invite.status === InviteStatus.ACCEPTED) {
      throw new BadRequestException('This invite has already been accepted');
    }
    if (invite.status === InviteStatus.REVOKED) {
      throw new BadRequestException('This invite has been revoked');
    }
    if (invite.status === InviteStatus.EXPIRED || invite.expiresAt < new Date()) {
      if (invite.status !== InviteStatus.EXPIRED) {
        await this.prisma.invite.update({
          where: { id: invite.id },
          data: { status: InviteStatus.EXPIRED },
        });
      }
      throw new BadRequestException('This invite has expired — ask for a new one');
    }

    return invite;
  }
}