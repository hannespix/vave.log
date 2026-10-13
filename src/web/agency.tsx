import type {Locale} from '../shared/i18n';
import type {DemoWorkspace} from '../shared/demo-data';
import type {Project,Task} from '../shared/types';
import {useI18n} from './i18n';
import {downloadCalendar} from './calendar';
import './agency.css';

const copy={
 finance:['Finance','Finanzen','财务'],
 financeTitle:['Plan with confidence.','Mit Klarheit planen.','清晰规划，从容管理。'],
 financeSubtitle:['Costs, budgets and invoices for your agency.','Kosten, Budgets und Rechnungen für eure Agentur.','管理工作室的成本、预算和发票。'],
 start:['How would you like to start?','Wie möchtest du starten?','你想如何开始？'],
 empty:['Start empty','Leer starten','从空白开始'],
 emptyNote:['Your own projects, people and plans.','Eigene Projekte, Menschen und Planungen.','创建自己的项目、团队与计划。'],
 demo:['Explore with VAVE examples','Mit VAVE-Beispielen erkunden','探索 VAVE 示例'],
 demoNote:['8 projects, 8 studios and 6 public profiles. Try fictional hours and budgets in a separate EUR workspace.','8 Projekte, 8 Studios und 6 öffentliche Profile. Erprobe erfundene Stunden und Budgets in einem eigenen EUR-Workspace.','8 个项目、8 间工作室及 6 位公开人物资料。在独立的欧元工作区体验虚构的工时和预算。'],
 demoBadge:['DEMO WORKSPACE','DEMO-WORKSPACE','示例工作区'],
 disclosure:['Public VAVE portfolio references. All hours, costs, budgets, dates and invoice drafts here are fictional. Invoice finalization is disabled.','Öffentliche VAVE-Referenzen. Alle Stunden, Kosten, Budgets, Planungstermine und Rechnungsentwürfe hier sind erfunden. Rechnungsfreigabe ist gesperrt.','引用 VAVE 公开作品资料。此处所有工时、成本、预算、计划日期及发票草稿均为虚构，无法正式开具发票。'],
 sources:['Explore the public sources','Öffentliche Quellen erkunden','浏览公开来源'],
 source:['Official source','Offizielle Quelle','官方来源'],
 research:['Research date','Recherchestand','研究日期'],
 studios:['Studios','Studios','工作室'],
 projects:['Portfolio projects & clients','Portfolioprojekte & Kunden','作品项目与客户'],
 people:['Public leadership profiles','Öffentliche Führungsprofile','公开管理团队资料'],
 peopleNote:['These are source references, not workspace members. Public credits do not establish employment type, salary or availability.','Dies sind Quellenprofile, keine Workspace-Mitglieder. Öffentliche Nennungen belegen keine Anstellungsart, Gehälter oder Verfügbarkeit.','这些是公开资料，并非工作区成员。公开署名不能证明雇佣类型、薪资或当前可用时间。'],
 historical:['Years refer to the published portfolio, not this fictional planning period. Client labels are not verified billing entities.','Jahre beziehen sich auf das veröffentlichte Portfolio, nicht auf den erfundenen Planungszeitraum. Kundennamen sind keine geprüften Rechnungsadressen.','年份来自公开作品资料，与虚构计划期间无关。客户名称不代表已核实的开票实体。'],
 archive:['Archive demo','Demo archivieren','归档示例'],
 archiveTitle:['Archive this demo workspace?','Diesen Demo-Workspace archivieren?','归档此示例工作区？'],
 archiveText:['This demo will disappear from workspace lists for everyone. Its records are retained; other workspaces are unaffected. Stop or discard any running timer first.','Diese Demo verschwindet für alle aus der Workspace-Auswahl. Ihre Daten bleiben erhalten; andere Workspaces sind nicht betroffen. Laufende Timer bitte zuerst stoppen oder verwerfen.','此示例将从所有人的工作区列表中隐藏，数据仍会保留，其他工作区不受影响。请先停止或放弃正在运行的计时。'],
 integration:['Useful connections','Sinnvolle Verbindungen','实用连接'],
 calendar:['Export task deadlines (.ics)','Aufgabenfristen exportieren (.ics)','导出任务截止日期（.ics）'],
 calendarNote:['Import this snapshot into Google Calendar, Outlook or Apple Calendar. It contains open tasks with a due date, with no invitations or live sync.','Diesen Stand in Google Kalender, Outlook oder Apple Kalender importieren. Enthält offene Aufgaben mit Fälligkeit, ohne Einladungen oder Live-Synchronisation.','将此快照导入 Google 日历、Outlook 或 Apple 日历。包含有截止日期的未完成任务，不发送邀请，也不会自动同步。'],
 exportNote:['Time and finance CSV exports are available in Reports and Finance. Review the export before sharing it.','Zeit- und Finanzdaten als CSV findest du unter Auswertung und Finanzen. Prüfe den Export vor dem Teilen.','可在报表和财务中导出工时及财务 CSV，共享前请检查内容。'],
 accounting:['Accounting connection: next step','Buchhaltung verbinden: nächster Schritt','连接会计系统：下一步'],
 accountingNote:['For structured e-invoices and payment sync, connect your accounting system (for example Lexware Office, sevdesk or Xero). No provider account is connected yet. The current invoice export is PDF/CSV.','Für strukturierte E-Rechnungen und Zahlungsabgleich bietet sich euer Buchhaltungssystem an, etwa Lexware Office, sevdesk oder Xero. Noch ist kein Anbieter-Konto verbunden. Der aktuelle Rechnungsexport liefert PDF/CSV.','如需结构化电子发票和付款同步，可连接会计系统，例如 Lexware Office、sevdesk 或 Xero。目前尚未连接服务商账户，发票支持 PDF/CSV 导出。'],
 'Co-Founder & CEO':['Co-Founder & CEO','Mitgründer & CEO','联合创始人兼首席执行官'],
 'Co-Founder':['Co-Founder','Mitgründer','联合创始人'],
 'Associate Partner':['Associate Partner','Associate Partner','合伙人'],
 Germany:['Germany','Deutschland','德国'],China:['China','China','中国'],
 'United Arab Emirates':['United Arab Emirates','Vereinigte Arabische Emirate','阿拉伯联合酋长国'],Singapore:['Singapore','Singapur','新加坡'],
} as const;
export function agencyText(locale:Locale,key:keyof typeof copy){return copy[key][locale==='de'?1:locale==='zh'?2:0]}
export type WorkspaceStart='empty'|'demo';
export function DemoChoice({value,onChange,disabled=false}:{value:WorkspaceStart;onChange:(v:WorkspaceStart)=>void;disabled?:boolean}){
 const{locale}=useI18n();const t=(key:keyof typeof copy)=>agencyText(locale,key);
 return <fieldset className="demo-choice" disabled={disabled}><legend>{t('start')}</legend>{(['empty','demo'] as const).map(kind=><label key={kind} className={value===kind?'selected':''}><input type="radio" name="workspace-start" value={kind} checked={value===kind} onChange={()=>onChange(kind)}/><span><strong>{t(kind)}</strong><small>{t(kind==='empty'?'emptyNote':'demoNote')}</small></span></label>)}</fieldset>;
}
function Source({url,label}:{url:string;label:string}){
 let safe=false;try{const parsed=new URL(url);safe=parsed.protocol==='https:'&&parsed.hostname==='www.vave.studio'&&!parsed.username&&!parsed.password}catch{/* Unknown provenance remains text. */}
 return safe?<a href={url} target="_blank" rel="noopener noreferrer">{label} ↗</a>:<span>{label}</span>;
}
export function DemoBanner({demo,canArchive,onArchive,busy}:{demo:DemoWorkspace;canArchive:boolean;onArchive:()=>void;busy:boolean}){
 const{locale}=useI18n();const t=(key:keyof typeof copy)=>agencyText(locale,key);const facts=demo.manifest;
 return <aside className="demo-banner" aria-label={t('demoBadge')}><div className="demo-banner-top"><div><strong>{t('demoBadge')}</strong><p>{t('disclosure')}</p></div>{canArchive&&<button className="button secondary small" disabled={busy} onClick={onArchive}>{t('archive')}</button>}</div><details className="demo-research"><summary>{t('sources')}</summary><p className="tiny muted">{t('research')}: {facts.researched_at}</p><h3>{t('studios')}</h3><div className="demo-reference-grid">{facts.studios.map(studio=><article key={studio.id}><strong>{studio.name}</strong><p>{studio.city} · {Object.hasOwn(copy,studio.country)?agencyText(locale,studio.country as keyof typeof copy):studio.country}</p><Source url={studio.source_url} label={t('source')}/></article>)}</div><h3>{t('projects')}</h3><p>{t('historical')}</p><div className="demo-reference-grid">{facts.projects.map(project=><article key={project.code}><strong>{project.name}</strong><p>{project.client} · {project.year}</p><small>{project.location}</small><Source url={project.source_url} label={t('source')}/></article>)}</div><h3>{t('people')}</h3><p>{t('peopleNote')}</p><div className="demo-reference-grid">{facts.people.map(person=><article key={person.name}><strong>{person.name}</strong><p>{Object.hasOwn(copy,person.role)?agencyText(locale,person.role as keyof typeof copy):person.role}</p><Source url={person.source_url} label={t('source')}/></article>)}</div></details></aside>;
}
export function Connections({tasks,projects,manager}:{tasks:Task[];projects:Project[];manager:boolean}){
 const{locale}=useI18n();const t=(key:keyof typeof copy)=>agencyText(locale,key);
 return <section className="panel connection-panel"><h2>{t('integration')}</h2><p>{t('calendarNote')}</p><button className="button secondary" onClick={()=>downloadCalendar(tasks,projects,locale)} disabled={!tasks.some(task=>task.status!=='done'&&task.due_date)}>{t('calendar')}</button>{manager&&<><p>{t('exportNote')}</p><h3>{t('accounting')}</h3><p>{t('accountingNote')}</p></>}</section>;
}
