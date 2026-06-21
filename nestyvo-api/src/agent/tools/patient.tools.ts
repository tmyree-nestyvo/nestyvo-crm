import Anthropic from '@anthropic-ai/sdk';

export const patientTools: Anthropic.Tool[] = [
  {
    name: 'search_patients',
    description: 'Search for patients by name, phone, or email.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Name, phone number, or email' },
        practice_id: { type: 'string' },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_patient',
    description: 'Get full patient record including appointment history and waitlist status.',
    input_schema: {
      type: 'object',
      properties: {
        patient_id: { type: 'string' },
      },
      required: ['patient_id'],
    },
  },
  {
    name: 'create_patient',
    description: 'Create a new patient record.',
    input_schema: {
      type: 'object',
      properties: {
        practice_id: { type: 'string' },
        first_name: { type: 'string' },
        last_name: { type: 'string' },
        dob: { type: 'string', description: 'YYYY-MM-DD' },
        phone: { type: 'string' },
        email: { type: 'string' },
        preferred_contact: { type: 'string', enum: ['phone', 'email', 'sms'] },
        referral_source: { type: 'string' },
        assigned_provider_id: { type: 'string' },
      },
      required: ['practice_id', 'first_name', 'last_name'],
    },
  },
  {
    name: 'update_patient',
    description: 'Update patient contact information or assigned provider.',
    input_schema: {
      type: 'object',
      properties: {
        patient_id: { type: 'string' },
        phone: { type: 'string' },
        email: { type: 'string' },
        preferred_contact: { type: 'string', enum: ['phone', 'email', 'sms'] },
        assigned_provider_id: { type: 'string' },
        notes: { type: 'string' },
      },
      required: ['patient_id'],
    },
  },
  {
    name: 'log_scheduling_attempt',
    description: 'Log a contact attempt for a patient (call, SMS, voicemail, etc).',
    input_schema: {
      type: 'object',
      properties: {
        patient_id: { type: 'string' },
        attempt_type: { type: 'string', enum: ['call', 'sms', 'email', 'voicemail'] },
        outcome: {
          type: 'string',
          enum: ['reached', 'no_answer', 'voicemail', 'busy', 'wrong_number', 'scheduled', 'declined'],
        },
        notes: { type: 'string' },
      },
      required: ['patient_id', 'attempt_type', 'outcome'],
    },
  },
];
