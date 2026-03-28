import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Put,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
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
    return this.companyService.withResolvedLogoUrl(company);
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

  @Patch('logo')
  @HttpCode(HttpStatus.OK)
  @UseGuards(CompanyMemberGuard, CompanyRoleGuard)
  @RequireCompanyRole(CompanyMemberRole.ADMIN, CompanyMemberRole.OWNER)
  @UseInterceptors(FileInterceptor('file'))
  uploadLogo(
    @GetUser() user: User,
    @GetCompany() company: Company,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('No file uploaded.');
    }
    return this.companyService.uploadLogo(user.id, company, file);
  }

  @Delete('logo')
  @HttpCode(HttpStatus.OK)
  @UseGuards(CompanyMemberGuard, CompanyRoleGuard)
  @RequireCompanyRole(CompanyMemberRole.ADMIN, CompanyMemberRole.OWNER)
  deleteLogo(
    @GetUser() user: User,
    @GetCompany() company: Company,
  ) {
    return this.companyService.deleteLogo(user.id, company);
  }
}
