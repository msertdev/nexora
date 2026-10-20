import {
  CanActivate,
  ExecutionContext,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import type { MembershipRole } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { AuthenticatedRequest } from '../auth/auth.types.js';

type OrganizationRequest = AuthenticatedRequest & {
  params: {
    organizationId?: string;
  };
};

@Injectable()
export class OrganizationMembershipGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<OrganizationRequest>();
    const userId = request.auth?.user.id;
    const organizationId = request.params.organizationId;

    if (!userId) {
      throw new UnauthorizedException('Authentication required');
    }
    if (!organizationId) {
      throw new NotFoundException('Organization not found');
    }

    let membership: { role: MembershipRole } | null;
    try {
      membership = await this.prisma.membership.findUnique({
        where: {
          organizationId_userId: {
            organizationId,
            userId,
          },
        },
        select: { role: true },
      });
    } catch {
      throw new ServiceUnavailableException('Organization unavailable');
    }

    if (!membership) {
      throw new NotFoundException('Organization not found');
    }

    request.auth!.organizationMembership = {
      organizationId,
      role: membership.role,
    };
    return true;
  }
}
