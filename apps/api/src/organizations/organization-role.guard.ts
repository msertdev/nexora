import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AuthenticatedRequest } from '../auth/auth.types.js';
import { ORGANIZATION_ROLES_KEY } from './organization-roles.decorator.js';
import type { MembershipRole } from '../generated/prisma/enums.js';

@Injectable()
export class OrganizationRoleGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<MembershipRole[]>(
      ORGANIZATION_ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!roles?.length) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const membershipRole = request.auth?.organizationMembership?.role;
    if (!membershipRole || !roles.includes(membershipRole)) {
      throw new ForbiddenException('Insufficient organization permissions');
    }

    return true;
  }
}
