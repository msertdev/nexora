import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { SessionAuthGuard } from '../auth/session-auth.guard.js';
import type { AuthenticatedRequest } from '../auth/auth.types.js';
import { OrganizationMembershipGuard } from '../organizations/organization-membership.guard.js';
import { CommentBodyDto } from './dto/comment-body.dto.js';
import { ListCommentsQueryDto } from './dto/list-comments-query.dto.js';
import { CommentsService } from './comments.service.js';

@Controller(
  'api/organizations/:organizationId/projects/:projectId/issues/:issueId/comments',
)
@UseGuards(SessionAuthGuard, OrganizationMembershipGuard)
export class CommentsController {
  constructor(private readonly commentsService: CommentsService) {}

  @Get()
  list(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('issueId', ParseUUIDPipe) issueId: string,
    @Query() query: ListCommentsQueryDto,
  ) {
    return this.commentsService.list(organizationId, projectId, issueId, query);
  }

  @Post()
  create(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('issueId', ParseUUIDPipe) issueId: string,
    @Req() request: AuthenticatedRequest,
    @Body() input: CommentBodyDto,
  ) {
    return this.commentsService.create(
      organizationId,
      projectId,
      issueId,
      request.auth!.user.id,
      input,
    );
  }

  @Patch(':commentId')
  update(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('issueId', ParseUUIDPipe) issueId: string,
    @Param('commentId', ParseUUIDPipe) commentId: string,
    @Req() request: AuthenticatedRequest,
    @Body() input: CommentBodyDto,
  ) {
    return this.commentsService.update(
      organizationId,
      projectId,
      issueId,
      commentId,
      request.auth!.user.id,
      input,
    );
  }

  @Delete(':commentId')
  @HttpCode(204)
  remove(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('issueId', ParseUUIDPipe) issueId: string,
    @Param('commentId', ParseUUIDPipe) commentId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    const auth = request.auth!;
    return this.commentsService.remove(
      organizationId,
      projectId,
      issueId,
      commentId,
      auth.user.id,
      auth.organizationMembership!.role,
    );
  }
}
