import {
  ForbiddenException,
  HttpException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import type { MembershipRole } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CommentBodyDto } from './dto/comment-body.dto.js';
import type { ListCommentsQueryDto } from './dto/list-comments-query.dto.js';

const COMMENT_FIELDS = {
  id: true,
  issueId: true,
  authorId: true,
  body: true,
  createdAt: true,
  updatedAt: true,
  author: { select: { id: true, name: true } },
} as const;

function scope(organizationId: string, projectId: string, issueId: string) {
  return {
    issueId,
    issue: { is: { projectId, project: { is: { organizationId } } } },
  };
}

function rethrow(error: unknown): never {
  if (error instanceof HttpException) throw error;
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === 'P2025' || error.code === 'P2003')
  ) {
    throw new NotFoundException('Comment or issue not found');
  }
  throw new ServiceUnavailableException('Comments unavailable');
}

@Injectable()
export class CommentsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    organizationId: string,
    projectId: string,
    issueId: string,
    query: ListCommentsQueryDto,
  ) {
    try {
      await this.requireIssue(this.prisma, organizationId, projectId, issueId);
      const where = scope(organizationId, projectId, issueId);
      const [items, total] = await Promise.all([
        this.prisma.comment.findMany({
          where,
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          skip: (query.page - 1) * query.limit,
          take: query.limit,
          select: COMMENT_FIELDS,
        }),
        this.prisma.comment.count({ where }),
      ]);
      return {
        items,
        total,
        page: query.page,
        limit: query.limit,
        totalPages: Math.ceil(total / query.limit),
      };
    } catch (error) {
      rethrow(error);
    }
  }

  async create(
    organizationId: string,
    projectId: string,
    issueId: string,
    userId: string,
    input: CommentBodyDto,
  ) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        await this.requireIssue(tx, organizationId, projectId, issueId);
        return tx.comment.create({
          data: { issueId, authorId: userId, body: input.body },
          select: COMMENT_FIELDS,
        });
      });
    } catch (error) {
      rethrow(error);
    }
  }

  async update(
    organizationId: string,
    projectId: string,
    issueId: string,
    commentId: string,
    userId: string,
    input: CommentBodyDto,
  ) {
    try {
      const where = {
        id: commentId,
        ...scope(organizationId, projectId, issueId),
      };
      const comment = await this.prisma.comment.findFirst({
        where,
        select: { authorId: true },
      });
      if (!comment) throw new NotFoundException('Comment not found');
      if (comment.authorId !== userId)
        throw new ForbiddenException('Only the author can edit a comment');
      // Keep ownership and scope in the write predicate as well as the read.
      return await this.prisma.comment.update({
        where: { ...where, authorId: userId },
        data: { body: input.body },
        select: COMMENT_FIELDS,
      });
    } catch (error) {
      rethrow(error);
    }
  }

  async remove(
    organizationId: string,
    projectId: string,
    issueId: string,
    commentId: string,
    userId: string,
    role: MembershipRole,
  ) {
    try {
      const where = {
        id: commentId,
        ...scope(organizationId, projectId, issueId),
      };
      const comment = await this.prisma.comment.findFirst({
        where,
        select: { authorId: true },
      });
      if (!comment) throw new NotFoundException('Comment not found');
      const canModerate = role === 'ADMIN' || role === 'OWNER';
      if (comment.authorId !== userId && !canModerate) {
        throw new ForbiddenException(
          'Only the author or an administrator can delete a comment',
        );
      }
      const result = await this.prisma.comment.deleteMany({
        where: { ...where, ...(canModerate ? {} : { authorId: userId }) },
      });
      if (result.count === 0) throw new NotFoundException('Comment not found');
    } catch (error) {
      rethrow(error);
    }
  }

  private async requireIssue(
    tx: Prisma.TransactionClient,
    organizationId: string,
    projectId: string,
    issueId: string,
  ) {
    const issue = await tx.issue.findFirst({
      where: { id: issueId, projectId, project: { is: { organizationId } } },
      select: { id: true },
    });
    if (!issue) throw new NotFoundException('Issue not found');
  }
}
