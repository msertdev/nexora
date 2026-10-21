import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { OrganizationMembershipGuard } from './organization-membership.guard.js';
import { OrganizationRoleGuard } from './organization-role.guard.js';
import { OrganizationsController } from './organizations.controller.js';
import { OrganizationsService } from './organizations.service.js';
import {
  PublicInvitationController,
  TeamCollaborationController,
} from './team-collaboration.controller.js';
import { TeamCollaborationService } from './team-collaboration.service.js';

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [
    OrganizationsController,
    TeamCollaborationController,
    PublicInvitationController,
  ],
  providers: [
    OrganizationsService,
    TeamCollaborationService,
    OrganizationMembershipGuard,
    OrganizationRoleGuard,
  ],
  exports: [OrganizationMembershipGuard, OrganizationRoleGuard],
})
export class OrganizationsModule {}
