import { Injectable, Logger } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import { ConfigService } from '@nestjs/config';
import { schedulingTools } from './tools/scheduling.tools';
import { waitlistTools } from './tools/waitlist.tools';
import { patientTools } from './tools/patient.tools';
import { communicationTools } from './tools/communication.tools';
import { User } from '../database/entities/user.entity';

export interface AgentMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AgentTurnResult {
  message: string;
  // When Claude wants to take a write action, we surface it for agent confirmation
  pendingAction?: {
    toolName: string;
    toolInput: Record<string, any>;
    description: string;
  };
  // After agent confirms, caller re-invokes with confirmAction=true
  toolUseId?: string;
}

const ALL_TOOLS = [...schedulingTools, ...waitlistTools, ...patientTools, ...communicationTools];

// Tools that mutate state require human confirmation before execution
const CONFIRMATION_REQUIRED = new Set([
  'schedule_appointment',
  'cancel_appointment',
  'reschedule_appointment',
  'add_to_waitlist',
  'remove_from_waitlist',
  'create_patient',
  'update_patient',
  'send_sms',
]);

const SYSTEM_PROMPT = `You are a scheduling copilot for Nestyvo, a mental health scheduling CRM. You assist scheduling agents in managing provider calendars, patient records, waitlists, and communications.

You have access to tools for:
- Searching provider availability and schedules
- Booking, rescheduling, and cancelling appointments
- Managing waitlists (search ranked matches, add/remove patients)
- Looking up and creating patient records
- Sending approved SMS templates and creating callbacks

Guidelines:
- Be concise and action-oriented. Scheduling agents are busy.
- Before booking, cancelling, or sending a message, always summarize what you're about to do and ask for confirmation.
- When a cancellation occurs, proactively search the waitlist for matches and present ranked options.
- Rank waitlist matches clearly: show patient name, wait time, preferred days match, and appointment type match.
- If you need more information to complete a task, ask one focused question.
- Never share PHI beyond what's needed to complete the current task.
- Always log scheduling attempts after contact with a patient.
- Dates and times should be presented in the provider's local timezone.`;

@Injectable()
export class AgentService {
  private readonly logger = new Logger(AgentService.name);
  private client: Anthropic;

  constructor(private configService: ConfigService) {
    this.client = new Anthropic({
      apiKey: this.configService.get<string>('anthropic.apiKey'),
    });
  }

  async chat(
    user: User,
    history: AgentMessage[],
    userMessage: string,
    executeTool: (toolName: string, input: Record<string, any>, user: User) => Promise<any>,
    pendingToolConfirmation?: { toolUseId: string; toolName: string; input: Record<string, any> },
  ): Promise<AgentTurnResult> {
    const messages: Anthropic.MessageParam[] = history.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    // If the agent just confirmed a pending action, execute it and continue
    if (pendingToolConfirmation) {
      const toolResult = await executeTool(
        pendingToolConfirmation.toolName,
        pendingToolConfirmation.input,
        user,
      );
      messages.push({
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: pendingToolConfirmation.toolUseId,
            content: JSON.stringify(toolResult),
          },
        ],
      });
    } else {
      messages.push({ role: 'user', content: userMessage });
    }

    const response = await this.client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      tools: ALL_TOOLS,
      messages,
    });

    // Handle tool use
    if (response.stop_reason === 'tool_use') {
      const toolUseBlock = response.content.find((b) => b.type === 'tool_use') as Anthropic.ToolUseBlock;
      const textBlock = response.content.find((b) => b.type === 'text') as Anthropic.TextBlock | undefined;

      if (CONFIRMATION_REQUIRED.has(toolUseBlock.name)) {
        // Surface to frontend for human confirmation — don't execute yet
        return {
          message: textBlock?.text || `I'd like to ${toolUseBlock.name.replace(/_/g, ' ')}. Please confirm.`,
          pendingAction: {
            toolName: toolUseBlock.name,
            toolInput: toolUseBlock.input as Record<string, any>,
            description: textBlock?.text || '',
          },
          toolUseId: toolUseBlock.id,
        };
      }

      // Read-only tools execute immediately
      const toolResult = await executeTool(toolUseBlock.name, toolUseBlock.input as Record<string, any>, user);

      // Continue conversation with tool result
      const continuationMessages: Anthropic.MessageParam[] = [
        ...messages,
        { role: 'assistant', content: response.content },
        {
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: toolUseBlock.id,
              content: JSON.stringify(toolResult),
            },
          ],
        },
      ];

      const continuation = await this.client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        tools: ALL_TOOLS,
        messages: continuationMessages,
      });

      const continuationText = continuation.content.find((b) => b.type === 'text') as Anthropic.TextBlock;
      return { message: continuationText?.text || '' };
    }

    // Plain text response
    const textBlock = response.content.find((b) => b.type === 'text') as Anthropic.TextBlock;
    return { message: textBlock?.text || '' };
  }
}
