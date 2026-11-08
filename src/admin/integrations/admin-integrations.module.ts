import { Module } from '@nestjs/common';
import { AdminIntegrationsController } from './admin-integrations.controller';
import { AdminIntegrationsService } from './admin-integrations.service';
import { PrismaModule } from 'src/prisma/prisma.module';
import { LogsModule } from 'src/logs/logs.module';
import { SecretEncryptionModule } from 'src/common/crypto/secret-encryption.module';
import { PayfestModule } from 'src/payfest/payfest.module';
import { AdminAuthModule } from '../auth/admin-auth.module';

@Module({
  imports: [
    PrismaModule,
    LogsModule,
    SecretEncryptionModule,
    PayfestModule,
    AdminAuthModule,
  ],
  controllers: [AdminIntegrationsController],
  providers: [AdminIntegrationsService],
  exports: [AdminIntegrationsService],
})
export class AdminIntegrationsModule {}
