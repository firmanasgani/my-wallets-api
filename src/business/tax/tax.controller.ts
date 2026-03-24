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
  UseGuards,
} from '@nestjs/common';
import { Company, CompanyMemberRole, User } from '@prisma/client';
import { TaxService } from './tax.service';
import { TaxSuggestionService } from './tax-suggestion.service';
import { CreateTaxConfigDto } from './dto/create-tax-config.dto';
import { UpdateTaxConfigDto } from './dto/update-tax-config.dto';
import { CreateSuggestionRuleDto } from './dto/create-suggestion-rule.dto';
import { UpdateSuggestionRuleDto } from './dto/update-suggestion-rule.dto';
import { SuggestTaxDto } from './dto/suggest-tax.dto';
import { BusinessSubscriptionGuard } from '../guards/business-subscription.guard';
import { CompanyMemberGuard } from '../guards/company-member.guard';
import { CompanyRoleGuard } from '../guards/company-role.guard';
import { RequireCompanyRole } from '../decorators/require-company-role.decorator';
import { GetCompany } from '../decorators/get-company.decorator';
import { GetUser } from '../../common/decorators/get-user.decorator';

@Controller('business/tax')
@UseGuards(BusinessSubscriptionGuard, CompanyMemberGuard, CompanyRoleGuard)
export class TaxController {
  constructor(
    private readonly taxService: TaxService,
    private readonly suggestionService: TaxSuggestionService,
  ) {}

  // ─── TaxConfig ────────────────────────────────────────────────────────────

  @Get()
  @RequireCompanyRole(CompanyMemberRole.VIEWER)
  listConfigs(@GetCompany() company: Company) {
    return this.taxService.listConfigs(company);
  }

  @Post()
  @RequireCompanyRole(CompanyMemberRole.ADMIN)
  createConfig(
    @GetUser() user: User,
    @GetCompany() company: Company,
    @Body() dto: CreateTaxConfigDto,
  ) {
    return this.taxService.createConfig(user.id, company, dto);
  }

  @Put(':id')
  @RequireCompanyRole(CompanyMemberRole.ADMIN)
  updateConfig(
    @GetUser() user: User,
    @GetCompany() company: Company,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTaxConfigDto,
  ) {
    return this.taxService.updateConfig(user.id, company, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @RequireCompanyRole(CompanyMemberRole.ADMIN)
  deleteConfig(
    @GetUser() user: User,
    @GetCompany() company: Company,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.taxService.deleteConfig(user.id, company, id);
  }

  // ─── Tax Suggestion ───────────────────────────────────────────────────────

  @Post('suggest')
  @HttpCode(HttpStatus.OK)
  @RequireCompanyRole(CompanyMemberRole.STAFF)
  suggest(
    @GetCompany() company: Company,
    @Body() dto: SuggestTaxDto,
  ) {
    return this.suggestionService.suggest(company, dto);
  }

  // ─── Suggestion Rules ─────────────────────────────────────────────────────

  @Get('suggestion-rules')
  @RequireCompanyRole(CompanyMemberRole.VIEWER)
  listRules(@GetCompany() company: Company) {
    return this.taxService.listRules(company);
  }

  @Post('suggestion-rules')
  @RequireCompanyRole(CompanyMemberRole.ADMIN)
  createRule(
    @GetUser() user: User,
    @GetCompany() company: Company,
    @Body() dto: CreateSuggestionRuleDto,
  ) {
    return this.taxService.createRule(user.id, company, dto);
  }

  @Put('suggestion-rules/:id')
  @RequireCompanyRole(CompanyMemberRole.ADMIN)
  updateRule(
    @GetUser() user: User,
    @GetCompany() company: Company,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSuggestionRuleDto,
  ) {
    return this.taxService.updateRule(user.id, company, id, dto);
  }

  @Delete('suggestion-rules/:id')
  @HttpCode(HttpStatus.OK)
  @RequireCompanyRole(CompanyMemberRole.ADMIN)
  deleteRule(
    @GetUser() user: User,
    @GetCompany() company: Company,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.taxService.deleteRule(user.id, company, id);
  }
}
