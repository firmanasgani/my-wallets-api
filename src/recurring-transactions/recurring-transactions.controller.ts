import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { RecurringTransactionsService } from './recurring-transactions.service';
import { CreateRecurringTransactionDto } from './dto/create-recurring-transaction.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GetUser } from '../common/decorators/get-user.decorator';
import { User as UserModel } from '@prisma/client';

@UseGuards(JwtAuthGuard)
@Controller('recurring-transactions')
export class RecurringTransactionsController {
  constructor(
    private readonly recurringTransactionsService: RecurringTransactionsService,
  ) {}

  @Post()
  create(
    @GetUser() user: UserModel,
    @Body() createRecurringTransactionDto: CreateRecurringTransactionDto,
  ) {
    return this.recurringTransactionsService.create(
      user.id,
      createRecurringTransactionDto,
    );
  }

  @Get()
  findAll(@GetUser() user: UserModel) {
    return this.recurringTransactionsService.findAll(user.id);
  }

  @Get(':id')
  findOne(
    @GetUser() user: UserModel,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.recurringTransactionsService.findOne(user.id, id);
  }

  @Delete(':id')
  remove(
    @GetUser() user: UserModel,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.recurringTransactionsService.remove(user.id, id);
  }
}
