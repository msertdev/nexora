import {
  BadRequestException,
  ConflictException,
  GoneException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'node:crypto';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { EmailDeliveryService } from './email-delivery.service.js';

const VERIFICATION_TTL_MS = 30 * 60 * 1000;

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

function isPrismaError(error: unknown, code: string) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError && error.code === code
  );
}

@Injectable()
export class EmailVerificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly emailDelivery: EmailDeliveryService,
  ) {}

  async requestVerification(userId: string) {
    let user: { email: string; emailVerifiedAt: Date | null } | null;
    try {
      user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { email: true, emailVerifiedAt: true },
      });
    } catch {
      throw new ServiceUnavailableException('Email verification unavailable');
    }
    if (!user) throw new NotFoundException('Account not found');
    if (user.emailVerifiedAt) return { status: 'verified' as const };

    const token = randomBytes(32).toString('base64url');
    const tokenHash = hashToken(token);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + VERIFICATION_TTL_MS);
    let verificationId: string;
    try {
      const record = await this.prisma.emailVerificationToken.create({
        data: { userId, tokenHash, expiresAt },
        select: { id: true },
      });
      verificationId = record.id;
    } catch {
      throw new ServiceUnavailableException('Email verification unavailable');
    }

    const verificationUrl = new URL(
      '/verify-email',
      this.config.getOrThrow<string>('FRONTEND_ORIGIN'),
    );
    verificationUrl.hash = new URLSearchParams({ token }).toString();
    try {
      await this.emailDelivery.sendVerificationLink(
        user.email,
        verificationUrl.toString(),
      );
    } catch (error) {
      try {
        await this.prisma.emailVerificationToken.updateMany({
          where: { id: verificationId, usedAt: null, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      } catch {
        throw new ServiceUnavailableException(
          'Email verification could not be completed',
        );
      }
      throw error;
    }
    return { status: 'sent' as const };
  }

  async confirmVerification(token: string) {
    const tokenHash = hashToken(token);
    let record: {
      id: string;
      userId: string;
      expiresAt: Date;
      usedAt: Date | null;
      revokedAt: Date | null;
    } | null;
    try {
      record = await this.prisma.emailVerificationToken.findUnique({
        where: { tokenHash },
        select: {
          id: true,
          userId: true,
          expiresAt: true,
          usedAt: true,
          revokedAt: true,
        },
      });
    } catch {
      throw new ServiceUnavailableException('Email verification unavailable');
    }
    if (!record) throw new BadRequestException('Invalid verification token');
    if (record.revokedAt)
      throw new GoneException('Verification link is revoked');
    if (record.expiresAt <= new Date()) {
      throw new GoneException('Verification link has expired');
    }
    if (record.usedAt) {
      throw new ConflictException('Email address is already verified');
    }

    const now = new Date();
    try {
      await this.prisma.$transaction(
        async (transaction) => {
          const claimed = await transaction.emailVerificationToken.updateMany({
            where: {
              id: record.id,
              tokenHash,
              usedAt: null,
              revokedAt: null,
              expiresAt: { gt: now },
            },
            data: { usedAt: now },
          });
          if (claimed.count !== 1) {
            throw new ConflictException(
              'Verification link is no longer available',
            );
          }
          await transaction.user.update({
            where: { id: record.userId },
            data: { emailVerifiedAt: now },
            select: { id: true },
          });
          await transaction.emailVerificationToken.updateMany({
            where: {
              userId: record.userId,
              id: { not: record.id },
              usedAt: null,
              revokedAt: null,
            },
            data: { revokedAt: now },
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
      return { status: 'verified' as const };
    } catch (error) {
      if (error instanceof ConflictException) throw error;
      if (isPrismaError(error, 'P2034')) {
        throw new ConflictException('Verification link is no longer available');
      }
      throw new ServiceUnavailableException('Email verification unavailable');
    }
  }
}
