import axios from 'axios';
import { router } from 'expo-router';
import { API_BASE_URL } from './constants';
import { useAuthStore } from './store';
import { clearPersistedSession } from './auth';

export { API_BASE_URL };

export const api = axios.create({ baseURL: API_BASE_URL });

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Two defense-in-depth cases, both real gaps a live session can hit that
// login.tsx's own redirect logic never sees (it only runs once, at login):
//  - PASSWORD_CHANGE_REQUIRED: PasswordChangeGuard 403s every route once an
//    admin resets a password mid-session (see providers/users reset-password
//    endpoints) — the normal first-login redirect in login.tsx has already
//    happened by then, so it never fires again on its own.
//  - 401: the 8h token simply expired, or was revoked. Bounce to login
//    instead of leaving every screen quietly failing its own requests.
api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const status = err?.response?.status;
    const message = err?.response?.data?.message;
    if (status === 403 && message === 'PASSWORD_CHANGE_REQUIRED') {
      router.replace({ pathname: '/(auth)/change-password', params: { firstLogin: '1' } });
    } else if (status === 401 && useAuthStore.getState().token) {
      useAuthStore.getState().clearAuth();
      await clearPersistedSession();
      router.replace('/(auth)/login');
    }
    return Promise.reject(err);
  },
);

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
  getAppointmentDetail: (providerId: string, appointmentId: string) =>
    api.get(`/providers/${providerId}/appointments/${appointmentId}`).then((r) => r.data),
  cancelAppointment: (providerId: string, appointmentId: string, reason?: string) =>
    api.patch(`/providers/${providerId}/appointments/${appointmentId}/cancel`, { reason }).then((r) => r.data),
  rescheduleAppointment: (
    providerId: string,
    appointmentId: string,
    input: { newStartAt: string; newEndAt?: string; reason?: string },
  ) => api.patch(`/providers/${providerId}/appointments/${appointmentId}/reschedule`, input).then((r) => r.data),
  getAvailability: (id: string) => api.get(`/providers/${id}/availability`).then((r) => r.data),
  replaceAvailability: (id: string, windows: { dayOfWeek: number; startTime: string; endTime: string }[]) =>
    api.put(`/providers/${id}/availability`, { windows }).then((r) => r.data),
  getBlocks: (id: string) => api.get(`/providers/${id}/blocks`).then((r) => r.data),
  create: (input: {
    practiceId: string;
    firstName: string;
    lastName: string;
    credentials?: string;
    specialty?: string;
    phone?: string;
    email?: string;
    officeLocation?: string;
    isVirtual?: boolean;
    isInPerson?: boolean;
    loginEmail?: string;
    /** Admin can set it directly; otherwise a temp password is generated and returned once. */
    loginPassword?: string;
  }) => api.post('/providers', input).then((r) => r.data),
  /**
   * Edit a provider after creation — most importantly to add a login email
   * to one onboarded without it, which previously had no path at all.
   */
  update: (
    id: string,
    input: {
      firstName?: string;
      lastName?: string;
      credentials?: string;
      specialty?: string;
      phone?: string;
      email?: string;
      loginEmail?: string;
      loginPassword?: string;
      defaultSlotDurationMin?: number;
      status?: 'active' | 'inactive' | 'vacation';
    },
  ) => api.patch(`/providers/${id}`, input).then((r) => r.data),
  /** Always issues a fresh temp password and forces a change on next sign-in. */
  resetPassword: (id: string) =>
    api.post<{ tempPassword: string }>(`/providers/${id}/reset-password`).then((r) => r.data),
  createRecurringBlock: (
    id: string,
    input: {
      frequency?: 'daily' | 'weekly' | 'monthly';
      daysOfWeek?: number[];
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
  /** One-time block — Charlene, Oct 5 2026, "Allow blocks to be: One-time". */
  createBlock: (id: string, input: { startAt: string; endAt: string; reason?: string }) =>
    api.post(`/providers/${id}/blocks`, input).then((r) => r.data),
};

// Provider-specific appointment/service types (Workstream B, Oct 3 2026) —
// each provider has their OWN list; never shown globally across providers.
export interface ProviderAppointmentType {
  id: string;
  providerId: string;
  name: string;
  durationMin: number;
  category: string;
  isActive: boolean;
}
export const appointmentTypesApi = {
  list: (providerId: string) =>
    api.get<ProviderAppointmentType[]>(`/providers/${providerId}/appointment-types`).then((r) => r.data),
  create: (providerId: string, input: { name: string; durationMin: number; category?: string }) =>
    api.post<ProviderAppointmentType>(`/providers/${providerId}/appointment-types`, input).then((r) => r.data),
  update: (
    providerId: string,
    typeId: string,
    input: { name?: string; durationMin?: number; category?: string; isActive?: boolean },
  ) => api.patch<ProviderAppointmentType>(`/providers/${providerId}/appointment-types/${typeId}`, input).then((r) => r.data),
  deactivate: (providerId: string, typeId: string) =>
    api.delete(`/providers/${providerId}/appointment-types/${typeId}`).then((r) => r.data),
};

// External calendars (Rula/Headway feed ingestion, Sep 29 2026) — see
// ExternalCalendarSyncService on the backend for why this is safe to pull:
// the feeds themselves carry no patient PHI, just generic busy/free blocks.
export type ExternalCalendarSource = 'rula' | 'headway' | 'other';
export interface ExternalCalendarFeed {
  id: string;
  providerId: string;
  source: ExternalCalendarSource;
  feedUrl: string;
  label?: string | null;
  lastSyncedAt: string | null;
  lastSyncError: string | null;
}
export const externalCalendarsApi = {
  list: (providerId: string) =>
    api.get<ExternalCalendarFeed[]>(`/providers/${providerId}/external-calendars`).then((r) => r.data),
  add: (providerId: string, input: { source: ExternalCalendarSource; feedUrl: string; label?: string }) =>
    api.post<ExternalCalendarFeed>(`/providers/${providerId}/external-calendars`, input).then((r) => r.data),
  sync: (providerId: string, feedId: string) =>
    api.post(`/providers/${providerId}/external-calendars/${feedId}/sync`).then((r) => r.data),
  remove: (providerId: string, feedId: string) =>
    api.delete(`/providers/${providerId}/external-calendars/${feedId}`).then((r) => r.data),
};

// Practices
export interface UpsertPracticeInput {
  name: string;
  address?: string;
  phone?: string;
  email?: string;
  contactName?: string;
  notes?: string;
  timezone?: string;
  subscriptionStatus?: 'trial' | 'active' | 'past_due' | 'canceled';
  subscriptionExpiresAt?: string;
}

export const practicesApi = {
  // Minimal fields — admin/agent cross-practice picker (unchanged shape).
  list: () => api.get('/practices').then((r) => r.data),
  // Full fields — admin partner-management screen only.
  listAdmin: () => api.get('/practices/admin').then((r) => r.data),
  get: (id: string) => api.get(`/practices/${id}`).then((r) => r.data),
  create: (input: UpsertPracticeInput) => api.post('/practices', input).then((r) => r.data),
  update: (id: string, input: Partial<UpsertPracticeInput>) =>
    api.patch(`/practices/${id}`, input).then((r) => r.data),
  /** Soft delete — hides the partner everywhere but keeps its history. */
  remove: (id: string) => api.delete(`/practices/${id}`).then((r) => r.data),
};

// Users (admin-only login creation — partner providers, staff hires)
export const usersApi = {
  create: (input: {
    email: string;
    firstName: string;
    lastName: string;
    role: 'administrator' | 'scheduling_agent' | 'provider' | 'practice_manager';
    practiceId?: string;
    phone?: string;
  }) => api.post('/users', input).then((r) => r.data),
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
