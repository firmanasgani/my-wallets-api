import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AssetStatus, Company, CompanyMemberRole, User } from '@prisma/client';
import { AssetsService } from './assets.service';
import { CreateAssetDto } from './dto/create-asset.dto';
import { UpdateAssetDto } from './dto/update-asset.dto';
import { DisposeAssetDto } from './dto/dispose-asset.dto';
import { RunDepreciationDto } from './dto/run-depreciation.dto';
import { RecordUnitsDto } from './dto/record-units.dto';
import { BusinessSubscriptionGuard } from '../guards/business-subscription.guard';
import { CompanyMemberGuard } from '../guards/company-member.guard';
import { CompanyRoleGuard } from '../guards/company-role.guard';
import { RequireCompanyRole } from '../decorators/require-company-role.decorator';
import { GetCompany } from '../decorators/get-company.decorator';
import { GetUser } from '../../common/decorators/get-user.decorator';
import { IsEnum, IsOptional } from 'class-validator';

class ListAssetsQuery {
  @IsOptional()
  @IsEnum(AssetStatus)
  status?: AssetStatus;
}

@Controller('business/assets')
@UseGuards(BusinessSubscriptionGuard, CompanyMemberGuard, CompanyRoleGuard)
export class AssetsController {
  constructor(private readonly service: AssetsService) {}

  @Get()
  @RequireCompanyRole(CompanyMemberRole.VIEWER)
  findAll(@GetCompany() company: Company, @Query() query: ListAssetsQuery) {
    return this.service.findAll(company, query.status);
  }

  @Get(':id')
  @RequireCompanyRole(CompanyMemberRole.VIEWER)
  findOne(
    @GetCompany() company: Company,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.findOne(company, id);
  }

  @Get(':id/schedule')
  @RequireCompanyRole(CompanyMemberRole.VIEWER)
  getSchedule(
    @GetCompany() company: Company,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.getSchedule(company, id);
  }

  @Get(':id/depreciations')
  @RequireCompanyRole(CompanyMemberRole.VIEWER)
  getDepreciationHistory(
    @GetCompany() company: Company,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.getDepreciationHistory(company, id);
  }

  @Post()
  @RequireCompanyRole(CompanyMemberRole.ADMIN)
  create(
    @GetUser() user: User,
    @GetCompany() company: Company,
    @Body() dto: CreateAssetDto,
  ) {
    return this.service.create(user.id, company, dto);
  }

  @Put(':id')
  @RequireCompanyRole(CompanyMemberRole.ADMIN)
  update(
    @GetUser() user: User,
    @GetCompany() company: Company,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAssetDto,
  ) {
    return this.service.update(user.id, company, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @RequireCompanyRole(CompanyMemberRole.ADMIN)
  remove(
    @GetUser() user: User,
    @GetCompany() company: Company,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.remove(user.id, company, id);
  }

  @Post(':id/dispose')
  @RequireCompanyRole(CompanyMemberRole.ADMIN)
  dispose(
    @GetUser() user: User,
    @GetCompany() company: Company,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DisposeAssetDto,
  ) {
    return this.service.dispose(user.id, company, id, dto);
  }

  @Post(':id/units')
  @RequireCompanyRole(CompanyMemberRole.STAFF)
  recordUnits(
    @GetUser() user: User,
    @GetCompany() company: Company,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RecordUnitsDto,
  ) {
    return this.service.recordUnitsAndRun(user.id, company, id, dto);
  }

  @Post('run-depreciation')
  @RequireCompanyRole(CompanyMemberRole.ADMIN)
  runDepreciation(
    @GetUser() user: User,
    @GetCompany() company: Company,
    @Body() dto: RunDepreciationDto,
  ) {
    return this.service.runDepreciation(user.id, company, dto);
  }
}
