export interface InstallPromptEvent extends Event {
 prompt():Promise<void>;
 userChoice:Promise<{outcome:'accepted'|'dismissed'}>;
}
export type PwaNotice='none'|'dismissed'|'installFailed'|'upToDate'|'checkFailed'|'updateFailed';
export interface PwaState {
 installed:boolean;canPrompt:boolean;offline:boolean;
 workerStatus:'unsupported'|'starting'|'ready'|'unavailable';
 updateReady:boolean;checking:boolean;applying:boolean;installBusy:boolean;notice:PwaNotice;
}
export interface PwaEnvironment {
 events:EventTarget;display:EventTarget;serviceWorker?:ServiceWorkerContainer;
 online:()=>boolean;standalone:()=>boolean;reload:()=>void;enabled:boolean;
 /** App base path ('/', or '/<repo>/' on a GitHub Pages project site). */
 base?:string;
}
export const initialPwaState:PwaState={installed:false,canPrompt:false,offline:false,workerStatus:'unsupported',updateReady:false,checking:false,applying:false,installBusy:false,notice:'none'};

/** Browser events stay outside React so updates cannot accidentally reload another tab. */
export function createPwaController(env:PwaEnvironment){
 let state:PwaState={...initialPwaState,installed:env.standalone(),offline:!env.online()};
 let prompt:InstallPromptEvent|undefined,registration:ServiceWorkerRegistration|undefined;
 let generation=0,updateTimeout:ReturnType<typeof setTimeout>|undefined;
 const subscribers=new Set<()=>void>();
 function set(patch:Partial<PwaState>){state={...state,...patch};subscribers.forEach(notify=>notify());}
 function waiting(){set({updateReady:!!registration?.waiting});}
 return {
  getSnapshot:()=>state,
  subscribe:(notify:()=>void)=>{subscribers.add(notify);return()=>{subscribers.delete(notify);};},
  start(){
   const current=++generation,cleanups:(()=>void)[]=[];
   const listen=(target:EventTarget,name:string,handler:(event:Event)=>void)=>{target.addEventListener(name,handler);cleanups.push(()=>target.removeEventListener(name,handler));};
   set({offline:!env.online(),installed:env.standalone()||state.installed});
   listen(env.events,'online',()=>set({offline:false}));listen(env.events,'offline',()=>set({offline:true}));
   listen(env.events,'beforeinstallprompt',event=>{event.preventDefault();prompt=event as InstallPromptEvent;set({canPrompt:true,notice:'none'});});
   listen(env.events,'appinstalled',()=>{prompt=undefined;set({installed:true,canPrompt:false,notice:'none'});});
   listen(env.display,'change',()=>{if(env.standalone())set({installed:true,canPrompt:false});});
   if(env.enabled&&env.serviceWorker){
    set({workerStatus:'starting'});
    listen(env.serviceWorker,'controllerchange',()=>{
     if(!state.applying){waiting();return;}
     clearTimeout(updateTimeout);set({applying:false,updateReady:false});env.reload();
    });
    env.serviceWorker.register(`${env.base??'/'}sw.js`,{scope:env.base??'/',updateViaCache:'none'}).then(value=>{
     if(current!==generation)return;
     registration=value;set({workerStatus:'ready'});waiting();
     const watch=()=>{const worker=value.installing;if(!worker)return;const changed=()=>{
      if(worker.state==='installed')waiting();
      if(worker.state==='redundant'&&state.applying){clearTimeout(updateTimeout);set({applying:false,notice:'updateFailed'});}
     };listen(worker,'statechange',changed);changed();};
     listen(value,'updatefound',watch);watch();
    }).catch(()=>{if(current===generation)set({workerStatus:'unavailable'});});
   }
   return()=>{generation++;cleanups.forEach(cleanup=>cleanup());clearTimeout(updateTimeout);};
  },
  async install(){
   const pending=prompt;if(!pending||state.installBusy)return;
   prompt=undefined;set({canPrompt:false,installBusy:true,notice:'none'});
   try{await pending.prompt();const choice=await pending.userChoice;set({notice:choice.outcome==='dismissed'?'dismissed':'none'});}
   catch{set({notice:'installFailed'});}
   finally{set({installBusy:false});}
  },
  async checkForUpdate(){
   if(!registration||state.checking)return;
   set({checking:true,notice:'none'});
   try{await registration.update();waiting();set({notice:registration.waiting||registration.installing?'none':'upToDate'});}
   catch{set({notice:'checkFailed'});}
   finally{set({checking:false});}
  },
  activateUpdate(){
   if(!registration?.waiting||state.applying)return;
   set({applying:true,notice:'none'});
   updateTimeout=setTimeout(()=>set({applying:false,notice:'updateFailed'}),15000);
   // oxlint-disable-next-line unicorn/require-post-message-target-origin -- ServiceWorker.postMessage kennt kein targetOrigin.
   try{registration.waiting.postMessage({type:'VAVE_ACTIVATE_UPDATE'});}
   catch{clearTimeout(updateTimeout);set({applying:false,notice:'updateFailed'});}
  },
 };
}
export type PwaController=ReturnType<typeof createPwaController>;
