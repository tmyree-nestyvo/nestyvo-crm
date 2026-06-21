import Anthropic from '@anthropic-ai/sdk';

export const communicationTools: Anthropic.Tool[] = [
  {
    name: 'send_sms',
    description: 'Send an approved SMS template to a patient.',
    input_schema: {
      type: 'object',
      properties: {
        patient_id: { type: 'string' },
        template_id: { type: 'string', description: 'ID of approved SMS template' },
        variables: {
          type: 'object',
          description: 'Template variable substitutions (e.g. { provider_name, date, time })',
        },
      },
      required: ['patient_id', 'template_id'],
    },
  },
  {
    name: 'get_sms_templates',
    description: 'List available approved SMS templates for the current practice.',
    input_schema: {
      type: 'object',
      properties: {
        template_type: {
          type: 'string',
          enum: ['reminder', 'reschedule_request', 'waitlist_notify', 'cancellation_opening', 'followup_reminder', 'custom'],
        },
      },
    },
  },
  {
    name: 'create_callback',
    description: 'Create a callback request for a patient.',
    input_schema: {
      type: 'object',
      properties: {
        patient_id: { type: 'string' },
        source: { type: 'string', enum: ['missed_call', 'voicemail', 'website', 'rescheduling_request', 'agent_created'] },
        notes: { type: 'string' },
        due_at: { type: 'string', description: 'ISO datetime when callback should happen' },
      },
      required: ['patient_id', 'source'],
    },
  },
  {
    name: 'get_open_callbacks',
    description: 'Get open callback requests assigned to the current agent.',
    input_schema: {
      type: 'object',
      properties: {
        include_overdue: { type: 'boolean', default: true },
      },
    },
  },
];
