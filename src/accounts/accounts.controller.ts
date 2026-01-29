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
  Req,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { AccountsService } from './accounts.service';
import { GetUser } from 'src/common/decorators/get-user.decorator';
import { User as UserModel } from '@prisma/client';
import { CreateAccountDto } from './dto/create-account.dto';
import { UpdateAccountDto } from './dto/update-account.dto';
import { Request } from 'express';

@UseGuards(JwtAuthGuard)
@Controller('accounts')
export class AccountsController {
  constructor(private readonly accountService: AccountsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @GetUser() user: UserModel,
    @Body() createAccountDto: CreateAccountDto,
    @Req() req: Request,
  ) {
    const ipAddress = req.ip;
    const userAgent = req.headers['user-agent'];
    return this.accountService.create(
      user.id,
      createAccountDto,
      ipAddress,
      userAgent,
    );
  }

  @Get()
  findAll(@GetUser() user: UserModel) {
    return this.accountService.findAll(user.id);
  }

  @Get(':id')
  findOne(
    @GetUser() user: UserModel,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.accountService.findOne(user.id, id);
  }

  @Patch(':id')
  update(
    @GetUser() user: UserModel,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() updateAccountDto: UpdateAccountDto,
    @Req() req: Request,
  ) {
    const ipAddress = req.ip;
    const userAgent = req.headers['user-agent'];
    return this.accountService.update(
      user.id,
      id,
      updateAccountDto,
      ipAddress,
      userAgent,
    );
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  remove(
    @GetUser() user: UserModel,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Req() req: Request,
  ) {
    const ipAddress = req.ip;
    const userAgent = req.headers['user-agent'];
    return this.accountService.remove(user.id, id, ipAddress, userAgent);
  }

  
}
