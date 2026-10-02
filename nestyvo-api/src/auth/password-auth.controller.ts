import {
  Controller, Post, Body, UnauthorizedException, BadRequestException, UseGuards, Req,
} from '@nestjs/common';
import { IsString, MinLength, IsEmail, IsOptional } from 'class-validator';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { Request } from 'express';
import { User } from '../database/entities/user.entity';
import { Public } from './decorators/public.decorator';
import { AllowDuringPasswordChange } from './decorators/allow-password-change.decorator';
import { JwtAuthGuard } from './auth.guard';
import { hashPassword, verifyPassword, generateResetToken, hashResetToken } from './password.util';

// Real password login (Charlene, Sep 30 2026 — "we'd want to ensure it was
// secure and the logins don't automatically log in for anybody"). Replaces
// the client-side auto-populate/quick-switch dev login for the shipped app;
// DevAuthController's /dev/login stays server-side (still gated behind
// DEV_AUTH_BYPASS) purely as a verification tool, no longer reachable from
// the UI — see login.tsx.
class LoginDto {
  @IsEmail() email: string;
  @IsString() password: string;
}

class ChangePasswordDto {
  // Omitted when mustChangePassword is true — a valid temp-password login
  // already proved identity for that one-time case (see PasswordChangeGuard).
  @IsOptional() @IsString() currentPassword?: string;
  @IsString() @MinLength(8) newPassword: string;
}

class ForgotPasswordDto {
  @IsEmail() email: string;
}

class ResetPasswordDto {
  @IsString() token: string;
  @IsString() @MinLength(8) newPassword: string;
}

const RESET_TOKEN_TTL_MS = 30 * 60 * 1000; // 30 minutes

@Controller('auth')
export class PasswordAuthController {
  constructor(
    private jwtService: JwtService,
    @InjectRepository(User) private userRepo: Repository<User>,
  ) {}

  @Public()
  @Post('login')
  async login(@Body() dto: LoginDto) {
    // passwordHash is `select: false` on the entity — must be requested
    // explicitly or it's silently omitted (see User entity comment).
    const user = await this.userRepo.findOne({
      where: { email: dto.email },
      select: {
        id: true, cognitoId: true, email: true, firstName: true, lastName: true,
        role: true, practiceId: true, isActive: true, passwordHash: true, mustChangePassword: true,
      },
    });

    // Deliberately one generic message for "no such account", "account
    // disabled", and "no password ever set" — this is an internal
    // scheduling-ops tool with a small, known set of accounts, not a
    // public consumer product, so the account-enumeration trade-off for a
    // clearer "contact your admin" message favors usability during active
    // partner-onboarding testing. Revisit if this app ever takes public
    // self-signup.
    const genericError = 'Incorrect email or password, or this account hasn\'t been activated yet. Contact your admin.';
    if (!user || !user.isActive || !user.passwordHash) {
      throw new UnauthorizedException(genericError);
    }

    const valid = await verifyPassword(dto.password, user.passwordHash);
    if (!valid) throw new UnauthorizedException(genericError);

    user.lastLoginAt = new Date();
    await this.userRepo.save(user);

    const token = this.jwtService.sign({ sub: user.cognitoId, email: user.email });
    return {
      token,
      user: { id: user.id, email: user.email, role: user.role, firstName: user.firstName, lastName: user.lastName },
      mustChangePassword: user.mustChangePassword,
    };
  }

  @UseGuards(JwtAuthGuard)
  @AllowDuringPasswordChange()
  @Post('change-password')
  async changePassword(@Body() dto: ChangePasswordDto, @Req() req: Request) {
    const cognitoUser = req.user as any;
    const user = await this.userRepo.findOne({
      where: { cognitoId: cognitoUser.cognitoId },
      select: { id: true, cognitoId: true, email: true, passwordHash: true, mustChangePassword: true },
    });
    if (!user) throw new UnauthorizedException();

    if (!user.mustChangePassword) {
      // Not the first-login flow — this is a real change, so prove they
      // still know the current password rather than trusting a live session
      // alone (a session could be a forgotten-open tab).
      if (!dto.currentPassword) {
        throw new BadRequestException('Current password is required.');
      }
      const valid = user.passwordHash && (await verifyPassword(dto.currentPassword, user.passwordHash));
      if (!valid) throw new UnauthorizedException('Current password is incorrect.');
    }

    if (dto.newPassword.length < 8) {
      throw new BadRequestException('New password must be at least 8 characters.');
    }

    user.passwordHash = await hashPassword(dto.newPassword);
    user.mustChangePassword = false;
    await this.userRepo.save(user);

    // Fresh token isn't strictly required (mustChangePassword is re-checked
    // from the DB on every request, not from a JWT claim — see
    // PasswordChangeGuard), but re-issuing is cheap and conventional, and
    // saves the client a second round trip to keep using the same session.
    const token = this.jwtService.sign({ sub: user.cognitoId, email: user.email });
    return { token, success: true };
  }

  // No email-sending provider exists in this codebase (checked: no
  // SendGrid/Resend/SES/SMTP) — returns the raw reset link directly in the
  // response instead of emailing it, same deliberate, flagged stand-in
  // already used in sal_tax_app's identical endpoint. A human (Troy) is the
  // one relaying it until real delivery exists. Built Oct 1 2026 after
  // Charlene got locked out with no self-service way back in and suggested
  // exactly this.
  @Public()
  @Post('forgot-password')
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    const user = await this.userRepo.findOne({ where: { email: dto.email, isActive: true } });
    const genericMessage = 'If that email has an account, a reset link has been generated.';
    if (!user) {
      // Don't reveal whether the email exists — same generic response either way.
      return { message: genericMessage };
    }

    const token = generateResetToken();
    user.passwordResetTokenHash = hashResetToken(token);
    user.passwordResetExpiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);
    await this.userRepo.save(user);

    return {
      message: genericMessage,
      // TEMPORARY — see method comment. Remove once real email delivery
      // exists; returning the token here only makes sense while a human is
      // the one calling this directly, not a real end user's own browser.
      devResetToken: token,
      expiresAt: user.passwordResetExpiresAt,
    };
  }

  @Public()
  @Post('reset-password')
  async resetPassword(@Body() dto: ResetPasswordDto) {
    const tokenHash = hashResetToken(dto.token);
    const user = await this.userRepo.findOne({
      where: { passwordResetTokenHash: tokenHash },
      select: { id: true, cognitoId: true, email: true, passwordResetTokenHash: true, passwordResetExpiresAt: true },
    });
    if (!user || !user.passwordResetExpiresAt || user.passwordResetExpiresAt < new Date()) {
      throw new BadRequestException('This reset link is invalid or has expired.');
    }

    user.passwordHash = await hashPassword(dto.newPassword);
    user.mustChangePassword = false;
    user.passwordResetTokenHash = null;
    user.passwordResetExpiresAt = null;
    await this.userRepo.save(user);

    const token = this.jwtService.sign({ sub: user.cognitoId, email: user.email });
    return { token, success: true };
  }
}
