import { useCallback, useEffect, useRef, useState } from 'react';
import { nextWorkflow, parseWorkflowHash, workflowHash, type WorkflowTarget } from './workflow-navigation';

export function useWorkflowNavigation(workspaceId:string){
 const [route,setRoute]=useState(()=>parseWorkflowHash(window.location.hash,workspaceId));
 const [revision,setRevision]=useState(0),current=useRef(route);
 const navigate=useCallback((target:WorkflowTarget,replace=false)=>{
  const next={...nextWorkflow(current.current,target),workspaceId};
  current.current=next;setRoute(next);setRevision(n=>n+1);
  // Keep authentication callbacks in the search untouched, and store no tokens.
  const hash=workflowHash(next);
  if(window.location.hash!==hash)window.history[replace?'replaceState':'pushState'](null,'',window.location.pathname+window.location.search+hash);
 },[workspaceId]);
 useEffect(()=>{
  const restore=()=>{const next=parseWorkflowHash(window.location.hash,workspaceId);current.current=next;setRoute(next);setRevision(n=>n+1);};
  window.addEventListener('popstate',restore);window.addEventListener('hashchange',restore);
  return()=>{window.removeEventListener('popstate',restore);window.removeEventListener('hashchange',restore);};
 },[workspaceId]);
 return {route,navigate,revision};
}
