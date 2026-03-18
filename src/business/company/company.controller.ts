import {
  Body,
  Controller,
  Get,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { CompanyService } from './company.service';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { GetUser } from '../../common/decorators/get-user.decorator';
import { GetCompany } from '../decorators/get-company.decorator';
import { BusinessSubscriptionGuard } from '../guards/business-subscription.guard';
import { CompanyMemberGuard } from '../guards/company-member.guard';
import { CompanyRoleGuard } from '../guards/company-role.guard';
import { RequireCompanyRole } from '../decorators/require-company-role.decorator';
import { Company, CompanyMemberRole, User } from '@prisma/client';

@Controller('business/company')
@UseGuards(BusinessSubscriptionGuard)
export class CompanyController {
  constructor(private readonly companyService: CompanyService) {}

  @Post()
  create(
    @GetUser() user: User,
    @Body() dto: CreateCompanyDto,
  ) {
    return this.companyService.create(user.id, dto);
  }

  @Get()
  @UseGuards(CompanyMemberGuard, CompanyRoleGuard)
  findMine(@GetCompany() company: Company) {
    return company;
  }

  @Put()
  @UseGuards(CompanyMemberGuard, CompanyRoleGuard)
  @RequireCompanyRole(CompanyMemberRole.ADMIN, CompanyMemberRole.OWNER)
  update(
    @GetUser() user: User,
    @GetCompany() company: Company,
    @Body() dto: UpdateCompanyDto,
  ) {
    return this.companyService.update(user.id, company, dto);
  }
}
