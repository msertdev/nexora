import type { MembershipRole } from '../generated/prisma/enums.js';

export type SafeUser = {
  id: string;
  email: string;
  name: string;
  emailVerified: boolean;
};

export type AuthenticatedRequest = {
  headers: {
    cookie?: string;
  };
  auth?: {
    sessionId: string;
    user: SafeUser;
    organizationMembership?: {
      organizationId: string;
      role: MembershipRole;
    };
  };
};
