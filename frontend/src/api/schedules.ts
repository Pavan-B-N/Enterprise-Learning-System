import apiClient from './client';

export type ScheduleStatus =
  | 'pending'
  | 'generating'
  | 'ready'
  | 'in_progress'
  | 'completed'
  | 'expired'
  | 'failed';

export interface ScheduleQuestion {
  index: number;
  question: string;
  options: string[];
  topic?: string;
  explanation?: string;
  // correct_index is intentionally NOT included in the type — backend hides it
  // until the schedule is completed.
  correct_index?: number;
}

export interface AssessmentSchedule {
  id: string;
  user_id: string;
  course_id: string;
  course_name: string;
  cert_code: string;
  status: ScheduleStatus;
  question_count: number;
  duration_minutes: number;
  scheduled_at: string;
  ready_at?: string | null;
  started_at?: string | null;
  ends_at?: string | null;
  submitted_at?: string | null;
  score_percentage?: number | null;
  passed?: boolean | null;
  proctor_violations?: any[];
  questions?: ScheduleQuestion[];
  weak_areas?: string[];
  strong_areas?: string[];
  per_topic_breakdown?: Record<string, { total: number; correct: number }>;
  correct_count?: number;
  total_questions?: number;
  error?: string;
}

export async function createSchedule(courseId: string): Promise<AssessmentSchedule> {
  const r = await apiClient.post('/api/assessment-schedules', { course_id: courseId });
  return r.data.schedule;
}

export async function getActiveSchedule(): Promise<AssessmentSchedule | null> {
  const r = await apiClient.get('/api/assessment-schedules/active');
  return r.data.schedule;
}

export async function getSchedule(id: string): Promise<AssessmentSchedule> {
  const r = await apiClient.get(`/api/assessment-schedules/${id}`);
  return r.data.schedule;
}

export async function startSchedule(id: string): Promise<{
  id: string;
  status: 'in_progress';
  started_at: string;
  ends_at: string;
  duration_minutes: number;
}> {
  const r = await apiClient.post(`/api/assessment-schedules/${id}/start`);
  return r.data;
}

export interface SubmitPayload {
  answers: { index: number; selected_index: number }[];
  proctor_violations: { type: string; reason: string; at: string }[];
}

export interface SubmitResult {
  id: string;
  status: 'completed';
  score_percentage: number;
  passed: boolean;
  correct_count: number;
  total_questions: number;
  per_topic_breakdown: Record<string, { total: number; correct: number }>;
  weak_areas: string[];
  strong_areas: string[];
}

export async function submitSchedule(id: string, payload: SubmitPayload): Promise<SubmitResult> {
  const r = await apiClient.post(`/api/assessment-schedules/${id}/submit`, payload);
  return r.data;
}
