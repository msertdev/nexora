import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);
  const trustProxyHops = Number(
    configService.get<string>('TRUST_PROXY_HOPS') ?? '0',
  );
  if (trustProxyHops > 0) {
    app.getHttpAdapter().getInstance().set('trust proxy', trustProxyHops);
  }
  app.enableCors({
    origin: configService.getOrThrow<string>('FRONTEND_ORIGIN'),
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );
  app.enableShutdownHooks();
  await app.listen(process.env.PORT ?? 4000);
}
await bootstrap();
