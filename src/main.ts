import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger, ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  // rawBody: true additionally exposes req.rawBody — needed to verify
  // Payfest's webhook signature (HMAC over the exact bytes sent), which a
  // re-serialized JSON body would not match. Every other route's normal
  // parsed `body` is unaffected.
  const app = await NestFactory.create(AppModule, { rawBody: true });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  app.enableCors({
    origin: true,
    credentials: true,
  });
  await app.listen(process.env.PORT ?? 3000);
  Logger.log(`🚀 Application is running on: ${await app.getUrl()}`);
}
void bootstrap();
