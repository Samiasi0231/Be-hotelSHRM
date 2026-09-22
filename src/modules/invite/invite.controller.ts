import { Controller, Post, Patch, Get, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { InviteService } from './invite.service';
import { CreateInviteDto } from './dto/create-invite.dto';
import { AcceptInviteDto } from './dto/accept-invite.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Role } from '@prisma/client';

@ApiTags('Invites')
@Controller()
export class InviteController {
  constructor(private inviteService: InviteService) {}

  @Post('auth/invite')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.HOTEL_DIRECTOR, Role.ADMIN)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Fill in an employee\'s details and create their (inactive) account + invite link' })
  create(@CurrentUser('sub') userId: string, @CurrentUser('role') role: Role, @Body() dto: CreateInviteDto) {
    return this.inviteService.createInvite(userId, role, dto);
  }

  @Get('auth/invite/:token')
  @ApiOperation({ summary: 'Validate an invite token — shows who is activating (no auth)' })
  validate(@Param('token') token: string) {
    return this.inviteService.validateToken(token);
  }

  @Post('auth/invite/accept')
  @ApiOperation({ summary: 'Accept an invite — sets the password and activates the already-created account (no auth)' })
  accept(@Body() dto: AcceptInviteDto) {
    return this.inviteService.acceptInvite(dto);
  }

  @Patch('staff/:staffId/revoke-access')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.HOTEL_DIRECTOR, Role.ADMIN)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Revoke a staff member\'s access — blocks login immediately, invite status unaffected' })
  revoke(@CurrentUser('sub') userId: string, @CurrentUser('role') role: Role, @Param('staffId') staffId: string) {
    return this.inviteService.revokeAccess(userId, role, staffId);
  }

  @Patch('staff/:staffId/grant-access')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.HOTEL_DIRECTOR, Role.ADMIN)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Restore a previously revoked staff member\'s access' })
  grant(@CurrentUser('sub') userId: string, @CurrentUser('role') role: Role, @Param('staffId') staffId: string) {
    return this.inviteService.grantAccess(userId, role, staffId);
  }
}