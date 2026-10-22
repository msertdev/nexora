import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

type HealthResponse = {
  status: 'ok';
  service: 'nexora-api';
  version: '0.1.0';
};

@Controller('api/health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  getHealth(): HealthResponse {
    return {
      status: 'ok',
      service: 'nexora-api',
      version: '0.1.0',
    };
  }

  @Get('db')
  async getDatabaseHealth(): Promise<{
    status: 'ok';
    database: 'connected';
  }> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      throw new ServiceUnavailableException('Database unavailable');
    }

    return {
      status: 'ok',
      database: 'connected',
    };
  }
}
