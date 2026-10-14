import { Children, Fragment, isValidElement, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type SelectHTMLAttributes } from 'react';
import Creatable from 'react-select/creatable';
import Select, { type AriaLiveMessages, type GroupBase, type SelectInstance } from 'react-select';
import { Check, ChevronDown, Search } from 'lucide-react';
import { useI18n } from './i18n';
import './smart-select.css';

export interface SelectOption { value: string; label: string; disabled: boolean; group: string; detail: string; keywords: string; avatar: string; color: string }
function textOf(node: ReactNode): string {
 return Children.toArray(node).map(child => isValidElement<{children?:ReactNode}>(child) ? textOf(child.props.children) : String(child)).join('');
}
/** Read existing option declarations without changing their order or eligibility. */
export function readOptions(children: ReactNode, group = ''): SelectOption[] {
 return Children.toArray(children).flatMap(child => {
  if (!isValidElement<Record<string,unknown>>(child)) return [];
  const p=child.props;
  if(child.type===Fragment||child.type==='optgroup')return readOptions(p.children as ReactNode,child.type==='optgroup'?String(p.label??''):group).map(o=>({...o,disabled:o.disabled||!!p.disabled}));
  if(child.type!=='option')return [];
  return [{value:String(p.value??textOf(p.children as ReactNode)),label:textOf(p.children as ReactNode),disabled:!!p.disabled,group:String(p['data-group']??group),detail:String(p['data-detail']??''),keywords:String(p['data-keywords']??''),avatar:String(p['data-avatar']??''),color:String(p['data-color']??'')}];
 });
}
const normalize=(s:string)=>s.normalize('NFKD').replace(/\p{M}/gu,'').toLocaleLowerCase();
export function matchesOption(option: SelectOption, input: string): boolean {
 const haystack=normalize([option.label,option.group,option.detail,option.keywords].join(' '));
 return normalize(input).trim().split(/\s+/).every(word=>haystack.includes(word));
}
const copy={
 en:{search:'Search…',empty:'No matches. Try another name or keyword.',choose:'Choose…',results:(n:number)=>`${n} results available.`,guide:'Type to search. Use arrow keys to browse, Enter to choose and Escape to close.',chosen:'Selected',cleared:'Selection cleared'},
 de:{search:'Suchen…',empty:'Keine Treffer. Anderen Namen oder Suchbegriff versuchen.',choose:'Auswählen…',results:(n:number)=>`${n} Ergebnisse verfügbar.`,guide:'Zum Suchen tippen. Mit Pfeiltasten navigieren, mit Enter auswählen, mit Escape schließen.',chosen:'Ausgewählt',cleared:'Auswahl aufgehoben'},
 zh:{search:'搜索…',empty:'没有匹配结果，请尝试其他姓名或关键词。',choose:'请选择…',results:(n:number)=>`有 ${n} 个结果。`,guide:'输入以搜索，使用方向键浏览，按回车选择，按 Escape 关闭。',chosen:'已选择',cleared:'已清除选择'},
};
type Props=Omit<SelectHTMLAttributes<HTMLSelectElement>,'onChange'|'value'|'defaultValue'|'multiple'|'size'> & {
 value?: string; defaultValue?: string; searchable?: boolean; compact?: boolean; displayValue?: ReactNode; allowCustom?: boolean;
 onChange?: (event:{target:{value:string;name:string}})=>void;
};
export function SmartSelect({children,value,defaultValue,onChange,name,id,required,disabled,className,searchable,compact,displayValue,allowCustom,...props}:Props){
 const {locale}=useI18n();const words=copy[locale];const generated=useId();const inputId=id??`select-${generated}`;
 const options=useMemo(()=>readOptions(children),[children]);
 const initial=()=>defaultValue??options.find(o=>!o.disabled)?.value??'';
 const [local,setLocal]=useState(initial);const selected=value??local;
 const [open,setOpen]=useState(false);const [query,setQuery]=useState('');const [invalid,setInvalid]=useState(false);
 const root=useRef<HTMLDivElement>(null);const native=useRef<HTMLSelectElement>(null);const control=useRef<SelectInstance<SelectOption,false,GroupBase<SelectOption>>>(null);
 const [portal,setPortal]=useState<HTMLElement|null>(null);
 const [labelledBy,setLabelledBy]=useState<string|undefined>(props['aria-labelledby']);
 const selectedOption=options.find(o=>o.value===selected)??{value:selected,label:allowCustom?selected:words.choose,disabled:!allowCustom,group:'',detail:'',keywords:'',avatar:'',color:''};
 const canSearch=searchable??options.length>7;
 useLayoutEffect(()=>{
  const node=root.current;if(!node)return;
  // Keep portalled menus inside the modal top layer and its focus boundary.
  setPortal(node.closest('dialog')??document.body);
  const label=node.closest('label');
  if(label){label.htmlFor=inputId;const caption=label.querySelector('span');if(caption&&!props['aria-label']){caption.id||=`${inputId}-label`;setLabelledBy(caption.id);}}
 },[inputId,props['aria-label']]);
 useEffect(()=>{const form=native.current?.form;if(!form)return;const reset=()=>{setLocal(initial());setQuery('');setInvalid(false);};form.addEventListener('reset',reset);return()=>form.removeEventListener('reset',reset);},[defaultValue]);
 useEffect(()=>{if(disabled)setOpen(false);},[disabled]);
 const grouped=useMemo(()=>{
  if(options.length<=7||!options.some(o=>o.group))return options;
  const groups=new Map<string,SelectOption[]>();const plain:SelectOption[]=[];
  for(const option of options){if(!option.group){plain.push(option);continue;}const items=groups.get(option.group)??[];items.push(option);groups.set(option.group,items);}
  return [...plain,...Array.from(groups,([label,items])=>({label,options:items}))];
 },[options]);
 const Control=allowCustom?Creatable:Select;
 const live:AriaLiveMessages<SelectOption,false,GroupBase<SelectOption>>={guidance:()=>words.guide,onFilter:({resultsMessage})=>resultsMessage,onChange:({label})=>label?`${words.chosen}: ${label}`:words.cleared,onFocus:({label})=>label??''};
 return <div ref={root} className={`smart-select ${compact?'smart-select-compact':''} ${className??''}`} data-select-value={selected} data-searchable={canSearch}
  role={disabled?'combobox':undefined} aria-disabled={disabled||undefined} aria-expanded={disabled?false:undefined} aria-haspopup={disabled?'listbox':undefined}
  aria-label={disabled?props['aria-label']:undefined} aria-labelledby={disabled?labelledBy:undefined}>

  <select name={name} ref={native} className="smart-select-native" tabIndex={-1} aria-hidden="true" value={selected} required={required} disabled={disabled} onChange={()=>{}} onInvalid={event=>{event.preventDefault();setInvalid(true);control.current?.focus();setOpen(true);}}>
   {options.map(o=><option key={o.value} value={o.value} disabled={o.disabled}>{o.label}</option>)}
   {!options.some(o=>o.value===selected)&&<option value={selected} disabled={!allowCustom}>{allowCustom?selected:words.choose}</option>}
  </select>
  <div aria-hidden={disabled||undefined}><Control<SelectOption,false,GroupBase<SelectOption>> ref={control} instanceId={inputId} inputId={inputId}
   aria-label={props['aria-label']} aria-labelledby={labelledBy} aria-describedby={props['aria-describedby']} aria-invalid={invalid||props['aria-invalid']} required={required}
   classNamePrefix="vave-select" unstyled value={selectedOption} options={grouped} isDisabled={disabled} isSearchable={canSearch} isClearable={false}
   inputValue={query} onInputChange={setQuery} menuIsOpen={open} onMenuOpen={()=>setOpen(true)} onMenuClose={()=>{setOpen(false);setQuery('');}}
   onChange={option=>{if(!option)return;setLocal(option.value);setInvalid(false);onChange?.({target:{value:option.value,name:name??''}});}}
   formatCreateLabel={input=>input}
   onCreateOption={input=>{const next=input.trim();if(!next)return;setLocal(next);setInvalid(false);setOpen(false);setQuery('');onChange?.({target:{value:next,name:name??''}});}}
   isOptionDisabled={option=>option.disabled} filterOption={({data},input)=>matchesOption(data,input)}
   menuPortalTarget={portal} menuPosition="fixed" menuPlacement="auto" maxMenuHeight={280} minMenuHeight={100} menuShouldScrollIntoView={false} captureMenuScroll={false}
   tabSelectsValue={false} blurInputOnSelect={false} escapeClearsValue={false}
   onKeyDown={event=>{if(open&&event.key==='Escape')event.stopPropagation();}}
   placeholder={canSearch?words.search:words.choose} noOptionsMessage={()=>words.empty} screenReaderStatus={({count})=>words.results(count)} ariaLiveMessages={live}
   formatGroupLabel={group=><span className="select-group-label">{group.label}<span>{group.options.filter(o=>matchesOption(o,query)).length}</span></span>}
   formatOptionLabel={(option,{context})=>context==='value'?(displayValue??option.label):<span className="select-option-content">
    {option.avatar&&<span className="select-avatar" aria-hidden="true">{option.avatar}</span>}
    {option.color&&<span className="select-color" style={{backgroundColor:option.color}} aria-hidden="true"/>}
    <span className="select-option-copy"><span>{option.label}</span>{option.detail&&<small>{option.detail}</small>}</span>
    {option.value===selected&&<Check size={15} className="select-check" aria-hidden="true"/>}
   </span>}
   components={{IndicatorSeparator:null,DropdownIndicator:()=> canSearch?<Search size={14} className="select-chevron" aria-hidden="true"/>:<ChevronDown size={14} className="select-chevron" aria-hidden="true"/>}}
   styles={{menuPortal:base=>{const viewport=typeof window==='undefined'?1024:window.innerWidth;const width=Math.min(Math.max(Number(base.width)||0,240),viewport-16);return {...base,zIndex:1000,width,left:Math.max(8,Math.min(Number(base.left)||0,viewport-width-8))};},menu:base=>({...base,marginTop:6,marginBottom:6})}}
  /></div>
 </div>;
}
