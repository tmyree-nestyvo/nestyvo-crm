import axios from 'axios';
import { API_BASE_URL } from './constants';
import { useAuthStore } from './store';

export { API_BASE_URL };

export const api = axios.create({ baseURL: API_BASE_URL });

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Agent copilot
export type AgentMessage = { role: 'user' | 'assistant'; content: string };

export interface AgentTurnResult {
  message: string;
  pendingAction?: {
    toolName: string;
    toolInput: Record<string, any>;
    description: string;
  };
  toolUseId?: string;
}

export async function agentChat(
  history: AgentMessage[],
  message: string,
): Promise<AgentTurnResult> {
  const { data } = await api.post<AgentTurnResult>('/agent/chat', { history, message });
  return data;
}

export async function agentConfirm(
  history: AgentMessage[],
  toolUseId: string,
  toolName: string,
  toolInput: Record<string, any>,
): Promise<AgentTurnResult> {
  const { data } = await api.post<AgentTurnResult>('/agent/chat', {
    history,
    message: '',
    confirmAction: true,
    pendingToolUseId: toolUseId,
    pendingToolName: toolName,
    pendingToolInput: toolInput,
  });
  return data;
}

// Patients
export const patientsApi = {
  search: (q: string) => api.get('/patients', { params: { q } }).then((r) => r.data),
  get: (id: string) => api.get(`/patients/${id}`).then((r) => r.data),
  create: (input: {
    practiceId?: string;
    firstName: string;
    lastName: string;
    phone?: string;
    email?: string;
    preferredContact?: string;
    assignedProviderId?: string;
    referralSource?: string;
    tagId?: string;
  }) => api.post('/patients', input).then((r) => r.data),
};

// Providers
export const providersApi = {
  list: (practiceId?: string) => api.get('/providers', { params: { practiceId } }).then((r) => r.data),
  getSchedule: (id: string, date?: string) =>
    api.get(`/providers/${id}/schedule`, { params: { date } }).then((r) => r.data),
  getAvailability: (id: string) => api.get(`/providers/${id}/availability`).then((r) => r.data),
  replaceAvailability: (id: string, windows: { dayOfWeek: number; startTime: string; endTime: string }[]) =>
    api.put(`/providers/${id}/availability`, { windows }).then((r) => r.data),
  getBlocks: (id: string) => api.get(`/providers/${id}/blocks`).then((r) => r.data),
  createRecurringBlock: (
    id: string,
    input: {
      frequency?: 'daily' | 'weekly' | 'monthly';
      dayOfWeek?: number;
      dayOfMonth?: number;
      startTime: string;
      endTime: string;
      endDate?: string;
      weeks?: number;
      reason?: string;
    },
  ) => api.post(`/providers/${id}/recurring-block`, input).then((r) => r.data),
  deleteBlock: (id: string, blockId: string) =>
    api.delete(`/providers/${id}/blocks/${blockId}`).then((r) => r.data),
};

// Practices (admin/agent cross-practice picker)
export const practicesApi = {
  list: () => api.get('/practices').then((r) => r.data),
};

// Waitlist
export const waitlistApi = {
  add: (input: {
    patientId: string;
    providerId?: string;
    waitlistType: string;
    preferredDays?: number[];
    preferredTimes?: Record<string, boolean>;
    notes?: string;
  }) => api.post('/waitlist', input).then((r) => r.data),
};

// Reminders (public, unauthenticated — patient self-service cancel link)
export const remindersApi = {
  get: (reminderId: string) => api.get(`/reminders/${reminderId}`).then((r) => r.data),
  cancel: (reminderId: string) => api.post(`/reminders/${reminderId}/cancel`).then((r) => r.data),
};

// Patient links (admin-only cross-practice customer linking)
export const patientLinksApi = {
  getLinks: (patientId: string) => api.get(`/patients/${patientId}/links`).then((r) => r.data),
  getSuggestions: (patientId: string) =>
    api.get(`/patients/${patientId}/link-suggestions`).then((r) => r.data),
  create: (patientAId: string, patientBId: string) =>
    api.post('/patient-links', { patientAId, patientBId }).then((r) => r.data),
  remove: (linkId: string) => api.delete(`/patient-links/${linkId}`).then((r) => r.data),
};

// Client tags (block-size classification)
export const clientTagsApi = {
  list: (practiceId?: string) => api.get('/client-tags', { params: { practiceId } }).then((r) => r.data),
  create: (name: string, blockMinutes: number) =>
    api.post('/client-tags', { name, blockMinutes }).then((r) => r.data),
  update: (id: string, updates: { name?: string; blockMinutes?: number; isActive?: boolean }) =>
    api.patch(`/client-tags/${id}`, updates).then((r) => r.data),
  remove: (id: string) => api.delete(`/client-tags/${id}`).then((r) => r.data),
  setPatientTag: (patientId: string, tagId: string | null) =>
    api.patch(`/patients/${patientId}/tag`, { tagId }).then((r) => r.data),
};

// Tickets (agent → office escalation)
export const ticketsApi = {
  list: (status?: string, patientId?: string) => api.get('/tickets', { params: { status, patientId } }).then((r) => r.data),
  get: (id: string) => api.get(`/tickets/${id}`).then((r) => r.data),
  create: (input: { patientId?: string; category: string; priority?: string; subject: string; description: string }) =>
    api.post('/tickets', input).then((r) => r.data),
  update: (id: string, updates: { status?: string; assignedToUserId?: string | null; resolutionNotes?: string }) =>
    api.patch(`/tickets/${id}`, updates).then((r) => r.data),
};
