import 'server-only';
import { NextResponse } from 'next/server';
import { normalizeState } from './workspace-view';

/** Optional server-side connection to an already deployed hub for local frontend work. */
export async function forwardToHub(request: Request, body?: string): Promise<Response|null> {
 const base=process.env.HUB_API_URL;
 if(!base)return null;
 try{
  const incoming=new URL(request.url);const origin=new URL(base);
  if(!['http:','https:'].includes(origin.protocol)||origin.origin===incoming.origin)throw new Error('Invalid upstream configuration');
  const target=new URL(incoming.pathname+incoming.search,origin.origin);
  const response=await fetch(target,{method:body===undefined?'GET':'POST',headers:body===undefined?undefined:{'Content-Type':'application/json'},body,cache:'no-store',redirect:'error',signal:AbortSignal.timeout(12000)});
  const contentType=response.headers.get('content-type')??'';
  if(!contentType.includes('application/json'))throw new Error('Upstream did not return JSON');
  if(body===undefined&&response.ok)return NextResponse.json(normalizeState(await response.json()),{headers:{'Cache-Control':'no-store'}});
  return new Response(await response.text(),{status:response.status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
 }catch{
  return NextResponse.json({error:'The configured hub is unavailable. Try again shortly.'},{status:503,headers:{'Cache-Control':'no-store'}});
 }
}
