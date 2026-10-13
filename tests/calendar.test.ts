import {describe,it,expect} from 'vitest';
import {deadlineCalendar} from '../src/web/calendar.js';
import type {Task,Project} from '../src/shared/types.js';
const project={id:'p',code:'VAVE',name:'My project'} as Project;
const task={id:'task-1',project_id:'p',title:'Design',due_date:'2026-12-31',status:'todo'} as Task;
describe('deadline calendar snapshot',()=>{
 it('exports one all-day event with exclusive next-day end, stable UID and localized labels',()=>{
  const text=deadlineCalendar([task],[project],'de',new Date('2026-10-13T15:00:00Z'));
  expect(text).toContain('DTSTART;VALUE=DATE:20261231\r\nDTEND;VALUE=DATE:20270101');
  expect(text).toContain('UID:task-1@vave.log');expect(text).toContain('DTSTAMP:20261013T150000Z');expect(text).toContain('Aufgabenfristen');
 });
 it('does not export completed or invalid tasks, invitations or injected properties',()=>{
  const text=deadlineCalendar([{...task,title:'Design\r\nATTENDEE:mailto:intruder@example.test;\\test,extra'},{...task,id:'done',status:'done'},{...task,id:'broken',due_date:'2026-02-30'}],[project],'en');
  expect(text.match(/BEGIN:VEVENT/g)).toHaveLength(1);expect(text).not.toContain('\r\nATTENDEE:');expect(text).toContain('\\nATTENDEE:mailto:');expect(text).toContain('\\;\\\\test\\,extra');expect(text).not.toContain('METHOD:REQUEST');
 });
 it('folds Unicode lines at 75 octets without splitting code points',()=>{
  const title='展览空间体验 '.repeat(40);const text=deadlineCalendar([{...task,title}],[project],'zh');
  for(const line of text.split('\r\n'))expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
  expect(text.replaceAll('\r\n ','')).toContain(title);expect(text).not.toContain('\ufffd');
 });
});
