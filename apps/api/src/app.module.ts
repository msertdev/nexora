import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { fileURLToPath } from 'node:url';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { CsrfGuard } from './auth/csrf.guard.js';
import { AuthModule } from './auth/auth.module.js';
import { HealthModule } from './health/health.module.js';
import { OrganizationsModule } from './organizations/organizations.module.js';
import { ProjectsModule } from './projects/projects.module.js';
import { PrismaModule } from './prisma/prisma.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: fileURLToPath(new URL('../.env', import.meta.url)),
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

        const smtpHost =
          typeof config.SMTP_HOST === 'string' ? config.SMTP_HOST.trim() : '';
        const smtpFrom =
          typeof config.SMTP_FROM === 'string' ? config.SMTP_FROM.trim() : '';
        const smtpPort =
          typeof config.SMTP_PORT === 'string'
            ? Number(config.SMTP_PORT)
            : undefined;
        const smtpSecure = config.SMTP_SECURE;
        const smtpUser =
          typeof config.SMTP_USER === 'string' ? config.SMTP_USER.trim() : '';
        const smtpPassword =
          typeof config.SMTP_PASSWORD === 'string'
            ? config.SMTP_PASSWORD
            : '';

        if ((smtpUser && !smtpPassword) || (!smtpUser && smtpPassword)) {
          throw new Error('SMTP_USER and SMTP_PASSWORD must be configured together');
        }
        if (
          (smtpPort !== undefined &&
            (!Number.isInteger(smtpPort) || smtpPort < 1 || smtpPort > 65535)) ||
          (smtpSecure !== undefined &&
            typeof smtpSecure !== 'string') ||
          (typeof smtpSecure === 'string' &&
            !['true', 'false'].includes(smtpSecure))
        ) {
          throw new Error('SMTP_PORT or SMTP_SECURE has an invalid value');
        }
        if (Boolean(smtpHost) !== Boolean(smtpFrom)) {
          throw new Error('SMTP_HOST and SMTP_FROM must be configured together');
        }
        if (smtpHost && (!smtpPort || smtpSecure === undefined)) {
          throw new Error(
            'SMTP_PORT and SMTP_SECURE are required when SMTP is configured',
          );
        }
        if (
          smtpFrom &&
          !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(smtpFrom)
        ) {
          throw new Error('SMTP_FROM must be a valid email address');
        }
        const publicAppUrl =
          typeof config.PUBLIC_APP_URL === 'string'
            ? config.PUBLIC_APP_URL.trim()
            : '';
        const normalizedSmtpHost = smtpHost
          .toLowerCase()
          .replace(/^\[|\]$/g, '')
          .replace(/\.$/, '');
        if (smtpHost && !publicAppUrl) {
          throw new Error('PUBLIC_APP_URL is required when SMTP is configured');
        }
        if (publicAppUrl) {
          let parsedPublicAppUrl: URL;
          try {
            parsedPublicAppUrl = new URL(publicAppUrl);
          } catch {
            throw new Error('PUBLIC_APP_URL must be a valid absolute URL');
          }
          if (
            !['http:', 'https:'].includes(parsedPublicAppUrl.protocol) ||
            parsedPublicAppUrl.username ||
            parsedPublicAppUrl.password ||
            parsedPublicAppUrl.pathname !== '/' ||
            parsedPublicAppUrl.search ||
            parsedPublicAppUrl.hash ||
            parsedPublicAppUrl.toString().replace(/\/$/, '') !==
              publicAppUrl.replace(/\/$/, '')
          ) {
            throw new Error(
              'PUBLIC_APP_URL must be an origin without credentials, path, query or fragment',
            );
          }
        }
        if (
          config.NODE_ENV === 'production' &&
          (!smtpHost || !smtpFrom || !smtpPort || smtpSecure === undefined)
        ) {
          throw new Error('SMTP_HOST, SMTP_PORT, SMTP_SECURE and SMTP_FROM are required in production');
        }
        if (
          config.NODE_ENV === 'production' &&
          (smtpPort === 1025 ||
            normalizedSmtpHost === 'localhost' ||
            normalizedSmtpHost.endsWith('.localhost') ||
            normalizedSmtpHost.startsWith('127.') ||
            normalizedSmtpHost === '::1' ||
            normalizedSmtpHost === 'mailpit')
        ) {
          throw new Error('Local development SMTP endpoints are not allowed in production');
        }
        if (
          config.NODE_ENV === 'production' &&
          !publicAppUrl.startsWith('https://')
        ) {
          throw new Error('PUBLIC_APP_URL must use HTTPS in production');
        }
        const trustProxyHops =
          typeof config.TRUST_PROXY_HOPS === 'string'
            ? Number(config.TRUST_PROXY_HOPS)
            : 0;
        if (
          !Number.isInteger(trustProxyHops) ||
          trustProxyHops < 0 ||
          trustProxyHops > 3 ||
          (config.NODE_ENV === 'production' && trustProxyHops !== 1)
        ) {
          throw new Error(
            'TRUST_PROXY_HOPS must be 1 in production and between 0 and 3 otherwise',
          );
        }

        return {
          ...config,
          FRONTEND_ORIGIN: resolvedOrigin,
          TRUST_PROXY_HOPS: String(trustProxyHops),
          ...(publicAppUrl
            ? { PUBLIC_APP_URL: publicAppUrl.replace(/\/$/, '') }
            : {}),
        };
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
    ProjectsModule,
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
