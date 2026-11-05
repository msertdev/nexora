import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../app.module.js';
import { SESSION_COOKIE } from '../auth/session-token.js';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

describe('Issue comments (mocked Prisma)', () => {
  let app: INestApplication<App>;
  const organizationId = 'fdcb570b-bb77-40c3-95dd-f61a12c438d0';
  const projectId = '6ed463d6-d31a-4a0e-a913-94130ab22fd4';
  const issueId = 'b27b4c26-b82b-4604-8e47-c117bef04ca9';
  const commentId = '7c84d980-0081-4d7d-8ad5-a1295d307c66';
  const userId = 'c17013a8-1c2f-4b91-b7f2-d06c6b586c30';
  const otherUserId = 'dd3ed7a2-bf73-4a46-b21e-85b79b5c632c';
  const path =
    '/api/organizations/' +
    organizationId +
    '/projects/' +
    projectId +
    '/issues/' +
    issueId +
    '/comments';
  const comment = {
    id: commentId,
    issueId,
    authorId: userId,
    body: 'A useful update',
    createdAt: new Date('2026-11-04T00:00:00Z'),
    updatedAt: new Date('2026-11-04T00:00:00Z'),
    author: { id: userId, name: 'Member' },
  };
  const prisma = {
    session: { findFirst: vi.fn() },
    membership: { findUnique: vi.fn() },
    issue: { findFirst: vi.fn() },
    comment: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      deleteMany: vi.fn(),
    },
    $transaction: vi.fn(),
  };

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .compile();
    app = module.createNestApplication();
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
    prisma.session.findFirst.mockResolvedValue({
      id: 'session-id',
      user: {
        id: userId,
        name: 'Member',
        email: 'member@example.com',
        emailVerifiedAt: new Date(),
      },
    });
    prisma.membership.findUnique.mockResolvedValue({ role: 'MEMBER' });
    prisma.issue.findFirst.mockResolvedValue({ id: issueId });
    prisma.comment.findFirst.mockResolvedValue(comment);
    prisma.comment.findMany.mockResolvedValue([comment]);
    prisma.comment.count.mockResolvedValue(1);
    prisma.comment.create.mockResolvedValue(comment);
    prisma.comment.update.mockResolvedValue(comment);
    prisma.comment.deleteMany.mockResolvedValue({ count: 1 });
    prisma.$transaction.mockImplementation(
      (callback: (tx: typeof prisma) => Promise<unknown>) => callback(prisma),
    );
  });

  function call(method: 'get' | 'post' | 'patch' | 'delete', url = path) {
    return request(app.getHttpServer())
      [method](url)
      .set(
        'Cookie',
        SESSION_COOKIE + '=' + Buffer.alloc(32, 9).toString('base64url'),
      )
      .set('Origin', 'http://localhost:3000');
  }

  it('lists a bounded chronological page with safe author fields', async () => {
    await call('get', path + '?page=2&limit=10')
      .expect(200)
      .expect((response) => {
        expect(response.body.page).toBe(2);
        expect(response.body.items[0].author).toEqual({
          id: userId,
          name: 'Member',
        });
      });
    expect(prisma.comment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 10,
        take: 10,
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        select: expect.objectContaining({
          author: { select: { id: true, name: true } },
        }),
        where: {
          issueId,
          issue: { is: { projectId, project: { is: { organizationId } } } },
        },
      }),
    );
  });

  it('creates a trimmed comment using the authenticated author', async () => {
    await call('post').send({ body: '  A useful update  ' }).expect(201);
    expect(prisma.comment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { issueId, authorId: userId, body: 'A useful update' },
      }),
    );
  });

  it.each(['', '   ', null, 42, 'x'.repeat(10_001)])(
    'rejects invalid body %j',
    async (body) => {
      await call('post').send({ body }).expect(400);
      expect(prisma.comment.create).not.toHaveBeenCalled();
    },
  );

  it('rejects missing body and attempts to spoof an author', async () => {
    await call('post').send({}).expect(400);
    await call('post')
      .send({ body: 'Update', authorId: otherUserId })
      .expect(400);
    expect(prisma.comment.create).not.toHaveBeenCalled();
  });

  it.each(['page=0', 'page=1.5', 'limit=101', 'limit=0'])(
    'rejects invalid pagination %s',
    async (query) => {
      await call('get', path + '?' + query).expect(400);
      expect(prisma.comment.findMany).not.toHaveBeenCalled();
    },
  );

  it('rejects anonymous access and non-members before querying comments', async () => {
    prisma.session.findFirst.mockResolvedValueOnce(null);
    await call('get').expect(401);
    prisma.membership.findUnique.mockResolvedValueOnce(null);
    await call('get').expect(404);
    expect(prisma.comment.findMany).not.toHaveBeenCalled();
  });

  it('keeps the existing CSRF origin check on writes', async () => {
    await call('post')
      .set('Origin', 'https://untrusted.example')
      .send({ body: 'Update' })
      .expect(403);
    expect(prisma.comment.create).not.toHaveBeenCalled();
  });

  it('does not list or create comments for a mismatched organization, project or issue', async () => {
    prisma.issue.findFirst.mockResolvedValue(null);
    await call('get').expect(404);
    await call('post').send({ body: 'Update' }).expect(404);
    expect(prisma.issue.findFirst).toHaveBeenCalledWith({
      where: { id: issueId, projectId, project: { is: { organizationId } } },
      select: { id: true },
    });
    expect(prisma.comment.findMany).not.toHaveBeenCalled();
    expect(prisma.comment.create).not.toHaveBeenCalled();
  });

  it('allows an author to edit and delete their comment', async () => {
    await call('patch', path + '/' + commentId)
      .send({ body: ' Edited ' })
      .expect(200);
    expect(prisma.comment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: commentId,
          issueId,
          authorId: userId,
        }),
        data: { body: 'Edited' },
      }),
    );
    await call('delete', path + '/' + commentId).expect(204);
    expect(prisma.comment.deleteMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        id: commentId,
        issueId,
        authorId: userId,
      }),
    });
  });

  it('does not allow a MEMBER to edit or delete another author’s comment', async () => {
    prisma.comment.findFirst.mockResolvedValue({
      ...comment,
      authorId: otherUserId,
    });
    await call('patch', path + '/' + commentId)
      .send({ body: 'Edited' })
      .expect(403);
    await call('delete', path + '/' + commentId).expect(403);
    expect(prisma.comment.update).not.toHaveBeenCalled();
    expect(prisma.comment.deleteMany).not.toHaveBeenCalled();
  });

  it.each(['ADMIN', 'OWNER'])(
    'allows %s to delete but never edit another author’s comment',
    async (role) => {
      prisma.membership.findUnique.mockResolvedValue({ role });
      prisma.comment.findFirst.mockResolvedValue({
        ...comment,
        authorId: otherUserId,
      });
      await call('patch', path + '/' + commentId)
        .send({ body: 'Edited' })
        .expect(403);
      await call('delete', path + '/' + commentId).expect(204);
      expect(prisma.comment.deleteMany).toHaveBeenCalledWith({
        where: {
          id: commentId,
          issueId,
          issue: { is: { projectId, project: { is: { organizationId } } } },
        },
      });
    },
  );

  it('scopes a comment ID to its issue, project and organization', async () => {
    prisma.comment.findFirst.mockResolvedValue(null);
    await call('patch', path + '/' + commentId)
      .send({ body: 'Edited' })
      .expect(404);
    await call('delete', path + '/' + commentId).expect(404);
    expect(prisma.comment.findFirst).toHaveBeenCalledWith({
      where: {
        id: commentId,
        issueId,
        issue: { is: { projectId, project: { is: { organizationId } } } },
      },
      select: { authorId: true },
    });
    expect(prisma.comment.update).not.toHaveBeenCalled();
    expect(prisma.comment.deleteMany).not.toHaveBeenCalled();
  });

  it('validates edits and route UUIDs before querying comments', async () => {
    await call('patch', path + '/' + commentId)
      .send({})
      .expect(400);
    await call('patch', path + '/' + commentId)
      .send({ body: ' ' })
      .expect(400);
    await call('delete', path + '/not-a-uuid').expect(400);
    expect(prisma.comment.findFirst).not.toHaveBeenCalled();
  });

  it('reports a concurrent deletion as not found', async () => {
    prisma.comment.deleteMany.mockResolvedValueOnce({ count: 0 });
    await call('delete', path + '/' + commentId).expect(404);
    prisma.comment.update.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('gone', {
        code: 'P2025',
        clientVersion: '7.10.1',
      }),
    );
    await call('patch', path + '/' + commentId)
      .send({ body: 'Edited' })
      .expect(404);
  });

  it('returns a safe service error on database failure', async () => {
    prisma.comment.findMany.mockRejectedValueOnce(
      new Error('private database detail'),
    );
    await call('get').expect(503).expect({
      statusCode: 503,
      message: 'Comments unavailable',
      error: 'Service Unavailable',
    });
  });
});
