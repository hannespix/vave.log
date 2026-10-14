import type {Locale} from '../shared/i18n';
import {DEMO_EXPERIENCE_VERSION, type DemoWorkspace} from '../shared/demo-data';
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
 demoNote:['An international agency with 100 employees, freelance specialists and multi-million-euro projects. Explore fictional work, budgets and invoices in a separate EUR workspace.','Eine internationale Agentur mit 100 Mitarbeitenden, freien Spezialisten und Projekten im Millionenbereich. Erkunde fiktive Arbeit, Budgets und Rechnungen in einem eigenen EUR-Workspace.','拥有 100 名员工、自由职业专家和数百万欧元项目的国际工作室。在独立的欧元工作区探索虚构的工作、预算及发票。'],
 demoBadge:['DEMO WORKSPACE','DEMO-WORKSPACE','示例工作区'],
 disclosure:['Explore a sample agency with team, projects, time, planning and invoices. Names include public VAVE credits and invented people; all operating and billing data is fictional. Sample people have no login. DEMO invoices are not for payment.','Erkunde eine Beispielagentur mit Team, Projekten, Zeiten, Planung und Rechnungen. Namen stammen aus öffentlichen VAVE-Projektcredits oder sind erfunden; alle Arbeits- und Rechnungsdaten sind fiktiv. Beispielpersonen haben keinen Login. DEMO-Rechnungen sind nicht zur Zahlung bestimmt.','探索包含团队、项目、工时、规划及发票的示例工作室。姓名来自 VAVE 公开项目署名或虚构人物；所有工作及账单数据均为虚构。示例人物无法登录，DEMO 发票无需付款。'],
 completeDemo:['Complete demo','Demo vervollständigen','补全示例'],
 completeDemoNote:['Add the 100-person agency scenario, enterprise projects and invoices in the millions. Existing records and your edits are kept.','Ergänze das Szenario einer Agentur mit 100 Mitarbeitenden, Großprojekten und Rechnungen im Millionenbereich. Vorhandene Datensätze und deine Änderungen bleiben erhalten.','添加 100 名员工的工作室场景、大型项目和数百万欧元的发票。现有记录及你的修改均会保留。'],
 demoCompleted:['The full demo agency is ready.','Die vollständige Demo-Agentur ist bereit.','完整的示例工作室已准备就绪。'],
 samplePerson:['DEMO','DEMO','示例'],
 samplePublic:['Public project credit','Öffentlicher Projektcredit','公开项目署名'],
 sampleProfile:['Sample profile','Beispielprofil','示例资料'],
 sampleFictional:['Fictional person','Erfundene Person','虚构人物'],
 realAccount:['Real account','Konto mit Anmeldung','登录账户'],
 sampleAccess:['Sample profile · no login','Beispielprofil · kein Login','示例资料 · 无法登录'],
 teamIdentity:['Profile / email','Profil / E-Mail','资料 / 邮箱'],
 samplePeopleNote:['DEMO profiles support sample tasks, time and planning. Public credits are historical context, not current employment claims. All rates and availability are fictional.','DEMO-Profile dienen beispielhaften Aufgaben, Zeiten und Planungen. Öffentliche Credits sind historischer Kontext und keine Aussage zur aktuellen Beschäftigung. Alle Sätze und Verfügbarkeiten sind erfunden.','DEMO 资料用于示例任务、工时及规划。公开署名仅提供历史背景，不代表当前雇佣关系。所有费率及可用时间均为虚构。'],
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
export function DemoBanner({demo,canArchive,onArchive,onUpgrade,busy}:{demo:DemoWorkspace;canArchive:boolean;onArchive:()=>void;onUpgrade:()=>void;busy:boolean}){
 const{locale}=useI18n();const t=(key:keyof typeof copy)=>agencyText(locale,key);
 const incomplete=(demo.experience_version??1)<DEMO_EXPERIENCE_VERSION;
 return <aside className="demo-banner" aria-label={t('demoBadge')}><div className="demo-banner-top"><div><strong>{t('demoBadge')}</strong><p>{t('disclosure')}</p>{incomplete&&canArchive&&<p>{t('completeDemoNote')}</p>}</div>{canArchive&&<div className="button-row">{incomplete&&<button className="button primary small" disabled={busy} onClick={onUpgrade}>{t('completeDemo')}</button>}<button className="button secondary small" disabled={busy} onClick={onArchive}>{t('archive')}</button></div>}</div></aside>;
}
export function Connections({tasks,projects,manager}:{tasks:Task[];projects:Project[];manager:boolean}){
 const{locale}=useI18n();const t=(key:keyof typeof copy)=>agencyText(locale,key);
 return <section className="panel connection-panel"><h2>{t('integration')}</h2><p>{t('calendarNote')}</p><button className="button secondary" onClick={()=>downloadCalendar(tasks,projects,locale)} disabled={!tasks.some(task=>task.status!=='done'&&task.due_date)}>{t('calendar')}</button>{manager&&<><p>{t('exportNote')}</p><h3>{t('accounting')}</h3><p>{t('accountingNote')}</p></>}</section>;
}
