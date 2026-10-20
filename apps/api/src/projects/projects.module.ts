import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { OrganizationsModule } from '../organizations/organizations.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { IssuesController } from './issues.controller.js';
import { ProjectsController } from './projects.controller.js';
import { ProjectsService } from './projects.service.js';

@Module({
  imports: [AuthModule, OrganizationsModule, PrismaModule],
  controllers: [ProjectsController, IssuesController],
  providers: [ProjectsService],
})
export class ProjectsModule {}
