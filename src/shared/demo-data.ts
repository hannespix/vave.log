/** Beispieldaten: ein kleiner, vollständig fiktiver Satz (7 Personen, 5 Projekte, 16 Aufgaben).
 * Dieses Manifest muss private.demo_manifest_compact() in der jüngsten Migration entsprechen.
 * Ältere Demo-Workspaces tragen noch das frühere, große Manifest; die App liest daraus nichts außer der Version. */
export type DemoLocale = 'en'|'de'|'zh';
export type DemoLabels = Record<DemoLocale,string>;
export interface DemoManifest { version:string; compact?:boolean; disclosure:DemoLabels; counts?:{people:number;projects:number;tasks:number}; [key:string]:unknown }
export interface DemoWorkspace { workspace_id:string; created_by:string; request_id:string; locale:DemoLocale; manifest_version:string; manifest:DemoManifest; created_at:string; archived_at:string|null; experience_version?:number; refreshed_on?:string|null }
/** Stufe der kompakten Demo. Ältere Demos (Stufe 1–5) lassen sich darauf umstellen: „Beispieldaten neu laden“. */
export const DEMO_EXPERIENCE_VERSION = 6;
export const DEMO_MANIFEST:DemoManifest = {
  version: 'vave-compact-2026-11-19.1', compact: true,
  disclosure: {
    en: 'All people, clients, projects, time and financial details in this sample are fictional. DEMO — DO NOT PAY.',
    de: 'Alle Personen, Kunden, Projekte, Zeiten und Finanzangaben in diesem Beispiel sind fiktiv. DEMO — NICHT BEZAHLEN.',
    zh: '本示例中的所有人员、客户、项目、工时和财务信息均为虚构。DEMO — 演示文件，请勿付款。',
  },
  counts: { people: 7, projects: 5, tasks: 16 },
};
