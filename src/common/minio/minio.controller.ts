import { Controller, Get } from '@nestjs/common';
import { MinioService } from './minio.service';
import { Public } from 'src/auth/decorators/public.decorator';

@Controller('minio')
export class MinioController {
  constructor(private readonly minioService: MinioService) {}

  @Public()
  @Get('health')
  async checkHealth() {
    const health = await this.minioService.checkHealth();

    return {
      status: health.connected && health.bucketExists ? 'ok' : 'error',
      timestamp: new Date().toISOString(),
      service: 'MinIO',
      details: {
        connected: health.connected,
        bucketExists: health.bucketExists,
        bucketName: health.bucketName,
        config: health.config,
        ...(health.error && { error: health.error }),
      },
    };
  }
}
