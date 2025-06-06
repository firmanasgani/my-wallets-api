import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger, ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    transform: true,
    forbidNonWhitelisted: true
  }))

  app.enableCors()
  await app.listen(process.env.PORT ?? 3000);
  Logger.log(`🚀 Application is running on: ${await app.getUrl()}`);
}
bootstrap();
