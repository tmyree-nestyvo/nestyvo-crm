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
};

// Providers
export const providersApi = {
  list: () => api.get('/providers').then((r) => r.data),
  getSchedule: (id: string, date?: string) =>
    api.get(`/providers/${id}/schedule`, { params: { date } }).then((r) => r.data),
};
