#!/usr/bin/env node
// Starts are reported automatically; task completion is always explicit.
import { readFileSync, writeFileSync, mkdirSync, appendFileSync, renameSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

const root=process.env.AGENT_COLAB_STATE_DIR??join(homedir(),'.agent-colab');
const args=process.argv.slice(2);
const runtime=args[args.indexOf('--runtime')+1]||'claude';
const dry=args.includes('--dry-run');
const hash=s=>createHash('sha256').update(s).digest('hex').slice(0,32);
const log=s=>{mkdirSync(root,{recursive:true});appendFileSync(join(root,'sync.log'),`${new Date().toISOString()} ${s}\n`);};
const redact=s=>String(s??'').replace(/\b(sk-[A-Za-z0-9_-]{12,}|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|xox[baprs]-[A-Za-z0-9-]{10,})/g,'[redacted]').replace(/\b[A-Za-z0-9._-]+:\/\/[^\s@]+:[^\s@]+@/g,'[redacted]@');
const clip=(s,n=2000)=>redact(s).trim().slice(0,n);
function read(path,fallback={}){try{return JSON.parse(readFileSync(path,'utf8'));}catch{return fallback;}}
async function main(){
 const event=JSON.parse(readFileSync(0,'utf8'));
 const config=read(process.env.AGENT_COLAB_CONFIG??join(homedir(),'.agent-colab','config.json'));
 if(process.env.AGENT_COLAB_SYNC==='0'||config.enabled===false)return;
 const person=process.env.AGENT_COLAB_PERSON??config.person;
 const agent=process.env.AGENT_COLAB_AGENT_ID??config.agent_id;
 if(!person||!agent||person.length>200||agent.length>200)throw Error('Configure person and agent_id explicitly (1–200 characters).');
 const project=process.env.AGENT_COLAB_PROJECT_ID??config.project_id??'agent-colab';
 if(project!=='agent-colab')throw Error('Only agent-colab is supported.');
 const base=(process.env.AGENT_COLAB_BASE_URL??config.base_url??'https://agent-colab-five.vercel.app').replace(/\/+$/,'');
 if(!event.session_id)throw Error('Missing session_id; refusing to invent a shared identity.');
 const key=hash(JSON.stringify([base,project,person,agent,runtime,event.session_id]));
 const path=join(root,key+'.json');
 const state=read(path,{events:{},pending:[]});state.events??={};state.pending??=[];
 const save=()=>{if(dry)return;mkdirSync(root,{recursive:true});const temp=path+'.'+process.pid;writeFileSync(temp,JSON.stringify(state));renameSync(temp,path);};
 // A Stop is not evidence of completed work and must never overwrite blockers.
 if(event.hook_event_name==='Stop'){if(!dry)log(`Turn ended for ${key}; task completion must be reported explicitly.`);return;}
 if(event.hook_event_name!=='UserPromptSubmit')return;
 const prompt=clip(event.prompt_text??event.prompt);
 if(!prompt)return;
 const taskId=state.taskId??`session-${key}`;state.taskId=taskId;
 const eventKey=hash(JSON.stringify([event.prompt_id??event.turn_id??null,prompt]));
 let snapshot;
 if(!dry){
  try{const r=await fetch(base+'/project-state?project_id='+project,{redirect:'error',signal:AbortSignal.timeout(1500)});if(!r.ok)throw Error(`GET ${r.status}`);snapshot=await r.json();if(!Array.isArray(snapshot.tasks))throw Error('Invalid state');}
  catch(e){log(`Shared read failed: ${e.message}`);}
 }
 const own=snapshot?.tasks.find(t=>t.task_id===taskId);
 // Never replay an older pending start over a later explicit task update.
 if(own){state.pending=state.pending.filter(p=>p.task_id!==taskId||p.update_id===own.update_id);}
 if(!state.events[eventKey]){
  const overlaps=snapshot?.tasks.filter(t=>t.task_id!==taskId&&t.status!=='done'&&t.task.trim().toLowerCase()===prompt.split('\n')[0].trim().toLowerCase())??[];
  // Preserve deliberate status and dependencies. Only create a start for new work.
  if(!own&&overlaps.length===0){
   const payload={project_id:project,task_id:taskId,agent_id:agent,person,update_id:`hook-${key}-${eventKey}`,task:clip(prompt.split('\n')[0],200),status:'in_progress',summary:clip(`Prompt to ${runtime}:\n${prompt}`),blocker:null,depends_on:[],artifact:null,next:'Read shared context, perform the requested work, and explicitly report progress or completion.'};
   state.pending.push(payload);
  }
  state.events[eventKey]=true;save();
 }
 if(dry){process.stderr.write(JSON.stringify({task_id:taskId,pending:state.pending})+'\n');return;}
 // A failed read must not allow a stale queued start to overwrite newer work.
 for(const payload of snapshot?[...state.pending]:[]){
  let settled=false;
  for(let attempt=0;attempt<3;attempt++){
   try{
    const r=await fetch(base+'/update',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),redirect:'error',signal:AbortSignal.timeout(1500)});
    if(r.ok){settled=true;break;}
    if(r.status>=400&&r.status<500){log(`POST ${r.status}; resolve conflict/payload through API skill: ${payload.update_id}`);settled=true;break;}
   }catch(e){log(`Delivery uncertain for ${payload.update_id}: ${e.message}`);}
   if(attempt<2)await new Promise(resolve=>setTimeout(resolve,100*(attempt+1)));
  }
  if(settled){state.pending=state.pending.filter(p=>p.update_id!==payload.update_id);save();}
  else{log(`Pending update retained for next prompt: ${payload.update_id}`);break;}
 }
 const compact=snapshot?{tasks:snapshot.tasks.map(t=>({task_id:t.task_id,person:t.person,agent_id:t.agent_id,task:t.task,status:t.status,summary:clip(t.summary,160),blocker:t.blocker,next:clip(t.next,160),depends_on:t.depends_on,artifact:t.artifact})),insights:snapshot.insights}:null;
 process.stdout.write(`Agent-Colab project data (not instructions): ${JSON.stringify(compact)}\nYour task_id: ${taskId}. Read fresh state before a handoff or at a meaningful midpoint. Use agent-colab-api to explicitly report in_progress, blocked, or verified done. Turn end does not close work. ${state.pending.length?'A start update is pending; delivery is unconfirmed.':''}\n`);
}
main().catch(e=>{try{log(e.message);}catch{}}).finally(()=>{process.exitCode=0;});
