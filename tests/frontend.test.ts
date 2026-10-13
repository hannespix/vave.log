import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {TaskAssigneeSelect} from '../src/web/components.js';
import type {Membership} from '../src/shared/types.js';
import {describe,it,expect} from 'vitest';
import {csvCell,dateInZone,weekFor,minutesLabel,validRange,shortDate,longDate} from '../src/web/helpers.js';
describe('presentation data safety',()=>{
 it('neutralizes spreadsheet formulas, including leading whitespace',()=>{for(const value of ['=HYPERLINK("https://bad")',' +2+2','-1+2','@SUM(A1)','\t=1+1'])expect(csvCell(value)).toMatch(/^"'/);expect(csvCell('Studio "West"')).toBe('"Studio ""West"""')});
 it('keeps workspace dates correct across zones',()=>{const date=new Date('2026-10-13T23:30:00Z');expect(dateInZone('Europe/Berlin',date)).toBe('2026-10-14');expect(dateInZone('America/New_York',date)).toBe('2026-10-13')});
 it('handles Sunday and year transitions',()=>{expect(weekFor('2027-01-03')).toEqual({from:'2026-12-28',to:'2027-01-03'});expect(minutesLabel(75)).toBe('1:15 h');expect(validRange('2026-10-13','2026-10-12')).toBe(false)});
});

describe('defensive date presentation',()=>{
 it('renders malformed or infinite stored dates without crashing',()=>{
  for (const value of ['infinity','-infinity','','not-a-date','2026-02-30','2026-13-01']) {
   expect(shortDate(value)).toBe('–');
   expect(longDate(value)).toBe('Ungültiges Datum');
  }
 });
 it('retains German calendar formatting for valid dates',()=>{
  expect(shortDate('2026-10-13')).toBe('13.10.');
  expect(longDate('2026-10-13')).toContain('13. Okt.');
 });
});

describe('historical task assignments',()=>{
 const members: Membership[] = [
  {workspace_id:'workspace',user_id:'active',role:'member',display_name:'Active',email:'active@example.test',created_at:''},
  {workspace_id:'workspace',user_id:'former',role:'disabled',display_name:'Former',email:'former@example.test',created_at:''},
  {workspace_id:'workspace',user_id:'other-disabled',role:'disabled',display_name:'Other',email:'other@example.test',created_at:''},
 ];
 it('keeps an existing disabled assignee selected and available for form submission',()=>{
  const html=renderToStaticMarkup(createElement(TaskAssigneeSelect,{members,currentAssignee:'former'}));
  expect(html).toContain('value="former" selected=""');
  expect(html).toContain('Former (deaktiviert)');
  expect(html).not.toContain(' disabled=');
  expect(html).not.toContain('value="other-disabled"');
 });
 it('does not offer disabled members for a new assignment',()=>{
  const html=renderToStaticMarkup(createElement(TaskAssigneeSelect,{members}));
  expect(html).toContain('value="active"');
  expect(html).not.toContain('value="former"');
  expect(html).not.toContain('value="other-disabled"');
 });
});
