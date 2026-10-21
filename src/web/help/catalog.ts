import type { Locale } from '../../shared/i18n';
import type { Role } from '../../shared/types';
import type { WorkflowView } from '../workflow-navigation';

// Hilfe-Katalog: Kategorien und Artikel-Metadaten (Titel, Kurzfassung, Rollen).
// Die Texte folgen dem Finance-Katalog: [en, de, zh]. Die Artikelkörper liegen
// in articles.ts und werden erst mit der Hilfe-Seite geladen; dieser Katalog ist
// klein genug für die globale Suche im Workspace-Bundle.
export type Text = readonly [en: string, de: string, zh: string];
export type HelpCategoryId = 'start' | 'time' | 'work' | 'team' | 'finance' | 'reference';
export interface HelpTopic { id: string; category: HelpCategoryId; title: Text; summary: Text; /** Wer den Artikel braucht; ohne Angabe alle. */ roles?: Role[]; /** Bereich, zu dem der Artikel gehört (Kontext-Hilfe, „Zum Bereich“). */ area?: WorkflowView }
export interface HelpCategory { id: HelpCategoryId; title: Text; intro: Text; roles?: Role[] }

export const helpText = (locale: Locale, text: Text) => text[locale === 'en' ? 0 : locale === 'de' ? 1 : 2];
export const MANAGERS: Role[] = ['owner', 'manager'];
export const helpVisible = (item: { roles?: Role[] }, role: Role) => !item.roles || item.roles.includes(role);

export const HELP_CATEGORIES: HelpCategory[] = [
  { id: 'start', title: ['Getting started', 'Erste Schritte', '入门'], intro: ['From the first workspace to the first approved hours – in the order you will meet them.', 'Vom ersten Workspace bis zur ersten freigegebenen Zeit – in der Reihenfolge, in der du sie brauchst.', '从第一个工作区到第一笔获批的工时——按你实际会遇到的顺序。'] },
  { id: 'time', title: ['Time & timer', 'Zeiten & Timer', '时间与计时器'], intro: ['Track, submit and approve hours. The heart of vave.log.', 'Erfassen, einreichen, freigeben. Das Herz von vave.log.', '记录、提交和审批工时。vave.log 的核心。'] },
  { id: 'work', title: ['Projects & tasks', 'Projekte & Aufgaben', '项目与任务'], intro: ['Projects hold budget and status; tasks hold the daily work.', 'Projekte tragen Budget und Status, Aufgaben die tägliche Arbeit.', '项目承载预算与状态，任务承载日常工作。'] },
  { id: 'team', title: ['Team & capacity', 'Team & Kapazität', '团队与产能'], intro: ['Invite people, set roles, plan capacity and absences.', 'Personen einladen, Rollen setzen, Kapazität und Abwesenheiten planen.', '邀请成员、设置角色、规划产能与缺勤。'], roles: MANAGERS },
  { id: 'finance', title: ['Finance', 'Finance', '财务'], intro: ['From offer to invoice to tax office – with frozen numbers and GoBD-safe cancellations.', 'Vom Angebot über die Rechnung bis zum Steuerbüro – mit festen Nummern und GoBD-sicherem Storno.', '从报价到发票再到税务——编号固定，冲销符合 GoBD。'], roles: MANAGERS },
  { id: 'reference', title: ['Reference', 'Nachschlagen', '参考'], intro: ['Shortcuts, statuses, roles, glossary and frequent questions.', 'Tastenkürzel, Status, Rollen, Glossar und häufige Fragen.', '快捷键、状态、角色、术语表和常见问题。'] },
];

export const HELP_TOPICS: HelpTopic[] = [
  // Erste Schritte
  { id: 'start-overview', category: 'start', area: 'overview', title: ['vave.log in two minutes', 'vave.log in zwei Minuten', '两分钟了解 vave.log'], summary: ['What the tool does and how the areas fit together.', 'Was das Tool kann und wie die Bereiche zusammenhängen.', '这个工具能做什么，各区域如何衔接。'] },
  { id: 'start-workspace', category: 'start', area: 'settings', title: ['Create or join a workspace', 'Workspace anlegen oder beitreten', '创建或加入工作区'], summary: ['Your own studio or an invitation: both start here.', 'Eigenes Studio oder Einladung: beides beginnt hier.', '自己的工作室或受邀加入：都从这里开始。'] },
  { id: 'start-roles', category: 'start', area: 'team', title: ['Understand the roles', 'Rollen verstehen', '理解角色'], summary: ['Owner, manager, member and disabled – who may do what.', 'Inhaber:in, Leitung, Mitglied, Deaktiviert – wer was darf.', '所有者、负责人、成员、已停用——各自的权限。'] },
  { id: 'start-first-time', category: 'start', area: 'time', title: ['Your first hours in five minutes', 'Deine erste Zeit in fünf Minuten', '五分钟记录第一笔工时'], summary: ['Track, submit, get approved – the whole loop once through.', 'Erfassen, einreichen, freigeben lassen – einmal die ganze Schleife.', '记录、提交、获批——完整走一遍流程。'] },
  { id: 'start-language', category: 'start', area: 'settings', title: ['Language, name and phone', 'Sprache, Name und Smartphone', '语言、姓名与手机'], summary: ['Three languages, your display name, and how the app behaves on a phone.', 'Drei Sprachen, dein Anzeigename und wie sich die App am Smartphone verhält.', '三种语言、你的显示名称，以及应用在手机上的表现。'] },
  // Zeiten
  { id: 'time-timer', category: 'time', area: 'time', title: ['Start and stop the timer', 'Timer starten und stoppen', '启动和停止计时器'], summary: ['One running timer per person; it follows you across the app.', 'Ein laufender Timer je Person – er begleitet dich durch die ganze App.', '每人同时只有一个计时器，它会在整个应用中跟随你。'] },
  { id: 'time-manual', category: 'time', area: 'time', title: ['Add time by hand', 'Zeit manuell erfassen', '手动添加工时'], summary: ['Date, project, duration, note – and what the 24-hour rule means.', 'Datum, Projekt, Dauer, Notiz – und was die 24-Stunden-Regel bedeutet.', '日期、项目、时长、备注——以及 24 小时规则的含义。'] },
  { id: 'time-task', category: 'time', area: 'tasks', title: ['Book time on a task', 'Zeit auf eine Aufgabe buchen', '将工时记到任务'], summary: ['Attach hours to a task so estimates and actuals meet.', 'Zeit an einer Aufgabe hängen, damit Schätzung und Ist zusammenfinden.', '把工时挂到任务上，让估算与实际对上。'] },
  { id: 'time-submit', category: 'time', area: 'time', title: ['Submit your hours', 'Zeiten einreichen', '提交工时'], summary: ['Drafts become submitted entries; what gets locked and what comes back.', 'Entwürfe werden eingereicht – was danach gesperrt ist und was zurückkommt.', '草稿变为已提交——之后哪些会被锁定，哪些会被退回。'] },
  { id: 'time-review', category: 'time', area: 'time', roles: MANAGERS, title: ['Review and approve hours', 'Zeiten prüfen und freigeben', '审核与批准工时'], summary: ['Single and bulk approval, returning entries, revoking an approval.', 'Einzeln und gesammelt freigeben, zurückgeben, Freigabe aufheben.', '单条与批量批准、退回条目、撤销批准。'] },
  { id: 'time-export', category: 'time', area: 'time', title: ['Export hours as CSV', 'Zeiten als CSV exportieren', '导出工时为 CSV'], summary: ['The CSV follows the filters you see.', 'Die CSV folgt genau den Filtern, die du siehst.', 'CSV 与你看到的筛选完全一致。'] },
  // Projekte & Aufgaben
  { id: 'work-project', category: 'work', area: 'projects', roles: MANAGERS, title: ['Create and maintain projects', 'Projekte anlegen und pflegen', '创建与维护项目'], summary: ['Code, client, budget, due date and the three project statuses.', 'Kürzel, Kunde, Budget, Termin und die drei Projektstatus.', '代码、客户、预算、截止日期和三种项目状态。'] },
  { id: 'work-tasks', category: 'work', area: 'tasks', title: ['Work on the task board', 'Mit dem Aufgaben-Board arbeiten', '使用任务看板'], summary: ['To do, doing, done – with assignees, due dates, estimates and milestones.', 'Offen, in Arbeit, erledigt – mit Zuständigen, Terminen, Schätzungen und Meilensteinen.', '待办、进行中、已完成——含负责人、截止日期、估算和里程碑。'] },
  { id: 'work-repeat', category: 'work', area: 'tasks', title: ['Repeating tasks', 'Wiederkehrende Aufgaben', '重复任务'], summary: ['Weekly, biweekly or monthly – the next one appears when you finish.', 'Wöchentlich, alle zwei Wochen oder monatlich – die nächste erscheint beim Erledigen.', '每周、每两周或每月——完成后自动出现下一个。'] },
  { id: 'work-calendar', category: 'work', area: 'settings', title: ['Due dates in your calendar', 'Termine in deinem Kalender', '把截止日期放进日历'], summary: ['Download open tasks as an ICS file for Outlook, Apple or Google.', 'Offene Aufgaben als ICS-Datei für Outlook, Apple oder Google laden.', '将未完成任务下载为 ICS 文件，用于 Outlook、Apple 或 Google。'] },
  // Team
  { id: 'team-invite', category: 'team', area: 'team', roles: MANAGERS, title: ['Invite people', 'Personen einladen', '邀请成员'], summary: ['Invitation with role, optional sign-in link, and how the person gets in.', 'Einladung mit Rolle, optionalem Anmeldelink – und wie die Person hereinkommt.', '带角色的邀请、可选登录链接，以及对方如何加入。'] },
  { id: 'team-roles', category: 'team', area: 'team', roles: MANAGERS, title: ['Change roles and remove access', 'Rollen ändern und Zugriff entziehen', '更改角色与撤销访问'], summary: ['Promote, demote, disable – and what stays when someone leaves.', 'Hochstufen, herabstufen, deaktivieren – und was bleibt, wenn jemand geht.', '升级、降级、停用——以及有人离开后保留什么。'] },
  { id: 'team-capacity', category: 'team', area: 'team', roles: MANAGERS, title: ['Capacity and absences', 'Kapazität und Abwesenheiten', '产能与缺勤'], summary: ['Hours per week and absences feed the utilization report.', 'Stunden pro Woche und Abwesenheiten speisen die Auslastung.', '每周工时与缺勤构成利用率报表的基础。'] },
  { id: 'time-account', category: 'time', area: 'time', title: ['Work schedule and time account', 'Arbeitszeitmodell und Zeitkonto', '工时模型与工时账户'], summary: ['Target per weekday, actual per day, flextime balance since a start date.', 'Soll je Wochentag, Ist je Tag, Gleitzeitsaldo seit Stichtag.', '每个工作日的目标、每日实际、自起始日的弹性工时余额。'] },
  { id: 'team-vacation', category: 'team', area: 'absences', title: ['Plan vacation and absences', 'Urlaub und Abwesenheiten planen', '规划休假与缺勤'], summary: ['Request vacation, see the team calendar, approve requests and keep the yearly account.', 'Urlaub beantragen, Teamkalender sehen, Anträge entscheiden und das Urlaubskonto führen.', '申请休假、查看团队日历、审批申请并维护年度假期账户。'] },
  { id: 'team-utilization', category: 'team', area: 'reports', roles: MANAGERS, title: ['Read the utilization report', 'Auslastung lesen', '解读利用率'], summary: ['Available, planned and tracked hours per person for any period.', 'Verfügbare, geplante und erfasste Stunden je Person für jeden Zeitraum.', '任意时段内每人的可用、计划与实际工时。'] },
  { id: 'team-list', category: 'team', area: 'team', roles: MANAGERS, title: ['Search and sort the team list', 'Team-Liste durchsuchen und sortieren', '搜索与排序团队列表'], summary: ['Role filter, sorting and a search across name, email and role.', 'Rollenfilter, Sortierung und Suche über Name, E-Mail und Rolle.', '角色筛选、排序，以及按姓名、邮箱和角色搜索。'] },
  // Finance
  { id: 'fin-setup', category: 'finance', area: 'finance', roles: MANAGERS, title: ['Set up Finance: company and clients', 'Finance einrichten: Unternehmen und Kunden', '设置财务：公司与客户'], summary: ['Letterhead, tax ID, payment terms and the client list.', 'Briefkopf, Steuer-ID, Zahlungsziel und die Kundenliste.', '信头、税号、付款期限和客户列表。'] },
  { id: 'fin-rates', category: 'finance', area: 'finance', roles: MANAGERS, title: ['Staff rates and project plans', 'Personensätze und Projektpläne', '人员费率与项目计划'], summary: ['Cost per hour, billing model, contract amount – the basis for margins.', 'Kosten je Stunde, Abrechnungsmodell, Vertragswert – die Basis für Margen.', '每小时成本、计费模式、合同金额——利润率的基础。'] },
  { id: 'fin-offers', category: 'finance', area: 'finance', roles: MANAGERS, title: ['Offers and the step to a project', 'Angebote und der Schritt zum Projekt', '报价及转为项目'], summary: ['Draft, send with a frozen number, decide, and create the project.', 'Entwerfen, mit fester Nummer versenden, entscheiden, Projekt anlegen.', '起草、以固定编号发送、决定、创建项目。'] },
  { id: 'fin-invoice-time', category: 'finance', area: 'finance', roles: MANAGERS, title: ['Invoice approved hours', 'Rechnung aus freigegebenen Zeiten', '按已批工时开票'], summary: ['Project, client, period – vave.log collects the unbilled hours.', 'Projekt, Kunde, Zeitraum – vave.log sammelt die noch nicht abgerechneten Zeiten.', '项目、客户、时段——vave.log 自动汇总未开票工时。'] },
  { id: 'fin-invoice-manual', category: 'finance', area: 'finance', roles: MANAGERS, title: ['Manual drafts and issuing', 'Manuelle Entwürfe und Ausstellen', '手动草稿与开具'], summary: ['Free line items, tax per line, and what issuing freezes.', 'Freie Positionen, Steuer je Position – und was das Ausstellen einfriert.', '自由条目、逐条税率——以及开具后会冻结什么。'] },
  { id: 'fin-payments', category: 'finance', area: 'finance', roles: MANAGERS, title: ['Payments, partial payments, overdue', 'Zahlungen, Teilzahlungen, Überfällig', '付款、部分付款、逾期'], summary: ['Record what came in and keep the open items in view.', 'Eingänge erfassen und die offenen Posten im Blick behalten.', '记录到账，随时掌握未结项目。'] },
  { id: 'fin-bank', category: 'finance', area: 'finance', roles: MANAGERS, title: ['Match a bank statement', 'Kontoauszug abgleichen', '核对银行对账单'], summary: ['Load CAMT or CSV, check the proposals, book incoming payments in one go.', 'CAMT oder CSV laden, Vorschläge prüfen, Zahlungseingänge in einem Schritt buchen.', '加载 CAMT 或 CSV，检查建议，一次性入账。'] },
  { id: 'fin-cancel', category: 'finance', area: 'finance', roles: MANAGERS, title: ['Cancel an invoice (GoBD)', 'Rechnung stornieren (GoBD)', '冲销发票（GoBD）'], summary: ['Issued invoices are never deleted – a cancellation invoice reverses them.', 'Ausgestellte Rechnungen werden nie gelöscht – eine Stornorechnung hebt sie auf.', '已开具的发票不会被删除——由冲销发票来撤销。'] },
  { id: 'fin-export', category: 'finance', area: 'finance', roles: MANAGERS, title: ['E-invoice and DATEV export', 'E-Rechnung und DATEV-Export', '电子发票与 DATEV 导出'], summary: ['XML for public clients and B2B, a booking batch for the tax office.', 'XML für öffentliche Auftraggeber und B2B, Buchungsstapel fürs Steuerbüro.', '面向公共机构和 B2B 的 XML，以及供税务师使用的记账批次。'] },
  // Nachschlagen
  { id: 'ref-search', category: 'reference', title: ['Global search (Ctrl+K)', 'Globale Suche (Strg+K)', '全局搜索（Ctrl+K）'], summary: ['Jump to projects, tasks, people, invoices and help from anywhere.', 'Von überall zu Projekten, Aufgaben, Personen, Rechnungen und Hilfe springen.', '从任何位置跳转到项目、任务、人员、发票和帮助。'] },
  { id: 'ref-accessibility', category: 'reference', title: ['Accessibility', 'Barrierefreiheit', '无障碍'], summary: ['Keyboard, screen readers, zoom and reduced motion.', 'Tastatur, Screenreader, Zoom und reduzierte Bewegung.', '键盘、读屏软件、缩放与减少动态效果。'] },
  { id: 'ref-shortcuts', category: 'reference', title: ['Keyboard shortcuts', 'Tastenkürzel', '键盘快捷键'], summary: ['Everything you can do without the mouse.', 'Alles, was ohne Maus geht.', '无需鼠标即可完成的一切。'] },
  { id: 'ref-status', category: 'reference', title: ['Statuses at a glance', 'Status auf einen Blick', '状态一览'], summary: ['Time entries, tasks, projects, offers and invoices.', 'Zeiteinträge, Aufgaben, Projekte, Angebote und Rechnungen.', '工时条目、任务、项目、报价和发票。'] },
  { id: 'ref-roles', category: 'reference', title: ['Role matrix', 'Rollen-Matrix', '角色矩阵'], summary: ['Which role can do what, as a table.', 'Welche Rolle was darf, als Tabelle.', '每个角色能做什么，以表格呈现。'] },
  { id: 'ref-data', category: 'reference', area: 'settings', title: ['Your data and your workspace', 'Deine Daten und dein Workspace', '你的数据与工作区'], summary: ['Where data lives, what you can export, and how a workspace ends.', 'Wo die Daten liegen, was du exportieren kannst, wie ein Workspace endet.', '数据存放在哪里、可以导出什么、工作区如何结束。'] },
  { id: 'ref-faq', category: 'reference', title: ['Frequent questions', 'Häufige Fragen', '常见问题'], summary: ['Short answers to what people ask most.', 'Kurze Antworten auf das, was am häufigsten gefragt wird.', '对最常见问题的简短回答。'] },
  { id: 'ref-glossary', category: 'reference', title: ['Glossary', 'Glossar', '术语表'], summary: ['The terms vave.log uses, explained in one line each.', 'Die Begriffe von vave.log, je in einem Satz erklärt.', 'vave.log 使用的术语，每条一句话解释。'] },
];

/** Artikel, den die Kontext-Hilfe („?“ im Seitenkopf) je Bereich öffnet. */
export const AREA_TOPIC: Record<WorkflowView, string> = { overview: 'start-overview', projects: 'work-project', tasks: 'work-tasks', time: 'time-manual', absences: 'team-vacation', reports: 'team-utilization', team: 'team-invite', finance: 'fin-setup', settings: 'start-language', help: 'start-overview' };

/** Die meistgesuchten Themen als Chips unter dem Suchfeld (Figma-Muster). */
export const HELP_CHIPS = ['start-first-time', 'time-submit', 'time-review', 'team-invite', 'fin-invoice-time', 'ref-shortcuts'];
