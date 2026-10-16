import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  NotFoundException,
  BadRequestException,ForbiddenException 
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import {SuperAdminLoginDto} from './dto/supera-admin-login.dto'
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { UpdateProfileDto, ChangePasswordDto } from './dto/update-profile.dto';
import { Role } from '@prisma/client';
import { Logger } from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { EmailService } from '../email/email.service';
import { ResetPasswordDto } from './dto/reset-password';

const RESET_TTL_MS = 60 * 60 * 1000;   
const RESET_COOLDOWN_MS = 60 * 1000;      
const INVALID_RESET = 'This reset link is invalid or has expired. Please request a new one.';

  @Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private config: ConfigService,
    private email: EmailService,
  ) {}

  async register(dto: RegisterDto) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) throw new ConflictException('Email already in use');

    const hashedPassword = await bcrypt.hash(dto.password, 12);
    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        password: hashedPassword,
        firstName: dto.firstName,
        lastName: dto.lastName,
        phone: dto.phone,
        role: dto.role || Role.STAFF,
      },
      select: { id: true, email: true, firstName: true, lastName: true, role: true, createdAt: true },
    });

    const tokens = await this.generateTokens(user.id, user.email, user.role);
    await this.updateRefreshToken(user.id, tokens.refreshToken);
    return { user, ...tokens };
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user || !user.isActive) throw new UnauthorizedException('Invalid credentials');

    const passwordValid = await bcrypt.compare(dto.password, user.password);
    if (!passwordValid) throw new UnauthorizedException('Invalid credentials');

    const tokens = await this.generateTokens(user.id, user.email, user.role);
    await this.updateRefreshToken(user.id, tokens.refreshToken);

    const { password, refreshToken, ...safe } = user;
    return { user: safe, ...tokens };
  }

  // ── Password reset ─────────────────────────────────────────────────────────

  private hashToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  async requestPasswordReset(rawEmail: string) {
    // Identical response whether or not the account exists — no email enumeration.
    const generic = { message: 'If an account exists for that email, a reset link has been sent.' };

    const user = await this.prisma.user.findFirst({
      where: { email: { equals: rawEmail.trim(), mode: 'insensitive' } },
      select: { id: true, email: true, firstName: true, isActive: true },
    });
    if (!user || !user.isActive) return generic;

    // Cooldown: stops someone using this endpoint to flood a victim's inbox.
    const recent = await this.prisma.passwordResetToken.findFirst({
      where: { userId: user.id, createdAt: { gt: new Date(Date.now() - RESET_COOLDOWN_MS) } },
      select: { id: true },
    });
    if (recent) return generic;

    const token = randomBytes(32).toString('hex');

    // One live link per account: issuing a new one revokes any earlier ones.
    await this.prisma.$transaction([
      this.prisma.passwordResetToken.deleteMany({ where: { userId: user.id } }),
      this.prisma.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash: this.hashToken(token),
          expiresAt: new Date(Date.now() + RESET_TTL_MS),
        },
      }),
    ]);

    const frontendUrl = this.config.get('FRONTEND_URL', 'http://localhost:5173');
    const resetUrl = `${frontendUrl}/reset-password?token=${token}`;

    // Dev convenience so you can test without SMTP. Never runs unless NODE_ENV is exactly "development".
    if (this.config.get('NODE_ENV') === 'development') {
      this.logger.debug(`[DEV ONLY] password reset link for ${user.email}: ${resetUrl}`);
    }

    // Not awaited, so response time doesn't reveal whether the account exists.
    void this.email.sendPasswordResetEmail(user.email, user.firstName, resetUrl);

    return generic;
  }

  async validateResetToken(token: string) {
    const record = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash: this.hashToken(token) },
      select: { usedAt: true, expiresAt: true },
    });
    return { valid: !!record && !record.usedAt && record.expiresAt > new Date() };
  }

  async resetPassword(dto: ResetPasswordDto) {
    const record = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash: this.hashToken(dto.token) },
      include: { user: { select: { id: true, email: true, firstName: true, isActive: true } } },
    });

    if (!record || record.usedAt || record.expiresAt < new Date() || !record.user.isActive) {
      throw new BadRequestException(INVALID_RESET);
    }

    // Claim the token atomically — a double-submit or a replay finds nothing to claim.
    const claimed = await this.prisma.passwordResetToken.updateMany({
      where: { id: record.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    if (claimed.count === 0) throw new BadRequestException(INVALID_RESET);

    const hashed = await bcrypt.hash(dto.newPassword, 12);

    await this.prisma.$transaction([
      // refreshToken: null signs the user out of every device (access tokens die within JWT_EXPIRES_IN).
      this.prisma.user.update({
        where: { id: record.userId },
        data: { password: hashed, refreshToken: null },
      }),
      this.prisma.passwordResetToken.deleteMany({ where: { userId: record.userId } }),
    ]);

    void this.email.sendPasswordChangedEmail(record.user.email, record.user.firstName);

    return { message: 'Password reset successfully. You can now sign in.' };
  }

  async loginSuperAdmin(dto: SuperAdminLoginDto) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } })
 
    // Fail with same generic message whether user doesn't exist, wrong password,
    // or wrong role — prevents enumeration attacks
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Invalid credentials')
    }
 
    const passwordValid = await bcrypt.compare(dto.password, user.password)
    if (!passwordValid) {
      throw new UnauthorizedException('Invalid credentials')
    }
 
    // Role check AFTER password — prevents leaking that the user exists
    if (user.role !== Role.SUPER_ADMIN) {
      throw new ForbiddenException('Access denied')
    }
 
    const tokens = await this.generateTokens(user.id, user.email, user.role)
    await this.updateRefreshToken(user.id, tokens.refreshToken)
 
    const { password, refreshToken, ...safe } = user
    return { user: safe, ...tokens }
  }

   
async refreshTokens(dto: RefreshTokenDto) {
  const { userId, refreshToken } = dto;

  const user = await this.prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user || !user.refreshToken) {
    throw new UnauthorizedException('Access denied');
  }

  const tokenMatch = await bcrypt.compare(
    refreshToken,
    user.refreshToken,
  );

  if (!tokenMatch) {
    throw new UnauthorizedException('Access denied');
  }

  const tokens = await this.generateTokens(
    user.id,
    user.email,
    user.role,
  );

  await this.updateRefreshToken(user.id, tokens.refreshToken);

  return tokens;
}

  async logout(userId: string) {
    await this.prisma.user.update({ where: { id: userId }, data: { refreshToken: null } });
    return { message: 'Logged out successfully' };
  }

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true, email: true, firstName: true, lastName: true,
        phone: true, avatar: true, role: true, isActive: true, createdAt: true,
        staffOf: { include: { hotel: { select: { id: true, name: true, logo: true } } } },
      },
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    return this.prisma.user.update({
      where: { id: userId },
      data: dto,
      select: { id: true, email: true, firstName: true, lastName: true, phone: true, avatar: true, role: true },
    });
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    const valid = await bcrypt.compare(dto.currentPassword, user.password);
    if (!valid) throw new BadRequestException('Current password is incorrect');
    const hashed = await bcrypt.hash(dto.newPassword, 12);
    await this.prisma.user.update({ where: { id: userId }, data: { password: hashed } });
    return { message: 'Password changed successfully' };
  }

  async updateAvatar(userId: string, avatarPath: string) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { avatar: avatarPath },
      select: { id: true, avatar: true },
    });
  }

  async validateUser(email: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (user && (await bcrypt.compare(password, user.password))) {
      const { password: _, ...result } = user;
      return result;
    }
    return null;
  }

  private async generateTokens(userId: string, email: string, role: Role) {
    const payload = { sub: userId, email, role };
    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: this.config.get('JWT_SECRET'),
        expiresIn: this.config.get('JWT_EXPIRES_IN', '15m'),
      }),
      this.jwtService.signAsync(payload, {
        secret: this.config.get('JWT_REFRESH_SECRET'),
        expiresIn: this.config.get('JWT_REFRESH_EXPIRES_IN', '7d'),
      }),
    ]);
    return { accessToken, refreshToken };
  }

  private async updateRefreshToken(userId: string, refreshToken: string) {
    const hashed = await bcrypt.hash(refreshToken, 12);
    await this.prisma.user.update({ where: { id: userId }, data: { refreshToken: hashed } });
  }
}
