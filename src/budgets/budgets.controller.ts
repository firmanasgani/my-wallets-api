import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { BudgetsService } from './budgets.service';
import { CreateBudgetDto } from './dto/create-budget.dto';
import { UpdateBudgetDto } from './dto/update-budget.dto';
import { BudgetFilterDto } from './dto/budget-filter.dto';
import { GetUser } from 'src/common/decorators/get-user.decorator';
import { User } from '@prisma/client';

@Controller('budgets')
@UsePipes(new ValidationPipe({ transform: true }))
export class BudgetsController {
  constructor(private readonly budgetsService: BudgetsService) {}

  @Post()
  create(@GetUser() user: User, @Body() createBudgetDto: CreateBudgetDto) {
    return this.budgetsService.create(user.id, createBudgetDto);
  }

  @Get()
  findAll(@GetUser() user: User, @Query() filter: BudgetFilterDto) {
    return this.budgetsService.findAll(user.id, filter);
  }

  @Get('report')
  getReport(
    @GetUser() user: User,
    @Query('year') year: number,
    @Query('month') month: number,
  ) {
    // Basic validation for query params
    const y = Number(year) || new Date().getFullYear();
    const m = Number(month) || new Date().getMonth() + 1;
    return this.budgetsService.getBudgetReport(user.id, y, m);
  }

  @Get(':id')
  findOne(@GetUser() user: User, @Param('id') id: string) {
    return this.budgetsService.findOne(id, user.id);
  }

  @Patch(':id')
  update(
    @GetUser() user: User,
    @Param('id') id: string,
    @Body() updateBudgetDto: UpdateBudgetDto,
  ) {
    return this.budgetsService.update(id, user.id, updateBudgetDto);
  }

  @Delete(':id')
  remove(@GetUser() user: User, @Param('id') id: string) {
    return this.budgetsService.remove(id, user.id);
  }
}
