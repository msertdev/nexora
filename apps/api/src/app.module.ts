import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { CsrfGuard } from './auth/csrf.guard.js';
import { AuthModule } from './auth/auth.module.js';
import { HealthModule } from './health/health.module.js';
import { OrganizationsModule } from './organizations/organizations.module.js';
import { PrismaModule } from './prisma/prisma.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      validate: (config: Record<string, unknown>) => {
        if (
          typeof config.DATABASE_URL !== 'string' ||
          config.DATABASE_URL.length === 0
        ) {
          throw new Error('DATABASE_URL environment variable is required');
        }

        const frontendOrigin = config.FRONTEND_ORIGIN;
        if (
          config.NODE_ENV === 'production' &&
          (typeof frontendOrigin !== 'string' || frontendOrigin.length === 0)
        ) {
          throw new Error('FRONTEND_ORIGIN is required in production');
        }

        const resolvedOrigin =
          typeof frontendOrigin === 'string'
            ? frontendOrigin
            : 'http://localhost:3000';
        let parsedOrigin: URL;
        try {
          parsedOrigin = new URL(resolvedOrigin);
        } catch {
          throw new Error('FRONTEND_ORIGIN must be a valid origin');
        }
        if (parsedOrigin.origin !== resolvedOrigin) {
          throw new Error('FRONTEND_ORIGIN must not include a path');
        }

        return { ...config, FRONTEND_ORIGIN: resolvedOrigin };
      },
    }),
    ThrottlerModule.forRoot([
      {
        ttl: 60_000,
        limit: 60,
      },
    ]),
    PrismaModule,
    AuthModule,
    OrganizationsModule,
    HealthModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_GUARD,
      useClass: CsrfGuard,
    },
  ],
})
export class AppModule {}
