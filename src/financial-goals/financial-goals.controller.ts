import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { User as UserModel } from '@prisma/client';
import { GetUser } from 'src/common/decorators/get-user.decorator';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { FinancialGoalsService } from './financial-goals.service';
import { CreateFinancialGoalDto } from './dto/create-financial-goal.dto';
import { UpdateFinancialGoalDto } from './dto/update-financial-goal.dto';
import { AllocateGoalDto } from './dto/allocate-goal.dto';
import { SpendGoalDto } from './dto/spend-goal.dto';
import { ReleaseGoalDto } from './dto/release-goal.dto';
import { AdjustGoalDto } from './dto/adjust-goal.dto';

@UseGuards(JwtAuthGuard)
@Controller('financial-goals')
export class FinancialGoalsController {
  constructor(private readonly financialGoalsService: FinancialGoalsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@GetUser() user: UserModel, @Body() dto: CreateFinancialGoalDto) {
    return this.financialGoalsService.createGoal(user.id, dto);
  }

  @Get()
  findAll(@GetUser() user: UserModel) {
    return this.financialGoalsService.findAll(user.id);
  }

  @Get(':id')
  findOne(
    @GetUser() user: UserModel,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.financialGoalsService.findOne(user.id, id);
  }

  @Patch(':id')
  update(
    @GetUser() user: UserModel,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdateFinancialGoalDto,
  ) {
    return this.financialGoalsService.updateGoal(user.id, id, dto);
  }

  @Delete(':id')
  remove(
    @GetUser() user: UserModel,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.financialGoalsService.removeGoal(user.id, id);
  }

  /** Alokasikan dana dari akun ke goal (soft allocation, saldo akun tidak berubah) */
  @Post(':id/allocate')
  @HttpCode(HttpStatus.CREATED)
  allocate(
    @GetUser() user: UserModel,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: AllocateGoalDto,
  ) {
    return this.financialGoalsService.allocate(user.id, id, dto);
  }

  /** Gunakan dana dari goal untuk pengeluaran nyata (membuat expense transaction) */
  @Post(':id/spend')
  @HttpCode(HttpStatus.CREATED)
  spend(
    @GetUser() user: UserModel,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: SpendGoalDto,
  ) {
    return this.financialGoalsService.spend(user.id, id, dto);
  }

  /** Lepas alokasi dari goal — uang kembali tersedia di akun */
  @Post(':id/release')
  @HttpCode(HttpStatus.CREATED)
  release(
    @GetUser() user: UserModel,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: ReleaseGoalDto,
  ) {
    return this.financialGoalsService.release(user.id, id, dto);
  }

  /** Koreksi manual saldo goal */
  @Post(':id/adjust')
  @HttpCode(HttpStatus.CREATED)
  adjust(
    @GetUser() user: UserModel,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: AdjustGoalDto,
  ) {
    return this.financialGoalsService.adjust(user.id, id, dto);
  }

  /** Riwayat semua ledger entry untuk goal ini */
  @Get(':id/ledgers')
  getLedgers(
    @GetUser() user: UserModel,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.financialGoalsService.getLedgers(user.id, id);
  }
}
