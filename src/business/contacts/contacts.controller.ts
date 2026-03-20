import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ContactsService } from './contacts.service';
import { BusinessSubscriptionGuard } from '../guards/business-subscription.guard';
import { CompanyMemberGuard } from '../guards/company-member.guard';
import { CompanyRoleGuard } from '../guards/company-role.guard';
import { RequireCompanyRole } from '../decorators/require-company-role.decorator';
import { GetCompany } from '../decorators/get-company.decorator';
import { GetUser } from '../../common/decorators/get-user.decorator';
import { Company, CompanyMemberRole, ContactType, User } from '@prisma/client';
import { CreateContactDto } from './dto/create-contact.dto';
import { UpdateContactDto } from './dto/update-contact.dto';

@Controller('business/contacts')
@UseGuards(BusinessSubscriptionGuard, CompanyMemberGuard, CompanyRoleGuard)
export class ContactsController {
  constructor(private readonly service: ContactsService) {}

  @Get()
  @RequireCompanyRole(CompanyMemberRole.VIEWER)
  findAll(
    @GetCompany() company: Company,
    @Query('type') type?: ContactType,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.findAll(
      company,
      type,
      search,
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 20,
    );
  }

  @Get(':id')
  @RequireCompanyRole(CompanyMemberRole.VIEWER)
  findById(
    @GetCompany() company: Company,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.findById(company.id, id);
  }

  @Post()
  @RequireCompanyRole(CompanyMemberRole.STAFF)
  create(
    @GetUser() user: User,
    @GetCompany() company: Company,
    @Body() dto: CreateContactDto,
  ) {
    return this.service.create(user.id, company, dto);
  }

  @Put(':id')
  @RequireCompanyRole(CompanyMemberRole.STAFF)
  update(
    @GetUser() user: User,
    @GetCompany() company: Company,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateContactDto,
  ) {
    return this.service.update(user.id, company.id, id, dto);
  }

  @Delete(':id')
  @RequireCompanyRole(CompanyMemberRole.ADMIN)
  delete(
    @GetUser() user: User,
    @GetCompany() company: Company,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.delete(user.id, company.id, id);
  }
}
