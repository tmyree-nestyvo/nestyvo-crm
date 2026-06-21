import Anthropic from '@anthropic-ai/sdk';

export const schedulingTools: Anthropic.Tool[] = [
  {
    name: 'search_provider_availability',
    description: 'Find open appointment slots for a provider within a date range.',
    input_schema: {
      type: 'object',
      properties: {
        provider_id: { type: 'string', description: 'Provider UUID' },
        start_date: { type: 'string', description: 'ISO date string (YYYY-MM-DD)' },
        end_date: { type: 'string', description: 'ISO date string (YYYY-MM-DD)' },
        duration_min: { type: 'number', description: 'Appointment duration in minutes' },
        appointment_category: {
          type: 'string',
          enum: ['new_patient', 'followup', 'urgent', 'other'],
        },
      },
      required: ['provider_id', 'start_date', 'end_date', 'duration_min'],
    },
  },
  {
    name: 'schedule_appointment',
    description: 'Book an appointment for a patient with a provider. Always confirm details with the agent before calling this.',
    input_schema: {
      type: 'object',
      properties: {
        provider_id: { type: 'string' },
        patient_id: { type: 'string' },
        appointment_type_id: { type: 'string' },
        start_at: { type: 'string', description: 'ISO datetime string' },
        location_type: { type: 'string', enum: ['virtual', 'in_person'] },
      },
      required: ['provider_id', 'patient_id', 'start_at', 'location_type'],
    },
  },
  {
    name: 'cancel_appointment',
    description: 'Cancel an existing appointment and automatically create a fill opportunity.',
    input_schema: {
      type: 'object',
      properties: {
        appointment_id: { type: 'string' },
        reason: { type: 'string' },
      },
      required: ['appointment_id', 'reason'],
    },
  },
  {
    name: 'reschedule_appointment',
    description: 'Reschedule an appointment to a new time.',
    input_schema: {
      type: 'object',
      properties: {
        appointment_id: { type: 'string' },
        new_start_at: { type: 'string', description: 'ISO datetime string' },
        reason: { type: 'string' },
      },
      required: ['appointment_id', 'new_start_at'],
    },
  },
  {
    name: 'get_provider_schedule',
    description: "Get a provider's scheduled appointments for a date range.",
    input_schema: {
      type: 'object',
      properties: {
        provider_id: { type: 'string' },
        date: { type: 'string', description: 'YYYY-MM-DD, defaults to today' },
      },
      required: ['provider_id'],
    },
  },
];
