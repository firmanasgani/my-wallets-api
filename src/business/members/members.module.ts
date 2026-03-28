import { Module } from '@nestjs/common';
import { MembersController } from './members.controller';
import { MembersService } from './members.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { LogsModule } from '../../logs/logs.module';
import { MinioModule } from '../../common/minio/minio.module';

@Module({
  imports: [PrismaModule, LogsModule, MinioModule],
  controllers: [MembersController],
  providers: [MembersService],
  exports: [MembersService],
})
export class MembersModule {}
