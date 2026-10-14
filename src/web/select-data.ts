import type { Membership, Project } from '../shared/types';
import { translate } from '../shared/i18n';
import { getLocale } from './i18n';
import { initials } from './helpers';
export function projectOption(project:Project){
 const status=translate({active:'Aktiv',paused:'Pausiert',archived:'Archiviert'}[project.status],getLocale());
 return {'data-group':status,'data-detail':[project.client,status].filter(Boolean).join(' · '),'data-keywords':project.code,'data-color':project.color};
}
export function personOption(member:Membership){
 const role=translate({owner:'Inhaber:in',manager:'Leitung',member:'Mitglied',disabled:'Deaktiviert'}[member.role],getLocale());
 return {'data-group':member.demo_studio||role,'data-detail':[member.demo_title||role,member.demo_studio].filter(Boolean).join(' · '),'data-keywords':member.email,'data-avatar':initials(member.display_name||member.email)};
}
