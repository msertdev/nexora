import { ValidationPipe } from '@nestjs/common';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { Prisma } from '../generated/prisma/client.js';
import { AppModule } from '../app.module.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { SESSION_COOKIE } from '../auth/session-token.js';

describe('Organization endpoints', () => {
  let app: INestApplication<App>;
  const organizationId = 'fdcb570b-bb77-40c3-95dd-f61a12c438d0';
  const userId = 'c17013a8-1c2f-4b91-b7f2-d06c6b586c30';
  const sessionToken = Buffer.alloc(32, 9).toString('base64url');
  const sessionUser = {
    id: userId,
    email: 'owner@example.com',
    name: 'Example Owner',
  };
  const organization = {
    id: organizationId,
    name: 'Acme Team',
    slug: 'acme-team',
    createdAt: new Date('2026-10-20T12:00:00.000Z'),
    updatedAt: new Date('2026-10-20T12:00:00.000Z'),
  };
  const transaction = {
    organization: {
      create: vi.fn(),
    },
    membership: {
      create: vi.fn(),
    },
  };
  const prismaMock = {
    session: {
      findFirst: vi.fn(),
    },
    organization: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
    },
    membership: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    $transaction: vi.fn(),
  };

  beforeAll(async () => {
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
    vi.resetAllMocks();
    prismaMock.session.findFirst.mockResolvedValue({
      id: 'session-id',
      user: sessionUser,
    });
    prismaMock.organization.findUnique.mockResolvedValue(null);
    transaction.organization.create.mockImplementation(({ data }) => ({
      ...organization,
      name: data.name,
      slug: data.slug,
    }));
    transaction.membership.create.mockResolvedValue({ role: 'OWNER' });
    prismaMock.$transaction.mockImplementation(
      async (callback: (tx: typeof transaction) => Promise<unknown>) =>
        callback(transaction),
    );
    prismaMock.$transaction.mockImplementation(
      async (callback: (tx: typeof transaction) => Promise<unknown>) =>
        callback(transaction),
    );
  });

  const authenticatedRequest = {
    get(path: string) {
      return request(app.getHttpServer())
        .get(path)
        .set('Cookie', `${SESSION_COOKIE}=${sessionToken}`);
    },
    post(path: string) {
      return request(app.getHttpServer())
        .post(path)
        .set('Cookie', `${SESSION_COOKIE}=${sessionToken}`);
    },
  };

  it('rejects unauthenticated requests', async () => {
    await request(app.getHttpServer()).get('/api/organizations').expect(401);
    expect(prismaMock.session.findFirst).not.toHaveBeenCalled();
  });

  it('creates an organization with a normalized unique slug', async () => {
    await authenticatedRequest
      .post('/api/organizations')
      .set('Origin', 'http://localhost:3000')
      .send({ name: '  Acme Team  ' })
      .expect(201)
      .expect({
        ...organization,
        createdAt: organization.createdAt.toISOString(),
        updatedAt: organization.updatedAt.toISOString(),
        role: 'OWNER',
      });

    expect(prismaMock.$transaction).toHaveBeenCalledOnce();
    expect(transaction.organization.create).toHaveBeenCalledWith({
      data: { name: 'Acme Team', slug: 'acme-team' },
      select: expect.objectContaining({ id: true, slug: true }),
    });
  });

  it('assigns the authenticated user OWNER membership in the same transaction', async () => {
    await authenticatedRequest
      .post('/api/organizations')
      .set('Origin', 'http://localhost:3000')
      .send({ name: 'Acme Team', ownerId: 'attacker-id', role: 'MEMBER' })
      .expect(400);

    expect(prismaMock.$transaction).not.toHaveBeenCalled();

    await authenticatedRequest
      .post('/api/organizations')
      .set('Origin', 'http://localhost:3000')
      .send({ name: 'Acme Team' })
      .expect(201);

    expect(transaction.membership.create).toHaveBeenCalledWith({
      data: {
        organizationId,
        userId,
        role: 'OWNER',
      },
      select: { role: true },
    });
  });

  it('rolls back organization creation if owner membership creation fails', async () => {
    let transactionRolledBack = false;
    transaction.membership.create.mockRejectedValueOnce(
      new Error('sensitive database failure'),
    );
    prismaMock.$transaction.mockImplementationOnce(
      async (callback: (tx: typeof transaction) => Promise<unknown>) => {
        try {
          return await callback(transaction);
        } catch (error) {
          transactionRolledBack = true;
          throw error;
        }
      },
    );

    await authenticatedRequest
      .post('/api/organizations')
      .set('Origin', 'http://localhost:3000')
      .send({ name: 'Acme Team' })
      .expect(503)
      .expect({
        statusCode: 503,
        message: 'Organization unavailable',
        error: 'Service Unavailable',
      });

    expect(transaction.organization.create).toHaveBeenCalledOnce();
    expect(transactionRolledBack).toBe(true);
  });

  it('uses a suffixed slug when the normalized slug already exists', async () => {
    prismaMock.organization.findUnique
      .mockResolvedValueOnce({ id: 'existing-id' })
      .mockResolvedValueOnce(null);
    transaction.organization.create.mockResolvedValueOnce({
      ...organization,
      slug: 'acme-team-2',
    });

    const response = await authenticatedRequest
      .post('/api/organizations')
      .set('Origin', 'http://localhost:3000')
      .send({ name: 'Acme Team' })
      .expect(201);

    expect(response.body.slug).toBe('acme-team-2');
  });

  it('retries a slug uniqueness race and does not leak database errors', async () => {
    const uniqueError = new Prisma.PrismaClientKnownRequestError(
      'Unique constraint failed',
      { code: 'P2002', clientVersion: '7.10.1' },
    );
    prismaMock.$transaction
      .mockRejectedValueOnce(uniqueError)
      .mockImplementationOnce(
        async (callback: (tx: typeof transaction) => Promise<unknown>) =>
          callback(transaction),
      );

    const response = await authenticatedRequest
      .post('/api/organizations')
      .set('Origin', 'http://localhost:3000')
      .send({ name: 'Acme Team' })
      .expect(201);

    expect(response.body.slug).toBe('acme-team-2');
    expect(transaction.organization.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { name: 'Acme Team', slug: 'acme-team-2' },
      }),
    );
  });

  it('lists only the authenticated user organizations with their roles', async () => {
    prismaMock.membership.findMany.mockResolvedValue([
      { organization, role: 'OWNER' },
    ]);

    const response = await authenticatedRequest
      .get('/api/organizations')
      .expect(200);

    expect(response.body).toEqual([
      {
        ...organization,
        createdAt: organization.createdAt.toISOString(),
        updatedAt: organization.updatedAt.toISOString(),
        role: 'OWNER',
      },
    ]);
    expect(prismaMock.membership.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId },
      }),
    );
  });

  it('denies access to an organization without membership', async () => {
    prismaMock.membership.findUnique.mockResolvedValue(null);

    await authenticatedRequest
      .get(`/api/organizations/${organizationId}`)
      .expect(404)
      .expect({
        statusCode: 404,
        message: 'Organization not found',
        error: 'Not Found',
      });

    expect(prismaMock.organization.findFirst).not.toHaveBeenCalled();
  });

  it('scopes organization detail queries to the authenticated member', async () => {
    prismaMock.membership.findUnique.mockResolvedValue({ role: 'ADMIN' });
    prismaMock.organization.findFirst.mockResolvedValue({
      ...organization,
      memberships: [{ role: 'ADMIN' }],
    });

    const response = await authenticatedRequest
      .get(`/api/organizations/${organizationId}`)
      .expect(200);

    expect(response.body.role).toBe('ADMIN');
    expect(prismaMock.organization.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: organizationId,
          memberships: { some: { userId } },
        },
      }),
    );
  });

  it('returns safe member fields and scopes members to a shared organization', async () => {
    prismaMock.membership.findUnique.mockResolvedValue({ role: 'MEMBER' });
    prismaMock.membership.findMany.mockResolvedValue([
      {
        role: 'OWNER',
        user: {
          id: userId,
          name: sessionUser.name,
          email: sessionUser.email,
        },
      },
    ]);

    const response = await authenticatedRequest
      .get(`/api/organizations/${organizationId}/members`)
      .expect(200);

    expect(response.body).toEqual([
      {
        role: 'OWNER',
        user: sessionUser,
      },
    ]);
    expect(JSON.stringify(response.body)).not.toContain('passwordHash');
    expect(JSON.stringify(response.body)).not.toContain('sessions');
    expect(prismaMock.membership.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organizationId,
          organization: { memberships: { some: { userId } } },
        },
        select: {
          role: true,
          user: { select: { id: true, name: true, email: true } },
        },
      }),
    );
  });
});
