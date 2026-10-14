import {createContext,useContext,useEffect,useState,useSyncExternalStore,type ReactNode} from 'react';
import {Check,Download,RefreshCw,WifiOff} from 'lucide-react';
import {Dialog} from './components';
import {useI18n} from './i18n';
import {createPwaController,initialPwaState,type PwaController,type PwaState} from './pwa-client';
import {pwaCopy} from './pwa-copy';
import './pwa.css';

const Context=createContext<{state:PwaState;controller:PwaController|null}>({state:initialPwaState,controller:null});
const noopSubscribe=()=>()=>{};
const serverSnapshot=()=>initialPwaState;
export function PwaProvider({children}:{children:ReactNode}){
 const [controller]=useState(()=>{
  if(typeof window==='undefined')return null;
  const display=window.matchMedia('(display-mode: standalone)');
  return createPwaController({events:window,display,serviceWorker:'serviceWorker'in navigator?navigator.serviceWorker:undefined,
   online:()=>navigator.onLine,standalone:()=>display.matches||!!(navigator as Navigator&{standalone?:boolean}).standalone,
   enabled:import.meta.env.PROD&&window.isSecureContext,base:import.meta.env.BASE_URL,reload:()=>window.location.reload()});
 });
 const state=useSyncExternalStore(controller?.subscribe||noopSubscribe,controller?.getSnapshot||serverSnapshot,serverSnapshot);
 useEffect(()=>controller?.start(),[controller]);
 return <Context.Provider value={{state,controller}}>{children}<NetworkStatus/></Context.Provider>;
}
function NetworkStatus(){const{state}=useContext(Context),{locale}=useI18n();return state.offline?<div className="pwa-network" role="status"><WifiOff size={16} aria-hidden="true"/><span>{pwaCopy(locale).offline}</span></div>:null;}
function installPlatform(){
 if(typeof navigator==='undefined')return 'browser';
 if(/iPad|iPhone|iPod/.test(navigator.userAgent)||(/Mac/.test(navigator.platform)&&navigator.maxTouchPoints>1))return 'ios';
 return /Mac/.test(navigator.platform)?'mac':'browser';
}
export function PwaInstallLink(){
 const{state,controller}=useContext(Context),{locale}=useI18n(),copy=pwaCopy(locale),[open,setOpen]=useState(false);
 if(state.installed)return null;
 const feedback=state.notice==='dismissed'||state.notice==='installFailed'?copy[state.notice]:'';
 return <><button type="button" className="text-button pwa-install-link" onClick={()=>setOpen(true)}><Download size={14} aria-hidden="true"/>{copy.install}</button>{open&&<Dialog title={copy.dialog} onClose={()=>setOpen(false)} busy={state.installBusy} description={copy.description}>
  <div className="pwa-install-body"><img src={`${import.meta.env.BASE_URL}icons/icon-192.png`} width="64" height="64" alt=""/><p>{state.canPrompt?copy.native:copy[installPlatform()]}</p><p className="muted">{copy.onlineOnly}</p>{feedback&&<p role="status">{feedback}</p>}
  {state.canPrompt&&<button type="button" className="button primary" disabled={state.installBusy} onClick={()=>void controller?.install()}><Download size={16} aria-hidden="true"/>{state.installBusy?copy.working:copy.install}</button>}
  </div></Dialog>}</>;
}
export function PwaSettings(){
 const{state,controller}=useContext(Context),{locale}=useI18n(),copy=pwaCopy(locale);
 const notice=state.notice==='upToDate'||state.notice==='checkFailed'||state.notice==='updateFailed'?copy[state.notice]:'';
 return <section className="panel pwa-settings"><div className="panel-heading"><div><p className="eyebrow">VAVE.LOG</p><h2>{copy.title}</h2></div><img src={`${import.meta.env.BASE_URL}icons/icon-192.png`} width="40" height="40" alt=""/></div><p className="muted">{copy.description}</p>
  <div className="button-row">{state.installed?<span className="pwa-installed"><Check size={15} aria-hidden="true"/>{copy.installed}</span>:<PwaInstallLink/>}
  {state.workerStatus==='ready'&&<button type="button" className="text-button" disabled={state.checking||state.offline||state.applying} onClick={()=>void controller?.checkForUpdate()}>{state.checking?copy.working:copy.check}</button>}</div>
  <p className="tiny muted">{copy.onlineOnly}</p>
  {state.updateReady&&<div className="pwa-update"><p>{copy.saveFirst}</p><button type="button" className="button secondary small" disabled={state.applying||state.offline} onClick={()=>controller?.activateUpdate()}><RefreshCw size={15} aria-hidden="true"/>{state.applying?copy.working:copy.update}</button></div>}
  {notice&&<p className="tiny" role="status">{notice}</p>}
  {state.workerStatus==='unavailable'&&<p className="tiny muted">{copy.unavailable}</p>}
 </section>;
}
