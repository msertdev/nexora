import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { AuthenticatedRequest } from '../auth/auth.types.js';
import { SessionAuthGuard } from '../auth/session-auth.guard.js';
import { MembershipRole } from '../generated/prisma/client.js';
import { OrganizationMembershipGuard } from './organization-membership.guard.js';
import { OrganizationRoleGuard } from './organization-role.guard.js';
import { OrganizationRoles } from './organization-roles.decorator.js';
import { AcceptInvitationDto } from './dto/accept-invitation.dto.js';
import { CreateInvitationDto } from './dto/create-invitation.dto.js';
import { UpdateMemberRoleDto } from './dto/update-member-role.dto.js';
import { TeamCollaborationService } from './team-collaboration.service.js';

@Controller('api')
export class TeamCollaborationController {
  constructor(private readonly collaboration: TeamCollaborationService) {}

  @Post('organizations/:organizationId/invitations')
  @UseGuards(
    SessionAuthGuard,
    OrganizationMembershipGuard,
    OrganizationRoleGuard,
  )
  @OrganizationRoles(MembershipRole.OWNER, MembershipRole.ADMIN)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  createInvitation(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Req() request: AuthenticatedRequest,
    @Body() input: CreateInvitationDto,
  ) {
    return this.collaboration.createInvitation(
      organizationId,
      request.auth!.user.id,
      input.email,
      input.role,
    );
  }

  @Get('organizations/:organizationId/invitations')
  @UseGuards(
    SessionAuthGuard,
    OrganizationMembershipGuard,
    OrganizationRoleGuard,
  )
  @OrganizationRoles(MembershipRole.OWNER, MembershipRole.ADMIN)
  listInvitations(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
  ) {
    return this.collaboration.listInvitations(organizationId);
  }

  @Post('organizations/:organizationId/invitations/:invitationId/revoke')
  @UseGuards(
    SessionAuthGuard,
    OrganizationMembershipGuard,
    OrganizationRoleGuard,
  )
  @OrganizationRoles(MembershipRole.OWNER, MembershipRole.ADMIN)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  revokeInvitation(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('invitationId', ParseUUIDPipe) invitationId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.collaboration.revokeInvitation(
      organizationId,
      invitationId,
      request.auth!.user.id,
    );
  }

  @Patch('organizations/:organizationId/members/:userId')
  @UseGuards(
    SessionAuthGuard,
    OrganizationMembershipGuard,
    OrganizationRoleGuard,
  )
  @OrganizationRoles(MembershipRole.OWNER)
  updateMemberRole(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Req() request: AuthenticatedRequest,
    @Body() input: UpdateMemberRoleDto,
  ) {
    return this.collaboration.updateMemberRole(
      organizationId,
      userId,
      request.auth!.user.id,
      input.role,
    );
  }

  @Delete('organizations/:organizationId/members/:userId')
  @UseGuards(
    SessionAuthGuard,
    OrganizationMembershipGuard,
    OrganizationRoleGuard,
  )
  @OrganizationRoles(
    MembershipRole.OWNER,
    MembershipRole.ADMIN,
    MembershipRole.MEMBER,
  )
  removeMember(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.collaboration.removeMember(
      organizationId,
      userId,
      request.auth!.user.id,
    );
  }
}

@Controller('api/invitations')
export class PublicInvitationController {
  constructor(private readonly collaboration: TeamCollaborationService) {}

  @Post('accept')
  @UseGuards(SessionAuthGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  accept(
    @Req() request: AuthenticatedRequest,
    @Body() input: AcceptInvitationDto,
  ) {
    return this.collaboration.acceptInvitation(
      request.auth!.user.id,
      input.token,
    );
  }
}
