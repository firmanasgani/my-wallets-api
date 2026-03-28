import { Module } from '@nestjs/common';
import { ContactsController } from './contacts.controller';
import { ContactsService } from './contacts.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { LogsModule } from '../../logs/logs.module';

@Module({
  imports: [PrismaModule, LogsModule],
  controllers: [ContactsController],
  providers: [ContactsService],
  exports: [ContactsService],
})
export class ContactsModule {}
