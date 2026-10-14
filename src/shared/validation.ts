import { z } from 'zod';
export const uuid = z.uuid();
export const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0,10) === value && value >= '2000-01-01' && value <= '2100-12-31';
}, 'Bitte ein gültiges Datum zwischen 2000 und 2100 eingeben.');
// oxlint-disable-next-line no-control-regex -- blockt Steuerzeichen bewusst in Eingaben.
const text = (max:number) => z.string().trim().max(max).refine(s => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(s), 'Ungültige Steuerzeichen.');
// oxlint-disable-next-line no-new -- Intl-Konstruktor dient als Zeitzonen-Validierung (wirft bei ungültiger Zone).
export const workspaceSchema = z.strictObject({ name:text(100).min(1), timezone:z.string().max(80).refine(value=>{try{new Intl.DateTimeFormat('de',{timeZone:value});return true}catch{return false}},'Ungültige Zeitzone.'), currency:z.string().regex(/^[A-Z]{3}$/) });
export const projectSchema = z.strictObject({id:uuid.optional(),workspace_id:uuid,code:text(24).min(1),name:text(160).min(1),client:text(160),budget_minutes:z.number().int().min(0).max(6000000),status:z.enum(['active','paused','archived']),due_date:date.nullable().optional(),progress_percent:z.number().min(0).max(100).nullable().optional(),color:z.string().regex(/^#[\da-fA-F]{6}$/)});
export const taskSchema = z.strictObject({id:uuid.optional(),workspace_id:uuid,project_id:uuid,title:text(240).min(1),status:z.enum(['todo','doing','done']),assignee_id:uuid.nullable(),due_date:date.nullable(),estimated_minutes:z.number().int().min(1).max(6000000).nullable().optional(),is_milestone:z.boolean().optional()});
export const entrySchema = z.strictObject({id:uuid.optional(),workspace_id:uuid,project_id:uuid,work_date:date,minutes:z.number().int().min(1).max(1440),note:text(2000),billable:z.boolean(),task_id:uuid.nullable().optional()});
export const timerSchema = z.strictObject({workspace_id:uuid,project_id:uuid,note:text(2000),billable:z.boolean(),task_id:uuid.nullable().optional()});
export const dateRangeSchema = z.strictObject({from:date,to:date}).refine(({from,to})=>from<=to && (Date.parse(to)-Date.parse(from))/86400000<=365,'Zeitraum: maximal 366 Tage, Beginn vor Ende.');
export const inviteSchema = z.strictObject({workspace_id:uuid,email:z.email().max(254).transform(s=>s.toLowerCase()),role:z.enum(['manager','member'])});
export const roleSchema = z.strictObject({workspace_id:uuid,user_id:uuid,role:z.enum(['owner','manager','member','disabled'])});
