import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuthenticatedRequest, SafeUser } from './auth.types.js';
import { hashSessionToken, readSessionToken } from './session-token.js';

@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = readSessionToken(request.headers.cookie);
    if (!token) {
      throw new UnauthorizedException('Authentication required');
    }

    let session: {
      id: string;
      user: Omit<SafeUser, 'emailVerified'> & { emailVerifiedAt: Date | null };
    } | null;
    try {
      session = await this.prisma.session.findFirst({
        where: {
          tokenHash: hashSessionToken(token),
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
        select: {
          id: true,
          user: {
            select: {
              id: true,
              email: true,
              name: true,
              emailVerifiedAt: true,
            },
          },
        },
      });
    } catch {
      throw new ServiceUnavailableException('Authentication unavailable');
    }

    if (!session) {
      throw new UnauthorizedException('Authentication required');
    }

    request.auth = {
      sessionId: session.id,
      user: {
        id: session.user.id,
        email: session.user.email,
        name: session.user.name,
        emailVerified: Boolean(session.user.emailVerifiedAt),
      },
    };
    return true;
  }
}
