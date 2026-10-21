import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { EmailDeliveryService } from './email-delivery.service.js';
import { EmailVerificationService } from './email-verification.service.js';
import { SessionAuthGuard } from './session-auth.guard.js';

@Module({
  imports: [ConfigModule, PrismaModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    SessionAuthGuard,
    EmailDeliveryService,
    EmailVerificationService,
  ],
  exports: [SessionAuthGuard],
})
export class AuthModule {}
