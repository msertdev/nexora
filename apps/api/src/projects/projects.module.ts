import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { OrganizationsModule } from '../organizations/organizations.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { IssuePermalinksController } from './issue-permalinks.controller.js';
import { CommentsController } from './comments.controller.js';
import { CommentsService } from './comments.service.js';
import { IssuesController } from './issues.controller.js';
import { ProjectsController } from './projects.controller.js';
import { ProjectsService } from './projects.service.js';

@Module({
  imports: [AuthModule, OrganizationsModule, PrismaModule],
  controllers: [
    ProjectsController,
    IssuesController,
    CommentsController,
    IssuePermalinksController,
  ],
  providers: [ProjectsService, CommentsService],
})
export class ProjectsModule {}
