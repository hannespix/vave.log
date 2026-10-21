import type { Text } from './catalog';

// Artikelkörper der Hilfe (nur mit der Hilfe-Seite geladen). Ein Artikel = ein
// Thema (Linear-Muster): kurze Schritte, höchstens ein „Gut zu wissen“ und ein
// „Darum“ (Diátaxis: Anleitung und Erklärung getrennt), Verweise statt Mega-Guide.
export interface HelpBody {
  steps?: Text[];
  tip?: Text;
  why?: Text;
  related?: string[];
  table?: { head: Text[]; rows: Text[][] };
  list?: { term: Text; def: Text }[];
}

export const HELP_BODIES: Record<string, HelpBody> = {
  'start-overview': {
    steps: [
      ['Overview shows your running timer, the week and what needs your attention.', 'Die Übersicht zeigt deinen laufenden Timer, die Woche und was Aufmerksamkeit braucht.', '概览显示正在运行的计时器、本周情况以及需要关注的事项。'],
      ['Projects carry budget, client and status; tasks carry the daily work on a board.', 'Projekte tragen Budget, Kunde und Status; Aufgaben die tägliche Arbeit auf einem Board.', '项目承载预算、客户和状态；任务在看板上承载日常工作。'],
      ['Time is where you track hours – by timer or by hand – and submit them for approval.', 'Unter Zeiten erfasst du Stunden – per Timer oder von Hand – und reichst sie zur Freigabe ein.', '在“时间”里按计时器或手动记录工时，并提交审批。'],
      ['Reports sum hours and budgets for any period; managers also see utilization.', 'Auswertung summiert Stunden und Budgets für jeden Zeitraum; die Leitung sieht auch die Auslastung.', '“报表”汇总任意时段的工时与预算；负责人还能看到利用率。'],
      ['Team and Finance are for owners and managers: people, roles, capacity, offers, invoices.', 'Team und Finance sind für Inhaber:in und Leitung: Personen, Rollen, Kapazität, Angebote, Rechnungen.', '“团队”和“财务”面向所有者与负责人：成员、角色、产能、报价、发票。'],
    ],
    tip: ['Ctrl+K (Cmd+K on Mac) opens the global search from anywhere – including this help.', 'Strg+K (Cmd+K am Mac) öffnet von überall die globale Suche – auch für diese Hilfe.', '在任何位置按 Ctrl+K（Mac 上 Cmd+K）打开全局搜索——包括这份帮助。'],
    related: ['start-first-time', 'start-roles', 'ref-search'],
  },
  'start-workspace': {
    steps: [
      ['Own studio: after signing in, choose a name for your workspace. Time zone and currency are set once and define the day boundaries of your timers.', 'Eigenes Studio: Nach der Anmeldung gibst du deinem Workspace einen Namen. Zeitzone und Währung werden einmal festgelegt und bestimmen die Tagesgrenzen deiner Timer.', '自己的工作室：登录后为工作区命名。时区和货币只设置一次，并决定计时器的日界。'],
      ['Invited: register with exactly the invited email address. Open invitations are accepted automatically the next time you sign in.', 'Eingeladen: Registriere dich mit genau der eingeladenen E-Mail-Adresse. Offene Einladungen werden bei der nächsten Anmeldung automatisch angenommen.', '受邀：使用被邀请的邮箱地址注册。下次登录时会自动接受待处理的邀请。'],
      ['Several workspaces? Switch in the sidebar; every workspace has its own projects, team and finance.', 'Mehrere Workspaces? Wechsle in der Seitenleiste; jeder Workspace hat eigene Projekte, Team und Finance.', '多个工作区？在侧边栏切换；每个工作区有自己的项目、团队和财务。'],
      ['Want to try first? Start a demo workspace with sample people and numbers. You can complete it into a real workspace or archive it later.', 'Erst ausprobieren? Starte einen Demo-Workspace mit Beispielpersonen und -zahlen. Du kannst ihn später in einen echten Workspace überführen oder archivieren.', '想先试试？创建一个带示例成员和数据的演示工作区，之后可转为正式工作区或归档。'],
    ],
    why: ['Time zone and currency are fixed on purpose: changing them later would silently move timers across days and mix amounts.', 'Zeitzone und Währung sind absichtlich fest: Eine spätere Änderung würde Timer still über Tagesgrenzen verschieben und Beträge vermischen.', '时区和货币被刻意固定：事后更改会悄悄改变计时器的日界并混淆金额。'],
    related: ['team-invite', 'start-language', 'ref-data'],
  },
  'start-roles': {
    steps: [
      ['Owner: everything – invitations, roles, workspace name, projects, team hours, Finance.', 'Inhaber:in: alles – Einladungen, Rollen, Workspace-Name, Projekte, Teamzeiten, Finance.', '所有者：全部权限——邀请、角色、工作区名称、项目、团队工时、财务。'],
      ['Manager: projects, team hours and approvals, Team and Finance – but no invitations or role changes.', 'Leitung: Projekte, Teamzeiten und Freigaben, Team und Finance – aber keine Einladungen oder Rollenwechsel.', '负责人：项目、团队工时与审批、团队和财务——但不能邀请或更改角色。'],
      ['Member: own hours, tasks, projects and reports for own work.', 'Mitglied: eigene Zeiten, Aufgaben, Projekte und Auswertung der eigenen Arbeit.', '成员：自己的工时、任务、项目和自己工作的报表。'],
      ['Disabled: no access any more; tracked hours stay in the history.', 'Deaktiviert: kein Zugriff mehr; erfasste Zeiten bleiben in der Historie.', '已停用：不再有访问权限；已记录的工时保留在历史中。'],
    ],
    related: ['ref-roles', 'team-roles'],
  },
  'start-first-time': {
    steps: [
      ['Make sure an active project exists (managers create projects under Projects).', 'Stelle sicher, dass ein aktives Projekt existiert (die Leitung legt es unter Projekte an).', '确保存在一个进行中的项目（由负责人在“项目”中创建）。'],
      ['On Overview or Time, start the timer for the project – or click “Add time” and enter date, duration and a note.', 'Starte auf der Übersicht oder unter Zeiten den Timer für das Projekt – oder klicke „Zeit erfassen“ und trage Datum, Dauer und eine Notiz ein.', '在“概览”或“时间”中为该项目启动计时器，或点击“记录时间”，填写日期、时长和备注。'],
      ['Your entry is a draft: edit or delete it as long as you like.', 'Dein Eintrag ist ein Entwurf: Bearbeite oder lösche ihn, solange du willst.', '你的条目是草稿：可随时编辑或删除。'],
      ['Click “Submit hours” – all your drafts in the selected period go to review.', 'Klicke „Zeiten einreichen“ – alle deine Entwürfe im gewählten Zeitraum gehen in die Prüfung.', '点击“提交工时”——所选时段内你的所有草稿进入审核。'],
      ['A manager approves or returns them; you get a note at the top of the page.', 'Die Leitung gibt frei oder gibt zurück; du bekommst einen Hinweis oben auf der Seite.', '负责人批准或退回；你会在页面顶部看到提示。'],
    ],
    related: ['time-timer', 'time-submit', 'time-review'],
  },
  'start-language': {
    steps: [
      ['Language: the switch in the header offers system language, German, English and Chinese. Invoices have their own language per document.', 'Sprache: Der Schalter in der Kopfzeile bietet Systemsprache, Deutsch, Englisch und Chinesisch. Rechnungen haben eine eigene Sprache je Dokument.', '语言：顶栏的切换器提供系统语言、德语、英语和中文。发票按单据单独设置语言。'],
      ['Display name: under Settings you set how your name appears in this workspace.', 'Anzeigename: Unter Einstellungen legst du fest, wie dein Name in diesem Workspace erscheint.', '显示名称：在“设置”中决定你的名字在此工作区如何显示。'],
      ['Phone: the four main areas sit in the bottom bar, the rest behind “More”. A running timer docks above the bar.', 'Smartphone: Die vier Hauptbereiche liegen in der unteren Leiste, der Rest hinter „Mehr“. Ein laufender Timer dockt über der Leiste an.', '手机：四个主要区域位于底栏，其余在“更多”中。运行中的计时器停靠在底栏上方。'],
      ['Install as an app: most browsers offer “Install” or “Add to home screen” for vave.log.', 'Als App installieren: Die meisten Browser bieten „Installieren“ oder „Zum Startbildschirm“ für vave.log an.', '安装为应用：多数浏览器为 vave.log 提供“安装”或“添加到主屏幕”。'],
    ],
    related: ['start-workspace'],
  },
  'time-timer': {
    steps: [
      ['Choose project, optional task and note, tick “billable” if the client pays for it, and press “Start timer”.', 'Wähle Projekt, optional Aufgabe und Notiz, setze „abrechenbar“, wenn der Kunde dafür zahlt, und drücke „Timer starten“.', '选择项目，可选任务和备注，若客户付费则勾选“可计费”，然后按“启动计时器”。'],
      ['The timer floats on every page and shows in the browser tab title. Stop it anywhere – the entry lands as a draft under Time.', 'Der Timer schwebt auf jeder Seite und steht im Tab-Titel des Browsers. Stoppe ihn überall – der Eintrag landet als Entwurf unter Zeiten.', '计时器悬浮在每个页面并显示在浏览器标签标题中。随处可停止——条目会作为草稿进入“时间”。'],
      ['Quick start: “Start timer” on a project card, the play button on a task card, the task dialog and “Start a timer instead” in the time dialog start the timer for exactly that project or task.', 'Schnellstart: „Timer starten“ auf der Projektkarte, der Play-Knopf auf der Aufgabenkarte, der Aufgaben-Dialog und „Stattdessen Timer starten“ im Zeit-Dialog starten den Timer direkt für genau dieses Projekt bzw. diese Aufgabe.', '快速开始：项目卡片上的“开始计时”、任务卡片上的播放按钮、任务对话框以及工时对话框中的“改为开始计时”，都会直接为该项目或任务开始计时。'],
      ['Only one timer runs per person. If one is already running, the app asks before switching: the running time is saved as a draft (under one minute it is discarded).', 'Pro Person läuft nur ein Timer. Läuft schon einer, fragt die App vor dem Wechsel nach: Die laufende Zeit wird als Entwurf gespeichert (unter einer Minute verworfen).', '每人只能运行一个计时器。如已有计时在运行，切换前会先确认：当前计时保存为草稿（不足一分钟则放弃）。'],
      ['Forgot to stop? Timers are split at midnight in the workspace time zone. After 24 hours the app asks you to discard and enter the time by hand.', 'Vergessen zu stoppen? Timer werden um Mitternacht in der Workspace-Zeitzone geteilt. Nach 24 Stunden bittet dich die App, ihn zu verwerfen und die Zeit manuell einzutragen.', '忘记停止？计时器会在工作区时区的午夜拆分。超过 24 小时后，应用会提示你放弃并手动录入。'],
      ['“Discard timer” throws the running time away without creating an entry.', '„Timer verwerfen“ wirft die laufende Zeit weg, ohne einen Eintrag anzulegen.', '“放弃计时器”会丢弃正在计时的时间，不生成条目。'],
    ],
    related: ['time-manual', 'time-task'],
  },
  'time-manual': {
    steps: [
      ['Click “Add time” on Overview or Time.', 'Klicke „Zeit erfassen“ auf der Übersicht oder unter Zeiten.', '在“概览”或“时间”中点击“记录时间”。'],
      ['Enter date, project, optional task, duration in minutes and a note. Tick “billable” for client-paid work.', 'Trage Datum, Projekt, optional Aufgabe, Dauer in Minuten und eine Notiz ein. Setze „abrechenbar“ für Arbeit, die der Kunde bezahlt.', '填写日期、项目、可选任务、分钟数和备注。客户付费的工作勾选“可计费”。'],
      ['Only active projects accept time. Paused and archived projects keep their history but take no new entries.', 'Nur aktive Projekte nehmen Zeit an. Pausierte und archivierte behalten ihre Historie, bekommen aber keine neuen Einträge.', '只有进行中的项目可记录工时。已暂停和已归档项目保留历史，但不接受新条目。'],
      ['Edit or delete your own drafts via the pencil and bin icons in the list.', 'Eigene Entwürfe bearbeitest oder löschst du über Stift und Papierkorb in der Liste.', '通过列表中的铅笔和垃圾桶图标编辑或删除自己的草稿。'],
    ],
    tip: ['A day holds at most 24 hours per workspace: the app rejects entries that would push one day above 1,440 minutes.', 'Ein Tag hat je Workspace höchstens 24 Stunden: Die App weist Einträge ab, die einen Tag über 1.440 Minuten bringen würden.', '每个工作区每天最多 24 小时：若某天超过 1,440 分钟，应用会拒绝该条目。'],
    related: ['time-timer', 'time-submit'],
  },
  'time-task': {
    steps: [
      ['In the time entry or the timer, pick a task of the chosen project.', 'Wähle im Zeiteintrag oder im Timer eine Aufgabe des gewählten Projekts.', '在工时条目或计时器中选择所选项目的任务。'],
      ['The task on the board shows the tracked hours next to its estimate.', 'Die Aufgabe auf dem Board zeigt die erfassten Stunden neben ihrer Schätzung.', '看板上的任务会在估算旁显示已记录工时。'],
      ['Entries without a task still count for the project – the task is optional.', 'Einträge ohne Aufgabe zählen weiter fürs Projekt – die Aufgabe ist optional.', '未关联任务的条目仍计入项目——任务是可选的。'],
    ],
    related: ['work-tasks', 'time-manual'],
  },
  'time-submit': {
    steps: [
      ['Under Time, choose the period with the date picker.', 'Wähle unter Zeiten den Zeitraum mit der Datumsauswahl.', '在“时间”中用日期选择器选定时段。'],
      ['Click “Submit hours”. All your drafts in that period are submitted – regardless of the filters shown.', 'Klicke „Zeiten einreichen“. Alle deine Entwürfe in diesem Zeitraum werden eingereicht – unabhängig von den angezeigten Filtern.', '点击“提交工时”。该时段内你的所有草稿都会提交——与当前显示的筛选无关。'],
      ['Submitted entries are locked for you until a manager approves or returns them.', 'Eingereichte Einträge sind für dich gesperrt, bis die Leitung sie freigibt oder zurückgibt.', '已提交的条目对你锁定，直到负责人批准或退回。'],
      ['Returned entries become drafts again: correct them and submit once more. The note at the top tells you how many were approved or returned.', 'Zurückgegebene Einträge werden wieder Entwürfe: Korrigiere sie und reiche erneut ein. Der Hinweis oben sagt dir, wie viele freigegeben oder zurückgegeben wurden.', '被退回的条目重新变为草稿：修正后再次提交。页面顶部的提示会告诉你有多少已批准或退回。'],
    ],
    related: ['time-review', 'start-first-time'],
  },
  'time-review': {
    steps: [
      ['Under Time, switch to “Team hours” and filter by status “Submitted”.', 'Wechsle unter Zeiten auf „Teamzeiten“ und filtere nach Status „Eingereicht“.', '在“时间”中切换到“团队工时”，按状态“已提交”筛选。'],
      ['Approve with the check mark or return with the cross – the person sees a note and can correct.', 'Gib mit dem Haken frei oder gib mit dem Kreuz zurück – die Person sieht einen Hinweis und kann korrigieren.', '用对勾批准或用叉号退回——对方会收到提示并可修正。'],
      ['Bulk approval: “Approve all” approves every submitted entry in the current view. Entries decided meanwhile are skipped.', 'Sammel-Freigabe: „Alle freigeben“ gibt alle eingereichten Einträge der aktuellen Ansicht frei. Inzwischen anders entschiedene werden übersprungen.', '批量批准：“全部批准”会批准当前视图中的所有已提交条目。期间已另行处理的会被跳过。'],
      ['A blue note tells you when submitted hours wait outside the chosen period; “Show all open approvals” widens the period.', 'Ein blauer Hinweis zeigt, wenn eingereichte Zeiten außerhalb des gewählten Zeitraums warten; „Alle offenen Freigaben anzeigen“ weitet den Zeitraum.', '蓝色提示会说明所选时段之外还有待审核的工时；“显示所有待审批”会扩大时段。'],
      ['Approved by mistake? “Revoke approval” returns the entry to draft – unless it is already on an invoice.', 'Versehentlich freigegeben? „Freigabe aufheben“ macht den Eintrag wieder zum Entwurf – außer er steht schon auf einer Rechnung.', '误批了？“撤销批准”会把条目恢复为草稿——除非它已在发票上。'],
    ],
    why: ['Approval is the gate to invoicing: only approved hours can be billed, and billed hours can no longer change.', 'Die Freigabe ist das Tor zur Rechnung: Nur freigegebene Zeiten lassen sich abrechnen, und abgerechnete Zeiten ändern sich nicht mehr.', '批准是开票的门槛：只有已批准的工时可开票，已开票的工时不可再更改。'],
    related: ['time-submit', 'fin-invoice-time'],
  },
  'time-export': {
    steps: [
      ['Set period, scope and filters under Time.', 'Stelle unter Zeiten Zeitraum, Bereich und Filter ein.', '在“时间”中设置时段、范围和筛选。'],
      ['Click “CSV”. The file contains exactly the rows you see, with person, project, task, duration and status.', 'Klicke „CSV“. Die Datei enthält genau die Zeilen, die du siehst, mit Person, Projekt, Aufgabe, Dauer und Status.', '点击“CSV”。文件包含你看到的全部行：人员、项目、任务、时长和状态。'],
    ],
    related: ['fin-export'],
  },
  'work-project': {
    steps: [
      ['Under Projects, click “New project”: code (short, unique), name, client, color, budget in hours and an optional due date.', 'Klicke unter Projekte „Neues Projekt“: Kürzel (kurz, eindeutig), Name, Kunde, Farbe, Budget in Stunden und optional ein Termin.', '在“项目”中点击“新建项目”：代码（简短唯一）、名称、客户、颜色、预算工时和可选截止日期。'],
      ['Status: active projects take time and tasks; paused and archived projects keep everything but accept nothing new.', 'Status: Aktive Projekte nehmen Zeit und Aufgaben an; pausierte und archivierte behalten alles, nehmen aber nichts Neues an.', '状态：进行中的项目接受工时和任务；已暂停和已归档的保留一切但不接受新内容。'],
      ['The project card shows budget usage; the insight dialog adds hours per person, tasks and planned versus actual.', 'Die Projektkarte zeigt den Budgetverbrauch; der Einblick-Dialog ergänzt Stunden je Person, Aufgaben und Plan gegen Ist.', '项目卡显示预算消耗；洞察对话框补充每人工时、任务及计划与实际对比。'],
      ['Projects created from an accepted offer already carry a fixed-price plan (see Finance).', 'Projekte aus einem angenommenen Angebot tragen bereits einen Festpreis-Plan (siehe Finance).', '由已接受报价创建的项目已带有固定价格计划（见财务）。'],
    ],
    related: ['fin-rates', 'fin-offers', 'work-tasks'],
  },
  'work-tasks': {
    steps: [
      ['“New task”: title, project, assignee, due date, estimate in minutes, milestone flag and repetition.', '„Neue Aufgabe“: Titel, Projekt, Zuständige, Termin, Schätzung in Minuten, Meilenstein-Markierung und Wiederholung.', '“新建任务”：标题、项目、负责人、截止日期、分钟估算、里程碑标记和重复设置。'],
      ['Drag a card into another column to change its status – on a phone, hold the card briefly, then drag. Esc cancels. With the keyboard, use the status field on the card.', 'Ziehe eine Karte in eine andere Spalte, um ihren Status zu ändern – am Handy die Karte kurz halten, dann ziehen. Esc bricht ab. Mit der Tastatur geht es über das Statusfeld auf der Karte.', '将卡片拖到另一列即可更改状态——在手机上先短按卡片再拖动。按 Esc 取消。使用键盘时，请用卡片上的状态字段。'],
      ['Filters: mine, overdue, status, assignee, due today or this week, and a text search – the URL keeps them, so you can share a view.', 'Filter: meine, überfällig, Status, Zuständige, fällig heute oder diese Woche und Textsuche – die Adresse merkt sie sich, du kannst eine Ansicht teilen.', '筛选：我的、逾期、状态、负责人、今天或本周到期以及文本搜索——网址会记住它们，可分享视图。'],
      ['Milestones are highlighted on the board and in the project insight.', 'Meilensteine sind auf dem Board und im Projekt-Einblick hervorgehoben.', '里程碑在看板和项目洞察中高亮显示。'],
    ],
    related: ['work-repeat', 'time-task', 'work-calendar'],
  },
  'work-repeat': {
    steps: [
      ['In the task, choose “Weekly”, “Every two weeks” or “Monthly” under repetition.', 'Wähle in der Aufgabe unter Wiederholung „Wöchentlich“, „Alle zwei Wochen“ oder „Monatlich“.', '在任务的重复设置中选择“每周”、“每两周”或“每月”。'],
      ['When you set the task to Done, the next one appears with the same details and the next due date.', 'Setzt du die Aufgabe auf Erledigt, erscheint die nächste mit denselben Angaben und dem nächsten Termin.', '将任务设为已完成后，下一个任务会以相同信息和下一个截止日期出现。'],
      ['The finished task keeps no repetition – only the new one. Set “none” on it to stop the series.', 'Die erledigte Aufgabe behält keine Wiederholung – nur die neue. Setze dort „keine“, um die Reihe zu beenden.', '已完成的任务不再保留重复设置——只有新任务有。在新任务上设为“无”即可终止系列。'],
    ],
    related: ['work-tasks'],
  },
  'work-calendar': {
    steps: [
      ['Under Settings → Connections, click the calendar download.', 'Klicke unter Einstellungen → Verbindungen den Kalender-Download.', '在“设置 → 连接”中点击日历下载。'],
      ['You get an ICS file with all open tasks that have a due date. Import it into Outlook, Apple Calendar or Google Calendar.', 'Du erhältst eine ICS-Datei mit allen offenen Aufgaben, die einen Termin haben. Importiere sie in Outlook, Apple Kalender oder Google Kalender.', '你会得到一个包含所有带截止日期的未完成任务的 ICS 文件。导入 Outlook、Apple 日历或 Google 日历即可。'],
    ],
    tip: ['The file is a snapshot – download it again after changes.', 'Die Datei ist eine Momentaufnahme – lade sie nach Änderungen erneut.', '该文件是快照——有变更后请重新下载。'],
    related: ['work-tasks'],
  },
  'team-invite': {
    steps: [
      ['Under Team, click “Invite person” (owners only): email address and role – manager or member.', 'Klicke unter Team „Person einladen“ (nur Inhaber:in): E-Mail-Adresse und Rolle – Leitung oder Mitglied.', '在“团队”中点击“邀请成员”（仅所有者）：邮箱地址和角色——负责人或成员。'],
      ['Optionally tick “Send a sign-in link by email right away”: the account is created and the person gets a link. Otherwise copy the invitation text and send it yourself.', 'Optional „Anmeldelink direkt per E-Mail senden“: Das Konto wird angelegt und die Person bekommt einen Link. Sonst kopiere den Einladungstext und schicke ihn selbst.', '可选勾选“立即通过邮件发送登录链接”：创建账号并向对方发送链接。否则复制邀请文本自行发送。'],
      ['The person registers with exactly that email address; the invitation is accepted on sign-in.', 'Die Person registriert sich mit genau dieser E-Mail-Adresse; die Einladung wird beim Anmelden angenommen.', '对方用该邮箱注册；登录时自动接受邀请。'],
      ['Invitations are valid for 14 days and listed under “Open invitations”, where owners can revoke them.', 'Einladungen gelten 14 Tage und stehen unter „Offene Einladungen“, wo Inhaber:innen sie widerrufen können.', '邀请有效期 14 天，列在“待处理邀请”下，所有者可撤销。'],
    ],
    tip: ['Already a member? The app tells you – change the role under Team instead.', 'Schon Mitglied? Die App sagt es dir – ändere stattdessen die Rolle unter Team.', '已是成员？应用会提示——请改在“团队”中更改角色。'],
    related: ['team-roles', 'start-roles'],
  },
  'team-roles': {
    steps: [
      ['Owners change roles in the Team list via the role selector; every change asks for confirmation.', 'Inhaber:innen ändern Rollen in der Team-Liste über die Rollenauswahl; jede Änderung fragt nach.', '所有者在团队列表中通过角色选择器更改角色；每次更改都会要求确认。'],
      ['“Disabled” removes access immediately. A running timer is discarded without an entry; tracked hours and tasks stay.', '„Deaktiviert“ entzieht den Zugriff sofort. Ein laufender Timer wird ohne Eintrag verworfen; erfasste Zeiten und Aufgaben bleiben.', '“已停用”会立即撤销访问。运行中的计时器会被丢弃且不生成条目；已记录的工时和任务保留。'],
      ['Changing your own role may change your own rights – the dialog warns you.', 'Änderst du deine eigene Rolle, können sich deine eigenen Rechte ändern – der Dialog warnt dich.', '更改自己的角色可能改变自己的权限——对话框会提醒你。'],
    ],
    related: ['ref-roles', 'team-invite'],
  },
  'team-capacity': {
    steps: [
      ['Capacity: in the Team list, enter hours per week per person. Leave it empty if a person is not planned.', 'Kapazität: Trage in der Team-Liste je Person die Stunden pro Woche ein. Lass es leer, wenn eine Person nicht verplant wird.', '产能：在团队列表中为每人填写每周工时。不参与排期的人留空。'],
      ['Absences: “Add absence” with person, from, to and kind – vacation, sick, public holiday or other.', 'Abwesenheiten: „Abwesenheit eintragen“ mit Person, von, bis und Art – Urlaub, krank, Feiertag oder sonstiges.', '缺勤：“添加缺勤”，填写人员、起止日期和类型——休假、病假、法定假日或其他。'],
      ['Location: choose a region per person (Germany, Austria, Switzerland with states or cantons) – or set a workspace default under Settings. Public holidays of that location are computed automatically; nobody needs to enter them.', 'Standort: Wähle je Person eine Region (Deutschland, Österreich, Schweiz mit Bundesländern bzw. Kantonen) – oder setze unter Einstellungen einen Workspace-Standard. Die gesetzlichen Feiertage dieses Standorts werden automatisch gerechnet; niemand muss sie eintragen.', '地点：为每人选择地区（德国、奥地利、瑞士及其州/邦），或在“设置”中设定工作区默认值。该地区的法定假日会自动计算，无需手动录入。'],
      ['All three feed the utilization report: available hours = capacity × workdays minus absences minus public holidays.', 'Alle drei speisen die Auslastung: verfügbare Stunden = Kapazität × Arbeitstage minus Abwesenheiten minus Feiertage.', '三者共同构成利用率：可用工时 = 产能 × 工作日 − 缺勤 − 法定假日。'],
    ],
    related: ['team-utilization'],
  },
  'time-ai-suggestions': {
    steps: [
      ['How it works: vave.log is a remote MCP server (endpoint /api/mcp, sign-in with your vave.log account). ChatGPT or Claude read your calendar, Fireflies meeting notes and Box activity through their own connectors, match each block to a project with “match_project” and send suggestions with “propose_time_entries”. vave.log stores only the suggestions and their evidence – never your raw calendar or files.', 'So funktioniert es: vave.log ist ein Remote-MCP-Server (Endpunkt /api/mcp, Anmeldung mit deinem vave.log-Konto). ChatGPT oder Claude lesen Kalender, Fireflies-Protokolle und Box-Aktivität über ihre eigenen Connectoren, ordnen jeden Block mit „match_project“ einem Projekt zu und schicken Vorschläge mit „propose_time_entries“. vave.log speichert nur die Vorschläge und ihre Belege – nie deinen Kalender oder deine Dateien.', '工作原理：vave.log 是远程 MCP 服务器（端点 /api/mcp，使用你的 vave.log 账户登录）。ChatGPT 或 Claude 通过各自的连接器读取日历、Fireflies 会议记录和 Box 活动，用“match_project”将每个时间块匹配到项目，并通过“propose_time_entries”发送建议。vave.log 只保存建议及其依据，绝不保存你的日历或文件。'],
      ['Set-up in the ChatGPT workspace (Business/Enterprise): an admin enables connectors/MCP, adds vave.log as a connector with the URL <your vave.log address>/api/mcp and OAuth; every person signs in once with their vave.log account. In Claude: Settings → Connectors → add the same URL. The OAuth server is Supabase Auth; the operator has to activate it (see STATE.md, open item 4).', 'Einrichtung im ChatGPT-Workspace (Business/Enterprise): Ein Admin schaltet Connectoren/MCP frei, trägt vave.log als Connector mit der Adresse <deine vave.log-Adresse>/api/mcp und OAuth ein; jede Person meldet sich einmal mit ihrem vave.log-Konto an. In Claude: Einstellungen → Connectoren → dieselbe Adresse. Der OAuth-Server ist Supabase Auth; der Betreiber muss ihn freischalten (siehe STATE.md, offener Punkt 4).', '在 ChatGPT 工作区（Business/Enterprise）中设置：管理员启用连接器/MCP，添加 vave.log 连接器，地址为 <你的 vave.log 地址>/api/mcp 并使用 OAuth；每人用自己的 vave.log 账户登录一次。在 Claude 中：设置 → 连接器 → 添加同一地址。OAuth 服务器为 Supabase Auth，需由运营方启用（见 STATE.md 第 4 项）。'],
      ['Instruction text for a GPT or project (copy): “Every working day at 17:30 read my calendar, Fireflies notes and Box activity for today. For every block of work call match_project with the title, customer or folder name. Round to 15 minutes, write a short note (what, for whom), set confidence and attach the evidence (title, link). Send everything with propose_time_entries using a stable external_id per calendar entry or document. Never call save_time_entry or start_timer yourself – I confirm in vave.log.”', 'Instruktionstext für ein GPT oder Projekt (zum Kopieren): „Lies jeden Arbeitstag um 17:30 meinen Kalender, die Fireflies-Protokolle und die Box-Aktivität von heute. Rufe für jeden Arbeitsblock match_project mit Titel, Kunde oder Ordnername auf. Runde auf 15 Minuten, schreibe eine kurze Notiz (was, für wen), setze die Sicherheit und hänge die Belege an (Titel, Link). Schicke alles mit propose_time_entries und einer stabilen external_id je Kalendereintrag oder Dokument. Rufe nie selbst save_time_entry oder start_timer auf – ich bestätige in vave.log.“', 'GPT 或项目的指令文本（可复制）：“每个工作日 17:30 读取我今天的日历、Fireflies 记录和 Box 活动。对每个工作块，用标题、客户或文件夹名称调用 match_project。四舍五入到 15 分钟，写一条简短备注（做了什么、为谁），设置置信度并附上依据（标题、链接）。通过 propose_time_entries 发送全部内容，并为每个日历条目或文档使用稳定的 external_id。切勿自行调用 save_time_entry 或 start_timer——由我在 vave.log 中确认。”'],
      ['Review in vave.log: the inbox “Suggestions” appears on the overview and under Time. Adjust project, task, minutes and note, then “Accept” creates a draft; “Accept all of the day” takes every suggestion with a project. Dismissed suggestions disappear. Only you see your suggestions; management sees the drafts you accepted.', 'Prüfen in vave.log: Der Posteingang „Vorschläge“ erscheint auf der Übersicht und unter Zeiten. Passe Projekt, Aufgabe, Minuten und Notiz an, „Übernehmen“ legt einen Entwurf an; „Alle vom Tag übernehmen“ nimmt jeden Vorschlag mit Projekt. Verworfene verschwinden. Deine Vorschläge siehst nur du; die Leitung sieht die übernommenen Entwürfe.', '在 vave.log 中审核：“建议”收件箱显示在概览和“工时”中。调整项目、任务、分钟和备注，“采用”会创建草稿；“采用当天全部”会接受所有已有项目的建议。被拒绝的建议会消失。只有你能看到自己的建议；管理层只能看到你采用后的草稿。'],
      ['Automation: a scheduled task in ChatGPT (“Tasks”) or a Claude routine runs the instruction daily. Repeated runs do not duplicate thanks to the external_id.', 'Automatisierung: Eine geplante Aufgabe in ChatGPT („Tasks“) oder eine Claude-Routine führt die Anweisung täglich aus. Wiederholte Läufe erzeugen dank external_id keine Doppel.', '自动化：ChatGPT 的定时任务（“Tasks”）或 Claude 的例行程序每天执行该指令。借助 external_id，重复运行不会产生重复。'],
    ],
    related: ['time-manual', 'time-timer'],
  },
  'time-account': {
    steps: [
      ['Management sets a work schedule per person under Team → “Schedule …”: hours per weekday (Mon–Sun), e.g. 8/8/8/8/0 for a four-day week. The weekly capacity becomes the sum.', 'Die Leitung legt je Person unter Team → „Modell …“ ein Arbeitszeitmodell fest: Stunden je Wochentag (Mo–So), zum Beispiel 8/8/8/8/0 für eine Vier-Tage-Woche. Die Wochenkapazität ergibt sich als Summe.', '管理层在“团队 → 模型…”中为每人设置工时模型：每个工作日（周一至周日）的小时数，例如四天工作制为 8/8/8/8/0。每周产能为其总和。'],
      ['Daily target = schedule value, 0 on public holidays of the location and on approved full-day absences, half on half days. Vacation days are counted only on days with a target.', 'Tagessoll = Modellwert, 0 an Feiertagen des Standorts und an genehmigten ganztägigen Abwesenheiten, halb bei halben Tagen. Urlaubstage zählen nur an Tagen mit Soll.', '每日目标 = 模型值；所在地点的法定假日及已批准的全天缺勤为 0，半天缺勤减半。休假天数仅按有目标工时的日期计算。'],
      ['Under Time you see your time account: target and actual in the selected period with a bar per day, and the flextime balance = actual − target since the start date plus the opening balance (set by management; without one from 1 January, at most one year back).', 'Unter Zeiten siehst du dein Zeitkonto: Soll und Ist im gewählten Zeitraum mit einem Balken je Tag sowie den Gleitzeitsaldo = Ist − Soll ab dem Stichtag plus Startsaldo (setzt die Leitung; ohne Stichtag ab dem 1. Januar, höchstens ein Jahr zurück).', '在“工时”中可查看工时账户：所选期间的目标与实际（每日一条柱），以及弹性工时余额 = 自起始日起的实际 − 目标 + 初始余额（由管理层设置；未设置时自 1 月 1 日起，最多回溯一年）。'],
      ['Reports show the difference actual − target per person next to the utilization.', 'Die Auswertung zeigt je Person die Differenz Ist − Soll neben der Auslastung.', '报表在利用率旁显示每人的实际 − 目标差额。'],
    ],
    related: ['team-capacity', 'team-vacation', 'team-utilization'],
  },
  'team-strengths': {
    steps: [
      ['Tag your work: tasks and projects take tags such as motion, 3d, konzept, pitch (comma separated). A task without tags inherits the project tags; without those the client counts as category.', 'Arbeit taggen: Aufgaben und Projekte bekommen Tags wie motion, 3d, konzept, pitch (durch Komma getrennt). Eine Aufgabe ohne Tags erbt die Projekt-Tags; ohne diese zählt der Kunde als Kategorie.', '为工作打标签：任务和项目可添加如 motion、3d、konzept、pitch 等标签（逗号分隔）。无标签的任务继承项目标签；都没有时按客户归类。'],
      ['The profile per person and category (Team → “Strengths”, your own on the overview) shows: done tasks, hours, speed = booked ÷ estimate (1× = as planned), on-time share, cycle days from start to done, reopenings, and the management rating. Every figure carries its sample size; a fit score appears from three done tasks.', 'Das Profil je Person und Kategorie (Team → „Stärken“, das eigene auf der Übersicht) zeigt: erledigte Aufgaben, Stunden, Tempo = gebucht ÷ Schätzung (1× = wie geplant), Termintreue, Durchlauftage von Start bis Erledigung, Wiedereröffnungen und die Bewertung der Leitung. Jede Zahl trägt ihre Stichprobe; eine Passung erscheint ab drei erledigten Aufgaben.', '每人每类的画像（团队 → “优势”，本人在概览中可见）显示：已完成任务、工时、速度 = 已记录 ÷ 估算（1× 即按计划）、准时率、从开始到完成的周期天数、重新打开次数和管理层评分。每个数字都标注样本量；完成三项任务后显示匹配度。'],
      ['Rating: when closing a task, management can rate 1–5 in the task dialog (optional). It is the only real quality measure; reopenings and lateness are indications.', 'Bewertung: Beim Abschluss kann die Leitung im Aufgaben-Dialog 1–5 vergeben (optional). Sie ist das einzige echte Qualitätsmaß; Wiedereröffnungen und Verspätung sind Indizien.', '评分：关闭任务时，管理层可在任务对话框中给出 1–5 分（可选）。这是唯一真正的质量指标；重新打开和延期只是线索。'],
      ['Assignment tip: in the task dialog the management sees up to three recommendations – fit for the category plus free capacity this week – and assigns with one click.', 'Zuweisungstipp: Im Aufgaben-Dialog sieht die Leitung bis zu drei Empfehlungen – Passung für die Kategorie plus freie Kapazität diese Woche – und weist mit einem Klick zu.', '分配建议：在任务对话框中，管理层可看到最多三条推荐——该类别的匹配度加上本周空余产能——一键分配。'],
      ['Limits, stated in the product: small samples, estimate quality drives “speed”, teamwork is invisible. Use the figures as a conversation basis, never as a ranking; co-determination duties lie with the operator.', 'Grenzen, die im Produkt stehen: kleine Stichproben, Schätzqualität prägt das „Tempo“, Teamarbeit ist unsichtbar. Die Zahlen sind Gesprächsgrundlage, nie Ranking; Mitbestimmungspflichten liegen beim Betreiber.', '产品中明示的局限：样本小、估算质量左右“速度”、团队协作不可见。数字仅作沟通基础，绝非排名；共同决定义务由运营方承担。'],
    ],
    related: ['plan-capacity', 'work-tasks'],
  },
  'plan-health': {
    steps: [
      ['The overview starts with the situation board: every active project gets a traffic light – red “burning”, yellow “wobbling”, green “running”. Red projects come first.', 'Die Übersicht beginnt mit dem Lagebild: Jedes aktive Projekt bekommt eine Ampel – rot „brennt“, gelb „wackelt“, grün „läuft“. Rote Projekte stehen zuerst.', '概览以态势板开始：每个进行中的项目都有一个红绿灯——红色“吃紧”、黄色“不稳”、绿色“正常”。红色项目排在最前。'],
      ['Every card lists the reasons: project deadline missed, deadline near with little progress, overdue milestones or tasks, time budget used up faster than progress, no booked time for two weeks, tasks due soon without an owner, many tasks without estimates, assignees over 100 % this week. Points add up: from 3 yellow, from 6 red.', 'Jede Karte nennt die Gründe: Projekttermin überschritten, Termin nahe bei wenig Fortschritt, überfällige Meilensteine oder Aufgaben, Zeitbudget schneller verbraucht als Fortschritt, zwei Wochen keine gebuchte Zeit, bald fällige Aufgaben ohne Zuständige, viele Aufgaben ohne Schätzung, Zuständige diese Woche über 100 %. Punkte summieren sich: ab 3 gelb, ab 6 rot.', '每张卡片列出原因：项目截止日已过、临近截止但进度不足、里程碑或任务逾期、时间预算消耗快于进度、两周无记录工时、即将到期但无人负责的任务、大量无估算任务、负责人本周超过 100%。分数累加：3 分起黄色，6 分起红色。'],
      ['Act right there: open the overdue tasks, jump to the capacity cockpit to reassign, or read the forecast. “All projects” also shows the green ones.', 'Direkt handeln: überfällige Aufgaben öffnen, ins Kapazitäts-Cockpit zum Umplanen springen oder die Prognose lesen. „Alle Projekte“ zeigt auch die grünen.', '就地处理：打开逾期任务、跳转到产能看板重新分配，或查看预测。“全部项目”也会显示绿色项目。'],
      ['Members see only projects with their own tasks and no budget signals.', 'Mitglieder sehen nur Projekte mit eigenen Aufgaben und keine Budgetsignale.', '成员只能看到含有自己任务的项目，且不显示预算信号。'],
    ],
    related: ['plan-capacity', 'work-project', 'work-tasks'],
  },
  'plan-capacity': {
    steps: [
      ['Planning shows a heatmap of people × weeks (4 to 12 weeks ahead). Each cell compares planned effort with available hours: green under 80 %, yellow 80–100 %, red over 100 %, striped when the person is away.', 'Planung zeigt eine Heatmap Personen × Wochen (4 bis 12 Wochen voraus). Jede Zelle vergleicht geplanten Aufwand mit verfügbaren Stunden: grün unter 80 %, gelb 80–100 %, rot über 100 %, gestreift bei Abwesenheit.', '“规划”以人员 × 周（未来 4 至 12 周）的热力图显示。每个单元格比较计划工时与可用工时：绿色低于 80%，黄色 80–100%，红色超过 100%，条纹表示缺勤。'],
      ['Planned = remaining effort of assigned open tasks (estimate minus booked time), spread evenly over workdays until the due date. Overdue or undated tasks land in the current week. “+n?” counts tasks without an estimate.', 'Geplant = Restaufwand der zugewiesenen offenen Aufgaben (Schätzung minus gebuchte Zeit), gleichmäßig über die Werktage bis zum Termin verteilt. Überfällige oder terminlose Aufgaben landen in der laufenden Woche. „+n?“ zählt Aufgaben ohne Schätzung.', '计划 = 已分配未完成任务的剩余工作量（估算减已记录工时），均匀分摊到截止日前的工作日。逾期或无截止日的任务计入本周。“+n?”为无估算的任务数。'],
      ['Available = work schedule minus public holidays and approved absences. The “Unassigned” row shows free work nobody owns yet.', 'Verfügbar = Arbeitszeitmodell minus Feiertage und genehmigte Abwesenheiten. Die Zeile „Nicht zugewiesen“ zeigt freie Arbeit, die noch niemand hat.', '可用 = 工时模型减去法定假日和已批准的缺勤。“未分配”行显示尚无人负责的工作。'],
      ['Click a cell to list its tasks and re-steer right there: assign another person, move the due date or change the estimate, then save. The heatmap updates immediately.', 'Klicke eine Zelle, um ihre Aufgaben zu sehen und direkt nachzusteuern: andere Person zuweisen, Termin schieben oder Schätzung ändern, dann speichern. Die Heatmap aktualisiert sich sofort.', '点击单元格查看其任务并直接调整：改派他人、移动截止日或修改估算，然后保存。热力图会立即更新。'],
      ['“Long term” switches to months (3/6/12): demand per project = planned effort (finance plan lines per person, else time budget) minus booked time, spread until the due date – stacked against the team’s supply. The scenario block adds a project, pauses a person or plans freelancer hours without saving anything.', '„Langfristig“ wechselt auf Monate (3/6/12): Bedarf je Projekt = geplanter Aufwand (Finanzplanung je Person, sonst Zeitbudget) minus gebuchte Zeit, bis zum Termin verteilt – gestapelt gegen das Angebot des Teams. Der Szenario-Block nimmt ein Projekt dazu, pausiert eine Person oder plant Freelancer-Stunden, ohne etwas zu speichern.', '“长期”切换为按月（3/6/12 个月）：每个项目的需求 = 计划工作量（按人的财务规划行，否则为时间预算）减已记录工时，分摊到截止日——与团队供给堆叠对比。情景区可添加项目、暂停人员或安排自由职业者工时，且不保存任何内容。'],
      ['Members see “My week” on the overview: target, planned and booked hours for the current week.', 'Mitglieder sehen auf der Übersicht „Meine Woche“: Soll, geplant und gebucht für die laufende Woche.', '成员可在概览中看到“我的一周”：本周的目标、计划和已记录工时。'],
    ],
    related: ['team-capacity', 'time-account', 'work-tasks'],
  },
  'team-vacation': {
    steps: [
      ['Absences: the month calendar shows every person per day – vacation purple, requested hatched, sick, other, public holidays grey, weekends striped. Use the arrows to move months, “Today” to come back.', 'Abwesenheiten: Der Monatskalender zeigt jede Person je Tag – Urlaub violett, beantragt schraffiert, krank, sonstiges, Feiertage grau, Wochenenden gestreift. Mit den Pfeilen wechselst du den Monat, „Heute“ führt zurück.', '缺勤：月历按天显示每个人——休假为紫色、申请中为斜纹、病假、其他、法定假日为灰色、周末为条纹。用箭头切换月份，“今天”返回当月。'],
      ['“Request vacation”: kind, from, to, optionally half a day. The preview counts workdays without public holidays of your location and shows the remaining balance. Sick days apply immediately; vacation and other absences go to the management as a request.', '„Urlaub beantragen“: Art, von, bis, optional ein halber Tag. Die Vorschau zählt Arbeitstage ohne Feiertage deines Standorts und zeigt den Rest danach. Krankmeldungen gelten sofort; Urlaub und Sonstiges gehen als Antrag an die Leitung.', '“申请休假”：类型、起止日期，可选半天。预览会扣除你所在地点的法定假日计算工作日，并显示剩余天数。病假立即生效；休假和其他缺勤作为申请发送给管理层。'],
      ['Management: open requests appear at the top with the days counted, the remaining balance and how many colleagues are away at the same time. Approve or decline – the person gets a notification. Management can also enter absences for anyone directly.', 'Leitung: Offene Anträge stehen oben mit gezählten Tagen, Rest und der Zahl gleichzeitig abwesender Kolleginnen und Kollegen. Genehmigen oder ablehnen – die Person wird benachrichtigt. Die Leitung trägt Abwesenheiten auch direkt für alle ein.', '管理层：待审批申请显示在顶部，附带天数、剩余额度以及同期缺勤的同事人数。批准或拒绝后，申请人会收到通知。管理层也可直接为任何人登记缺勤。'],
      ['Yearly account: entitlement per person (Team or management inline), carry-over and adjustment per year, taken, requested, remaining. Half days count 0.5. Settings lets management switch approval off for small teams.', 'Urlaubskonto: Anspruch je Person (Leitung trägt ihn direkt in der Tabelle ein), Übertrag und Korrektur je Jahr, genommen, beantragt, Rest. Halbe Tage zählen 0,5. Unter Einstellungen kann die Leitung die Freigabepflicht für kleine Teams ausschalten.', '年度账户：每人的假期额度（管理层可直接在表中填写）、每年的结转和调整、已休、申请中、剩余。半天按 0.5 计。管理层可在“设置”中为小团队关闭审批。'],
      ['“Calendar (ICS)” exports all approved absences of the year for Outlook, Google or Apple Calendar.', '„Kalender (ICS)“ exportiert alle genehmigten Abwesenheiten des Jahres für Outlook, Google oder Apple Kalender.', '“日历（ICS）”导出当年所有已批准的缺勤，可导入 Outlook、Google 或 Apple 日历。'],
    ],
    related: ['team-capacity', 'team-utilization'],
  },
  'team-utilization': {
    steps: [
      ['Under Reports, choose the period. The utilization section lists every person with available, planned and tracked hours.', 'Wähle unter Auswertung den Zeitraum. Der Abschnitt Auslastung listet jede Person mit verfügbaren, geplanten und erfassten Stunden.', '在“报表”中选择时段。利用率部分列出每人的可用、计划和实际工时。'],
      ['Planned hours come from task estimates assigned to the person; tracked hours from time entries.', 'Geplante Stunden kommen aus den Schätzungen der zugewiesenen Aufgaben, erfasste Stunden aus den Zeiteinträgen.', '计划工时来自分配给该人的任务估算，实际工时来自工时条目。'],
      ['Click a person – from Team or the search – to open their report directly.', 'Klicke eine Person – im Team oder in der Suche – um direkt ihre Auswertung zu öffnen.', '在团队或搜索中点击某人，可直接打开其报表。'],
    ],
    related: ['team-capacity'],
  },
  'team-list': {
    steps: [
      ['Role filter: all, active only, or a single role.', 'Rollenfilter: alle, nur aktive oder eine einzelne Rolle.', '角色筛选：全部、仅活跃或单一角色。'],
      ['Sort by name, role or capacity; ties always by name.', 'Sortiere nach Name, Rolle oder Kapazität; Gleichstände immer nach Name.', '按姓名、角色或产能排序；相同时按姓名。'],
      ['The search matches name, email and role – several words must all match, accents do not matter.', 'Die Suche trifft Name, E-Mail und Rolle – mehrere Wörter müssen alle passen, Umlaute sind egal.', '搜索匹配姓名、邮箱和角色——多个词都需匹配，不区分变音符号。'],
    ],
    related: ['team-roles'],
  },
  'fin-setup': {
    steps: [
      ['Finance → Company: legal company name, billing address, tax or VAT ID, logo and default payment terms in days. These appear on every offer and invoice.', 'Finance → Unternehmen: rechtlicher Firmenname, Rechnungsanschrift, Steuer-/USt-ID, Logo und Standard-Zahlungsziel in Tagen. Sie erscheinen auf jedem Angebot und jeder Rechnung.', '财务 → 公司：法定公司名称、账单地址、税号/增值税号、标志和默认付款期限（天）。它们会出现在每份报价和发票上。'],
      ['Finance → Clients: name, address and document language per client – plus customer number, industry, phone, website and any number of contact persons. The first contact person is the main contact; “Make main contact” moves another one up.', 'Finance → Kunden: Name, Anschrift und Dokumentsprache je Kunde – dazu Kundennummer, Branche, Telefon, Website und beliebig viele Ansprechpartner. Der erste Ansprechpartner ist der Hauptkontakt; „Als Hauptkontakt“ setzt einen anderen nach oben.', '财务 → 客户：每个客户的名称、地址和单据语言——以及客户编号、行业、电话、网站和任意数量的联系人。第一位联系人为主要联系人；“设为主要联系人”可调整顺序。'],
      ['Remarks on a client are internal: they appear on the client card and in the search, never on offers or invoices. The card also shows invoices, invoiced and open amounts and linked projects.', 'Bemerkungen am Kunden sind intern: Sie stehen auf der Kundenkarte und in der Suche, nie auf Angeboten oder Rechnungen. Die Karte zeigt außerdem Rechnungen, abgerechnete und offene Beträge und verknüpfte Projekte.', '客户备注仅供内部使用：显示在客户卡片和搜索中，不会出现在报价或发票上。卡片还会显示发票数量、已开票和未付金额以及关联项目。'],
      ['Without legal name, billing address and a client address, offers and invoices cannot be sent or issued.', 'Ohne Firmenname, Rechnungsanschrift und Kundenanschrift lassen sich Angebote und Rechnungen nicht versenden oder ausstellen.', '缺少公司名称、账单地址和客户地址时，无法发送报价或开具发票。'],
    ],
    related: ['fin-rates', 'fin-invoice-manual'],
  },
  'fin-rates': {
    steps: [
      ['Planning & costs → staff rates: cost per hour per person, valid from a date. Older rates stay for older entries.', 'Planung & Kosten → Personensätze: Kosten je Stunde je Person, gültig ab einem Datum. Ältere Sätze bleiben für ältere Einträge.', '规划与成本 → 人员费率：每人每小时成本，从某日起生效。旧费率仍适用于旧条目。'],
      ['Project plan per project: billing model hourly or fixed (contract amount), planned hours. Expenses can be added per project and date.', 'Projektplan je Projekt: Abrechnungsmodell nach Stunden oder fest (Vertragswert), geplante Stunden. Ausgaben lassen sich je Projekt und Datum erfassen.', '每个项目的计划：按小时或固定（合同金额）计费模式、计划工时。可按项目和日期记录支出。'],
      ['The overview then shows planned versus actual cost, margin and a forecast per project for the chosen period.', 'Die Übersicht zeigt dann Plan- gegen Ist-Kosten, Marge und eine Prognose je Projekt für den gewählten Zeitraum.', '概览会显示所选时段内每个项目的计划与实际成本、利润率和预测。'],
    ],
    related: ['work-project', 'fin-offers'],
  },
  'fin-offers': {
    steps: [
      ['Finance → Offers → “New offer”: title, client, language, valid-until date and free line items with quantity, price and tax.', 'Finance → Angebote → „Neues Angebot“: Titel, Kunde, Sprache, Gültig-bis und freie Positionen mit Menge, Preis und Steuer.', '财务 → 报价 → “新建报价”：标题、客户、语言、有效期和含数量、价格、税率的自由条目。'],
      ['“Send offer” assigns the number (AN-year-0001) and freezes your letterhead and the client address. Drafts can still be edited; sent offers cannot.', '„Angebot versenden“ vergibt die Nummer (AN-Jahr-0001) und friert Briefkopf und Kundenanschrift ein. Entwürfe bleiben änderbar, versendete nicht.', '“发送报价”分配编号（AN-年份-0001）并冻结信头和客户地址。草稿仍可编辑，已发送的不可。'],
      ['Mark the answer: accepted or declined.', 'Trage die Antwort ein: angenommen oder abgelehnt.', '记录结果：已接受或已拒绝。'],
      ['Accepted? “Create project” with a project code: vave.log creates the project with a fixed-price plan of the offer total – exactly once.', 'Angenommen? „Projekt anlegen“ mit einem Projektkürzel: vave.log legt das Projekt mit einem Festpreis-Plan über die Angebotssumme an – genau einmal.', '已接受？用项目代码“创建项目”：vave.log 会以报价总额创建固定价格计划的项目——仅一次。'],
    ],
    tip: ['Drafts and declined offers can be deleted; sent and accepted ones stay as records.', 'Entwürfe und abgelehnte Angebote lassen sich löschen; versendete und angenommene bleiben als Beleg.', '草稿和已拒绝的报价可删除；已发送和已接受的作为记录保留。'],
    related: ['work-project', 'fin-invoice-manual'],
  },
  'fin-invoice-time': {
    steps: [
      ['Finance → Invoices → “From time”: project, client, period and language. vave.log collects all approved, billable hours of the period that are not on an invoice yet.', 'Finance → Rechnungen → „Aus Zeiten“: Projekt, Kunde, Zeitraum und Sprache. vave.log sammelt alle freigegebenen, abrechenbaren Zeiten des Zeitraums, die noch auf keiner Rechnung stehen.', '财务 → 发票 → “按工时”：项目、客户、时段和语言。vave.log 汇总该时段内所有已批准、可计费且尚未开票的工时。'],
      ['Choose grouping: one line per entry, or one line per person.', 'Wähle die Gruppierung: eine Position je Eintrag oder eine je Person.', '选择分组方式：每条目一行，或每人一行。'],
      ['Set issue date, due date (prefilled from the payment terms) and tax rate; add a zero-tax reason if the rate is 0 %.', 'Setze Rechnungsdatum, Fälligkeit (aus dem Zahlungsziel vorbelegt) und Steuersatz; bei 0 % einen Grund für die Steuerfreiheit.', '设置开票日期、到期日（按付款期限预填）和税率；税率为 0% 时填写免税原因。'],
      ['The draft shows all lines. Edit if needed, then “Issue invoice”.', 'Der Entwurf zeigt alle Positionen. Passe an, wenn nötig, dann „Rechnung ausstellen“.', '草稿显示所有条目。必要时调整，然后“开具发票”。'],
    ],
    why: ['Billed hours are claimed by the invoice: they cannot be edited or revoked any more, and no second invoice can contain them. Cancelling the invoice releases them.', 'Abgerechnete Zeiten sind von der Rechnung beansprucht: Sie lassen sich nicht mehr ändern oder zurückholen, und keine zweite Rechnung kann sie enthalten. Ein Storno gibt sie frei.', '已开票的工时被该发票占用：不可再编辑或撤销，也不会出现在第二张发票上。冲销后会释放。'],
    related: ['time-review', 'fin-invoice-manual', 'fin-cancel'],
  },
  'fin-invoice-manual': {
    steps: [
      ['“Manual draft”: client, language, dates, notes, payment instructions and free line items with quantity, unit price and tax per line.', '„Manueller Entwurf“: Kunde, Sprache, Daten, Notizen, Zahlungshinweise und freie Positionen mit Menge, Einzelpreis und Steuer je Position.', '“手动草稿”：客户、语言、日期、备注、付款说明和含数量、单价、逐条税率的自由条目。'],
      ['“Issue invoice” assigns the next number of the yearly sequence and freezes letterhead, client address and lines. The totals show tax per rate.', '„Rechnung ausstellen“ vergibt die nächste Nummer der Jahresfolge und friert Briefkopf, Kundenanschrift und Positionen ein. Die Summen weisen die Steuer je Satz aus.', '“开具发票”分配年度序列的下一个编号，并冻结信头、客户地址和条目。合计按税率分别列示税额。'],
      ['Print or save the PDF from the invoice; the document language follows the invoice, not the app.', 'Drucke oder speichere das PDF aus der Rechnung; die Dokumentsprache folgt der Rechnung, nicht der App.', '从发票打印或保存 PDF；单据语言跟随发票而非应用。'],
      ['Demo workspaces number their documents DEMO-year-0001 so they never collide with real ones.', 'Demo-Workspaces nummerieren ihre Dokumente DEMO-Jahr-0001, damit sie nie mit echten kollidieren.', '演示工作区的单据编号为 DEMO-年份-0001，不会与真实单据冲突。'],
    ],
    related: ['fin-setup', 'fin-payments', 'fin-cancel'],
  },
  'fin-payments': {
    steps: [
      ['Open an issued invoice and click “Record payment”: amount and date. Several partial payments add up; the open amount is shown.', 'Öffne eine ausgestellte Rechnung und klicke „Zahlung erfassen“: Betrag und Datum. Mehrere Teilzahlungen summieren sich; der offene Betrag wird angezeigt.', '打开已开具的发票，点击“记录付款”：金额和日期。多笔部分付款会累加；显示未付金额。'],
      ['“Mark paid” settles the rest in one step.', '„Als bezahlt markieren“ begleicht den Rest in einem Schritt.', '“标记为已付款”一步结清余额。'],
      ['An invoice is overdue when its due date has passed and it is not paid. The chips above the list filter open, overdue, paid and drafts; the search finds number, client and amount.', 'Eine Rechnung ist überfällig, wenn ihre Fälligkeit vorbei und sie nicht bezahlt ist. Die Chips über der Liste filtern offen, überfällig, bezahlt und Entwürfe; die Suche findet Nummer, Kunde und Betrag.', '到期日已过且未付款的发票为逾期。列表上方的标签可筛选未结、逾期、已付和草稿；搜索可按编号、客户和金额查找。'],
    ],
    related: ['fin-bank', 'fin-invoice-manual', 'ref-search'],
  },
  'fin-bank': {
    steps: [
      ['In online banking, export the transactions as CAMT.053 (XML) or CSV. Sparkasse, Volksbank, Deutsche Bank, Commerzbank, ING, DKB, N26 and most other banks offer one of the two.', 'Exportiere im Onlinebanking die Umsätze als CAMT.053 (XML) oder CSV. Sparkasse, Volksbank, Deutsche Bank, Commerzbank, ING, DKB, N26 und die meisten anderen Banken bieten eines von beiden an.', '在网银中将交易导出为 CAMT.053 (XML) 或 CSV。Sparkasse、Volksbank、德意志银行、德国商业银行、ING、DKB、N26 等大多数银行都支持其中一种。'],
      ['Finance → Invoices → “Match bank statement”, choose the file. vave.log reads only booked incoming payments; debits and pending items are ignored.', 'Finance → Rechnungen → „Kontoauszug abgleichen“, Datei wählen. vave.log liest nur gebuchte Zahlungseingänge; Abbuchungen und vorgemerkte Umsätze bleiben außen vor.', '财务 → 发票 → “核对银行对账单”，选择文件。vave.log 只读取已入账的收款；支出和待处理交易会被忽略。'],
      ['Each payment gets a proposal with a reason: invoice number in the reference, amount equal to the open amount, client name. “Certain” proposals are ticked, everything else you decide yourself – choose another invoice or adjust the amount for a partial payment.', 'Jeder Eingang bekommt einen Vorschlag mit Begründung: Rechnungsnummer im Verwendungszweck, Betrag gleich offenem Betrag, Kundenname. „Sichere“ Vorschläge sind angehakt, alles andere entscheidest du – andere Rechnung wählen oder den Betrag für eine Teilzahlung anpassen.', '每笔收款都会附带理由的建议：用途中的发票号、金额等于未付金额、客户名称。“确定”的建议会被勾选，其余由你决定——选择其他发票或调整部分付款金额。'],
      ['“Book payments” records each ticked payment on its invoice with the booking date. Fully paid invoices switch to paid automatically.', '„Zahlungen buchen“ erfasst jeden angehakten Eingang mit dem Buchungsdatum an seiner Rechnung. Voll bezahlte Rechnungen wechseln automatisch auf bezahlt.', '“入账付款”会将每笔已勾选的收款按记账日期记录到对应发票。全额付清的发票会自动变为已付款。'],
    ],
    tip: ['Load the same statement twice without worry: every booked payment carries the bank reference in its note, and vave.log shows it as “Already booked”.', 'Denselben Auszug zweimal laden ist kein Problem: Jede gebuchte Zahlung trägt die Bankreferenz in der Notiz, vave.log zeigt sie als „Schon gebucht“.', '同一份对账单加载两次也没关系：每笔已入账的付款在备注中带有银行参考号，vave.log 会显示为“已入账”。'],
    why: ['The statement is read in your browser and not stored – only the payments you confirm reach the database. A payment more than the open amount books only the open rest, so an invoice never shows more paid than invoiced.', 'Der Auszug wird im Browser gelesen und nicht gespeichert – in die Datenbank gelangen nur die Zahlungen, die du bestätigst. Ein Eingang über dem offenen Betrag bucht nur den offenen Rest, damit eine Rechnung nie mehr bezahlt zeigt als berechnet.', '对账单在浏览器中读取，不会被保存——只有你确认的付款才会写入数据库。超过未付金额的收款只入账未付部分，因此发票的已付金额永远不会超过开票金额。'],
    related: ['fin-payments', 'fin-export'],
  },
  'fin-cancel': {
    steps: [
      ['Issued invoices cannot be edited or deleted – only drafts can.', 'Ausgestellte Rechnungen lassen sich nicht ändern oder löschen – nur Entwürfe.', '已开具的发票不可编辑或删除——只有草稿可以。'],
      ['Open the invoice and choose “Cancel invoice” with a reason. vave.log issues a cancellation invoice with its own number that reverses the amounts.', 'Öffne die Rechnung und wähle „Rechnung stornieren“ mit Begründung. vave.log stellt eine Stornorechnung mit eigener Nummer aus, die die Beträge aufhebt.', '打开发票并选择“冲销发票”并填写原因。vave.log 会开具带独立编号的冲销发票以抵销金额。'],
      ['Hours on the cancelled invoice are released and can be billed again.', 'Zeiten der stornierten Rechnung werden freigegeben und lassen sich erneut abrechnen.', '被冲销发票上的工时会被释放，可再次开票。'],
    ],
    why: ['German bookkeeping rules (GoBD) require that issued documents stay unchanged and traceable. A cancellation keeps the sequence complete instead of deleting a number.', 'Die GoBD verlangen, dass ausgestellte Belege unverändert und nachvollziehbar bleiben. Ein Storno hält die Nummernfolge lückenlos, statt eine Nummer zu löschen.', '德国记账规范（GoBD）要求已开具的单据保持不变且可追溯。冲销保持编号序列完整，而不是删除编号。'],
    related: ['fin-invoice-time', 'ref-status'],
  },
  'fin-export': {
    steps: [
      ['E-invoice: on an issued invoice, “E-invoice (XML)” downloads an EN 16931 file (CII profile). Public clients in Germany require it; many B2B clients accept it.', 'E-Rechnung: An einer ausgestellten Rechnung lädt „E-Rechnung (XML)“ eine Datei nach EN 16931 (CII-Profil). Öffentliche Auftraggeber in Deutschland verlangen sie, viele B2B-Kunden nehmen sie an.', '电子发票：在已开具的发票上，“电子发票 (XML)”下载符合 EN 16931（CII 格式）的文件。德国公共机构要求此格式，许多 B2B 客户也接受。'],
      ['DATEV: “DATEV export” creates a booking batch (EXTF CSV) for a period that your tax office imports directly.', 'DATEV: „DATEV-Export“ erzeugt einen Buchungsstapel (EXTF-CSV) für einen Zeitraum, den dein Steuerbüro direkt importiert.', 'DATEV：“DATEV 导出”为某一时段生成记账批次（EXTF CSV），税务师可直接导入。'],
      ['Both exports need a complete company profile; the app names missing fields.', 'Beide Exporte brauchen ein vollständiges Firmenprofil; die App nennt fehlende Felder.', '两种导出都需要完整的公司资料；应用会提示缺失字段。'],
    ],
    related: ['fin-setup', 'time-export'],
  },
  'ref-search': {
    steps: [
      ['Press Ctrl+K (Cmd+K) or click the magnifier in the header.', 'Drücke Strg+K (Cmd+K) oder klicke die Lupe in der Kopfzeile.', '按 Ctrl+K（Cmd+K）或点击顶栏的放大镜。'],
      ['Type one or more words: every word must match, in any order; accents and case do not matter.', 'Tippe ein oder mehrere Wörter: Jedes Wort muss passen, in beliebiger Reihenfolge; Umlaute und Großschreibung sind egal.', '输入一个或多个词：每个词都需匹配，顺序不限；不区分变音符号和大小写。'],
      ['Results: areas, projects (code, name, client), tasks (opens the editor), help topics – and for managers people (opens their report) and invoices (number, client, status, amount).', 'Treffer: Bereiche, Projekte (Kürzel, Name, Kunde), Aufgaben (öffnet den Editor), Hilfethemen – und für die Leitung Personen (öffnet ihre Auswertung) und Rechnungen (Nummer, Kunde, Status, Betrag).', '结果：区域、项目（代码、名称、客户）、任务（打开编辑器）、帮助主题——对负责人还有人员（打开其报表）和发票（编号、客户、状态、金额）。'],
      ['Arrow keys move, Enter opens, Escape closes.', 'Pfeiltasten wählen, Enter öffnet, Escape schließt.', '方向键选择，Enter 打开，Esc 关闭。'],
    ],
    related: ['ref-shortcuts'],
  },
  'ref-accessibility': {
    steps: [
      ['The first Tab on every page jumps to “Skip to content”; Enter moves the focus straight into the main area. Every button, link and field shows a clear purple focus ring.', 'Der erste Tab auf jeder Seite führt zu „Zum Inhalt“; Enter setzt den Fokus direkt in den Hauptbereich. Jede Schaltfläche, jeder Link und jedes Feld zeigt einen deutlichen lila Fokusrahmen.', '每页第一次按 Tab 会到达“跳到内容”；按 Enter 直接进入主区域。所有按钮、链接和字段都有清晰的紫色焦点框。'],
      ['Everything you can do with the mouse also works with the keyboard: dragging task cards has a keyboard twin in the status field on each card; menus open with Enter or Space, ↑ ↓ choose, Esc closes and returns the focus.', 'Alles, was mit der Maus geht, geht auch mit der Tastatur: Zum Ziehen der Aufgabenkarten gibt es das Statusfeld auf jeder Karte; Auswahlmenüs öffnen mit Enter oder Leertaste, ↑ ↓ wählen, Esc schließt und gibt den Fokus zurück.', '鼠标能做的，键盘也能做：拖动任务卡片可改用每张卡片上的状态字段；菜单用 Enter 或空格打开，↑ ↓ 选择，Esc 关闭并返回焦点。'],
      ['Screen readers hear names for every icon button, tables are announced as scrollable regions, dialogs and tabs follow the ARIA patterns, and the page language follows your language setting.', 'Screenreader hören für jede Symbolschaltfläche einen Namen, Tabellen werden als scrollbare Bereiche angesagt, Dialoge und Reiter folgen den ARIA-Mustern, und die Seitensprache folgt deiner Spracheinstellung.', '读屏软件能读出每个图标按钮的名称，表格会作为可滚动区域朗读，对话框和标签页遵循 ARIA 模式，页面语言跟随你的语言设置。'],
      ['Zoom up to 400 % or use a phone: the layout reflows without horizontal scrolling. If your system asks for reduced motion, vave.log switches off animations, including the tilt when dragging cards.', 'Zoom bis 400 % oder Smartphone: Das Layout bricht ohne waagerechtes Scrollen um. Wünscht dein System reduzierte Bewegung, schaltet vave.log Animationen ab – auch das Kippen beim Ziehen von Karten.', '可放大至 400 % 或使用手机：布局会自动重排，无需横向滚动。若系统要求减少动态效果，vave.log 会关闭动画，包括拖动卡片时的倾斜效果。'],
    ],
    why: ['vave.log follows WCAG 2.2 level AA. Text contrast is at least 4.5:1, touch targets are at least 24 px, and an automated check (axe-core) tests every area, dialog and the phone layout on each change.', 'vave.log richtet sich nach WCAG 2.2 Stufe AA. Textkontrast mindestens 4,5:1, Klickflächen mindestens 24 px, und eine automatische Prüfung (axe-core) testet bei jeder Änderung alle Bereiche, Dialoge und die Smartphone-Ansicht.', 'vave.log 遵循 WCAG 2.2 AA 级。文字对比度至少 4.5:1，点击区域至少 24 px，每次更改都会用自动检查（axe-core）测试所有区域、对话框和手机布局。'],
    related: ['ref-shortcuts'],
  },
  'ref-shortcuts': {
    table: {
      head: [['Keys', 'Tasten', '按键'], ['Where', 'Wo', '位置'], ['What happens', 'Was passiert', '效果']],
      rows: [
        [['Ctrl+K / Cmd+K', 'Strg+K / Cmd+K', 'Ctrl+K / Cmd+K'], ['everywhere', 'überall', '任何位置'], ['Open the global search', 'Globale Suche öffnen', '打开全局搜索']],
        [['↑ ↓', '↑ ↓', '↑ ↓'], ['search', 'Suche', '搜索'], ['Move between results', 'Zwischen Treffern wechseln', '在结果间移动']],
        [['Enter', 'Enter', 'Enter'], ['search', 'Suche', '搜索'], ['Open the selected result', 'Gewählten Treffer öffnen', '打开所选结果']],
        [['Esc', 'Esc', 'Esc'], ['search, dialogs, phone menu', 'Suche, Dialoge, Smartphone-Menü', '搜索、对话框、手机菜单'], ['Close', 'Schließen', '关闭']],
        [['← →, Home, End', '← →, Pos1, Ende', '← →、Home、End'], ['Finance tabs', 'Finance-Reiter', '财务标签页'], ['Switch tabs', 'Reiter wechseln', '切换标签页']],
        [['Tab, Shift+Tab', 'Tab, Umschalt+Tab', 'Tab、Shift+Tab'], ['forms and lists', 'Formulare und Listen', '表单和列表'], ['Move focus; Enter activates buttons and links', 'Fokus bewegen; Enter löst Knöpfe und Links aus', '移动焦点；Enter 触发按钮和链接']],
      ],
    },
    related: ['ref-search', 'ref-accessibility'],
  },
  'ref-status': {
    table: {
      head: [['Object', 'Objekt', '对象'], ['Statuses', 'Status', '状态'], ['Meaning', 'Bedeutung', '含义']],
      rows: [
        [['Time entry', 'Zeiteintrag', '工时条目'], ['Draft → Submitted → Approved', 'Entwurf → Eingereicht → Freigegeben', '草稿 → 已提交 → 已批准'], ['Only drafts are editable; only approved hours can be billed.', 'Nur Entwürfe sind änderbar; nur freigegebene Zeiten lassen sich abrechnen.', '只有草稿可编辑；只有已批准工时可开票。']],
        [['Task', 'Aufgabe', '任务'], ['To do → Doing → Done', 'Offen → In Arbeit → Erledigt', '待办 → 进行中 → 已完成'], ['Done triggers the next repetition, if set.', 'Erledigt löst die nächste Wiederholung aus, falls gesetzt.', '若设置了重复，完成会触发下一个。']],
        [['Project', 'Projekt', '项目'], ['Active · Paused · Archived', 'Aktiv · Pausiert · Archiviert', '进行中 · 已暂停 · 已归档'], ['Only active projects accept time and tasks.', 'Nur aktive Projekte nehmen Zeit und Aufgaben an.', '只有进行中的项目接受工时和任务。']],
        [['Offer', 'Angebot', '报价'], ['Draft → Sent → Accepted / Declined', 'Entwurf → Versendet → Angenommen / Abgelehnt', '草稿 → 已发送 → 已接受 / 已拒绝'], ['Sending assigns the number; accepted offers become projects.', 'Versenden vergibt die Nummer; angenommene werden Projekte.', '发送分配编号；已接受的转为项目。']],
        [['Invoice', 'Rechnung', '发票'], ['Draft → Issued (open / overdue / paid) · Cancellation', 'Entwurf → Ausgestellt (offen / überfällig / bezahlt) · Storno', '草稿 → 已开具（未结 / 逾期 / 已付） · 冲销'], ['Issued invoices are never deleted – they are cancelled.', 'Ausgestellte Rechnungen werden nie gelöscht – sie werden storniert.', '已开具的发票不会被删除——而是被冲销。']],
      ],
    },
    related: ['fin-cancel', 'time-submit'],
  },
  'ref-roles': {
    table: {
      head: [['Can …', 'Darf …', '可以…'], ['Owner', 'Inhaber:in', '所有者'], ['Manager', 'Leitung', '负责人'], ['Member', 'Mitglied', '成员']],
      rows: [
        [['track and submit own hours, work on tasks', 'eigene Zeiten erfassen und einreichen, Aufgaben bearbeiten', '记录并提交自己的工时，处理任务'], ['✓', '✓', '✓'], ['✓', '✓', '✓'], ['✓', '✓', '✓']],
        [['create projects, see team hours, approve', 'Projekte anlegen, Teamzeiten sehen, freigeben', '创建项目、查看团队工时、审批'], ['✓', '✓', '✓'], ['✓', '✓', '✓'], ['–', '–', '–']],
        [['Team: capacity, absences, utilization', 'Team: Kapazität, Abwesenheiten, Auslastung', '团队：产能、缺勤、利用率'], ['✓', '✓', '✓'], ['✓', '✓', '✓'], ['–', '–', '–']],
        [['Finance: clients, offers, invoices, exports', 'Finance: Kunden, Angebote, Rechnungen, Exporte', '财务：客户、报价、发票、导出'], ['✓', '✓', '✓'], ['✓', '✓', '✓'], ['–', '–', '–']],
        [['invite people, change roles, revoke invitations', 'Personen einladen, Rollen ändern, Einladungen widerrufen', '邀请成员、更改角色、撤销邀请'], ['✓', '✓', '✓'], ['–', '–', '–'], ['–', '–', '–']],
        [['rename, archive or delete the workspace', 'Workspace umbenennen, archivieren oder löschen', '重命名、归档或删除工作区'], ['✓', '✓', '✓'], ['–', '–', '–'], ['–', '–', '–']],
      ],
    },
    related: ['start-roles', 'team-roles'],
  },
  'ref-data': {
    steps: [
      ['Your data lives in a Postgres database per workspace, protected by row-level access rules: you only ever receive rows of workspaces you belong to.', 'Deine Daten liegen in einer Postgres-Datenbank je Workspace, geschützt durch Zugriffsregeln auf Zeilenebene: Du erhältst nur Zeilen von Workspaces, zu denen du gehörst.', '你的数据按工作区存放在 Postgres 数据库中，并受行级访问规则保护：你只会收到所属工作区的数据行。'],
      ['Exports: hours as CSV, invoices as PDF and XML, bookings as DATEV batch, tasks as ICS. Nothing is locked in.', 'Exporte: Zeiten als CSV, Rechnungen als PDF und XML, Buchungen als DATEV-Stapel, Aufgaben als ICS. Nichts ist eingesperrt.', '导出：工时为 CSV、发票为 PDF 和 XML、记账为 DATEV 批次、任务为 ICS。没有任何锁定。'],
      ['Settings → “Manage workspaces” lets owners archive or delete a workspace; deletion asks for confirmation and removes all its data.', 'Einstellungen → „Workspaces verwalten“ lässt Inhaber:innen einen Workspace archivieren oder löschen; das Löschen fragt nach und entfernt alle seine Daten.', '设置 → “管理工作区”允许所有者归档或删除工作区；删除需确认并移除其全部数据。'],
      ['Password: “Reset password” under Settings sends a link to your email address.', 'Passwort: „Passwort zurücksetzen“ unter Einstellungen schickt einen Link an deine E-Mail-Adresse.', '密码：在“设置”中点击“重置密码”会向你的邮箱发送链接。'],
    ],
    related: ['start-workspace', 'fin-export'],
  },
  'ref-faq': {
    list: [
      { term: ['I cannot add time – the button is greyed out.', 'Ich kann keine Zeit erfassen – der Knopf ist grau.', '无法记录时间——按钮是灰色的。'], def: ['There is no active project. Ask a manager to create one or set a paused project back to active.', 'Es gibt kein aktives Projekt. Bitte die Leitung, eines anzulegen oder ein pausiertes wieder auf aktiv zu setzen.', '没有进行中的项目。请负责人创建一个，或将已暂停的项目改回进行中。'] },
      { term: ['My entry disappeared from the list.', 'Mein Eintrag ist aus der Liste verschwunden.', '我的条目从列表中消失了。'], def: ['Check the period and the status filter under Time – submitted and approved entries are hidden when “Draft” is selected.', 'Prüfe Zeitraum und Statusfilter unter Zeiten – eingereichte und freigegebene Einträge sind ausgeblendet, wenn „Entwurf“ gewählt ist.', '检查“时间”中的时段和状态筛选——选择“草稿”时，已提交和已批准的条目会被隐藏。'] },
      { term: ['Why can I not edit an approved entry?', 'Warum kann ich einen freigegebenen Eintrag nicht ändern?', '为什么不能编辑已批准的条目？'], def: ['Approved hours are the basis for invoices. A manager can revoke the approval as long as the hours are not billed.', 'Freigegebene Zeiten sind die Basis für Rechnungen. Die Leitung kann die Freigabe aufheben, solange die Zeiten nicht abgerechnet sind.', '已批准的工时是开票的依据。只要尚未开票，负责人可撤销批准。'] },
      { term: ['The invitation email did not arrive.', 'Die Einladungs-E-Mail kam nicht an.', '邀请邮件没有收到。'], def: ['Without the sign-in-link option, no email is sent – copy the invitation text and send it yourself. The person must register with the invited address.', 'Ohne die Option „Anmeldelink senden“ wird keine E-Mail verschickt – kopiere den Einladungstext und schicke ihn selbst. Die Person muss sich mit der eingeladenen Adresse registrieren.', '未勾选“发送登录链接”时不会发送邮件——请复制邀请文本自行发送。对方必须用被邀请的邮箱注册。'] },
      { term: ['Can I delete an invoice?', 'Kann ich eine Rechnung löschen?', '可以删除发票吗？'], def: ['Drafts yes. Issued invoices are cancelled with a cancellation invoice, never deleted (GoBD).', 'Entwürfe ja. Ausgestellte Rechnungen werden mit einer Stornorechnung storniert, nie gelöscht (GoBD).', '草稿可以。已开具的发票只能用冲销发票冲销，不能删除（GoBD）。'] },
      { term: ['Where do the DEMO numbers come from?', 'Woher kommen die DEMO-Nummern?', 'DEMO 编号从哪里来？'], def: ['You are in a demo workspace. Complete it under Settings to turn it into a real workspace with a real sequence.', 'Du bist in einem Demo-Workspace. Schließe ihn unter Einstellungen ab, um ihn in einen echten Workspace mit echter Nummernfolge zu überführen.', '你在演示工作区中。在“设置”中完成它，即可转为拥有真实编号序列的正式工作区。'] },
      { term: ['The app looks different on my phone.', 'Auf dem Smartphone sieht die App anders aus.', '应用在手机上看起来不一样。'], def: ['On phones the four main areas sit in the bottom bar; Reports, Team, Finance, Settings and Help are behind “More”.', 'Am Smartphone liegen die vier Hauptbereiche in der unteren Leiste; Auswertung, Team, Finance, Einstellungen und Hilfe hinter „Mehr“.', '在手机上，四个主要区域位于底栏；报表、团队、财务、设置和帮助在“更多”中。'] },
    ],
    related: ['ref-glossary'],
  },
  'ref-glossary': {
    list: [
      { term: ['Workspace', 'Workspace', '工作区'], def: ['One studio or team with its own projects, people and finance. You can belong to several.', 'Ein Studio oder Team mit eigenen Projekten, Personen und Finance. Du kannst zu mehreren gehören.', '一个拥有自己项目、成员和财务的工作室或团队。你可以属于多个。'] },
      { term: ['Billable', 'Abrechenbar', '可计费'], def: ['Hours the client pays for. Only billable, approved hours go on invoices from time.', 'Zeiten, die der Kunde bezahlt. Nur abrechenbare, freigegebene Zeiten kommen auf Rechnungen aus Zeiten.', '客户付费的工时。只有可计费且已批准的工时会进入按工时开具的发票。'] },
      { term: ['Approval', 'Freigabe', '批准'], def: ['A manager confirms submitted hours. Approved hours are locked and ready for billing.', 'Die Leitung bestätigt eingereichte Zeiten. Freigegebene Zeiten sind gesperrt und bereit zur Abrechnung.', '负责人确认已提交的工时。已批准的工时被锁定并可开票。'] },
      { term: ['Capacity', 'Kapazität', '产能'], def: ['Planned hours per week per person; the base of the utilization report.', 'Geplante Stunden pro Woche je Person; Basis der Auslastung.', '每人每周的计划工时；利用率的基础。'] },
      { term: ['Utilization', 'Auslastung', '利用率'], def: ['Tracked hours compared with available hours (capacity minus absences) in a period.', 'Erfasste Stunden im Verhältnis zu verfügbaren Stunden (Kapazität minus Abwesenheiten) in einem Zeitraum.', '某时段内实际工时与可用工时（产能减缺勤）的比值。'] },
      { term: ['Milestone', 'Meilenstein', '里程碑'], def: ['A task marked as a key date; highlighted on the board and in the project insight.', 'Eine als Schlüsseltermin markierte Aufgabe; hervorgehoben auf dem Board und im Projekt-Einblick.', '被标记为关键节点的任务；在看板和项目洞察中高亮。'] },
      { term: ['Snapshot', 'Snapshot', '快照'], def: ['The frozen copy of your letterhead and the client address on a sent offer or issued invoice.', 'Die eingefrorene Kopie von Briefkopf und Kundenanschrift auf einem versendeten Angebot oder einer ausgestellten Rechnung.', '已发送报价或已开具发票上冻结的信头和客户地址副本。'] },
      { term: ['Yearly sequence', 'Jahresfolge', '年度序列'], def: ['Document numbers count per year without gaps: prefix, year, running number.', 'Belegnummern zählen je Jahr lückenlos: Präfix, Jahr, laufende Nummer.', '单据编号按年连续无间断：前缀、年份、流水号。'] },
      { term: ['Cancellation invoice', 'Stornorechnung', '冲销发票'], def: ['A document with its own number that reverses an issued invoice.', 'Ein Beleg mit eigener Nummer, der eine ausgestellte Rechnung aufhebt.', '带独立编号、用于撤销已开具发票的单据。'] },
      { term: ['E-invoice (EN 16931)', 'E-Rechnung (EN 16931)', '电子发票（EN 16931）'], def: ['The European standard for machine-readable invoices; vave.log writes the CII XML profile.', 'Der europäische Standard für maschinenlesbare Rechnungen; vave.log schreibt das CII-XML-Profil.', '欧洲机读发票标准；vave.log 输出 CII XML 格式。'] },
      { term: ['DATEV batch', 'DATEV-Stapel', 'DATEV 批次'], def: ['A CSV in the EXTF format that tax offices import into DATEV.', 'Eine CSV im EXTF-Format, die Steuerbüros in DATEV importieren.', '税务师可导入 DATEV 的 EXTF 格式 CSV。'] },
      { term: ['GoBD', 'GoBD', 'GoBD'], def: ['German principles for proper bookkeeping: issued documents stay unchanged and traceable.', 'Grundsätze ordnungsmäßiger Buchführung: Ausgestellte Belege bleiben unverändert und nachvollziehbar.', '德国规范记账原则：已开具的单据保持不变且可追溯。'] },
    ],
    related: ['ref-faq'],
  },
};
