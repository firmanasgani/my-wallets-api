import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SecretEncryptionService } from './secret-encryption.service';

@Module({
  imports: [ConfigModule],
  providers: [SecretEncryptionService],
  exports: [SecretEncryptionService],
})
export class SecretEncryptionModule {}
