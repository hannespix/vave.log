import {WorkspaceAdminError} from '../shared/workspace-admin-service.js';
import {AppError} from '../shared/service.js';
import {hasTranslation,translate,type Locale} from '../shared/i18n.js';
const copy={
 confirmation:['Confirm permanent deletion and enter the exact workspace name.','Bestätige das endgültige Löschen und gib den exakten Workspace-Namen ein.','请确认永久删除并输入完全一致的工作区名称。'],
 running_timers:['Stop or discard all running timers in this workspace before deleting it.','Beende oder verwerfe zuerst alle laufenden Timer in diesem Workspace.','请先停止或放弃此工作区中所有运行中的计时器，再删除工作区。'],
 signin:['Please sign in.','Bitte anmelden.','请登录。'],
 limited:['Too many requests. Please wait a moment.','Zu viele Anfragen. Bitte kurz warten.','请求过多，请稍后再试。'],
 host:['Host not allowed.','Host nicht erlaubt.','不允许的主机。'],
 origin:['Origin not allowed.','Origin nicht erlaubt.','不允许的来源。'],
 setup:['The backend is not configured yet.','Backend noch nicht eingerichtet.','后端尚未配置。'],
 missing:['Not found.','Nicht gefunden.','未找到。'],
 method:['Only POST is supported. This MCP server is stateless.','Nur POST wird unterstützt. Der MCP-Server arbeitet ohne Sessions.','仅支持 POST；MCP 服务器不保留会话。'],
 busy:['Server is busy. Try again shortly.','Server ausgelastet. Bitte erneut versuchen.','服务器繁忙，请稍后重试。'],
 json:['JSON is required.','JSON erwartet.','需要 JSON 数据。'],
 invalid:['Invalid or oversized JSON.','Ungültiges oder zu großes JSON.','JSON 无效或过大。'],
 batch:['Batch requests are not supported.','Batch-Aufrufe werden nicht unterstützt.','不支持批量请求。'],
 failed:['The request failed. Check your input, connection and permission.','Die Anfrage ist fehlgeschlagen. Eingaben, Verbindung und Berechtigung prüfen.','请求失败，请检查输入、连接和权限。'],
 validation:['Please check the input fields and date range.','Bitte Eingaben und Datumsbereich prüfen.','请检查输入字段和日期范围。'],
 forbidden:['You do not have permission for this action.','Dafür fehlt die Berechtigung.','你没有执行此操作的权限。'],
 not_found:['Not found or access denied.','Nicht gefunden oder kein Zugriff.','未找到或无权访问。'],
 conflict:['The record changed or the operation is not allowed in its current state. Reload and review it.','Der Datensatz wurde geändert oder die Aktion ist in diesem Zustand nicht erlaubt. Bitte neu laden und prüfen.','记录已更改或当前状态不允许此操作，请刷新并检查。'],
 missing_configuration:['Complete and review company identity, customer address, service dates and tax details first.','Bitte zuerst Firmenidentität, Kundenadresse, Leistungszeitraum und Steuerangaben vervollständigen und prüfen.','请先补充并核对公司信息、客户地址、服务日期和税务信息。'],
 result_limit:['More than 1,000 records. Reduce the date range or scope.','Mehr als 1.000 Einträge. Bitte Zeitraum oder Umfang verkleinern.','记录超过 1,000 条，请缩小日期范围或查询范围。'],
 time_entry_limit:['More than 50,000 time entries matched. Please narrow the date range.','Mehr als 50.000 Zeiteinträge. Bitte Zeitraum verkleinern.','匹配的工时记录超过 50,000 条，请缩小日期范围。'],
 result_incomplete:['Time entries could not be loaded completely. Please reload and try again.','Zeiteinträge konnten nicht vollständig geladen werden. Bitte neu laden und erneut versuchen.','无法完整加载工时记录，请刷新后重试。'],
} as const;
export function serverMessage(key:keyof typeof copy,locale:Locale){return copy[key][locale==='de'?1:locale==='zh'?2:0]}
export function toolError(error:unknown,locale:Locale):string{
 if(error instanceof WorkspaceAdminError)return serverMessage(error.code,locale);
 if(error instanceof AppError){
  if(error.code==='validation')return serverMessage('validation',locale);
  if(hasTranslation(error.message))return translate(error.message,locale);
 }
 if(error instanceof Error&&error.name==='DemoError'&&hasTranslation(error.message))return translate(error.message,locale);
 if(error instanceof Error&&error.name==='FinanceError'){
  const code=(error as Error&{code?:string}).code;
  if(code&&['validation','forbidden','not_found','conflict','missing_configuration','result_limit','time_entry_limit','result_incomplete'].includes(code))return serverMessage(code as keyof typeof copy,locale);
 }
 return serverMessage('failed',locale);
}
