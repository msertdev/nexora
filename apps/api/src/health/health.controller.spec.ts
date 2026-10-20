import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { HealthModule } from './health.module.js';
import { PrismaService } from '../prisma/prisma.service.js';

describe('Health endpoints', () => {
  let app: INestApplication<App>;
  const prismaService = {
    $queryRaw: vi.fn(),
  };

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [HealthModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prismaService)
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    prismaService.$queryRaw.mockReset();
  });

  it('returns the API health payload', async () => {
    await request(app.getHttpServer())
      .get('/api/health')
      .expect(200)
      .expect({
        status: 'ok',
        service: 'nexora-api',
        version: '0.1.0',
      });
  });

  it('reports a healthy database connection', async () => {
    prismaService.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);

    await request(app.getHttpServer())
      .get('/api/health/db')
      .expect(200)
      .expect({
        status: 'ok',
        database: 'connected',
      });
    expect(prismaService.$queryRaw).toHaveBeenCalledOnce();
  });

  it('returns a safe unavailable response when the database query fails', async () => {
    prismaService.$queryRaw.mockRejectedValue(
      new Error('sensitive database details'),
    );

    await request(app.getHttpServer())
      .get('/api/health/db')
      .expect(503)
      .expect({
        statusCode: 503,
        message: 'Database unavailable',
        error: 'Service Unavailable',
      });
  });
});