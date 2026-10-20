import { SetMetadata } from '@nestjs/common';
import type { MembershipRole } from '../generated/prisma/enums.js';

export const ORGANIZATION_ROLES_KEY = 'organization-roles';

export const OrganizationRoles = (...roles: MembershipRole[]) =>
  SetMetadata(ORGANIZATION_ROLES_KEY, roles);
