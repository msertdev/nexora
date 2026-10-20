import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service.js';
import type { AuthenticatedRequest, SafeUser } from './auth.types.js';
import { LoginDto } from './dto/login.dto.js';
import { RegisterDto } from './dto/register.dto.js';
import { SessionAuthGuard } from './session-auth.guard.js';
import { SESSION_COOKIE, SESSION_TTL_MS } from './session-token.js';

@Controller('api/auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  private getCookieOptions() {
    return {
      httpOnly: true,
      secure: this.configService.get<string>('NODE_ENV') === 'production',
      sameSite: 'lax' as const,
      path: '/api',
    };
  }

  @Post('register')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async register(@Body() input: RegisterDto): Promise<SafeUser> {
    return this.authService.register(input);
  }

  @Post('login')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async login(
    @Body() input: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<SafeUser> {
    const result = await this.authService.login(input);
    response.cookie(SESSION_COOKIE, result.token, {
      ...this.getCookieOptions(),
      maxAge: SESSION_TTL_MS,
      expires: result.expiresAt,
    });
    return result.user;
  }

  @Post('logout')
  @HttpCode(204)
  @UseGuards(SessionAuthGuard)
  async logout(
    @Req() request: Request & AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.authService.logout(request.auth!.sessionId);
    response.clearCookie(SESSION_COOKIE, this.getCookieOptions());
  }

  @Get('me')
  @UseGuards(SessionAuthGuard)
  getMe(@Req() request: Request & AuthenticatedRequest): SafeUser {
    return request.auth!.user;
  }
}
