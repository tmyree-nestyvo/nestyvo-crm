import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { CognitoStrategy } from './cognito.strategy';
import { DevStrategy } from './dev.strategy';
import { DevAuthController } from './dev-auth.controller';
import { User } from '../database/entities/user.entity';

const DEV_BYPASS = process.env.DEV_AUTH_BYPASS === 'true';

@Module({
  imports: [
    ConfigModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.register({
      secret: 'nestyvo-dev-secret',
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
  controllers: DEV_BYPASS ? [DevAuthController] : [],
  exports: [PassportModule, JwtModule],
})
export class AuthModule {}
