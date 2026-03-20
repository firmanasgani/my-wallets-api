import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { LogsService } from '../../logs/logs.service';
import {
  Company,
  CompanyMember,
  CompanyMemberRole,
  CompanyMemberStatus,
  LogActionType,
  SubscriptionStatus,
} from '@prisma/client';
import { Resend } from 'resend';
import * as crypto from 'crypto';
import { InviteMemberDto } from './dto/invite-member.dto';
import { UpdateMemberRoleDto } from './dto/update-role.dto';
import { MinioService } from '../../common/minio/minio.service';

const MAX_MEMBERS = 5;

const PAID_PLAN_CODES = [
  'PREMIUM_1M', 'PREMIUM_6M', 'PREMIUM_1Y',
  'BUSINESS_1M', 'BUSINESS_6M', 'BUSINESS_12M',
];

const ROLE_HIERARCHY: Record<CompanyMemberRole, number> = {
  [CompanyMemberRole.VIEWER]: 0,
  [CompanyMemberRole.STAFF]: 1,
  [CompanyMemberRole.ADMIN]: 2,
  [CompanyMemberRole.OWNER]: 3,
};

const INVITE_TOKEN_TTL_MINUTES = 30;

@Injectable()
export class MembersService {
  private readonly resend: Resend;

  constructor(
    private prisma: PrismaService,
    private logsService: LogsService,
    private minioService: MinioService,
  ) {
    this.resend = new Resend(process.env.RESEND_API_KEY);
  }

  async findAll(company: Company) {
    const members = await this.prisma.companyMember.findMany({
      where: {
        companyId: company.id,
        status: { not: CompanyMemberStatus.REVOKED },
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            username: true,
            fullName: true,
            profilePicture: true,
          },
        },
      },
      orderBy: { invitedAt: 'asc' },
    });

    return Promise.all(
      members.map(async (member) => {
        let profilePictureUrl: string | null = null;
        if (member.user?.profilePicture) {
          try {
            profilePictureUrl = await this.minioService.getFileUrl(member.user.profilePicture);
          } catch {
            profilePictureUrl = null;
          }
        }
        return {
          ...member,
          user: { ...member.user, profilePictureUrl },
        };
      }),
    );
  }

  async invite(
    inviterId: string,
    company: Company,
    inviterMember: CompanyMember,
    dto: InviteMemberDto,
  ) {
    // Only OWNER and ADMIN can invite
    if (ROLE_HIERARCHY[inviterMember.role] < ROLE_HIERARCHY[CompanyMemberRole.ADMIN]) {
      throw new ForbiddenException('Only OWNER or ADMIN can invite members.');
    }

    // Check member limit (ACTIVE + PENDING)
    const activeCount = await this.prisma.companyMember.count({
      where: {
        companyId: company.id,
        status: { in: [CompanyMemberStatus.ACTIVE, CompanyMemberStatus.PENDING] },
      },
    });

    if (activeCount >= MAX_MEMBERS) {
      throw new BadRequestException(
        `Company has reached the maximum of ${MAX_MEMBERS} members.`,
      );
    }

    // Check if invitee is a registered user
    const invitee = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    // If not registered, send a "please register first" email and return early
    if (!invitee) {
      await this.sendRegistrationInvitationEmail({
        toEmail: dto.email,
        companyName: company.name,
        role: dto.role,
      });

      return {
        message: `${dto.email} is not registered yet. A registration invitation email has been sent.`,
        memberId: null,
      };
    }

    // Cannot invite yourself
    if (invitee.id === inviterId) {
      throw new BadRequestException('You cannot invite yourself.');
    }

    // Check if already a member (ACTIVE or PENDING)
    const existing = await this.prisma.companyMember.findFirst({
      where: {
        companyId: company.id,
        userId: invitee.id,
        status: { in: [CompanyMemberStatus.ACTIVE, CompanyMemberStatus.PENDING] },
      },
    });

    if (existing) {
      const statusLabel =
        existing.status === CompanyMemberStatus.ACTIVE ? 'already an active member' : 'already has a pending invitation';
      throw new BadRequestException(`This user is ${statusLabel} of the company.`);
    }

    // Cannot invite users with active Premium or Business subscription
    const inviteeActivePaidSub = await this.prisma.userSubscription.findFirst({
      where: {
        userId: invitee.id,
        status: SubscriptionStatus.ACTIVE,
        plan: { code: { in: PAID_PLAN_CODES } },
      },
    });

    if (inviteeActivePaidSub) {
      throw new BadRequestException(
        'This user already has an active Premium or Business subscription and cannot be invited as a member.',
      );
    }

    // Generate invite token
    const inviteToken = crypto.randomBytes(32).toString('hex');
    const inviteTokenExpiresAt = new Date(
      Date.now() + INVITE_TOKEN_TTL_MINUTES * 60 * 1000,
    );

    // Upsert CompanyMember (handle previously REVOKED member)
    const member = await this.prisma.companyMember.upsert({
      where: { companyId_userId: { companyId: company.id, userId: invitee.id } },
      create: {
        companyId: company.id,
        userId: invitee.id,
        role: dto.role,
        status: CompanyMemberStatus.PENDING,
        invitedAt: new Date(),
        inviteToken,
        inviteTokenExpiresAt,
      },
      update: {
        role: dto.role,
        status: CompanyMemberStatus.PENDING,
        invitedAt: new Date(),
        joinedAt: null,
        inviteToken,
        inviteTokenExpiresAt,
      },
    });

    // Send invitation email
    await this.sendInvitationEmail({
      toEmail: invitee.email,
      toName: invitee.fullName || invitee.username,
      companyName: company.name,
      role: dto.role,
      token: inviteToken,
    });

    await this.logsService.create({
      userId: inviterId,
      actionType: LogActionType.BUSINESS_MEMBER_INVITE,
      entityType: 'CompanyMember',
      entityId: member.id,
      description: `User ${invitee.email} invited to company "${company.name}" as ${dto.role}.`,
      details: { inviteeEmail: invitee.email, role: dto.role },
    });

    return {
      message: `Invitation sent to ${invitee.email}. The invite link will expire in ${INVITE_TOKEN_TTL_MINUTES} minutes.`,
      memberId: member.id,
    };
  }

  async acceptInvite(userId: string, token: string) {
    const member = await this.prisma.companyMember.findUnique({
      where: { inviteToken: token },
      include: { company: true },
    });

    if (!member) {
      throw new NotFoundException('Invalid or expired invitation token.');
    }

    if (member.userId !== userId) {
      throw new ForbiddenException('This invitation was not sent to your account.');
    }

    if (member.status !== CompanyMemberStatus.PENDING) {
      throw new BadRequestException(
        'This invitation is no longer valid (already accepted or revoked).',
      );
    }

    if (!member.inviteTokenExpiresAt || member.inviteTokenExpiresAt < new Date()) {
      throw new BadRequestException('Invitation token has expired.');
    }

    const updated = await this.prisma.companyMember.update({
      where: { id: member.id },
      data: {
        status: CompanyMemberStatus.ACTIVE,
        joinedAt: new Date(),
        inviteToken: null,
        inviteTokenExpiresAt: null,
      },
      include: { company: { select: { id: true, name: true } } },
    });

    // Assign BUSINESS_MEMBER subscription to the invited user
    const businessMemberPlan = await this.prisma.subscriptionPlan.findUnique({
      where: { code: 'BUSINESS_MEMBER' },
    });

    if (businessMemberPlan) {
      const existingSub = await this.prisma.userSubscription.findFirst({
        where: { userId, plan: { code: 'BUSINESS_MEMBER' } },
      });

      if (existingSub) {
        await this.prisma.userSubscription.update({
          where: { id: existingSub.id },
          data: { status: SubscriptionStatus.ACTIVE, startDate: new Date(), endDate: null },
        });
      } else {
        await this.prisma.userSubscription.create({
          data: {
            userId,
            subscriptionPlanId: businessMemberPlan.id,
            status: SubscriptionStatus.ACTIVE,
            startDate: new Date(),
          },
        });
      }
    }

    return {
      message: `You have successfully joined "${updated.company.name}".`,
      companyId: updated.company.id,
      companyName: updated.company.name,
      role: updated.role,
    };
  }

  async updateRole(
    invokerId: string,
    company: Company,
    invokerMember: CompanyMember,
    memberId: string,
    dto: UpdateMemberRoleDto,
  ) {
    // Only OWNER can change roles
    if (invokerMember.role !== CompanyMemberRole.OWNER) {
      throw new ForbiddenException('Only the OWNER can update member roles.');
    }

    const target = await this.prisma.companyMember.findFirst({
      where: { id: memberId, companyId: company.id },
    });

    if (!target) {
      throw new NotFoundException('Member not found in this company.');
    }

    if (target.userId === invokerId) {
      throw new BadRequestException('You cannot change your own role.');
    }

    if (target.role === CompanyMemberRole.OWNER) {
      throw new BadRequestException("Cannot change the OWNER's role.");
    }

    if (target.status === CompanyMemberStatus.REVOKED) {
      throw new BadRequestException('Cannot update role of a revoked member.');
    }

    const updated = await this.prisma.companyMember.update({
      where: { id: memberId },
      data: { role: dto.role },
      include: {
        user: { select: { email: true, username: true } },
      },
    });

    await this.logsService.create({
      userId: invokerId,
      actionType: LogActionType.BUSINESS_MEMBER_ROLE_UPDATE,
      entityType: 'CompanyMember',
      entityId: memberId,
      description: `Member ${updated.user.email} role updated to ${dto.role} in company "${company.name}".`,
      details: { newRole: dto.role, previousRole: target.role },
    });

    return updated;
  }

  async revoke(
    invokerId: string,
    company: Company,
    invokerMember: CompanyMember,
    memberId: string,
  ) {
    const target = await this.prisma.companyMember.findFirst({
      where: { id: memberId, companyId: company.id },
      include: { user: { select: { email: true, username: true } } },
    });

    if (!target) {
      throw new NotFoundException('Member not found in this company.');
    }

    // Cannot revoke OWNER
    if (target.role === CompanyMemberRole.OWNER) {
      throw new BadRequestException('Cannot revoke the OWNER of a company.');
    }

    // Cannot revoke yourself
    if (target.userId === invokerId) {
      throw new BadRequestException('You cannot revoke yourself.');
    }

    // ADMIN can only revoke STAFF/VIEWER
    if (
      invokerMember.role === CompanyMemberRole.ADMIN &&
      target.role === CompanyMemberRole.ADMIN
    ) {
      throw new ForbiddenException('An ADMIN cannot revoke another ADMIN.');
    }

    if (target.status === CompanyMemberStatus.REVOKED) {
      throw new BadRequestException('Member is already revoked.');
    }

    await this.prisma.companyMember.update({
      where: { id: memberId },
      data: {
        status: CompanyMemberStatus.REVOKED,
        inviteToken: null,
        inviteTokenExpiresAt: null,
      },
    });

    // Cancel the BUSINESS_MEMBER subscription of the revoked user
    const memberSub = await this.prisma.userSubscription.findFirst({
      where: { userId: target.userId, plan: { code: 'BUSINESS_MEMBER' } },
    });

    if (memberSub) {
      await this.prisma.userSubscription.update({
        where: { id: memberSub.id },
        data: { status: SubscriptionStatus.CANCELLED, endDate: new Date() },
      });
    }

    await this.logsService.create({
      userId: invokerId,
      actionType: LogActionType.BUSINESS_MEMBER_REVOKE,
      entityType: 'CompanyMember',
      entityId: memberId,
      description: `Member ${target.user.email} revoked from company "${company.name}".`,
      details: { revokedRole: target.role },
    });

    return { message: `Member ${target.user.email} has been revoked.` };
  }

  private async sendRegistrationInvitationEmail(params: {
    toEmail: string;
    companyName: string;
    role: string;
  }) {
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const registerUrl = `${frontendUrl}/register?email=${encodeURIComponent(params.toEmail)}&ref=invite`;
    const from = process.env.SMTP_FROM || 'Moneytory <noreply@moneytory.com>';

    const roleLabels: Record<string, string> = {
      ADMIN: 'Admin',
      STAFF: 'Staff',
      VIEWER: 'Viewer',
    };
    const roleLabel = roleLabels[params.role] ?? params.role;

    await this.resend.emails.send({
      from,
      to: params.toEmail,
      subject: `You're invited to join ${params.companyName} on Moneytory`,
      html: `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Company Invitation</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 0;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
          <tr>
            <td style="background:linear-gradient(135deg,#6366f1,#8b5cf6);padding:36px 40px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-size:26px;font-weight:700;letter-spacing:-0.5px;">Moneytory</h1>
              <p style="margin:6px 0 0;color:rgba(255,255,255,0.8);font-size:13px;">Business</p>
            </td>
          </tr>
          <tr>
            <td style="padding:40px 40px 32px;">
              <h2 style="margin:0 0 12px;color:#1e1b4b;font-size:20px;font-weight:600;">You've been invited!</h2>
              <p style="margin:0 0 20px;color:#4b5563;font-size:15px;line-height:1.6;">
                Hi there,<br/><br/>
                You have been invited to join <strong>${params.companyName}</strong> on Moneytory as a <strong>${roleLabel}</strong>.
              </p>
              <table cellpadding="0" cellspacing="0" style="margin-bottom:20px;">
                <tr>
                  <td style="background:#ede9fe;border-radius:6px;padding:8px 16px;">
                    <span style="color:#6d28d9;font-size:13px;font-weight:600;">Role: ${roleLabel}</span>
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 8px;color:#4b5563;font-size:14px;line-height:1.6;">
                It looks like you don't have a Moneytory account yet. Please register first using the button below, then let the company admin know so they can send you the invitation.
              </p>
              <table cellpadding="0" cellspacing="0" style="margin:24px 0 32px;">
                <tr>
                  <td style="background:linear-gradient(135deg,#6366f1,#8b5cf6);border-radius:8px;">
                    <a href="${registerUrl}" target="_blank"
                       style="display:inline-block;padding:14px 32px;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;letter-spacing:0.2px;">
                      Create an Account
                    </a>
                  </td>
                </tr>
              </table>
              <hr style="border:none;border-top:1px solid #e5e7eb;margin:0 0 24px;" />
              <p style="margin:0;color:#9ca3af;font-size:12px;line-height:1.5;">
                If you didn't expect this invitation, you can safely ignore this email.
              </p>
            </td>
          </tr>
          <tr>
            <td style="background:#f9fafb;padding:20px 40px;text-align:center;border-top:1px solid #e5e7eb;">
              <p style="margin:0;color:#9ca3af;font-size:12px;">© 2026 Moneytory. All rights reserved.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`.trim(),
    });
  }

  private async sendInvitationEmail(params: {
    toEmail: string;
    toName: string;
    companyName: string;
    role: string;
    token: string;
  }) {
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const acceptUrl = `${frontendUrl}/business/invite/accept?token=${params.token}`;

    const from =
      process.env.SMTP_FROM || 'Moneytory <noreply@moneytory.com>';

    await this.resend.emails.send({
      from,
      to: params.toEmail,
      subject: `You're invited to join ${params.companyName} on Moneytory`,
      html: this.buildInvitationEmailHtml({
        toName: params.toName,
        companyName: params.companyName,
        role: params.role,
        acceptUrl,
      }),
    });
  }

  private buildInvitationEmailHtml(params: {
    toName: string;
    companyName: string;
    role: string;
    acceptUrl: string;
  }): string {
    const roleLabels: Record<string, string> = {
      ADMIN: 'Admin',
      STAFF: 'Staff',
      VIEWER: 'Viewer',
    };
    const roleLabel = roleLabels[params.role] ?? params.role;

    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Company Invitation</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 0;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#6366f1,#8b5cf6);padding:36px 40px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-size:26px;font-weight:700;letter-spacing:-0.5px;">Moneytory</h1>
              <p style="margin:6px 0 0;color:rgba(255,255,255,0.8);font-size:13px;">Business</p>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:40px 40px 32px;">
              <h2 style="margin:0 0 12px;color:#1e1b4b;font-size:20px;font-weight:600;">You've been invited!</h2>
              <p style="margin:0 0 20px;color:#4b5563;font-size:15px;line-height:1.6;">
                Hi <strong>${params.toName}</strong>,<br/><br/>
                You have been invited to join <strong>${params.companyName}</strong> on Moneytory as a <strong>${roleLabel}</strong>.
              </p>
              <!-- Role badge -->
              <table cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
                <tr>
                  <td style="background:#ede9fe;border-radius:6px;padding:8px 16px;">
                    <span style="color:#6d28d9;font-size:13px;font-weight:600;">Role: ${roleLabel}</span>
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 28px;color:#4b5563;font-size:14px;line-height:1.6;">
                Click the button below to accept the invitation. This link will expire in <strong>30 minutes</strong>.
              </p>
              <!-- CTA Button -->
              <table cellpadding="0" cellspacing="0" style="margin-bottom:32px;">
                <tr>
                  <td style="background:linear-gradient(135deg,#6366f1,#8b5cf6);border-radius:8px;">
                    <a href="${params.acceptUrl}" target="_blank"
                       style="display:inline-block;padding:14px 32px;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;letter-spacing:0.2px;">
                      Accept Invitation
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 8px;color:#6b7280;font-size:12px;">Or copy this link to your browser:</p>
              <p style="margin:0 0 28px;color:#6366f1;font-size:12px;word-break:break-all;">${params.acceptUrl}</p>
              <hr style="border:none;border-top:1px solid #e5e7eb;margin:0 0 24px;" />
              <p style="margin:0;color:#9ca3af;font-size:12px;line-height:1.5;">
                If you didn't expect this invitation, you can safely ignore this email. The link will expire automatically.
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background:#f9fafb;padding:20px 40px;text-align:center;border-top:1px solid #e5e7eb;">
              <p style="margin:0;color:#9ca3af;font-size:12px;">© 2026 Moneytory. All rights reserved.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`.trim();
  }
}
