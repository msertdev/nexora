import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  GoneException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'node:crypto';
import { MembershipRole, Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { EmailDeliveryService } from '../auth/email-delivery.service.js';

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const SAFE_INVITATION_FIELDS = {
  id: true,
  organizationId: true,
  email: true,
  role: true,
  expiresAt: true,
  acceptedAt: true,
  revokedAt: true,
  createdAt: true,
  invitedBy: { select: { id: true, name: true, email: true } },
} as const;

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

function isPrismaError(error: unknown, code: string) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError && error.code === code
  );
}

function isHttpError(error: unknown) {
  return (
    error instanceof BadRequestException ||
    error instanceof ConflictException ||
    error instanceof ForbiddenException ||
    error instanceof GoneException ||
    error instanceof NotFoundException ||
    error instanceof ServiceUnavailableException
  );
}

@Injectable()
export class TeamCollaborationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly emailDelivery: EmailDeliveryService,
  ) {}

  async createInvitation(
    organizationId: string,
    actorId: string,
    emailInput: string,
    roleInput: 'ADMIN' | 'MEMBER',
  ) {
    const email = emailInput.trim().toLowerCase();
    const token = randomBytes(32).toString('base64url');
    const tokenHash = hashToken(token);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + INVITATION_TTL_MS);

    try {
      const invitation = await this.prisma.$transaction(
        async (transaction) => {
          const actorMembership = await transaction.membership.findUnique({
            where: {
              organizationId_userId: { organizationId, userId: actorId },
            },
            select: { role: true },
          });
          if (!actorMembership) {
            throw new NotFoundException('Organization not found');
          }
          // Admins may invite members only; only owners can invite admins.
          if (
            actorMembership.role === MembershipRole.MEMBER ||
            (actorMembership.role === MembershipRole.ADMIN &&
              roleInput !== MembershipRole.MEMBER)
          ) {
            throw new ForbiddenException(
              'Insufficient organization permissions',
            );
          }

          const existingUser = await transaction.user.findUnique({
            where: { email },
            select: { id: true },
          });
          if (existingUser) {
            const existingMembership = await transaction.membership.findUnique({
              where: {
                organizationId_userId: {
                  organizationId,
                  userId: existingUser.id,
                },
              },
              select: { id: true },
            });
            if (existingMembership) {
              throw new ConflictException(
                'Unable to create an invitation with these details',
              );
            }
          }

          const activeInvitation = await transaction.invitation.findFirst({
            where: {
              organizationId,
              email,
              acceptedAt: null,
              revokedAt: null,
              expiresAt: { gt: now },
            },
            select: { id: true },
          });
          if (activeInvitation) {
            throw new ConflictException(
              'Unable to create an invitation with these details',
            );
          }

          return transaction.invitation.create({
            data: {
              organizationId,
              invitedByUserId: actorId,
              email,
              role: roleInput,
              tokenHash,
              expiresAt,
            },
            select: {
              ...SAFE_INVITATION_FIELDS,
              organization: { select: { name: true } },
            },
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );

      let invitationUrl: URL;
      try {
        const origin = this.config.getOrThrow<string>('PUBLIC_APP_URL');
        invitationUrl = new URL('/invitations/accept', origin);
        invitationUrl.hash = new URLSearchParams({ token }).toString();
        await this.emailDelivery.sendInvitation(
          email,
          invitation.organization.name,
          invitation.invitedBy.name,
          roleInput,
          invitationUrl.toString(),
        );
      } catch {
        try {
          await this.prisma.invitation.updateMany({
            where: {
              id: invitation.id,
              acceptedAt: null,
              revokedAt: null,
            },
            data: { revokedAt: new Date() },
          });
        } catch {
          throw new ServiceUnavailableException(
            'Invitation email could not be delivered',
          );
        }
        throw new ServiceUnavailableException(
          'Invitation email could not be delivered',
        );
      }
      return {
        id: invitation.id,
        organizationId: invitation.organizationId,
        email: invitation.email,
        role: invitation.role,
        expiresAt: invitation.expiresAt,
        acceptedAt: invitation.acceptedAt,
        revokedAt: invitation.revokedAt,
        createdAt: invitation.createdAt,
        invitedBy: invitation.invitedBy,
      };
    } catch (error) {
      if (isHttpError(error)) throw error;
      if (isPrismaError(error, 'P2002') || isPrismaError(error, 'P2034')) {
        throw new ConflictException(
          'Unable to create an invitation with these details',
        );
      }
      throw new ServiceUnavailableException('Invitations unavailable');
    }
  }

  async listInvitations(organizationId: string) {
    try {
      return await this.prisma.invitation.findMany({
        where: {
          organizationId,
          acceptedAt: null,
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
        orderBy: { createdAt: 'desc' },
        select: SAFE_INVITATION_FIELDS,
      });
    } catch {
      throw new ServiceUnavailableException('Invitations unavailable');
    }
  }

  async revokeInvitation(
    organizationId: string,
    invitationId: string,
    actorId: string,
  ) {
    try {
      return await this.prisma.$transaction(
        async (transaction) => {
          const actor = await transaction.membership.findUnique({
            where: {
              organizationId_userId: { organizationId, userId: actorId },
            },
            select: { role: true },
          });
          if (!actor) throw new NotFoundException('Organization not found');
          if (actor.role === MembershipRole.MEMBER) {
            throw new ForbiddenException(
              'Insufficient organization permissions',
            );
          }

          const invitation = await transaction.invitation.findFirst({
            where: { id: invitationId, organizationId },
            select: { id: true, role: true, acceptedAt: true, revokedAt: true },
          });
          if (!invitation) throw new NotFoundException('Invitation not found');
          if (
            actor.role === MembershipRole.ADMIN &&
            invitation.role !== MembershipRole.MEMBER
          ) {
            throw new ForbiddenException(
              'Insufficient organization permissions',
            );
          }
          if (invitation.acceptedAt || invitation.revokedAt) {
            throw new ConflictException('Invitation is no longer active');
          }

          const revokedAt = new Date();
          const result = await transaction.invitation.updateMany({
            where: {
              id: invitationId,
              organizationId,
              acceptedAt: null,
              revokedAt: null,
              expiresAt: { gt: revokedAt },
            },
            data: { revokedAt },
          });
          if (result.count !== 1) {
            throw new ConflictException('Invitation is no longer active');
          }
          return { id: invitationId, revokedAt };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (isHttpError(error)) throw error;
      if (isPrismaError(error, 'P2034')) {
        throw new ConflictException('Invitation is no longer active');
      }
      throw new ServiceUnavailableException('Invitations unavailable');
    }
  }

  async acceptInvitation(userId: string, token: string) {
    const tokenHash = hashToken(token);
    const invitation = await this.findInvitationForAcceptance(tokenHash);
    const now = new Date();

    if (invitation.revokedAt) {
      throw new GoneException('Invitation has been revoked');
    }
    if (invitation.acceptedAt) {
      throw new ConflictException('Invitation has already been accepted');
    }
    if (invitation.expiresAt <= now) {
      throw new GoneException('Invitation has expired');
    }

    try {
      return await this.prisma.$transaction(
        async (transaction) => {
          const user = await transaction.user.findUnique({
            where: { id: userId },
            select: { email: true, emailVerifiedAt: true },
          });
          if (!user) throw new NotFoundException('Invitation not found');
          if (!user.emailVerifiedAt) {
            throw new ForbiddenException(
              'Verify your email address before accepting invitations',
            );
          }
          if (
            user.email.trim().toLowerCase() !== invitation.email.toLowerCase()
          ) {
            throw new ForbiddenException(
              'This invitation is for a different email address',
            );
          }

          const claimed = await transaction.invitation.updateMany({
            where: {
              id: invitation.id,
              tokenHash,
              acceptedAt: null,
              revokedAt: null,
              expiresAt: { gt: now },
            },
            data: { acceptedAt: now },
          });
          if (claimed.count !== 1) {
            throw new ConflictException('Invitation is no longer available');
          }

          await transaction.membership.create({
            data: {
              organizationId: invitation.organizationId,
              userId,
              role: invitation.role,
            },
            select: { id: true },
          });
          return {
            organizationId: invitation.organizationId,
            role: invitation.role,
          };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (isHttpError(error)) throw error;
      if (isPrismaError(error, 'P2002') || isPrismaError(error, 'P2034')) {
        throw new ConflictException(
          'Invitation is no longer available or membership already exists',
        );
      }
      throw new ServiceUnavailableException(
        'Invitation acceptance unavailable',
      );
    }
  }

  async updateMemberRole(
    organizationId: string,
    targetUserId: string,
    actorId: string,
    role: 'ADMIN' | 'MEMBER',
  ) {
    try {
      return await this.prisma.$transaction(
        async (transaction) => {
          const actor = await transaction.membership.findUnique({
            where: {
              organizationId_userId: { organizationId, userId: actorId },
            },
            select: { role: true },
          });
          if (!actor) throw new NotFoundException('Organization not found');
          if (actor.role !== MembershipRole.OWNER) {
            throw new ForbiddenException(
              'Only an organization owner can change member roles',
            );
          }

          const target = await transaction.membership.findUnique({
            where: {
              organizationId_userId: {
                organizationId,
                userId: targetUserId,
              },
            },
            select: { role: true },
          });
          if (!target) throw new NotFoundException('Member not found');
          // Ownership transfer is deferred, so owner roles cannot be demoted.
          if (target.role === MembershipRole.OWNER) {
            throw new ConflictException(
              'Owner roles cannot be changed without ownership transfer',
            );
          }

          await transaction.membership.update({
            where: {
              organizationId_userId: {
                organizationId,
                userId: targetUserId,
              },
            },
            data: { role },
          });
          return { userId: targetUserId, role };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (isHttpError(error)) throw error;
      if (isPrismaError(error, 'P2034')) {
        throw new ConflictException('Membership changed; retry the request');
      }
      throw new ServiceUnavailableException('Membership unavailable');
    }
  }

  async removeMember(
    organizationId: string,
    targetUserId: string,
    actorId: string,
  ) {
    try {
      return await this.prisma.$transaction(
        async (transaction) => {
          const actor = await transaction.membership.findUnique({
            where: {
              organizationId_userId: { organizationId, userId: actorId },
            },
            select: { role: true },
          });
          if (!actor) throw new NotFoundException('Organization not found');

          const target = await transaction.membership.findUnique({
            where: {
              organizationId_userId: {
                organizationId,
                userId: targetUserId,
              },
            },
            select: { role: true },
          });
          if (!target) throw new NotFoundException('Member not found');
          // Owners manage admins and members; admins may remove members only.
          if (target.role === MembershipRole.OWNER) {
            throw new ConflictException(
              'Owner removal is unavailable until ownership transfer is supported',
            );
          }
          if (
            actor.role === MembershipRole.MEMBER ||
            (actor.role === MembershipRole.ADMIN &&
              target.role !== MembershipRole.MEMBER)
          ) {
            throw new ForbiddenException(
              'Insufficient organization permissions',
            );
          }

          const deleted = await transaction.membership.deleteMany({
            where: { organizationId, userId: targetUserId },
          });
          if (deleted.count !== 1) {
            throw new NotFoundException('Member not found');
          }
          await transaction.issue.updateMany({
            where: {
              assigneeId: targetUserId,
              project: { organizationId },
            },
            data: { assigneeId: null },
          });
          return { userId: targetUserId, removed: true };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (isHttpError(error)) throw error;
      if (isPrismaError(error, 'P2034')) {
        throw new ConflictException('Membership changed; retry the request');
      }
      throw new ServiceUnavailableException('Membership unavailable');
    }
  }

  private async findInvitationForAcceptance(tokenHash: string) {
    try {
      const invitation = await this.prisma.invitation.findUnique({
        where: { tokenHash },
        select: {
          id: true,
          organizationId: true,
          email: true,
          role: true,
          expiresAt: true,
          acceptedAt: true,
          revokedAt: true,
        },
      });
      if (!invitation) {
        throw new BadRequestException('Invalid invitation token');
      }
      return invitation;
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new ServiceUnavailableException(
        'Invitation acceptance unavailable',
      );
    }
  }
}
