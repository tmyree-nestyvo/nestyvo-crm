import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { IsString, IsArray, IsBoolean, IsOptional, IsObject, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { JwtAuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserRole, User } from '../database/entities/user.entity';
import { AgentService, AgentMessage } from './agent.service';
import { AgentToolExecutorService } from './agent-tool-executor.service';

class AgentMessageDto {
  @IsString() role: 'user' | 'assistant';
  @IsString() content: string;
}

class ChatDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AgentMessageDto)
  history: AgentMessage[];

  @IsString()
  message: string;

  @IsOptional() @IsBoolean()
  confirmAction?: boolean;

  @IsOptional() @IsString()
  pendingToolUseId?: string;

  @IsOptional() @IsString()
  pendingToolName?: string;

  @IsOptional() @IsObject()
  pendingToolInput?: Record<string, any>;
}

@Controller('agent')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AgentController {
  constructor(
    private agentService: AgentService,
    private toolExecutor: AgentToolExecutorService,
  ) {}

  @Post('chat')
  @Roles(UserRole.SCHEDULING_AGENT, UserRole.ADMINISTRATOR, UserRole.PRACTICE_MANAGER)
  async chat(@Body() dto: ChatDto, @CurrentUser() user: User) {
    const pendingConfirmation =
      dto.confirmAction && dto.pendingToolUseId && dto.pendingToolName && dto.pendingToolInput
        ? {
            toolUseId: dto.pendingToolUseId,
            toolName: dto.pendingToolName,
            input: dto.pendingToolInput,
          }
        : undefined;

    return this.agentService.chat(
      user,
      dto.history || [],
      dto.message,
      (toolName, input, u) => this.toolExecutor.execute(toolName, input, u),
      pendingConfirmation,
    );
  }
}
