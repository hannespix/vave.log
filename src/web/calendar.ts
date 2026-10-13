import type {Task,Project} from '../shared/types';
import type {Locale} from '../shared/i18n';
const labels={en:'Task deadlines',de:'Aufgabenfristen',zh:'任务截止日期'};
function text(value:string){return value.replaceAll('\\','\\\\').replace(/\r\n|\r|\n/g,'\\n').replaceAll(';','\\;').replaceAll(',','\\,').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g,'')}
function fold(value:string){let line='',size=0;const result:string[]=[];for(const char of value){const n=new TextEncoder().encode(char).length;if(size+n>75){result.push(line);line=' ';size=1}line+=char;size+=n}result.push(line);return result.join('\r\n')}
/** A downloadable RFC 5545 snapshot, with no invitees, email delivery or live sync. */
export function deadlineCalendar(tasks:Task[],projects:Project[],locale:Locale,now=new Date()):string{
 const lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//VAVE.LOG//Deadlines//EN','CALSCALE:GREGORIAN',`X-WR-CALNAME:VAVE.LOG · ${labels[locale]}`];
 const timestamp=now.toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z');
 for(const task of tasks){
  if(task.status==='done'||!task.due_date||!/^\d{4}-\d{2}-\d{2}$/.test(task.due_date))continue;
  const due=new Date(`${task.due_date}T00:00:00Z`);
  if(!Number.isFinite(due.getTime())||due.toISOString().slice(0,10)!==task.due_date)continue;
  const next=new Date(due);next.setUTCDate(next.getUTCDate()+1);
  const project=projects.find(p=>p.id===task.project_id);
  lines.push('BEGIN:VEVENT',`UID:${encodeURIComponent(task.id)}@vave.log`,`DTSTAMP:${timestamp}`,`DTSTART;VALUE=DATE:${task.due_date.replaceAll('-','')}`,`DTEND;VALUE=DATE:${next.toISOString().slice(0,10).replaceAll('-','')}`,`SUMMARY:${text(task.title)}`,`DESCRIPTION:${text([labels[locale],project?.code,project?.name].filter(Boolean).join(' · '))}`,'TRANSP:TRANSPARENT','STATUS:CONFIRMED','END:VEVENT');
 }
 return [...lines,'END:VCALENDAR',''].map(fold).join('\r\n');
}
export function downloadCalendar(tasks:Task[],projects:Project[],locale:Locale){
 const url=URL.createObjectURL(new Blob([deadlineCalendar(tasks,projects,locale)],{type:'text/calendar;charset=utf-8'}));
 const a=document.createElement('a');a.href=url;a.download='vave-log-deadlines.ics';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
