import type {Locale} from '../shared/i18n';

const en={
 title:'Manage studios & demos',owner:'Owner controls',intro:'Manage the studios and demos you own, including archived ones.',
 loading:'Loading your studios and demos…',empty:'No studios or demos owned by you.',studio:'Studio',demo:'Demo',active:'Active',archived:'Archived',current:'Current workspace',
 delete:'Delete',deleteLabel:'Delete: {name}',deleteTitle:'Permanently delete workspace?',back:'Back',retry:'Try again',refresh:'Refresh list',
 permanent:'This permanently deletes this studio or demo and all its content for everyone. This cannot be undone.',
 finances:'Projects, tasks, time entries, invitations, planning, invoices, payments and expenses will be deleted, including archived records.',
 accounts:'User accounts and other studios remain. Everyone loses access to this workspace.',
 counts:'Records to be deleted',projects:'Projects',tasks:'Tasks',time_entries:'Time entries',members:'Members',invoices:'Invoices',expenses:'Expenses',
 nameLabel:'Type the exact workspace name',nameHint:'Match every character, including spaces and capitalization.',acknowledge:'I understand that all workspace content, including financial records, will be permanently deleted for everyone.',
 submit:'Permanently delete',deleting:'Deleting…',offline:'You are offline. Reconnect before deleting a workspace.',
 running_timers:'This workspace has running timers. Stop all of them before deleting it, then refresh the list.',
 forbidden:'Only an owner can delete this workspace. Refresh the list to check your access.',confirmation:'The name or confirmation does not match. Check both before trying again.',
 not_found:'This workspace is no longer available. Refresh the list.',failed:'Deletion was not confirmed. The workspace has not been removed from this view. Refresh the list before trying again.',
 loadError:'Your studios and demos could not be loaded. Please try again.',deleted:'Workspace deleted permanently.',
};
type Copy={[K in keyof typeof en]:string};
const de:Copy={
 title:'Studios & Demos verwalten',owner:'Verwaltung für Owner',intro:'Verwalte deine Studios und Demos – auch archivierte.',
 loading:'Deine Studios und Demos werden geladen…',empty:'Du bist bei keinem Studio oder Demo Owner.',studio:'Studio',demo:'Demo',active:'Aktiv',archived:'Archiviert',current:'Aktueller Workspace',
 delete:'Löschen',deleteLabel:'Löschen: {name}',deleteTitle:'Workspace dauerhaft löschen?',back:'Zurück',retry:'Erneut versuchen',refresh:'Liste aktualisieren',
 permanent:'Dieses Studio oder Demo und alle Inhalte werden für alle dauerhaft gelöscht. Das kann nicht rückgängig gemacht werden.',
 finances:'Projekte, Aufgaben, Zeiteinträge, Einladungen, Planung, Rechnungen, Zahlungen und Ausgaben werden gelöscht, einschließlich archivierter Daten.',
 accounts:'Benutzerkonten und andere Studios bleiben erhalten. Alle verlieren den Zugriff auf diesen Workspace.',
 counts:'Zu löschende Daten',projects:'Projekte',tasks:'Aufgaben',time_entries:'Zeiteinträge',members:'Mitglieder',invoices:'Rechnungen',expenses:'Ausgaben',
 nameLabel:'Exakten Workspace-Namen eingeben',nameHint:'Alle Zeichen müssen übereinstimmen, auch Leerzeichen und Groß-/Kleinschreibung.',acknowledge:'Ich verstehe, dass alle Workspace-Inhalte einschließlich Finanzdaten für alle dauerhaft gelöscht werden.',
 submit:'Dauerhaft löschen',deleting:'Wird gelöscht…',offline:'Du bist offline. Stelle vor dem Löschen eine Verbindung her.',
 running_timers:'In diesem Workspace laufen Timer. Stoppe zuerst alle Timer und aktualisiere dann die Liste.',
 forbidden:'Nur Owner können diesen Workspace löschen. Aktualisiere die Liste, um deinen Zugriff zu prüfen.',confirmation:'Name oder Bestätigung stimmen nicht überein. Prüfe beides und versuche es erneut.',
 not_found:'Dieser Workspace ist nicht mehr verfügbar. Aktualisiere die Liste.',failed:'Das Löschen wurde nicht bestätigt. Der Workspace wurde aus dieser Ansicht nicht entfernt. Aktualisiere die Liste vor einem weiteren Versuch.',
 loadError:'Deine Studios und Demos konnten nicht geladen werden. Bitte versuche es erneut.',deleted:'Workspace dauerhaft gelöscht.',
};
const zh:Copy={
 title:'管理工作室与演示',owner:'所有者管理',intro:'管理你拥有的工作室和演示，包括已归档的项目。',
 loading:'正在加载你的工作室和演示…',empty:'你目前不拥有任何工作室或演示。',studio:'工作室',demo:'演示',active:'启用',archived:'已归档',current:'当前工作区',
 delete:'删除',deleteLabel:'删除：{name}',deleteTitle:'永久删除工作区？',back:'返回',retry:'重试',refresh:'刷新列表',
 permanent:'此工作室或演示及其所有内容将被永久删除，影响所有成员。此操作无法撤销。',
 finances:'项目、任务、工时记录、邀请、计划、发票、付款和费用都将被删除，包括已归档的数据。',
 accounts:'用户账户和其他工作室将保留。所有成员都将失去此工作区的访问权限。',
 counts:'将删除的记录',projects:'项目',tasks:'任务',time_entries:'工时记录',members:'成员',invoices:'发票',expenses:'费用',
 nameLabel:'输入完整且完全一致的工作区名称',nameHint:'每个字符都必须一致，包括空格和大小写。',acknowledge:'我理解所有工作区内容（包括财务记录）将对所有成员永久删除。',
 submit:'永久删除',deleting:'正在删除…',offline:'你已离线。请恢复网络连接后再删除工作区。',
 running_timers:'此工作区有正在运行的计时器。请先停止所有计时器，然后刷新列表。',
 forbidden:'只有所有者可以删除此工作区。请刷新列表以检查你的权限。',confirmation:'名称或确认不匹配。请检查后重试。',
 not_found:'此工作区已不可用。请刷新列表。',failed:'删除尚未确认。工作区尚未从此视图中移除。请先刷新列表再重试。',
 loadError:'无法加载你的工作室和演示。请重试。',deleted:'工作区已永久删除。',
};
export const workspaceAdminCopy={en,de,zh};
export function workspaceAdminText(locale:Locale,key:keyof Copy,values:Record<string,string|number>={}){
 return (workspaceAdminCopy[locale]??en)[key].replace(/\{(\w+)\}/g,(match,name:string)=>String(values[name]??match));
}
