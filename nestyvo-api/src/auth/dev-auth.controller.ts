import { Controller, Post, Body, Get } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User, UserRole } from '../database/entities/user.entity';
import { Public } from './decorators/public.decorator';

// Only active when DEV_AUTH_BYPASS=true — never compiled into production.
@Controller('dev')
export class DevAuthController {
  constructor(
    private jwtService: JwtService,
    @InjectRepository(User) private userRepo: Repository<User>,
  ) {}

  @Public()
  @Get('users')
  async listUsers() {
    return this.userRepo.find({ select: { id: true, email: true, role: true, firstName: true, lastName: true } });
  }

  @Public()
  @Post('login')
  async mockLogin(@Body() body: { email: string }) {
    let user = await this.userRepo.findOne({ where: { email: body.email } });

    if (!user) {
      // Auto-create the user on first dev login
      user = this.userRepo.create({
        cognitoId: `dev-${body.email}`,
        email: body.email,
        firstName: body.email.split('@')[0],
        lastName: 'Demo',
        role: (body as any).role ?? UserRole.SCHEDULING_AGENT,
        isActive: true,
      });
      await this.userRepo.save(user);
    }

    const token = this.jwtService.sign({
      sub: user.cognitoId,
      email: user.email,
    });

    return { token, user: { id: user.id, email: user.email, role: user.role } };
  }
}
