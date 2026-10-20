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
import { OrganizationMembershipGuard } from '../organizations/organization-membership.guard.js';
import { CreateIssueDto } from './dto/create-issue.dto.js';
import { ListIssuesQueryDto } from './dto/list-issues-query.dto.js';
import { UpdateIssueDto } from './dto/update-issue.dto.js';
import { ProjectsService } from './projects.service.js';

@Controller('api/organizations/:organizationId/projects/:projectId/issues')
@UseGuards(SessionAuthGuard, OrganizationMembershipGuard)
export class IssuesController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Get()
  list(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Query() query: ListIssuesQueryDto,
  ) {
    return this.projectsService.listIssues(organizationId, projectId, query);
  }

  @Post()
  create(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() input: CreateIssueDto,
  ) {
    return this.projectsService.createIssue(organizationId, projectId, input);
  }

  @Get(':issueId')
  get(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('issueId', ParseUUIDPipe) issueId: string,
  ) {
    return this.projectsService.getIssue(organizationId, projectId, issueId);
  }

  @Patch(':issueId')
  update(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('issueId', ParseUUIDPipe) issueId: string,
    @Body() input: UpdateIssueDto,
  ) {
    return this.projectsService.updateIssue(
      organizationId,
      projectId,
      issueId,
      input,
    );
  }
}
