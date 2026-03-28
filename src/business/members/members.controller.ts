import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { MembersService } from './members.service';
import { BusinessSubscriptionGuard } from '../guards/business-subscription.guard';
import { CompanyMemberGuard } from '../guards/company-member.guard';
import { CompanyRoleGuard } from '../guards/company-role.guard';
import { RequireCompanyRole } from '../decorators/require-company-role.decorator';
import { GetCompany } from '../decorators/get-company.decorator';
import { GetCompanyMember } from '../decorators/get-company-member.decorator';
import { GetUser } from '../../common/decorators/get-user.decorator';
import { Company, CompanyMember, CompanyMemberRole, User } from '@prisma/client';
import { InviteMemberDto } from './dto/invite-member.dto';
import { UpdateMemberRoleDto } from './dto/update-role.dto';
import { AcceptInviteDto } from './dto/accept-invite.dto';

@Controller('business/members')
export class MembersController {
  constructor(private readonly membersService: MembersService) {}

  /**
   * GET /business/members
   * List all non-revoked members. Requires: active membership (VIEWER+).
   */
  @Get()
  @UseGuards(BusinessSubscriptionGuard, CompanyMemberGuard, CompanyRoleGuard)
  @RequireCompanyRole(CompanyMemberRole.VIEWER)
  findAll(@GetCompany() company: Company) {
    return this.membersService.findAll(company);
  }

  /**
   * POST /business/members/invite
   * Invite a registered user by email. Requires: ADMIN or OWNER.
   */
  @Post('invite')
  @UseGuards(BusinessSubscriptionGuard, CompanyMemberGuard, CompanyRoleGuard)
  @RequireCompanyRole(CompanyMemberRole.ADMIN)
  invite(
    @GetUser() user: User,
    @GetCompany() company: Company,
    @GetCompanyMember() invokerMember: CompanyMember,
    @Body() dto: InviteMemberDto,
  ) {
    return this.membersService.invite(user.id, company, invokerMember, dto);
  }

  /**
   * POST /business/members/accept
   * Accept a pending invitation using the token from the email link.
   * Requires: JWT only (invitee must be logged in — no company guard).
   */
  @Post('accept')
  acceptInvite(@GetUser() user: User, @Body() dto: AcceptInviteDto) {
    return this.membersService.acceptInvite(user.id, dto.token);
  }

  /**
   * PUT /business/members/:id/role
   * Update a member's role. OWNER only.
   */
  @Put(':id/role')
  @UseGuards(BusinessSubscriptionGuard, CompanyMemberGuard, CompanyRoleGuard)
  @RequireCompanyRole(CompanyMemberRole.OWNER)
  updateRole(
    @GetUser() user: User,
    @GetCompany() company: Company,
    @GetCompanyMember() invokerMember: CompanyMember,
    @Param('id', ParseUUIDPipe) memberId: string,
    @Body() dto: UpdateMemberRoleDto,
  ) {
    return this.membersService.updateRole(user.id, company, invokerMember, memberId, dto);
  }

  /**
   * DELETE /business/members/:id
   * Revoke a member's access. ADMIN+ only.
   */
  @Delete(':id')
  @UseGuards(BusinessSubscriptionGuard, CompanyMemberGuard, CompanyRoleGuard)
  @RequireCompanyRole(CompanyMemberRole.ADMIN)
  revoke(
    @GetUser() user: User,
    @GetCompany() company: Company,
    @GetCompanyMember() invokerMember: CompanyMember,
    @Param('id', ParseUUIDPipe) memberId: string,
  ) {
    return this.membersService.revoke(user.id, company, invokerMember, memberId);
  }
}
