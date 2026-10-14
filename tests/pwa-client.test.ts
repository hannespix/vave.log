import {describe,expect,it,vi} from 'vitest';
import {createPwaController,type InstallPromptEvent,type PwaEnvironment} from '../src/web/pwa-client';
function fixture(options:{online?:boolean;standalone?:boolean;failRegistration?:boolean}={}){
 const events=new EventTarget(),display=new EventTarget(),worker=Object.assign(new EventTarget(),{state:'installed',postMessage:vi.fn()});
 const registration=Object.assign(new EventTarget(),{waiting:null as unknown,installing:null as unknown,update:vi.fn(async()=>{})});
 const serviceWorker=Object.assign(new EventTarget(),{controller:{},register:vi.fn(async()=>{if(options.failRegistration)throw Error('blocked');return registration;})});
 const reload=vi.fn();let online=options.online??true;
 const env={events,display,serviceWorker,online:()=>online,standalone:()=>options.standalone??false,reload,enabled:true} as unknown as PwaEnvironment;
 const controller=createPwaController(env);
 return {controller,events,display,worker,registration,serviceWorker,reload,setOnline:(value:boolean)=>{online=value;events.dispatchEvent(new Event(value?'online':'offline'));}};
}
async function settle(){await Promise.resolve();await Promise.resolve();}
describe('PWA browser lifecycle',()=>{
 it('does not interrupt normal browsing when registration is unavailable',async()=>{const f=fixture({failRegistration:true});const stop=f.controller.start();await settle();expect(f.controller.getSnapshot().workerStatus).toBe('unavailable');expect(f.reload).not.toHaveBeenCalled();stop();});
 it('tracks connectivity and installation with removable listeners',async()=>{const f=fixture();const stop=f.controller.start();await settle();f.setOnline(false);expect(f.controller.getSnapshot().offline).toBe(true);f.events.dispatchEvent(new Event('appinstalled'));expect(f.controller.getSnapshot().installed).toBe(true);stop();f.setOnline(true);expect(f.controller.getSnapshot().offline).toBe(true);});
 it('prompts only after a user action and consumes a dismissed browser prompt once',async()=>{
  const f=fixture(),stop=f.controller.start();const event=Object.assign(new Event('beforeinstallprompt',{cancelable:true}),{prompt:vi.fn(async()=>{}),userChoice:Promise.resolve({outcome:'dismissed'})}) as unknown as InstallPromptEvent;
  f.events.dispatchEvent(event);expect(event.defaultPrevented).toBe(true);expect(event.prompt).not.toHaveBeenCalled();expect(f.controller.getSnapshot().canPrompt).toBe(true);
  await Promise.all([f.controller.install(),f.controller.install()]);expect(event.prompt).toHaveBeenCalledTimes(1);expect(f.controller.getSnapshot()).toMatchObject({installed:false,canPrompt:false,notice:'dismissed'});stop();
 });
 it('never reloads for an unsolicited controller change; an explicit update reloads only its initiating tab',async()=>{
  const f=fixture();f.registration.waiting=f.worker;const stop=f.controller.start();await settle();expect(f.controller.getSnapshot().updateReady).toBe(true);
  f.serviceWorker.dispatchEvent(new Event('controllerchange'));expect(f.reload).not.toHaveBeenCalled();
  f.controller.activateUpdate();expect(f.worker.postMessage).toHaveBeenCalledWith({type:'VAVE_ACTIVATE_UPDATE'});expect(f.reload).not.toHaveBeenCalled();
  f.serviceWorker.dispatchEvent(new Event('controllerchange'));expect(f.reload).toHaveBeenCalledTimes(1);f.serviceWorker.dispatchEvent(new Event('controllerchange'));expect(f.reload).toHaveBeenCalledTimes(1);stop();
 });
 it('reports delayed updates only after installation and handles failed manual checks',async()=>{
  const f=fixture(),stop=f.controller.start();await settle();f.worker.state='installing';f.registration.installing=f.worker;f.registration.dispatchEvent(new Event('updatefound'));expect(f.controller.getSnapshot().updateReady).toBe(false);
  f.worker.state='installed';f.registration.waiting=f.worker;f.worker.dispatchEvent(new Event('statechange'));expect(f.controller.getSnapshot().updateReady).toBe(true);
  f.registration.update.mockRejectedValueOnce(Error('offline'));await f.controller.checkForUpdate();expect(f.controller.getSnapshot().notice).toBe('checkFailed');stop();
 });
 it('removes an obsolete update action when another tab activates the waiting worker',async()=>{
  const f=fixture();f.registration.waiting=f.worker;const stop=f.controller.start();await settle();expect(f.controller.getSnapshot().updateReady).toBe(true);
  f.registration.waiting=null;f.serviceWorker.dispatchEvent(new Event('controllerchange'));
  expect(f.controller.getSnapshot().updateReady).toBe(false);expect(f.reload).not.toHaveBeenCalled();stop();
 });
 it('ignores registration completion after cleanup and can restart in Strict Mode',async()=>{
  const f=fixture();const stop=f.controller.start();stop();await settle();expect(f.controller.getSnapshot().workerStatus).toBe('starting');const stop2=f.controller.start();await settle();expect(f.controller.getSnapshot().workerStatus).toBe('ready');stop2();
 });
});
