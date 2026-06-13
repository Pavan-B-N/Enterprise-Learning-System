import apiClient from './client';

export interface Conversation {
  id: string;
  title: string;
  created_at?: string;
  updated_at?: string;
  last_message_at?: string;
  message_count: number;
}

export interface ChatMessage {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant';
  content: string;
  agent?: string | null;
  is_error?: boolean;
  created_at?: string;
}

export interface AppendMessageInput {
  role: 'user' | 'assistant';
  content: string;
  agent?: string | null;
  is_error?: boolean;
}

export interface AppendMessagesResponse {
  conversation: Conversation;
  messages: ChatMessage[];
}

const BASE = '/api/chat/conversations';

export async function listConversations(): Promise<Conversation[]> {
  const { data } = await apiClient.get(BASE);
  return Array.isArray(data) ? data : [];
}

export async function createConversation(title?: string): Promise<Conversation> {
  const { data } = await apiClient.post(BASE, { title: title ?? null });
  return data;
}

export async function getConversation(id: string): Promise<Conversation> {
  const { data } = await apiClient.get(`${BASE}/${id}`);
  return data;
}

export async function renameConversation(id: string, title: string): Promise<Conversation> {
  const { data } = await apiClient.patch(`${BASE}/${id}`, { title });
  return data;
}

export async function deleteConversation(id: string): Promise<void> {
  await apiClient.delete(`${BASE}/${id}`);
}

export async function deleteAllConversations(): Promise<void> {
  await apiClient.delete(BASE);
}

export async function listMessages(id: string): Promise<ChatMessage[]> {
  const { data } = await apiClient.get(`${BASE}/${id}/messages`);
  return Array.isArray(data) ? data : [];
}

export async function appendMessages(
  id: string,
  messages: AppendMessageInput[],
): Promise<AppendMessagesResponse> {
  const { data } = await apiClient.post(`${BASE}/${id}/messages`, { messages });
  return data;
}
