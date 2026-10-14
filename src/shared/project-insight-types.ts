import type { Project, Task } from './types.js';

export interface ProjectTaskStats {
  total: number;
  done: number;
  overdue: number;
  /** Optional additions retain compatibility with older snapshots and clients. */
  doing?: number;
  estimated?: number;
  estimated_minutes?: number;
  done_estimated_minutes?: number;
  missing_estimates?: number;
  missing_due_dates?: number;
  unassigned?: number;
}
export interface ProjectMilestones {
  total: number;
  done: number;
  overdue: number;
  missing_due_dates: number;
  /** Up to 12: unfinished first, then deadline (undated last), title and ID. */
  items: Pick<Task,'id'|'title'|'status'|'due_date'>[];
}

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
  tasks: ProjectTaskStats;
  milestones?: ProjectMilestones;
}
