import type { Project } from './types.js';

/** Manager-only, all recorded team effort through the workspace-local as_of date. */
export interface ProjectInsight {
  project: Project;
  as_of: string;
  /** Progress timestamp converted to the workspace calendar date on the server. */
  progress_date: string | null;
  total_minutes: number;
  first_work_date: string | null;
  last_work_date: string | null;
  recent_daily: { work_date: string; minutes: number }[];
  tasks: { total: number; done: number; overdue: number };
}
