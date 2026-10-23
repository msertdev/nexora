import { Controller, Get, Param, Req, UseGuards } from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/auth.types.js';
import { SessionAuthGuard } from '../auth/session-auth.guard.js';
import { ProjectsService } from './projects.service.js';

@Controller(
  'api/organizations/by-slug/:organizationSlug/projects/:projectId/issues',
)
@UseGuards(SessionAuthGuard)
export class IssuePermalinksController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Get(':issueNumber')
  get(
    @Req() request: AuthenticatedRequest,
    @Param('organizationSlug') organizationSlug: string,
    @Param('projectId') projectId: string,
    @Param('issueNumber') issueNumber: string,
  ) {
    return this.projectsService.getIssueByPermalink(
      request.auth!.user.id,
      organizationSlug,
      projectId,
      issueNumber,
    );
  }
}
