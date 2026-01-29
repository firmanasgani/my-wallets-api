import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as Minio from 'minio';

@Injectable()
export class MinioService {
  private readonly logger = new Logger(MinioService.name);
  private minioClient: Minio.Client;
  private bucketName: string;

  constructor(private configService: ConfigService) {
    this.bucketName =
      this.configService.get<string>('MINIO_BUCKET_NAME') || 'my-wallets';

    this.minioClient = new Minio.Client({
      endPoint: this.configService.get<string>('MINIO_ENDPOINT') || 'localhost',
      port: parseInt(this.configService.get<string>('MINIO_PORT') || '9000'),
      useSSL: this.configService.get<string>('MINIO_USE_SSL') === 'true',
      accessKey:
        this.configService.get<string>('MINIO_ACCESS_KEY') || 'minioadmin',
      secretKey:
        this.configService.get<string>('MINIO_SECRET_KEY') || 'minioadmin',
    });

    this.ensureBucketExists();
  }

  private async ensureBucketExists(): Promise<void> {
    try {
      const exists = await this.minioClient.bucketExists(this.bucketName);
      if (!exists) {
        await this.minioClient.makeBucket(this.bucketName, 'us-east-1');
        this.logger.log(`Bucket ${this.bucketName} created successfully`);
      }
    } catch (error) {
      this.logger.error(`Error ensuring bucket exists: ${error.message}`);
    }
  }

  async uploadFile(file: Express.Multer.File, path: string): Promise<string> {
    try {
      const fileName = `${path}`;

      await this.minioClient.putObject(
        this.bucketName,
        fileName,
        file.buffer,
        file.size,
        {
          'Content-Type': file.mimetype,
        },
      );

      this.logger.log(`File uploaded successfully: ${fileName}`);
      return fileName;
    } catch (error) {
      this.logger.error(`Error uploading file: ${error.message}`);
      throw new InternalServerErrorException('Failed to upload file');
    }
  }

  async deleteFile(path: string): Promise<void> {
    try {
      await this.minioClient.removeObject(this.bucketName, path);
      this.logger.log(`File deleted successfully: ${path}`);
    } catch (error) {
      this.logger.error(`Error deleting file: ${error.message}`);
      // Don't throw error if file doesn't exist
    }
  }

  async getFileUrl(path: string): Promise<string> {
    try {
      // Generate presigned URL valid for 7 days
      const url = await this.minioClient.presignedGetObject(
        this.bucketName,
        path,
        24 * 60 * 60 * 7, // 7 days
      );
      return url;
    } catch (error) {
      this.logger.error(`Error generating file URL: ${error.message}`);
      throw new InternalServerErrorException('Failed to generate file URL');
    }
  }

  async checkHealth(): Promise<{
    connected: boolean;
    bucketExists: boolean;
    bucketName: string;
    config: {
      endpoint: string;
      port: number;
      useSSL: boolean;
    };
    error?: string;
  }> {
    try {
      // Check if bucket exists (this also verifies connection)
      const exists = await this.minioClient.bucketExists(this.bucketName);

      return {
        connected: true,
        bucketExists: exists,
        bucketName: this.bucketName,
        config: {
          endpoint:
            this.configService.get<string>('MINIO_ENDPOINT') || 'localhost',
          port: parseInt(
            this.configService.get<string>('MINIO_PORT') || '9000',
          ),
          useSSL: this.configService.get<string>('MINIO_USE_SSL') === 'true',
        },
      };
    } catch (error) {
      this.logger.error(`MinIO health check failed: ${error.message}`);
      return {
        connected: false,
        bucketExists: false,
        bucketName: this.bucketName,
        config: {
          endpoint:
            this.configService.get<string>('MINIO_ENDPOINT') || 'localhost',
          port: parseInt(
            this.configService.get<string>('MINIO_PORT') || '9000',
          ),
          useSSL: this.configService.get<string>('MINIO_USE_SSL') === 'true',
        },
        error: error.message,
      };
    }
  }
}
