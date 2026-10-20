import {
  ConflictException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { LoginDto } from './dto/login.dto.js';
import { RegisterDto } from './dto/register.dto.js';
import { SafeUser } from './auth.types.js';
import {
  createSessionToken,
  hashSessionToken,
  SESSION_TTL_MS,
} from './session-token.js';
import * as argon2 from 'argon2';
import { randomBytes } from 'node:crypto';

const ARGON2_OPTIONS: argon2.HashOptions = {
  type: argon2.argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
};

@Injectable()
export class AuthService {
  private readonly dummyPasswordHash = argon2.hash(
    randomBytes(32).toString('hex'),
    ARGON2_OPTIONS,
  );

  constructor(private readonly prisma: PrismaService) {}

  async register(input: RegisterDto): Promise<SafeUser> {
    const email = input.email.trim().toLowerCase();
    try {
      const existing = await this.prisma.user.findUnique({
        where: { email },
        select: { id: true },
      });
      if (existing) {
        throw new ConflictException('Unable to register with these details');
      }
    } catch (error) {
      if (error instanceof ConflictException) {
        throw error;
      }
      throw new ServiceUnavailableException('Authentication unavailable');
    }

    const passwordHash = await argon2.hash(input.password, ARGON2_OPTIONS);
    try {
      return await this.prisma.user.create({
        data: {
          email,
          name: input.name.trim(),
          passwordHash,
        },
        select: {
          id: true,
          email: true,
          name: true,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Unable to register with these details');
      }
      throw new ServiceUnavailableException('Authentication unavailable');
    }
  }

  async login(input: LoginDto): Promise<{
    user: SafeUser;
    token: string;
    expiresAt: Date;
  }> {
    const email = input.email.trim().toLowerCase();
    let user: {
      id: string;
      email: string;
      name: string;
      passwordHash: string | null;
    } | null;
    try {
      user = await this.prisma.user.findUnique({
        where: { email },
        select: {
          id: true,
          email: true,
          name: true,
          passwordHash: true,
        },
      });
    } catch {
      throw new ServiceUnavailableException('Authentication unavailable');
    }

    const storedHash = user?.passwordHash ?? (await this.dummyPasswordHash);
    let passwordMatches = false;
    try {
      passwordMatches = await argon2.verify(storedHash, input.password);
    } catch {
      passwordMatches = false;
    }
    if (!user || !user.passwordHash || !passwordMatches) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const token = createSessionToken();
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
    try {
      await this.prisma.session.create({
        data: {
          tokenHash: hashSessionToken(token),
          userId: user.id,
          expiresAt,
        },
        select: { id: true },
      });
    } catch {
      throw new ServiceUnavailableException('Authentication unavailable');
    }

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
      token,
      expiresAt,
    };
  }

  async logout(sessionId: string): Promise<void> {
    try {
      await this.prisma.session.updateMany({
        where: {
          id: sessionId,
          revokedAt: null,
        },
        data: {
          revokedAt: new Date(),
        },
      });
    } catch {
      throw new ServiceUnavailableException('Authentication unavailable');
    }
  }
}
