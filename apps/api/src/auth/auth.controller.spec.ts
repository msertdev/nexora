import { ValidationPipe } from '@nestjs/common';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as argon2 from 'argon2';
import { createHash } from 'node:crypto';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from '../app.module.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { SESSION_COOKIE, hashSessionToken } from './session-token.js';

describe('Authentication endpoints', () => {
  let app: INestApplication<App>;
  let passwordHash: string;
  const user = {
    id: 'c17013a8-1c2f-4b91-b7f2-d06c6b586c30',
    email: 'person@example.com',
    name: 'Example Person',
    emailVerified: false,
  };
  const sessionToken = Buffer.alloc(32, 7).toString('base64url');
  const prismaMock = {
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    session: {
      findFirst: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
    },
    $queryRaw: vi.fn(),
  };

  beforeAll(async () => {
    passwordHash = await argon2.hash('Correct horse battery staple 42!');
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prismaMock)
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects invalid registration input', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/register')
      .set('Origin', 'http://localhost:3000')
      .send({
        email: 'not-an-email',
        name: 'Example',
        password: 'short',
      })
      .expect(400);

    expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
  });

  it('normalizes registration email and returns only safe user fields', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    prismaMock.user.create.mockImplementation(async ({ data }) => ({
      id: user.id,
      email: data.email,
      name: data.name,
      emailVerifiedAt: null,
    }));

    const response = await request(app.getHttpServer())
      .post('/api/auth/register')
      .set('Origin', 'http://localhost:3000')
      .send({
        email: '  PERSON@Example.com ',
        name: ' Example Person ',
        password: 'Correct horse battery staple 42!',
      })
      .expect(201);

    expect(response.body).toEqual(user);
    expect(response.body).not.toHaveProperty('passwordHash');
    expect(prismaMock.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          email: user.email,
          name: user.name,
        }),
      }),
    );
    const createArgs = prismaMock.user.create.mock.calls[0][0];
    expect(createArgs.data.passwordHash).not.toBe(
      'Correct horse battery staple 42!',
    );
    await expect(
      argon2.verify(
        createArgs.data.passwordHash,
        'Correct horse battery staple 42!',
      ),
    ).resolves.toBe(true);
  });

  it('rejects duplicate registrations without exposing account details', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: user.id });

    await request(app.getHttpServer())
      .post('/api/auth/register')
      .set('Origin', 'http://localhost:3000')
      .send({
        email: user.email,
        name: user.name,
        password: 'Correct horse battery staple 42!',
      })
      .expect(409)
      .expect({
        message: 'Unable to register with these details',
        error: 'Conflict',
        statusCode: 409,
      });

    expect(prismaMock.user.create).not.toHaveBeenCalled();
  });

  it('logs in and places a random session token only in an HttpOnly cookie', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      ...user,
      passwordHash,
      emailVerifiedAt: null,
    });
    prismaMock.session.create.mockResolvedValue({ id: 'session-id' });

    const response = await request(app.getHttpServer())
      .post('/api/auth/login')
      .set('Origin', 'http://localhost:3000')
      .send({
        email: 'PERSON@EXAMPLE.COM',
        password: 'Correct horse battery staple 42!',
      })
      .expect(200);

    expect(response.body).toEqual(user);
    expect(response.body).not.toHaveProperty('token');
    const cookie = response.headers['set-cookie'][0] as string;
    expect(cookie).toContain(`${SESSION_COOKIE}=`);
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).toContain('Path=/api');
    const token = cookie.split(';')[0].slice(`${SESSION_COOKIE}=`.length);
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(prismaMock.session.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tokenHash: hashSessionToken(token),
          userId: user.id,
        }),
      }),
    );
  });

  it('returns the same generic error for invalid credentials', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      ...user,
      passwordHash,
      emailVerifiedAt: null,
    });

    await request(app.getHttpServer())
      .post('/api/auth/login')
      .set('Origin', 'http://localhost:3000')
      .send({
        email: user.email,
        password: 'not the correct password',
      })
      .expect(401)
      .expect({
        message: 'Invalid email or password',
        error: 'Unauthorized',
        statusCode: 401,
      });

    expect(prismaMock.session.create).not.toHaveBeenCalled();
  });

  it('accepts a valid session and returns only safe user fields', async () => {
    prismaMock.session.findFirst.mockResolvedValue({
      id: 'session-id',
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        emailVerifiedAt: null,
      },
    });

    const response = await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Cookie', `${SESSION_COOKIE}=${sessionToken}`)
      .expect(200);

    expect(response.body).toEqual(user);
    expect(response.body).not.toHaveProperty('passwordHash');
  });

  it('exposes only a boolean email verification status from the persisted account', async () => {
    prismaMock.session.findFirst.mockResolvedValue({
      id: 'session-id',
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        emailVerifiedAt: new Date(),
      },
    });

    await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Cookie', `${SESSION_COOKIE}=${sessionToken}`)
      .expect(200)
      .expect({
        ...user,
        emailVerified: true,
      });

    expect(prismaMock.session.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          user: {
            select: expect.objectContaining({ emailVerifiedAt: true }),
          },
        }),
      }),
    );
  });

  it('rejects expired or revoked sessions', async () => {
    prismaMock.session.findFirst.mockResolvedValue(null);

    await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Cookie', `${SESSION_COOKIE}=${sessionToken}`)
      .expect(401);

    expect(prismaMock.session.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tokenHash: createHash('sha256').update(sessionToken).digest('hex'),
          revokedAt: null,
          expiresAt: { gt: expect.any(Date) },
        }),
      }),
    );
  });

  it('rejects unauthenticated requests', async () => {
    await request(app.getHttpServer()).get('/api/auth/me').expect(401);
  });

  it('revokes the current session and clears the cookie on logout', async () => {
    prismaMock.session.findFirst.mockResolvedValue({
      id: 'session-id',
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        emailVerifiedAt: null,
      },
    });
    prismaMock.session.updateMany.mockResolvedValue({ count: 1 });

    const response = await request(app.getHttpServer())
      .post('/api/auth/logout')
      .set('Origin', 'http://localhost:3000')
      .set('Cookie', `${SESSION_COOKIE}=${sessionToken}`)
      .expect(204);

    expect(prismaMock.session.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'session-id',
        revokedAt: null,
      },
      data: {
        revokedAt: expect.any(Date),
      },
    });
    expect(response.headers['set-cookie'][0]).toContain(`${SESSION_COOKIE}=;`);
  });

  it('rejects state-changing requests from an untrusted origin', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .set('Origin', 'https://attacker.example')
      .send({
        email: user.email,
        password: 'Correct horse battery staple 42!',
      })
      .expect(403);

    expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
  });
});
