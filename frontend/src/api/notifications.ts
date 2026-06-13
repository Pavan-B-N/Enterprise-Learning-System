import apiClient from './client';

export interface AppNotification {
  id: string;
  user_id: string;
  type: string;
  title: string;
  message: string;
  metadata: Record<string, any>;
  read: boolean;
  created_at: string;
}

export async function listNotifications(limit = 50): Promise<{
  items: AppNotification[];
  unread_count: number;
}> {
  const r = await apiClient.get(`/api/notifications?limit=${limit}`);
  return r.data;
}

export async function markRead(id: string): Promise<void> {
  await apiClient.post(`/api/notifications/${id}/read`);
}

export async function markAllRead(): Promise<void> {
  await apiClient.post('/api/notifications/mark-all-read');
}
