import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import type { IssuePriority, IssueStatus } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CreateIssueDto } from './dto/create-issue.dto.js';
import type { CreateProjectDto } from './dto/create-project.dto.js';
import type { ListIssuesQueryDto } from './dto/list-issues-query.dto.js';
import type { ListProjectsQueryDto } from './dto/list-projects-query.dto.js';
import type { UpdateIssueDto } from './dto/update-issue.dto.js';
import type { UpdateProjectDto } from './dto/update-project.dto.js';

const PROJECT_FIELDS = {
  id: true,
  organizationId: true,
  name: true,
  key: true,
  createdAt: true,
  updatedAt: true,
} as const;

const ISSUE_FIELDS = {
  id: true,
  projectId: true,
  issueNumber: true,
  title: true,
  description: true,
  status: true,
  priority: true,
  assigneeId: true,
  dueDate: true,
  createdAt: true,
  updatedAt: true,
  assignee: {
    select: { id: true, name: true, email: true },
  },
  project: {
    select: { key: true },
  },
} as const;

type ProjectTransaction = Prisma.TransactionClient;

function isPrismaError(error: unknown, code: string): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError && error.code === code
  );
}

function isHttpError(error: unknown): boolean {
  return (
    error instanceof NotFoundException ||
    error instanceof BadRequestException ||
    error instanceof ConflictException
  );
}

function withIdentifier<
  T extends { issueNumber: number; project: { key: string } },
>(issue: T) {
  return {
    ...issue,
    identifier: `${issue.project.key}-${issue.issueNumber}`,
  };
}

function toDate(value: string | null | undefined) {
  if (value === undefined || value === null) return value;
  const date = new Date(`${value}T00:00:00.000Z`);
  if (
    Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value
  ) {
    throw new BadRequestException('dueDate must be a valid YYYY-MM-DD date');
  }
  return date;
}

@Injectable()
export class ProjectsService {
  constructor(private readonly prisma: PrismaService) {}

  async listProjects(organizationId: string, query: ListProjectsQueryDto) {
    const where = { organizationId };
    const skip = (query.page - 1) * query.limit;
    try {
      const [items, total] = await Promise.all([
        this.prisma.project.findMany({
          where,
          orderBy: { name: 'asc' },
          skip,
          take: query.limit,
          select: PROJECT_FIELDS,
        }),
        this.prisma.project.count({ where }),
      ]);
      return {
        items,
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      };
    } catch {
      throw new ServiceUnavailableException('Projects unavailable');
    }
  }

  async createProject(organizationId: string, input: CreateProjectDto) {
    try {
      return await this.prisma.project.create({
        data: {
          organizationId,
          name: input.name,
          key: input.key,
        },
        select: PROJECT_FIELDS,
      });
    } catch (error) {
      if (isPrismaError(error, 'P2002')) {
        throw new ConflictException('A project with that key already exists');
      }
      if (isPrismaError(error, 'P2003')) {
        throw new NotFoundException('Organization not found');
      }
      throw new ServiceUnavailableException('Projects unavailable');
    }
  }

  async getProject(organizationId: string, projectId: string) {
    try {
      const project = await this.prisma.project.findFirst({
        where: { id: projectId, organizationId },
        select: PROJECT_FIELDS,
      });
      if (!project) throw new NotFoundException('Project not found');
      return project;
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      throw new ServiceUnavailableException('Projects unavailable');
    }
  }

  async updateProject(
    organizationId: string,
    projectId: string,
    input: UpdateProjectDto,
  ) {
    if (Object.keys(input).length === 0) {
      throw new BadRequestException('At least one project field is required');
    }
    try {
      const result = await this.prisma.project.updateMany({
        where: { id: projectId, organizationId },
        data: input,
      });
      if (result.count === 0) throw new NotFoundException('Project not found');
      return await this.getProject(organizationId, projectId);
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      if (isPrismaError(error, 'P2002')) {
        throw new ConflictException('A project with that key already exists');
      }
      throw new ServiceUnavailableException('Projects unavailable');
    }
  }

  async listIssues(
    organizationId: string,
    projectId: string,
    query: ListIssuesQueryDto,
  ) {
    await this.getProject(organizationId, projectId);
    const where: Prisma.IssueWhereInput = {
      projectId,
      ...(query.status ? { status: query.status as IssueStatus } : {}),
      ...(query.priority ? { priority: query.priority as IssuePriority } : {}),
      ...(query.assigneeId ? { assigneeId: query.assigneeId } : {}),
    };
    const skip = (query.page - 1) * query.limit;
    try {
      const [items, total] = await Promise.all([
        this.prisma.issue.findMany({
          where,
          orderBy: { issueNumber: 'desc' },
          skip,
          take: query.limit,
          select: ISSUE_FIELDS,
        }),
        this.prisma.issue.count({ where }),
      ]);
      return {
        items: items.map(withIdentifier),
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      };
    } catch {
      throw new ServiceUnavailableException('Issues unavailable');
    }
  }

  async createIssue(
    organizationId: string,
    projectId: string,
    input: CreateIssueDto,
  ) {
    try {
      const issue = await this.prisma.$transaction(async (transaction) => {
        await this.requireProject(transaction, organizationId, projectId);
        await this.requireAssigneeMembership(
          transaction,
          organizationId,
          input.assigneeId,
        );

        const counter = await transaction.project.update({
          where: { id: projectId },
          data: { lastIssueNumber: { increment: 1 } },
          select: { lastIssueNumber: true },
        });

        return transaction.issue.create({
          data: {
            projectId,
            issueNumber: counter.lastIssueNumber,
            title: input.title,
            description: input.description,
            status: input.status,
            priority: input.priority,
            assigneeId: input.assigneeId,
            dueDate: toDate(input.dueDate),
          },
          select: ISSUE_FIELDS,
        });
      });
      return withIdentifier(issue);
    } catch (error) {
      if (isHttpError(error)) throw error;
      if (isPrismaError(error, 'P2002')) {
        throw new ConflictException('Unable to allocate an issue number');
      }
      if (isPrismaError(error, 'P2003')) {
        throw new BadRequestException('Invalid issue reference');
      }
      throw new ServiceUnavailableException('Issues unavailable');
    }
  }

  async getIssue(organizationId: string, projectId: string, issueId: string) {
    await this.getProject(organizationId, projectId);
    try {
      const issue = await this.prisma.issue.findFirst({
        where: { id: issueId, projectId },
        select: ISSUE_FIELDS,
      });
      if (!issue) throw new NotFoundException('Issue not found');
      return withIdentifier(issue);
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      throw new ServiceUnavailableException('Issues unavailable');
    }
  }

  async updateIssue(
    organizationId: string,
    projectId: string,
    issueId: string,
    input: UpdateIssueDto,
  ) {
    if (Object.keys(input).length === 0) {
      throw new BadRequestException('At least one issue field is required');
    }
    await this.getProject(organizationId, projectId);
    try {
      await this.prisma.$transaction(async (transaction) => {
        const existing = await transaction.issue.findFirst({
          where: { id: issueId, projectId },
          select: { id: true },
        });
        if (!existing) throw new NotFoundException('Issue not found');
        if (input.assigneeId !== undefined) {
          await this.requireAssigneeMembership(
            transaction,
            organizationId,
            input.assigneeId,
          );
        }
        const data: Prisma.IssueUncheckedUpdateManyInput = {
          title: input.title,
          description: input.description,
          status: input.status,
          priority: input.priority,
          assigneeId: input.assigneeId,
          dueDate:
            input.dueDate === undefined ? undefined : toDate(input.dueDate),
        };
        await transaction.issue.updateMany({
          where: { id: issueId, projectId },
          data,
        });
      });
      return await this.getIssue(organizationId, projectId, issueId);
    } catch (error) {
      if (isHttpError(error)) throw error;
      if (isPrismaError(error, 'P2003')) {
        throw new BadRequestException('Invalid issue reference');
      }
      throw new ServiceUnavailableException('Issues unavailable');
    }
  }

  private async requireProject(
    transaction: ProjectTransaction,
    organizationId: string,
    projectId: string,
  ) {
    const project = await transaction.project.findFirst({
      where: { id: projectId, organizationId },
      select: { id: true },
    });
    if (!project) throw new NotFoundException('Project not found');
  }

  private async requireAssigneeMembership(
    transaction: ProjectTransaction,
    organizationId: string,
    assigneeId: string | null | undefined,
  ) {
    // Any organization member may assign or reassign issues; only active membership qualifies.
    if (assigneeId == null) return;
    const membership = await transaction.membership.findFirst({
      where: { organizationId, userId: assigneeId },
      select: { id: true },
    });
    if (!membership) {
      throw new BadRequestException(
        'Assignee must be a member of this organization',
      );
    }
  }
}
