import { Module } from '@nestjs/common';
import { PrismaModule } from 'src/prisma/prisma.module';
import { SecretEncryptionModule } from 'src/common/crypto/secret-encryption.module';
import { PayfestClientService } from './payfest-client.service';

@Module({
  imports: [PrismaModule, SecretEncryptionModule],
  providers: [PayfestClientService],
  exports: [PayfestClientService],
})
export class PayfestModule {}
