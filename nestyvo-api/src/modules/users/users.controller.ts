import { Controller, Get, Post, Body, Req, UseGuards } from '@nestjs/common';
import { IsString, IsEmail, IsEnum, IsOptional } from 'class-validator';
import { JwtAuthGuard } from '../../auth/auth.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { ADMIN_ONLY } from '../../auth/role-groups';
import { UserRole } from '../../database/entities/user.entity';
import { UsersService } from './users.service';

class CreateUserDto {
  @IsEmail() email: string;
  @IsString() firstName: string;
  @IsString() lastName: string;
  @IsEnum(UserRole) role: UserRole;
  @IsOptional() @IsString() practiceId?: string;
  @IsOptional() @IsString() phone?: string;
}

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Get('me')
  async getMe(@Req() req: any) {
    const user = await this.usersService.findByCognitoId(req.user.cognitoId);
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      practiceId: user.practiceId,
      practiceName: (user as any).practice?.name,
    };
  }

  // Admin-only: create a login for a new partner provider or a new staff
  // hire (e.g. a remote scheduling agent). See UsersService.create for why
  // this exists and how it's temporarily standing in for real Cognito.
  @Post()
  @UseGuards(RolesGuard)
  @Roles(...ADMIN_ONLY)
  create(@Body() dto: CreateUserDto) {
    return this.usersService.create(dto);
  }
}
