import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/auth.types.js';
import { SessionAuthGuard } from '../auth/session-auth.guard.js';
import { MembershipRole } from '../generated/prisma/client.js';
import { CreateOrganizationDto } from './dto/create-organization.dto.js';
import { OrganizationMembershipGuard } from './organization-membership.guard.js';
import { OrganizationRoleGuard } from './organization-role.guard.js';
import { OrganizationRoles } from './organization-roles.decorator.js';
import { OrganizationsService } from './organizations.service.js';

@Controller('api/organizations')
@UseGuards(SessionAuthGuard)
export class OrganizationsController {
  constructor(private readonly organizationsService: OrganizationsService) {}

  @Post()
  create(
    @Req() request: AuthenticatedRequest,
    @Body() input: CreateOrganizationDto,
  ) {
    return this.organizationsService.create(request.auth!.user.id, input.name);
  }

  @Get()
  list(@Req() request: AuthenticatedRequest) {
    return this.organizationsService.listForUser(request.auth!.user.id);
  }

  @Get(':organizationId')
  @UseGuards(OrganizationMembershipGuard, OrganizationRoleGuard)
  @OrganizationRoles(
    MembershipRole.OWNER,
    MembershipRole.ADMIN,
    MembershipRole.MEMBER,
  )
  get(
    @Req() request: AuthenticatedRequest,
    @Param('organizationId') organizationId: string,
  ) {
    return this.organizationsService.getForUser(
      organizationId,
      request.auth!.user.id,
    );
  }

  @Get(':organizationId/members')
  @UseGuards(OrganizationMembershipGuard, OrganizationRoleGuard)
  @OrganizationRoles(
    MembershipRole.OWNER,
    MembershipRole.ADMIN,
    MembershipRole.MEMBER,
  )
  listMembers(
    @Req() request: AuthenticatedRequest,
    @Param('organizationId') organizationId: string,
  ) {
    return this.organizationsService.listMembersForUser(
      organizationId,
      request.auth!.user.id,
    );
  }
}
