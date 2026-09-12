import 'server-only';
import { NextResponse } from 'next/server';
import { findOpenDuplicate } from './task-validation';
import { normalizeState } from './workspace-view';

/** Optional server-side connection to an already deployed hub for local frontend work. */
export async function forwardToHub(request: Request, body?: string): Promise<Response|null> {
 const base=process.env.HUB_API_URL;
 if(!base)return null;
 try{
  const incoming=new URL(request.url);const origin=new URL(base);
  if(!['http:','https:'].includes(origin.protocol)||origin.origin===incoming.origin)throw new Error('Invalid upstream configuration');
  const target=new URL(incoming.pathname+incoming.search,origin.origin);
  if(body!==undefined){
   const update=JSON.parse(body);
   const check=await fetch(new URL('/project-state?project_id=agent-colab',origin.origin),{cache:'no-store',redirect:'error',signal:AbortSignal.timeout(12000)});
   if(!check.ok)throw new Error('Cannot validate current state');
   const state=normalizeState(await check.json());
   // Existing IDs go upstream so retry idempotency and ownership remain authoritative.
   if(!state.tasks.some(t=>t.task_id===update.task_id)){
    const duplicate=findOpenDuplicate(update,state.tasks);
    if(duplicate)return NextResponse.json({error:'This work is already open. Reuse your existing task_id or coordinate with its owner.',code:'duplicate_task',existing_task:duplicate},{status:409});
   }
  }
  const response=await fetch(target,{method:body===undefined?'GET':'POST',headers:body===undefined?undefined:{'Content-Type':'application/json'},body,cache:'no-store',redirect:'error',signal:AbortSignal.timeout(12000)});
  const contentType=response.headers.get('content-type')??'';
  if(!contentType.includes('application/json'))throw new Error('Upstream did not return JSON');
  if(body===undefined&&response.ok)return NextResponse.json(normalizeState(await response.json()),{headers:{'Cache-Control':'no-store'}});
  return new Response(await response.text(),{status:response.status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
 }catch{
  return NextResponse.json({error:'The configured hub is unavailable. Try again shortly.'},{status:503,headers:{'Cache-Control':'no-store'}});
 }
}
