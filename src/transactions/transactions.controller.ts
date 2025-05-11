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
  Param,
  ParseUUIDPipe,
  Delete,
  Patch,
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
import { UpdateTransactionDto } from './dto/update-transaction.dto';

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

  @Get(':id')
  findOne(
    @GetUser() user: UserModel,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.transactionsService.findOne(user.id, id);
  }

  @Patch(':id')
  update(
    @GetUser() user: UserModel,
    @Param('id', new ParseUUIDPipe({ version: '4' })) transactionId: string,
    @Body() updateTransactionDto: UpdateTransactionDto,
    @Req() req: Request, // Inject Request untuk IP dan User Agent
  ) {
    const ipAddress = req.ip;
    const userAgent = req.headers['user-agent'];
    return this.transactionsService.update(
      user.id,
      transactionId,
      updateTransactionDto,
      ipAddress,
      userAgent,
    );
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK) // Atau HttpStatus.NO_CONTENT (204) jika tidak ada body respons
  remove(
    @GetUser() user: UserModel,
    @Param('id', new ParseUUIDPipe({ version: '4' })) transactionId: string,
    @Req() req: Request, // Inject Request untuk IP dan User Agent
  ) {
    const ipAddress = req.ip;
    const userAgent = req.headers['user-agent'];
    return this.transactionsService.remove(
      user.id,
      transactionId,
      ipAddress,
      userAgent,
    );
  }
}
