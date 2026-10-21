import { ValidationPipe } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../app.module.js';
import { SESSION_COOKIE } from '../auth/session-token.js';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

describe('Project and issue endpoints', () => {
  let app: INestApplication<App>;
  const organizationId = 'fdcb570b-bb77-40c3-95dd-f61a12c438d0';
  const projectId = '6ed463d6-d31a-4a0e-a913-94130ab22fd4';
  const issueId = 'b27b4c26-b82b-4604-8e47-c117bef04ca9';
  const userId = 'c17013a8-1c2f-4b91-b7f2-d06c6b586c30';
  const sessionToken = Buffer.alloc(32, 8).toString('base64url');
  const project = {
    id: projectId,
    organizationId,
    name: 'Platform',
    key: 'PLAT',
    createdAt: new Date('2026-10-20T12:00:00.000Z'),
    updatedAt: new Date('2026-10-20T12:00:00.000Z'),
  };
  const issue = {
    id: issueId,
    projectId,
    issueNumber: 1,
    title: 'First issue',
    description: null,
    status: 'BACKLOG',
    priority: 'MEDIUM',
    assigneeId: null,
    dueDate: null,
    createdAt: new Date('2026-10-20T12:00:00.000Z'),
    updatedAt: new Date('2026-10-20T12:00:00.000Z'),
    assignee: null,
    project: { key: 'PLAT' },
  };
  const transaction = {
    project: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    membership: {
      findFirst: vi.fn(),
    },
    issue: {
      create: vi.fn(),
      findFirst: vi.fn(),
      updateMany: vi.fn(),
    },
  };
  const prismaMock = {
    session: {
      findFirst: vi.fn(),
    },
    membership: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
    },
    organization: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
    },
    project: {
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      findFirst: vi.fn(),
      updateMany: vi.fn(),
    },
    issue: {
      findMany: vi.fn(),
      count: vi.fn(),
      findFirst: vi.fn(),
    },
    $transaction: vi.fn(),
  };
  const projectsPath = `/api/organizations/${organizationId}/projects`;
  const issuesPath = `${projectsPath}/${projectId}/issues`;

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
        id: userId,
        email: 'member@example.com',
        name: 'Example Member',
      },
    });
    prismaMock.membership.findUnique.mockResolvedValue({ role: 'OWNER' });
    prismaMock.project.findMany.mockResolvedValue([]);
    prismaMock.project.count.mockResolvedValue(0);
    prismaMock.project.create.mockResolvedValue(project);
    prismaMock.project.findFirst.mockResolvedValue(project);
    prismaMock.project.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.issue.findMany.mockResolvedValue([]);
    prismaMock.issue.count.mockResolvedValue(0);
    prismaMock.issue.findFirst.mockResolvedValue(issue);
    prismaMock.$transaction.mockImplementation(
      (callback: (tx: typeof transaction) => Promise<unknown>) =>
        callback(transaction),
    );
    transaction.project.findFirst.mockResolvedValue({ id: projectId });
    transaction.project.update.mockResolvedValue({ lastIssueNumber: 1 });
    transaction.membership.findFirst.mockResolvedValue({ id: 'membership-id' });
    transaction.issue.create.mockResolvedValue(issue);
    transaction.issue.findFirst.mockResolvedValue({ id: issueId });
    transaction.issue.updateMany.mockResolvedValue({ count: 1 });
  });

  function get(path: string) {
    return request(app.getHttpServer())
      .get(path)
      .set('Cookie', `${SESSION_COOKIE}=${sessionToken}`);
  }

  function post(path: string) {
    return request(app.getHttpServer())
      .post(path)
      .set('Cookie', `${SESSION_COOKIE}=${sessionToken}`)
      .set('Origin', 'http://localhost:3000');
  }

  function patch(path: string) {
    return request(app.getHttpServer())
      .patch(path)
      .set('Cookie', `${SESSION_COOKIE}=${sessionToken}`)
      .set('Origin', 'http://localhost:3000');
  }

  it('rejects unauthenticated project and issue reads', async () => {
    prismaMock.session.findFirst.mockResolvedValue(null);
    await request(app.getHttpServer()).get(projectsPath).expect(401);
    await request(app.getHttpServer()).get(issuesPath).expect(401);
    expect(prismaMock.project.findMany).not.toHaveBeenCalled();
  });

  it('allows OWNER to create a normalized project', async () => {
    await post(projectsPath)
      .send({ name: ' Platform ', key: 'plat' })
      .expect(201)
      .expect((response) => {
        expect(response.body.key).toBe('PLAT');
        expect(response.body).not.toHaveProperty('lastIssueNumber');
      });

    expect(prismaMock.project.create).toHaveBeenCalledWith({
      data: { organizationId, name: 'Platform', key: 'PLAT' },
      select: expect.objectContaining({ id: true, key: true }),
    });
  });

  it('denies MEMBER project creation', async () => {
    prismaMock.membership.findUnique.mockResolvedValue({ role: 'MEMBER' });

    await post(projectsPath)
      .send({ name: 'Platform', key: 'PLAT' })
      .expect(403);

    expect(prismaMock.project.create).not.toHaveBeenCalled();
  });

  it('returns a safe conflict when the organization already has the project key', async () => {
    prismaMock.project.create.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('unique conflict', {
        code: 'P2002',
        clientVersion: '7.10.1',
      }),
    );

    await post(projectsPath)
      .send({ name: 'Platform', key: 'PLAT' })
      .expect(409)
      .expect({
        statusCode: 409,
        message: 'A project with that key already exists',
        error: 'Conflict',
      });
  });

  it('allows ADMIN project edits and denies MEMBER project edits', async () => {
    prismaMock.membership.findUnique.mockResolvedValue({ role: 'ADMIN' });
    await patch(`${projectsPath}/${projectId}`)
      .send({ name: 'Renamed platform' })
      .expect(200);
    expect(prismaMock.project.updateMany).toHaveBeenCalledWith({
      where: { id: projectId, organizationId },
      data: { name: 'Renamed platform' },
    });

    prismaMock.project.updateMany.mockClear();
    prismaMock.membership.findUnique.mockResolvedValue({ role: 'MEMBER' });
    await patch(`${projectsPath}/${projectId}`)
      .send({ name: 'Not allowed' })
      .expect(403);
    expect(prismaMock.project.updateMany).not.toHaveBeenCalled();
  });

  it('scopes project listing and detail to the organization in the route', async () => {
    await get(projectsPath).expect(200);
    expect(prismaMock.project.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId },
        skip: 0,
        take: 50,
      }),
    );

    prismaMock.project.findFirst.mockResolvedValueOnce(null);
    await get(`${projectsPath}/${projectId}`).expect(404);
    expect(prismaMock.project.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: projectId, organizationId },
      }),
    );
  });

  it('does not allow a non-member to query a known organization project', async () => {
    prismaMock.membership.findUnique.mockResolvedValue(null);
    await get(projectsPath).expect(404);
    expect(prismaMock.project.findMany).not.toHaveBeenCalled();
  });

  it('does not resolve a known issue ID when its project is outside the route organization', async () => {
    prismaMock.project.findFirst.mockResolvedValueOnce(null);
    await get(`${issuesPath}/${issueId}`).expect(404);
    expect(prismaMock.issue.findFirst).not.toHaveBeenCalled();
  });

  it('creates issues using an atomic project counter and returns a scoped identifier', async () => {
    await post(issuesPath)
      .send({ title: ' First issue ' })
      .expect(201)
      .expect((response) => {
        expect(response.body.identifier).toBe('PLAT-1');
        expect(response.body.title).toBe('First issue');
        expect(response.body).not.toHaveProperty('passwordHash');
      });

    expect(transaction.project.findFirst).toHaveBeenCalledWith({
      where: { id: projectId, organizationId },
      select: { id: true },
    });
    expect(transaction.project.update).toHaveBeenCalledWith({
      where: { id: projectId },
      data: { lastIssueNumber: { increment: 1 } },
      select: { lastIssueNumber: true },
    });
    expect(transaction.issue.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          projectId,
          issueNumber: 1,
          title: 'First issue',
        }),
      }),
    );
    expect(prismaMock.$transaction).toHaveBeenCalledOnce();
  });

  it('allows an organization MEMBER to create an issue', async () => {
    prismaMock.membership.findUnique.mockResolvedValue({ role: 'MEMBER' });
    await post(issuesPath).send({ title: 'Member-created issue' }).expect(201);
    expect(transaction.issue.create).toHaveBeenCalledOnce();
  });

  it('allows a MEMBER to edit permitted fields of an issue in their organization', async () => {
    prismaMock.membership.findUnique.mockResolvedValue({ role: 'MEMBER' });
    prismaMock.issue.findFirst.mockResolvedValueOnce({
      ...issue,
      status: 'IN_PROGRESS',
      priority: 'HIGH',
    });
    await patch(`${issuesPath}/${issueId}`)
      .send({ status: 'IN_PROGRESS', priority: 'HIGH' })
      .expect(200)
      .expect((response) => {
        expect(response.body.status).toBe('IN_PROGRESS');
        expect(response.body.priority).toBe('HIGH');
        expect(response.body.identifier).toBe('PLAT-1');
      });
    expect(transaction.issue.updateMany).toHaveBeenCalledWith({
      where: { id: issueId, projectId },
      data: {
        status: 'IN_PROGRESS',
        priority: 'HIGH',
        dueDate: undefined,
      },
    });
  });

  it('does not allocate an issue number for a project outside the route organization', async () => {
    transaction.project.findFirst.mockResolvedValueOnce(null);
    await post(issuesPath)
      .send({ title: 'Cross-organization issue' })
      .expect(404);
    expect(transaction.project.update).not.toHaveBeenCalled();
    expect(transaction.issue.create).not.toHaveBeenCalled();
  });

  it('retrieves issues only within the requested project', async () => {
    await get(`${issuesPath}/${issueId}`)
      .expect(200)
      .expect((response) => {
        expect(response.body.identifier).toBe('PLAT-1');
      });
    expect(prismaMock.issue.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: issueId, projectId } }),
    );

    transaction.issue.findFirst.mockResolvedValueOnce(null);
    prismaMock.issue.findFirst.mockResolvedValueOnce(null);
    await get(`${issuesPath}/${issueId}`).expect(404);
  });

  it('rejects invalid status, priority and non-member assignees', async () => {
    await post(issuesPath)
      .send({ title: 'Invalid status', status: 'SHIPPED' })
      .expect(400);
    await post(issuesPath)
      .send({ title: 'Invalid priority', priority: 'URGENT' })
      .expect(400);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();

    transaction.membership.findFirst.mockResolvedValueOnce(null);
    await post(issuesPath)
      .send({
        title: 'Invalid assignee',
        assigneeId: 'c17013a8-1c2f-4b91-b7f2-d06c6b586c31',
      })
      .expect(400);
    expect(transaction.membership.findFirst).toHaveBeenCalledWith({
      where: {
        organizationId,
        userId: 'c17013a8-1c2f-4b91-b7f2-d06c6b586c31',
      },
      select: { id: true },
    });
    expect(transaction.project.update).not.toHaveBeenCalled();
  });

  it('rolls back the counter transaction and reports unique conflicts safely', async () => {
    transaction.issue.create.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('unique conflict', {
        code: 'P2002',
        clientVersion: '7.10.1',
      }),
    );
    let rolledBack = false;
    prismaMock.$transaction.mockImplementationOnce(
      async (callback: (tx: typeof transaction) => Promise<unknown>) => {
        try {
          return await callback(transaction);
        } catch (error) {
          rolledBack = true;
          throw error;
        }
      },
    );

    await post(issuesPath)
      .send({ title: 'Conflict issue' })
      .expect(409)
      .expect({
        statusCode: 409,
        message: 'Unable to allocate an issue number',
        error: 'Conflict',
      });
    expect(rolledBack).toBe(true);
  });

  it('validates pagination and scopes filtered issue lists to the project', async () => {
    await get(`${issuesPath}?page=2&limit=25&status=TODO`).expect(200).expect({
      items: [],
      page: 2,
      limit: 25,
      total: 0,
      totalPages: 0,
    });
    expect(prismaMock.issue.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { projectId, status: 'TODO' },
        skip: 25,
        take: 25,
      }),
    );
    await get(`${issuesPath}?limit=1000`).expect(400);
  });
});
