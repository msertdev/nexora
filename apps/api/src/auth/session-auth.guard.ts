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
      user: SafeUser;
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
      user: session.user,
    };
    return true;
  }
}
