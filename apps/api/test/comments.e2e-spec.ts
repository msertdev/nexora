import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import {
  SESSION_COOKIE,
  createSessionToken,
  hashSessionToken,
} from '../src/auth/session-token.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

describe('Comments with PostgreSQL (use an isolated test database)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const organizationId = randomUUID();
  const projectId = randomUUID();
  const issueId = randomUUID();
  const otherIssueId = randomUUID();
  const otherProjectId = randomUUID();
  const users = Array.from({ length: 4 }, () => randomUUID());
  const tokens = users.map(() => createSessionToken());
  const base =
    '/api/organizations/' +
    organizationId +
    '/projects/' +
    projectId +
    '/issues/' +
    issueId +
    '/comments';

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();
    prisma = app.get(PrismaService);
    for (const [index, id] of users.entries()) {
      await prisma.user.create({
        data: {
          id,
          email: id + '@comments-test.example',
          name: 'Comment tester ' + index,
          sessions: {
            create: {
              tokenHash: hashSessionToken(tokens[index]),
              expiresAt: new Date(Date.now() + 60_000),
            },
          },
        },
      });
    }
    await prisma.organization.create({
      data: {
        id: organizationId,
        name: 'Comments integration test',
        slug: 'comments-' + organizationId,
        memberships: {
          create: users.slice(0, 3).map((userId, index) => ({
            userId,
            role: (['MEMBER', 'ADMIN', 'OWNER'] as const)[index],
          })),
        },
        projects: {
          create: [
            {
              id: projectId,
              name: 'Comments',
              key: 'CMT',
              issues: {
                create: [
                  { id: issueId, issueNumber: 1, title: 'Discussion' },
                  {
                    id: otherIssueId,
                    issueNumber: 2,
                    title: 'Other discussion',
                  },
                ],
              },
            },
            { id: otherProjectId, name: 'Other project', key: 'OTHER' },
          ],
        },
      },
    });
  });

  afterAll(async () => {
    if (prisma) {
      // Delete only this run's UUID-scoped fixtures, never truncate shared tables.
      await prisma.organization.deleteMany({ where: { id: organizationId } });
      await prisma.user.deleteMany({ where: { id: { in: users } } });
    }
    await app?.close();
  });

  function call(
    method: 'get' | 'post' | 'patch' | 'delete',
    path = base,
    actor = 0,
  ) {
    return request(app.getHttpServer())
      [method](path)
      .set('Cookie', SESSION_COOKIE + '=' + tokens[actor])
      .set('Origin', 'http://localhost:3000');
  }

  it('persists authored comments, edits them, and deletes them', async () => {
    const created = await call('post')
      .send({ body: '  Persisted update  ' })
      .expect(201);
    const id = created.body.id as string;
    expect(created.body.author).toEqual({
      id: users[0],
      name: 'Comment tester 0',
    });
    expect(created.body.body).toBe('Persisted update');
    expect(created.body.author).not.toHaveProperty('email');
    expect(await prisma.comment.findUnique({ where: { id } })).toMatchObject({
      issueId,
      authorId: users[0],
    });
    const edited = await call('patch', base + '/' + id)
      .send({ body: 'New update' })
      .expect(200);
    expect(edited.body.body).toBe('New update');
    await call('delete', base + '/' + id).expect(204);
    expect(await prisma.comment.findUnique({ where: { id } })).toBeNull();
  });

  it('enforces authorship and administrator deletion against real rows', async () => {
    for (const admin of [1, 2]) {
      const row = await prisma.comment.create({
        data: { issueId, authorId: users[admin], body: 'Protected' },
      });
      await call('patch', base + '/' + row.id)
        .send({ body: 'Spoofed' })
        .expect(403);
      await call('delete', base + '/' + row.id).expect(403);
      const own = await prisma.comment.create({
        data: { issueId, authorId: users[0], body: 'Member comment' },
      });
      await call('patch', base + '/' + own.id, admin)
        .send({ body: 'Admin edit' })
        .expect(403);
      await call('delete', base + '/' + own.id, admin).expect(204);
      expect(
        await prisma.comment.findUnique({ where: { id: own.id } }),
      ).toBeNull();
      await prisma.comment.delete({ where: { id: row.id } });
    }
  });

  it('rejects non-members and mismatched issue, project and organization routes', async () => {
    const row = await prisma.comment.create({
      data: { issueId, authorId: users[0], body: 'Private discussion' },
    });
    await call('get', base, 3).expect(404);
    const otherIssue = base.replace(issueId, otherIssueId);
    await call('patch', otherIssue + '/' + row.id)
      .send({ body: 'Wrong issue' })
      .expect(404);
    await call('delete', otherIssue + '/' + row.id).expect(404);
    await call('get', base.replace(projectId, otherProjectId)).expect(404);
    await call('post', base.replace(organizationId, randomUUID()))
      .send({ body: 'Wrong organization' })
      .expect(404);
    expect(
      (await prisma.comment.findUniqueOrThrow({ where: { id: row.id } })).body,
    ).toBe('Private discussion');
    await prisma.comment.delete({ where: { id: row.id } });
  });

  it('paginates chronologically without exposing author secrets', async () => {
    await prisma.comment.createMany({
      data: Array.from({ length: 51 }, (_, index) => ({
        issueId,
        authorId: users[0],
        body: 'Page entry ' + index,
        createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, index)),
      })),
    });
    const first = await call('get', base + '?limit=50').expect(200);
    const second = await call('get', base + '?limit=50&page=2').expect(200);
    expect(first.body.items).toHaveLength(50);
    expect(first.body.totalPages).toBe(2);
    expect(second.body.items).toHaveLength(1);
    expect(second.body.items[0].body).toBe('Page entry 50');
    expect(first.body.items[0].author).toEqual({
      id: users[0],
      name: 'Comment tester 0',
    });
    await prisma.comment.deleteMany({ where: { issueId } });
  });

  it('cascades comments when an issue or author is deleted', async () => {
    const row = await prisma.comment.create({
      data: {
        issueId: otherIssueId,
        authorId: users[0],
        body: 'Issue cascade',
      },
    });
    await prisma.issue.delete({ where: { id: otherIssueId } });
    expect(
      await prisma.comment.findUnique({ where: { id: row.id } }),
    ).toBeNull();
    const authorComment = await prisma.comment.create({
      data: { issueId, authorId: users[3], body: 'Author cascade' },
    });
    await prisma.user.delete({ where: { id: users[3] } });
    expect(
      await prisma.comment.findUnique({ where: { id: authorComment.id } }),
    ).toBeNull();
  });
});
