import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { CognitoStrategy } from './cognito.strategy';
import { DevStrategy } from './dev.strategy';
import { DevAuthController } from './dev-auth.controller';
import { PasswordAuthController } from './password-auth.controller';
import { User } from '../database/entities/user.entity';

const DEV_BYPASS = process.env.DEV_AUTH_BYPASS === 'true';

@Module({
  imports: [
    ConfigModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.register({
      // Required at boot when DEV_AUTH_BYPASS=true (see DevStrategy) —
      // never a hardcoded literal. Real Cognito mode doesn't sign tokens
      // with this at all (CognitoStrategy verifies against AWS's own
      // JWKS), so this only matters while the bypass is in use.
      secret: process.env.JWT_SECRET ?? 'unset-jwt-secret-cognito-mode-only',
      signOptions: { expiresIn: '8h' },
    }),
    TypeOrmModule.forFeature([User]),
  ],
  providers: [
    {
      provide: 'JWT_STRATEGY',
      useFactory: (config: ConfigService) => {
        if (DEV_BYPASS) return new DevStrategy();
        return new CognitoStrategy(config);
      },
      inject: [ConfigService],
    },
  ],
  // PasswordAuthController (real email+password login) is the actual
  // production auth mechanism now and stays registered regardless of
  // DEV_AUTH_BYPASS. DevAuthController's /dev/login stays DEV_BYPASS-gated,
  // server-side only, verification/emergency-access use — see its own
  // comment for why it isn't removed outright.
  controllers: DEV_BYPASS ? [DevAuthController, PasswordAuthController] : [PasswordAuthController],
  exports: [PassportModule, JwtModule],
})
export class AuthModule {}
