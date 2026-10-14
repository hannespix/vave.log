import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe,expect,it} from 'vitest';
import {I18nProvider} from '../src/web/i18n';
import {WorkspaceAdminList,WorkspaceDeleteConfirmation} from '../src/web/workspace-admin';
import {workspaceAdminCopy,workspaceAdminText} from '../src/web/workspace-admin-copy';
import type {WorkspaceAdminSummary} from '../src/shared/workspace-admin-types';
import type {Locale} from '../src/shared/i18n';

const studio:WorkspaceAdminSummary={id:'w',name:'Studio <North> & South',is_demo:false,archived_at:null,created_at:'2026-10-01',counts:{projects:2,tasks:7,time_entries:13,members:3,invoices:4,expenses:5},running_timers:0};
const props={workspace:studio,confirmationName:studio.name,confirmed:true,busy:false,online:true,blocked:false,onNameChange:()=>{},onConfirmedChange:()=>{},onBack:()=>{},onSubmit:()=>{}};
const render=(overrides:Partial<typeof props>={},locale:Locale='en')=>renderToStaticMarkup(createElement(I18nProvider,{initialLocale:locale},createElement(WorkspaceDeleteConfirmation,{...props,...overrides})));
describe('owner workspace management',()=>{
 it.each(['en','de','zh'] as const)('has complete localized deletion copy in %s',locale=>{
  expect(Object.keys(workspaceAdminCopy[locale]).sort()).toEqual(Object.keys(workspaceAdminCopy.en).sort());
  for(const key of Object.keys(workspaceAdminCopy.en) as Array<keyof typeof workspaceAdminCopy.en>)expect(workspaceAdminText(locale,key).trim()).not.toBe('');
  expect(render({},locale)).toContain(workspaceAdminText(locale,'permanent'));
 });
 it('shows consequences, financial records and preserved accounts; escapes user names',()=>{
  const html=render();expect(html).toContain('Studio &lt;North&gt; &amp; South');expect(html).not.toContain('<North>');
  for(const label of ['Projects','Tasks','Time entries','Members','Invoices','Expenses','accounts and other studios remain'])expect(html).toContain(label);
  expect(html).toContain('cannot be undone');
 });
 it.each([{confirmationName:'studio <North> & South'},{confirmationName:studio.name+' '},{confirmed:false},{busy:true},{online:false},{blocked:true},{workspace:{...studio,running_timers:1}}])('blocks deletion without all explicit safeguards: %j',overrides=>{
  expect(render(overrides)).toMatch(/<button[^>]+type="submit"[^>]+disabled=""/);
 });
 it('enables deletion only for exact confirmation with no blockers',()=>{expect(render()).toMatch(/<button[^>]+type="submit"[^>]*>Permanently delete/);});
 it('shows active studios and archived demos without exposing data outside the owner list',()=>{
  const html=renderToStaticMarkup(createElement(WorkspaceAdminList,{workspaces:[studio,{...studio,id:'archived',name:'Old demo',is_demo:true,archived_at:'2026-10-13'}],onDelete:()=>{},busy:false}));
  for(const label of ['Studio','Demo','Active','Archived','Old demo'])expect(html).toContain(label);
  const empty=renderToStaticMarkup(createElement(WorkspaceAdminList,{workspaces:[],onDelete:()=>{},busy:false}));
  expect(empty).not.toContain('Delete:');expect(empty).toContain('No studios or demos');
 });
});
