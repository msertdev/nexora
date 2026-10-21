import { ValidationPipe } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { createHash } from 'node:crypto';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../app.module.js';
import { SESSION_COOKIE } from '../auth/session-token.js';
import { PrismaService } from '../prisma/prisma.service.js';

describe('Team collaboration endpoints (mocked Prisma)', () => {
  let app: INestApplication<App>;
  const organizationId = 'fdcb570b-bb77-40c3-95dd-f61a12c438d0';
  const invitationId = '6ed463d6-d31a-4a0e-a913-94130ab22fd4';
  const ownerId = 'c17013a8-1c2f-4b91-b7f2-d06c6b586c30';
  const memberId = 'b27b4c26-b82b-4604-8e47-c117bef04ca9';
  const sessionToken = Buffer.alloc(32, 5).toString('base64url');
  const rawInvitationToken = Buffer.alloc(32, 7).toString('base64url');
  const activeInvitation = {
    id: invitationId,
    organizationId,
    email: 'invitee@example.com',
    role: 'MEMBER',
    expiresAt: new Date(Date.now() + 60_000),
    acceptedAt: null,
    revokedAt: null,
  };

  const transaction = {
    membership: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      deleteMany: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    invitation: {
      findFirst: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
    },
    issue: {
      updateMany: vi.fn(),
    },
    emailVerificationToken: {
      updateMany: vi.fn(),
    },
  };

  const prismaMock = {
    session: { findFirst: vi.fn() },
    membership: {
      findUnique: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
    invitation: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    emailVerificationToken: {
      create: vi.fn(),
      findUnique: vi.fn(),
      updateMany: vi.fn(),
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
      user: {
        id: ownerId,
        email: 'owner@example.com',
        name: 'Example Owner',
      },
    });
    prismaMock.membership.findUnique.mockResolvedValue({ role: 'OWNER' });
    prismaMock.user.findUnique.mockResolvedValue({
      email: 'owner@example.com',
      emailVerifiedAt: null,
    });
    prismaMock.emailVerificationToken.create.mockResolvedValue({
      id: 'verification-id',
    });
    prismaMock.emailVerificationToken.findUnique.mockResolvedValue(null);
    transaction.membership.findUnique.mockImplementation(({ where }) =>
      where.organizationId_userId.userId === ownerId ? { role: 'OWNER' } : null,
    );
    transaction.user.findUnique.mockResolvedValue({
      email: 'invitee@example.com',
      emailVerifiedAt: new Date(),
    });
    transaction.invitation.findFirst.mockResolvedValue(null);
    transaction.invitation.create.mockImplementation(({ data }) => ({
      ...activeInvitation,
      email: data.email,
      role: data.role,
      expiresAt: data.expiresAt,
      createdAt: new Date(),
      invitedBy: {
        id: ownerId,
        email: 'owner@example.com',
        name: 'Example Owner',
      },
    }));
    transaction.invitation.updateMany.mockResolvedValue({ count: 1 });
    transaction.membership.create.mockResolvedValue({ id: 'membership-id' });
    transaction.membership.update.mockResolvedValue({});
    transaction.membership.deleteMany.mockResolvedValue({ count: 1 });
    transaction.issue.updateMany.mockResolvedValue({ count: 0 });
    transaction.emailVerificationToken.updateMany.mockResolvedValue({
      count: 0,
    });
    transaction.user.update.mockResolvedValue({ id: ownerId });
    prismaMock.$transaction.mockImplementation(
      async (callback: (tx: typeof transaction) => Promise<unknown>) =>
        callback(transaction),
    );
  });

  function authenticated(
    method: 'get' | 'post' | 'patch' | 'delete',
    path: string,
  ) {
    return request(app.getHttpServer())
      [method](path)
      .set('Cookie', `${SESSION_COOKIE}=${sessionToken}`)
      .set('Origin', 'http://localhost:3000');
  }

  const invitationPath = `/api/organizations/${organizationId}/invitations`;
  const membersPath = `/api/organizations/${organizationId}/members`;

  it('requires authentication and the existing Origin-based CSRF protection', async () => {
    await request(app.getHttpServer())
      .post(`${invitationPath}/${invitationId}/revoke`)
      .set('Origin', 'http://localhost:3000')
      .send({ email: 'invitee@example.com', role: 'MEMBER' })
      .expect(401);

    await request(app.getHttpServer())
      .post(`${invitationPath}/${invitationId}/revoke`)
      .set('Cookie', `${SESSION_COOKIE}=${sessionToken}`)
      .send({ email: 'invitee@example.com', role: 'MEMBER' })
      .expect(403);
  });

  it('lets OWNER create an invitation and returns a one-time link, not its token hash', async () => {
    const response = await authenticated('post', invitationPath)
      .send({ email: ' Invitee@Example.com ', role: 'MEMBER' })
      .expect(201);

    const token = new URLSearchParams(
      new URL(response.body.invitationLink).hash.slice(1),
    ).get('token');
    expect(token).toBeTruthy();
    expect(response.body.email).toBe('invitee@example.com');
    expect(response.body).not.toHaveProperty('tokenHash');
    expect(transaction.invitation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          email: 'invitee@example.com',
          role: 'MEMBER',
          tokenHash: createHash('sha256').update(token!).digest('hex'),
        }),
      }),
    );
    expect(
      transaction.invitation.create.mock.calls[0]?.[0].data.tokenHash,
    ).not.toBe(token);
  });

  it('allows ADMIN to invite MEMBER but denies ADMIN invitation and MEMBER invitations', async () => {
    prismaMock.membership.findUnique.mockResolvedValue({ role: 'ADMIN' });
    transaction.membership.findUnique.mockImplementation(({ where }) =>
      where.organizationId_userId.userId === ownerId ? { role: 'ADMIN' } : null,
    );

    await authenticated('post', invitationPath)
      .send({ email: 'member@example.com', role: 'MEMBER' })
      .expect(201);

    await authenticated('post', invitationPath)
      .send({ email: 'admin@example.com', role: 'ADMIN' })
      .expect(403);

    prismaMock.membership.findUnique.mockResolvedValue({ role: 'MEMBER' });
    await authenticated('post', invitationPath)
      .send({ email: 'member2@example.com', role: 'MEMBER' })
      .expect(403);
  });

  it('does not expose invitation tokens in the pending invitation list', async () => {
    prismaMock.invitation.findMany.mockResolvedValue([
      {
        ...activeInvitation,
        createdAt: new Date(),
        invitedBy: { id: ownerId, email: 'owner@example.com', name: 'Owner' },
      },
    ]);

    const response = await authenticated('get', invitationPath).expect(200);
    expect(response.body[0]).not.toHaveProperty('tokenHash');
    expect(response.body[0]).not.toHaveProperty('invitationLink');
  });

  it('rejects duplicate active invitations and redundant memberships generically', async () => {
    transaction.user.findUnique.mockResolvedValue({ id: memberId });
    transaction.membership.findUnique.mockImplementation(({ where }) =>
      where.organizationId_userId.userId === ownerId
        ? { role: 'OWNER' }
        : { id: 'existing-membership' },
    );
    await authenticated('post', invitationPath)
      .send({ email: 'member@example.com', role: 'MEMBER' })
      .expect(409)
      .expect(({ body }) => {
        expect(body.message).toBe(
          'Unable to create an invitation with these details',
        );
      });

    transaction.user.findUnique.mockResolvedValue(null);
    transaction.membership.findUnique.mockImplementation(({ where }) =>
      where.organizationId_userId.userId === ownerId ? { role: 'OWNER' } : null,
    );
    transaction.invitation.findFirst.mockResolvedValue({ id: invitationId });
    await authenticated('post', invitationPath)
      .send({ email: 'member@example.com', role: 'MEMBER' })
      .expect(409)
      .expect(({ body }) => {
        expect(body.message).toBe(
          'Unable to create an invitation with these details',
        );
      });
  });

  it('lets OWNER revoke an invitation and scopes it to its organization', async () => {
    transaction.invitation.findFirst.mockResolvedValue({
      id: invitationId,
      role: 'MEMBER',
      acceptedAt: null,
      revokedAt: null,
    });
    await authenticated(
      'post',
      `${invitationPath}/${invitationId}/revoke`,
    ).expect(201);
    expect(transaction.invitation.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: invitationId,
          organizationId,
          acceptedAt: null,
          revokedAt: null,
        }),
      }),
    );
  });

  it('rejects accepting an invitation from an unverified account or a different email', async () => {
    prismaMock.invitation.findUnique.mockResolvedValue(activeInvitation);
    transaction.user.findUnique.mockResolvedValue({
      email: 'invitee@example.com',
      emailVerifiedAt: null,
    });
    await authenticated('post', '/api/invitations/accept')
      .send({ token: rawInvitationToken })
      .expect(403);
    expect(transaction.membership.create).not.toHaveBeenCalled();

    transaction.user.findUnique.mockResolvedValue({
      email: 'other@example.com',
      emailVerifiedAt: new Date(),
    });
    await authenticated('post', '/api/invitations/accept')
      .send({ token: rawInvitationToken })
      .expect(403);
    expect(transaction.membership.create).not.toHaveBeenCalled();
  });

  it('accepts a verified matching invitation once in one transaction', async () => {
    prismaMock.invitation.findUnique.mockResolvedValue(activeInvitation);
    const response = await authenticated('post', '/api/invitations/accept')
      .send({ token: rawInvitationToken })
      .expect(201);

    expect(response.body).toEqual({ organizationId, role: 'MEMBER' });
    expect(transaction.invitation.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tokenHash: createHash('sha256')
            .update(rawInvitationToken)
            .digest('hex'),
          acceptedAt: null,
          revokedAt: null,
        }),
      }),
    );
    expect(transaction.membership.create).toHaveBeenCalledWith({
      data: { organizationId, userId: ownerId, role: 'MEMBER' },
      select: { id: true },
    });
  });

  it('rejects expired, revoked, reused and concurrently claimed invitations', async () => {
    prismaMock.invitation.findUnique.mockResolvedValue({
      ...activeInvitation,
      expiresAt: new Date(Date.now() - 1),
    });
    await authenticated('post', '/api/invitations/accept')
      .send({ token: rawInvitationToken })
      .expect(410);

    prismaMock.invitation.findUnique.mockResolvedValue({
      ...activeInvitation,
      revokedAt: new Date(),
    });
    await authenticated('post', '/api/invitations/accept')
      .send({ token: rawInvitationToken })
      .expect(410);

    prismaMock.invitation.findUnique.mockResolvedValue({
      ...activeInvitation,
      acceptedAt: new Date(),
    });
    await authenticated('post', '/api/invitations/accept')
      .send({ token: rawInvitationToken })
      .expect(409);

    prismaMock.invitation.findUnique.mockResolvedValue(activeInvitation);
    transaction.invitation.updateMany.mockResolvedValueOnce({ count: 0 });
    await authenticated('post', '/api/invitations/accept')
      .send({ token: rawInvitationToken })
      .expect(409);
    expect(transaction.membership.create).not.toHaveBeenCalled();
  });

  it('prevents role escalation and keeps owners from being removed without transfer', async () => {
    await authenticated('patch', `${membersPath}/${memberId}`)
      .send({ role: 'OWNER' })
      .expect(400);

    transaction.membership.findUnique
      .mockResolvedValueOnce({ role: 'OWNER' })
      .mockResolvedValueOnce({ role: 'MEMBER' });
    await authenticated('patch', `${membersPath}/${memberId}`)
      .send({ role: 'ADMIN' })
      .expect(200);
    expect(transaction.membership.update).toHaveBeenCalled();

    transaction.membership.findUnique
      .mockResolvedValueOnce({ role: 'OWNER' })
      .mockResolvedValueOnce({ role: 'OWNER' });
    await authenticated('delete', `${membersPath}/${ownerId}`).expect(409);
    expect(transaction.membership.deleteMany).not.toHaveBeenCalled();
  });

  it('does not let ADMIN change member roles', async () => {
    prismaMock.membership.findUnique.mockResolvedValue({ role: 'ADMIN' });
    await authenticated('patch', `${membersPath}/${memberId}`)
      .send({ role: 'ADMIN' })
      .expect(403);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('limits ADMIN removal to MEMBER and clears only this organization assignments', async () => {
    prismaMock.membership.findUnique.mockResolvedValue({ role: 'ADMIN' });
    transaction.membership.findUnique
      .mockResolvedValueOnce({ role: 'ADMIN' })
      .mockResolvedValueOnce({ role: 'ADMIN' });
    await authenticated('delete', `${membersPath}/${memberId}`).expect(403);

    transaction.membership.findUnique
      .mockResolvedValueOnce({ role: 'ADMIN' })
      .mockResolvedValueOnce({ role: 'MEMBER' });
    await authenticated('delete', `${membersPath}/${memberId}`).expect(200);
    expect(transaction.issue.updateMany).toHaveBeenCalledWith({
      where: { assigneeId: memberId, project: { organizationId } },
      data: { assigneeId: null },
    });
  });

  it('rejects cross-organization member routes before mutation', async () => {
    prismaMock.membership.findUnique.mockResolvedValue(null);
    await authenticated(
      'delete',
      `/api/organizations/6ed463d6-d31a-4a0e-a913-94130ab22fd4/members/${memberId}`,
    ).expect(404);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('never returns an email-verification secret when delivery is unavailable', async () => {
    const response = await authenticated(
      'post',
      '/api/auth/email-verification/request',
    ).expect(503);

    expect(response.body.message).toBe(
      'Email verification delivery is not configured',
    );
    expect(prismaMock.emailVerificationToken.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: ownerId,
          tokenHash: expect.stringMatching(/^[a-f0-9]{64}$/),
          expiresAt: expect.any(Date),
        }),
      }),
    );
    expect(prismaMock.emailVerificationToken.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'verification-id', usedAt: null, revokedAt: null },
      }),
    );
  });

  it('confirms a one-time email verification token transactionally', async () => {
    const token = Buffer.alloc(32, 8).toString('base64url');
    prismaMock.emailVerificationToken.findUnique.mockResolvedValue({
      id: 'verification-id',
      userId: ownerId,
      expiresAt: new Date(Date.now() + 60_000),
      usedAt: null,
      revokedAt: null,
    });
    transaction.emailVerificationToken.updateMany.mockResolvedValue({
      count: 1,
    });

    await authenticated('post', '/api/auth/email-verification/confirm')
      .send({ token })
      .expect(200)
      .expect(({ body }) => expect(body).toEqual({ status: 'verified' }));

    expect(prismaMock.emailVerificationToken.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tokenHash: createHash('sha256').update(token).digest('hex'),
        },
      }),
    );
    expect(transaction.user.update).toHaveBeenCalledWith({
      where: { id: ownerId },
      data: { emailVerifiedAt: expect.any(Date) },
      select: { id: true },
    });
  });
});
