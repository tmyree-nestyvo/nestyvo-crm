import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClientTagsService } from './client-tags.service';
import { ClientTagsController } from './client-tags.controller';
import { ClientTag } from '../../database/entities/client-tag.entity';
import { User } from '../../database/entities/user.entity';
import { Provider } from '../../database/entities/provider.entity';

@Module({
  imports: [TypeOrmModule.forFeature([ClientTag, User, Provider])],
  providers: [ClientTagsService],
  controllers: [ClientTagsController],
  exports: [ClientTagsService],
})
export class ClientTagsModule {}
