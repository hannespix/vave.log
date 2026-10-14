import type {Task} from './types.js';

export interface TaskProgressStats {
 total:number;done:number;overdue:number;doing?:number;estimated?:number;
 estimated_minutes?:number;done_estimated_minutes?:number;missing_estimates?:number;
 missing_due_dates?:number;unassigned?:number;
}
export interface AutoProgress {
 percent:number|null;method:'estimated-effort'|'task-count'|'none';
 total:number;done:number;doing:number;estimated:number;estimatedMinutes:number;
 completedEstimatedMinutes:number;missingEstimates:number;missingDueDates:number;unassigned:number;
}
const count=(value:unknown):value is number=>typeof value==='number'&&Number.isSafeInteger(value)&&value>=0;
const estimate=(value:unknown):value is number=>count(value)&&value>0&&value<=6000000;

/** Completion measures tracked deliverables; time spent is a separate budget KPI. */
export function calculateProjectProgress(stats:TaskProgressStats):AutoProgress{
 const total=count(stats.total)?stats.total:0,done=count(stats.done)?stats.done:0;
 const doing=count(stats.doing)?stats.doing:0;
 const estimated=count(stats.estimated)&&stats.estimated<=total?stats.estimated:0;
 const estimatedMinutes=count(stats.estimated_minutes)?stats.estimated_minutes:0;
 const completedEstimatedMinutes=count(stats.done_estimated_minutes)?stats.done_estimated_minutes:0;
 const result:AutoProgress={percent:null,method:'none',total,done,doing,estimated,estimatedMinutes,completedEstimatedMinutes,
  missingEstimates:total-estimated,missingDueDates:count(stats.missing_due_dates)?Math.min(total,stats.missing_due_dates):0,
  unassigned:count(stats.unassigned)?Math.min(total,stats.unassigned):0};
 if(!count(stats.total)||!count(stats.done)||done>total||doing+done>total||total===0)return result;
 const weighted=estimated===total&&estimatedMinutes>=total&&completedEstimatedMinutes>=done
  &&completedEstimatedMinutes<=estimatedMinutes-(total-done)
  &&(done!==0||completedEstimatedMinutes===0)&&(done!==total||completedEstimatedMinutes===estimatedMinutes);
 return {...result,method:weighted?'estimated-effort':'task-count',percent:100*(weighted?completedEstimatedMinutes/estimatedMinutes:done/total)};
}

type ProgressTask=Pick<Task,'status'|'due_date'|'assignee_id'>&{estimated_minutes?:number|null;is_milestone?:boolean};
/** Uses the complete task scope, independent of time/report filters. */
export function taskProgressStats(tasks:ReadonlyArray<ProgressTask>,today?:string):TaskProgressStats{
 const stats:Required<TaskProgressStats>={total:tasks.length,done:0,doing:0,overdue:0,estimated:0,estimated_minutes:0,done_estimated_minutes:0,missing_estimates:0,missing_due_dates:0,unassigned:0};
 for(const task of tasks){
  if(task.status==='done')stats.done++;if(task.status==='doing')stats.doing++;
  if(today&&task.due_date&&task.due_date<today&&task.status!=='done')stats.overdue++;
  if(estimate(task.estimated_minutes)){stats.estimated++;stats.estimated_minutes+=task.estimated_minutes;if(task.status==='done')stats.done_estimated_minutes+=task.estimated_minutes;}
  else stats.missing_estimates++;
  if(!task.due_date)stats.missing_due_dates++;if(!task.assignee_id)stats.unassigned++;
 }
 return stats;
}
