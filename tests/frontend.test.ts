import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {I18nProvider} from '../src/web/i18n.js';
import {TaskAssigneeSelect,assigneeOptions} from '../src/web/components.js';
import {DemoBanner} from '../src/web/agency.js';
import {DEMO_MANIFEST,DEMO_EXPERIENCE_VERSION, type DemoWorkspace} from '../src/shared/demo-data.js';
import type {Membership} from '../src/shared/types.js';
import {describe,it,expect} from 'vitest';
import {csvCell,dateInZone,weekFor,minutesLabel,validRange,shortDate,longDate} from '../src/web/helpers.js';
describe('presentation data safety',()=>{
 it('neutralizes spreadsheet formulas, including leading whitespace',()=>{for(const value of ['=HYPERLINK("https://bad")',' +2+2','-1+2','@SUM(A1)','\t=1+1'])expect(csvCell(value)).toMatch(/^"'/);expect(csvCell('Studio "West"')).toBe('"Studio ""West"""')});
 it('keeps workspace dates correct across zones',()=>{const date=new Date('2026-10-13T23:30:00Z');expect(dateInZone('Europe/Berlin',date)).toBe('2026-10-14');expect(dateInZone('America/New_York',date)).toBe('2026-10-13')});
 it('handles Sunday and year transitions',()=>{expect(weekFor('2027-01-03')).toEqual({from:'2026-12-28',to:'2027-01-03'});expect(minutesLabel(75)).toBe('1:15 h');expect(validRange('2026-10-13','2026-10-12')).toBe(false)});
});

describe('enterprise demo upgrade',()=>{
 const demo:DemoWorkspace={workspace_id:'sample',created_by:'owner',request_id:'request',locale:'en',manifest_version:DEMO_MANIFEST.version,manifest:DEMO_MANIFEST,created_at:'',archived_at:null,experience_version:2};
 const render=(version:number,canArchive=true)=>renderToStaticMarkup(createElement(I18nProvider,{initialLocale:'en'},createElement(DemoBanner,{demo:{...demo,experience_version:version},canArchive,busy:false,onUpgrade:()=>{},onArchive:()=>{}})));
 it('offers the new scenario to owners of the previous complete demo',()=>{expect(render(2)).toContain('Complete demo');expect(render(DEMO_EXPERIENCE_VERSION)).not.toContain('Complete demo');});
 it('does not offer a creator-owner upgrade to other members',()=>{expect(render(2,false)).not.toContain('Complete demo');});
});

describe('defensive date presentation',()=>{
 it('renders malformed or infinite stored dates without crashing',()=>{
  for (const value of ['infinity','-infinity','','not-a-date','2026-02-30','2026-13-01']) {
   expect(shortDate(value)).toBe('–');
   expect(longDate(value, 'de')).toBe('Ungültiges Datum');
  }
 });
 it('retains German calendar formatting for valid dates',()=>{
  expect(shortDate('2026-10-13', 'de')).toBe('13.10.');
  expect(longDate('2026-10-13', 'de')).toContain('13. Okt.');
 });
});

describe('historical task assignments',()=>{
 const members: Membership[] = [
  {workspace_id:'workspace',user_id:'active',role:'member',display_name:'Active',email:'active@example.test',created_at:''},
  {workspace_id:'workspace',user_id:'former',role:'disabled',display_name:'Former',email:'former@example.test',created_at:''},
  {workspace_id:'workspace',user_id:'other-disabled',role:'disabled',display_name:'Other',email:'other@example.test',created_at:''},
 ];
 it('keeps an existing disabled assignee selected and available for form submission',()=>{
  const html=renderToStaticMarkup(createElement(I18nProvider,{initialLocale:'de'},createElement(TaskAssigneeSelect,{members,currentAssignee:'former'})));
  expect(html).toContain('<input type="hidden" name="assignee" value="former"');
  expect(html).toContain('Former (deaktiviert)');
  expect(html).not.toContain(' disabled=');
  const values=assigneeOptions(members,'former',(message:string)=>message).map(option=>option.value);
  expect(values).toContain('former');
  expect(values).not.toContain('other-disabled');
 });
 it('does not offer disabled members for a new assignment',()=>{
  const values=assigneeOptions(members,undefined,(message:string)=>message).map(option=>option.value);
  expect(values).toContain('active');
  expect(values).not.toContain('former');
  expect(values).not.toContain('other-disabled');
 });
});
