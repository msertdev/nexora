import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { SessionAuthGuard } from '../auth/session-auth.guard.js';
import { MembershipRole } from '../generated/prisma/enums.js';
import { OrganizationMembershipGuard } from '../organizations/organization-membership.guard.js';
import { OrganizationRoleGuard } from '../organizations/organization-role.guard.js';
import { OrganizationRoles } from '../organizations/organization-roles.decorator.js';
import { ListProjectsQueryDto } from './dto/list-projects-query.dto.js';
import { CreateProjectDto } from './dto/create-project.dto.js';
import { UpdateProjectDto } from './dto/update-project.dto.js';
import { ProjectsService } from './projects.service.js';

@Controller('api/organizations/:organizationId/projects')
@UseGuards(SessionAuthGuard, OrganizationMembershipGuard)
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Get()
  list(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Query() query: ListProjectsQueryDto,
  ) {
    return this.projectsService.listProjects(organizationId, query);
  }

  @Post()
  @UseGuards(OrganizationRoleGuard)
  @OrganizationRoles(MembershipRole.OWNER, MembershipRole.ADMIN)
  create(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Body() input: CreateProjectDto,
  ) {
    return this.projectsService.createProject(organizationId, input);
  }

  @Get(':projectId')
  get(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
  ) {
    return this.projectsService.getProject(organizationId, projectId);
  }

  @Patch(':projectId')
  @UseGuards(OrganizationRoleGuard)
  @OrganizationRoles(MembershipRole.OWNER, MembershipRole.ADMIN)
  update(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() input: UpdateProjectDto,
  ) {
    return this.projectsService.updateProject(organizationId, projectId, input);
  }
}
