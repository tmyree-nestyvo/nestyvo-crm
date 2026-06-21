import Anthropic from '@anthropic-ai/sdk';

export const waitlistTools: Anthropic.Tool[] = [
  {
    name: 'search_waitlist',
    description: 'Search the waitlist for patients who match an open appointment slot. Returns ranked results.',
    input_schema: {
      type: 'object',
      properties: {
        provider_id: { type: 'string' },
        slot_start_at: { type: 'string', description: 'ISO datetime of the open slot' },
        appointment_type_id: { type: 'string' },
        limit: { type: 'number', description: 'Max results to return, default 10' },
      },
      required: ['provider_id', 'slot_start_at'],
    },
  },
  {
    name: 'add_to_waitlist',
    description: 'Add a patient to a provider waitlist.',
    input_schema: {
      type: 'object',
      properties: {
        patient_id: { type: 'string' },
        provider_id: { type: 'string' },
        waitlist_type: { type: 'string', enum: ['new_patient', 'followup', 'urgent'] },
        appointment_type_id: { type: 'string' },
        preferred_days: {
          type: 'array',
          items: { type: 'number' },
          description: 'Day numbers 0=Sun…6=Sat',
        },
        preferred_times: {
          type: 'object',
          properties: {
            morning: { type: 'boolean' },
            afternoon: { type: 'boolean' },
            evening: { type: 'boolean' },
          },
        },
        notes: { type: 'string' },
      },
      required: ['patient_id', 'provider_id', 'waitlist_type'],
    },
  },
  {
    name: 'get_waitlist',
    description: "Get all active waitlist entries for a provider.",
    input_schema: {
      type: 'object',
      properties: {
        provider_id: { type: 'string' },
        waitlist_type: { type: 'string', enum: ['new_patient', 'followup', 'urgent'] },
      },
      required: ['provider_id'],
    },
  },
  {
    name: 'remove_from_waitlist',
    description: 'Remove or mark a waitlist entry as scheduled/removed.',
    input_schema: {
      type: 'object',
      properties: {
        waitlist_entry_id: { type: 'string' },
        reason: { type: 'string', enum: ['scheduled', 'removed', 'declined'] },
      },
      required: ['waitlist_entry_id', 'reason'],
    },
  },
];
