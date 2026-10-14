import { localeTag, type Locale } from '../shared/i18n';

const en = {
 title:'Project analysis', loading:'Loading project analysis…', loadError:'Project analysis could not be loaded. Check your access and try again.', retry:'Try again',
 scope:'All recorded team time through {date}. Independent of the selected period.', recorded:'All recorded team time', budgetLeft:'{hours} left in the time budget', budgetOver:'Time budget exceeded by {hours}', noBudget:'No time budget',
 "progress":"Automatic progress", "noProgress":"No tasks yet", progressDate:'Updated {date}', noProgressDate:'Progress update date unavailable', "complete":"All tracked tasks complete",
 effort:'Total effort scenario', unavailable:'Not enough information', remaining:'{hours} still to do', effortWithin:'Scenario within the time budget', effortOver:'Scenario exceeds the time budget', effortUnknown:'Budget outcome unknown',
 deadline:'Deadline', noDeadline:'No deadline', finish:'At this pace: {date}', deadlineWithin:'Scenario within deadline', deadlineLate:'Scenario after deadline', deadlineOverdue:'Deadline has passed', deadlineUnknown:'Deadline outcome unknown', completeDate:'No completion date is recorded.',
 pace:'Recent team pace', paceValue:'{hours} per calendar day', observed:'{days} calendar days · {logged} logged dates',
 edit:'Edit planning', tasks:'Tasks', time:'Time', reports:'Reports', planning:'Planning', invoices:'Invoices', related:'Continue with this project',
 tasksDone:'{done} of {total} tasks done · {overdue} overdue', assumptions:'How this is calculated',
 "calculation":"Total effort = recorded time ÷ automatic progress. Remaining effort = total effort − recorded time. This is a scenario, not a commitment.",
 paceAssumption:'Pace uses up to the last 28 calendar days, starting with the first logged date. At least 7 observed days and 3 distinct logged dates are required. Finish = today + remaining effort ÷ pace, rounded up to a whole day.',
 scheduleAssumption:'The scenario keeps the recent team pace constant. Weekends are included; holidays, staffing changes and future time entries are not modeled. Draft, submitted and approved time is included; running timers are excluded.',
 "progressAssumption":"When every task has an estimate, progress is completed estimated effort divided by all estimated effort. Otherwise each task counts equally. In-progress tasks count as unfinished.",
 "taskAssumption":"Task counts are unweighted when estimates are incomplete. Milestones are tasks and count once. Time budget consumption is separate from completion.",
 'invalid-date':'The analysis date is invalid. A finish forecast is unavailable.',
 'invalid-history':'Recorded work dates are missing or inconsistent. A finish forecast is unavailable.',
 inactive:'This project is paused or archived. A finish forecast is unavailable.',
 "missing-progress":"Add tasks to calculate project progress.",
 "zero-progress":"No tracked tasks are complete yet. A finish forecast needs progress above zero.",
 'stale-progress':'Progress is over 14 calendar days old. Update it before relying on a finish forecast.',
 'undated-progress':'A current progress update date is needed for a finish forecast.',
 'no-effort':'Record project time before estimating remaining effort.',
 'insufficient-history':'A finish forecast needs at least 7 observed calendar days and 3 logged dates.',
 'no-pace':'No recent work pace is available. A finish forecast is unavailable.',
 'out-of-range':'The scenario is outside the supported range. Review recorded time and progress.',
 "refresh":"Refresh analysis","weighted":"Weighted by estimated effort","unweighted":"Unweighted task count","done":"Done","doing":"In progress","open":"Open","milestones":"Milestones","noMilestones":"No milestones yet","milestoneHint":"Mark key tasks as milestones to see them here.","milestoneCount":"{done} of {total} complete","milestoneMore":"Showing {shown} of {total} milestones","overdue":"Overdue","noTaskDate":"No due date","missingData":"Missing data","dataReady":"Planning data is complete","missingEstimates":"Tasks without an estimate: {count}","missingDates":"Tasks without a due date: {count}","missingAssignees":"Tasks without an assignee: {count}","addTasks":"Add tasks","addBudget":"Add a time budget","addDeadline":"Add a project deadline","addHistory":"More recorded history needed for a forecast","budget":"Time budget","budgetConsumption":"Hours used, not completion","eta":"Estimated finish","estimateHours":"Estimated effort (hours)","estimateHint":"Optional. Estimate every task to weight progress by effort.","milestone":"Milestone","milestoneEditorHint":"A key checkpoint; counted once as a task.","autoHint":"Progress updates automatically from tasks.","dataHint":"Fill these gaps for a clearer project outlook.",
};
type Copy = { [Key in keyof typeof en]: string };
const de: Copy = {
 title:'Projektanalyse', loading:'Projektanalyse wird geladen…', loadError:'Die Projektanalyse konnte nicht geladen werden. Prüfe deinen Zugriff und versuche es erneut.', retry:'Erneut versuchen',
 scope:'Gesamte erfasste Teamzeit bis {date}. Unabhängig vom gewählten Zeitraum.', recorded:'Erfasste Teamzeit', budgetLeft:'{hours} im Zeitbudget verbleibend', budgetOver:'Zeitbudget um {hours} überschritten', noBudget:'Kein Zeitbudget',
 "progress":"Automatischer Fortschritt", "noProgress":"Noch keine Aufgaben", progressDate:'Aktualisiert am {date}', noProgressDate:'Aktualisierungsdatum fehlt', "complete":"Alle erfassten Aufgaben erledigt",
 effort:'Szenario: Gesamtaufwand', unavailable:'Noch nicht abschätzbar', remaining:'{hours} verbleibender Aufwand', effortWithin:'Szenario innerhalb des Zeitbudgets', effortOver:'Szenario überschreitet das Zeitbudget', effortUnknown:'Budgetausgang unbekannt',
 deadline:'Frist', noDeadline:'Keine Frist', finish:'Bei diesem Tempo: {date}', deadlineWithin:'Szenario innerhalb der Frist', deadlineLate:'Szenario nach der Frist', deadlineOverdue:'Frist überschritten', deadlineUnknown:'Fristeinhaltung unbekannt', completeDate:'Ein Abschlussdatum ist nicht erfasst.',
 pace:'Aktuelles Teamtempo', paceValue:'{hours} pro Kalendertag', observed:'{days} Kalendertage · {logged} erfasste Tage',
 edit:'Planung bearbeiten', tasks:'Aufgaben', time:'Zeiten', reports:'Berichte', planning:'Planung', invoices:'Rechnungen', related:'Mit diesem Projekt weiterarbeiten',
 tasksDone:'{done} von {total} Aufgaben erledigt · {overdue} überfällig', assumptions:'So wird gerechnet',
 "calculation":"Gesamtaufwand = erfasste Zeit ÷ automatischer Fortschritt. Restaufwand = Gesamtaufwand − erfasste Zeit. Dies ist ein Szenario, keine Zusage.",
 paceAssumption:'Das Tempo berücksichtigt höchstens die letzten 28 Kalendertage ab dem ersten Zeiteintrag. Mindestens 7 beobachtete Tage und 3 unterschiedliche erfasste Tage sind nötig. Abschluss = heute + Restaufwand ÷ Tempo, auf ganze Tage aufgerundet.',
 scheduleAssumption:'Das Szenario setzt ein gleichbleibendes Teamtempo voraus. Wochenenden sind enthalten; Feiertage, Teamänderungen und zukünftige Zeiteinträge werden nicht modelliert. Entwürfe, eingereichte und freigegebene Zeiten zählen mit; laufende Timer nicht.',
 "progressAssumption":"Sind alle Aufgaben geschätzt, zählt der erledigte geschätzte Aufwand im Verhältnis zum gesamten geschätzten Aufwand. Sonst zählt jede Aufgabe gleich. Aufgaben in Arbeit zählen als unerledigt.",
 "taskAssumption":"Ohne vollständige Schätzungen sind Aufgabenzahlen ungewichtet. Meilensteine zählen als Aufgabe genau einmal. Zeitbudgetverbrauch und Fortschritt sind getrennt.",
 'invalid-date':'Das Analysedatum ist ungültig. Eine Abschlussprognose ist nicht verfügbar.',
 'invalid-history':'Erfasste Arbeitsdaten fehlen oder sind widersprüchlich. Eine Abschlussprognose ist nicht verfügbar.',
 inactive:'Dieses Projekt ist pausiert oder archiviert. Eine Abschlussprognose ist nicht verfügbar.',
 "missing-progress":"Ergänze Aufgaben, um den Projektfortschritt zu berechnen.",
 "zero-progress":"Noch keine erfasste Aufgabe ist erledigt. Eine Abschlussprognose benötigt einen Fortschritt über null.",
 'stale-progress':'Der Fortschritt ist über 14 Kalendertage alt. Aktualisiere ihn, bevor du eine Abschlussprognose nutzt.',
 'undated-progress':'Eine Abschlussprognose benötigt ein aktuelles Fortschrittsdatum.',
 'no-effort':'Erfasse Projektzeit, bevor du den Restaufwand abschätzt.',
 'insufficient-history':'Eine Abschlussprognose benötigt mindestens 7 beobachtete Kalendertage und 3 erfasste Tage.',
 'no-pace':'Es ist kein aktuelles Arbeitstempo verfügbar. Eine Abschlussprognose ist nicht möglich.',
 'out-of-range':'Das Szenario liegt außerhalb des unterstützten Bereichs. Prüfe Zeit und Fortschritt.',
 "refresh":"Analyse aktualisieren","weighted":"Nach geschätztem Aufwand gewichtet","unweighted":"Ungewichtete Aufgabenzahl","done":"Erledigt","doing":"In Arbeit","open":"Offen","milestones":"Meilensteine","noMilestones":"Noch keine Meilensteine","milestoneHint":"Markiere wichtige Aufgaben als Meilensteine, um sie hier zu sehen.","milestoneCount":"{done} von {total} erledigt","milestoneMore":"{shown} von {total} Meilensteinen angezeigt","overdue":"Überfällig","noTaskDate":"Ohne Termin","missingData":"Fehlende Daten","dataReady":"Planungsdaten vollständig","missingEstimates":"{count} Aufgaben ohne Schätzung","missingDates":"{count} Aufgaben ohne Termin","missingAssignees":"{count} Aufgaben ohne Zuständigkeit","addTasks":"Aufgaben ergänzen","addBudget":"Zeitbudget ergänzen","addDeadline":"Projektdeadline ergänzen","addHistory":"Mehr erfasste Historie für eine Prognose nötig","budget":"Zeitbudget","budgetConsumption":"Stundenverbrauch, kein Fertigstellungsgrad","eta":"Voraussichtlicher Abschluss","estimateHours":"Geschätzter Aufwand (Stunden)","estimateHint":"Optional. Schätze alle Aufgaben, um den Fortschritt nach Aufwand zu gewichten.","milestone":"Meilenstein","milestoneEditorHint":"Ein wichtiger Kontrollpunkt; zählt einmal als Aufgabe.","autoHint":"Der Fortschritt wird automatisch aus Aufgaben berechnet.","dataHint":"Ergänze diese Angaben für eine klarere Projektprognose.",
};
const zh: Copy = {
 title:'项目分析', loading:'正在加载项目分析…', loadError:'无法加载项目分析。请检查访问权限并重试。', retry:'重试',
 scope:'截至{date}的全部已记录团队工时，不受所选时间段影响。', recorded:'已记录的团队工时', budgetLeft:'工时预算还剩{hours}', budgetOver:'已超出工时预算{hours}', noBudget:'未设工时预算',
 "progress":"自动进度", "noProgress":"暂无任务", progressDate:'更新于{date}', noProgressDate:'缺少进度更新日期', "complete":"所有已记录任务均已完成",
 effort:'总工时情景估算', unavailable:'信息不足', remaining:'预计还需{hours}', effortWithin:'情景估算在工时预算内', effortOver:'情景估算超出工时预算', effortUnknown:'预算结果未知',
 deadline:'截止日期', noDeadline:'未设截止日期', finish:'按当前速度：{date}', deadlineWithin:'情景估算在截止日期前', deadlineLate:'情景估算晚于截止日期', deadlineOverdue:'已超过截止日期', deadlineUnknown:'能否按期完成尚不明确', completeDate:'尚未记录实际完成日期。',
 pace:'近期团队工作速度', paceValue:'每个日历日{hours}', observed:'{days}个日历日 · {logged}天有工时记录',
 edit:'编辑计划', tasks:'任务', time:'工时', reports:'报表', planning:'计划', invoices:'发票', related:'继续处理此项目',
 tasksDone:'已完成{done}/{total}项任务 · {overdue}项逾期', assumptions:'计算方式',
 "calculation":"总工时 = 已记录工时 ÷ 自动进度。剩余工时 = 总工时 − 已记录工时。这是一种情景估算，并非承诺。",
 paceAssumption:'工作速度最多采用最近28个日历日的数据，起点为首次工时记录日。至少需要7个观察日和3个有工时记录的不同日期。预计完成日 = 今天 + 剩余工时 ÷ 工作速度，向上取整到天。',
 scheduleAssumption:'此情景假设近期团队工作速度保持不变。日历日包括周末；不考虑节假日、人员变动及未来工时记录。包含草稿、已提交及已批准工时，不包含运行中的计时器。',
 "progressAssumption":"所有任务都有估算时，进度按已完成任务的预计工时占总预计工时的比例计算。否则每项任务权重相同。进行中的任务视为未完成。",
 "taskAssumption":"估算不完整时，任务数量不加权。里程碑也是任务，仅计入一次。工时预算消耗与完成进度分开显示。",
 'invalid-date':'分析日期无效，无法预测完成日期。',
 'invalid-history':'工时记录日期缺失或不一致，无法预测完成日期。',
 inactive:'此项目已暂停或归档，无法预测完成日期。',
 "missing-progress":"添加任务以计算项目进度。",
 "zero-progress":"尚无已完成的任务。预测完成日期需要大于零的进度。",
 'stale-progress':'进度距今已超过14个日历日，请先更新进度再参考完成日期预测。',
 'undated-progress':'预测完成日期需要有效的近期进度更新日期。',
 'no-effort':'请先记录项目工时，再估算剩余工作量。',
 'insufficient-history':'预测完成日期至少需要7个观察日及3个有工时记录的不同日期。',
 'no-pace':'暂无近期工作速度数据，无法预测完成日期。',
 'out-of-range':'情景估算超出支持范围，请检查已记录工时和进度。',
 "refresh":"刷新分析","weighted":"按预计工时加权","unweighted":"任务等权计数","done":"已完成","doing":"进行中","open":"待办","milestones":"里程碑","noMilestones":"暂无里程碑","milestoneHint":"将关键任务标为里程碑，即可在此查看。","milestoneCount":"已完成{done}/{total}项","milestoneMore":"显示{total}个里程碑中的{shown}个","overdue":"已逾期","noTaskDate":"无截止日期","missingData":"缺失数据","dataReady":"计划数据完整","missingEstimates":"{count}项任务缺少工时估算","missingDates":"{count}项任务缺少截止日期","missingAssignees":"{count}项任务未分配负责人","addTasks":"添加任务","addBudget":"添加工时预算","addDeadline":"添加项目截止日期","addHistory":"预测需要更多工时记录","budget":"工时预算","budgetConsumption":"工时消耗，不代表完成进度","eta":"预计完成日期","estimateHours":"预计工时（小时）","estimateHint":"可选。为所有任务估算工时，即可按工作量计算进度。","milestone":"里程碑","milestoneEditorHint":"关键检查点；作为任务计入一次。","autoHint":"进度根据任务自动更新。","dataHint":"补充这些信息，可更清晰地了解项目预测。",
};
export const projectInsightCopy: Record<Locale, Copy> = {en,de,zh};
export function insightText(locale: Locale, key: keyof Copy, values: Record<string, string | number> = {}): string {
 const resolved = projectInsightCopy[locale] ? locale : 'en';
 return projectInsightCopy[resolved][key].replace(/\{(\w+)\}/g, (token, name:string) => Object.hasOwn(values,name) ? typeof values[name] === 'number' ? new Intl.NumberFormat(localeTag(resolved)).format(values[name]) : values[name]! : token);
}
export function formatInsightHours(minutes: number, locale: Locale): string {
 return new Intl.NumberFormat(localeTag(locale), {style:'unit',unit:'hour',unitDisplay:'short',maximumFractionDigits:1}).format(minutes / 60);
}
export function formatInsightDate(iso: string | null | undefined, locale: Locale): string {
 if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return '—';
 const date = new Date(`${iso}T00:00:00Z`);
 if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0,10) !== iso) return '—';
 return new Intl.DateTimeFormat(localeTag(locale), {day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}).format(date);
}
