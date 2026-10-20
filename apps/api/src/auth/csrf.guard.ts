import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthenticatedRequest } from './auth.types.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

type OriginRequest = AuthenticatedRequest & {
  method: string;
  headers: AuthenticatedRequest['headers'] & {
    origin?: string;
  };
};

@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<OriginRequest>();
    if (SAFE_METHODS.has(request.method)) {
      return true;
    }

    const origin = request.headers.origin;
    const allowedOrigin =
      this.configService.getOrThrow<string>('FRONTEND_ORIGIN');
    if (origin !== allowedOrigin) {
      throw new ForbiddenException('Invalid request origin');
    }

    return true;
  }
}
