import {
  Controller,
  Post,
  Body,
  Get,
  Query,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { TransactionsService } from './transactions.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GetUser } from '../common/decorators/get-user.decorator';
import { User as UserModel } from '@prisma/client';
import { Request } from 'express';
import { CreateIncomeDto } from './dto/create-income.dto';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { CreateTransferDto } from './dto/create-transfer.dto';
import { QueryTransactionDto } from './dto/query-transaction.dto';

@UseGuards(JwtAuthGuard)
@Controller('transactions')
export class TransactionsController {
  constructor(private readonly transactionsService: TransactionsService) {}

  @Post('income')
  @HttpCode(HttpStatus.CREATED)
  createIncome(
    @GetUser() user: UserModel,
    @Body() createIncomeDto: CreateIncomeDto,
    @Req() req: Request,
  ) {
    return this.transactionsService.createIncome(
      user.id,
      createIncomeDto,
      req.ip,
      req.headers['user-agent'],
    );
  }

  @Post('expense')
  @HttpCode(HttpStatus.CREATED)
  createExpense(
    @GetUser() user: UserModel,
    @Body() createExpenseDto: CreateExpenseDto,
    @Req() req: Request,
  ) {
    return this.transactionsService.createExpense(
      user.id,
      createExpenseDto,
      req.ip,
      req.headers['user-agent'],
    );
  }

  @Post('transfer')
  @HttpCode(HttpStatus.CREATED)
  createTransfer(
    @GetUser() user: UserModel,
    @Body() createTransferDto: CreateTransferDto,
    @Req() req: Request,
  ) {
    return this.transactionsService.createTransfer(
      user.id,
      createTransferDto,
      req.ip,
      req.headers['user-agent'],
    );
  }

  @Get()
  findAll(@GetUser() user: UserModel, @Query() queryDto: QueryTransactionDto) {
    return this.transactionsService.findAll(user.id, queryDto);
  }
}
