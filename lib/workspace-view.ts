import type { ProjectStateResponse, UpdateSnapshot } from './contracts';
export type Point = { x: number; y: number };
export type Member = { id: string; name: string; color: string; focus: string; initial: Point };
export type AgentNode = { id: string; updateId: string; agentId: string; person: string; name: string; kind: string; task: string; description: string; next: string; status: 'Working'|'Waiting'|'Done'|'Planned'; time: string; timestamp: string; initial: Point; dependsOn: string[]; artifact: string|null; blocker: string|null };
export function relativeTime(timestamp: string, now=Date.now()) {
 const seconds=Math.max(0,Math.floor((now-Date.parse(timestamp))/1000));
 if(!Number.isFinite(seconds))return 'Time unavailable';
 if(seconds<60)return 'Just now';if(seconds<3600)return `${Math.floor(seconds/60)} min ago`;
 if(seconds<86400)return `${Math.floor(seconds/3600)} hr ago`;return `${Math.floor(seconds/86400)} days ago`;
}
export function normalizeState(input: unknown): ProjectStateResponse {
 if(!input||typeof input!=='object')throw new Error('The workspace returned an invalid response.');
 const state=input as ProjectStateResponse;
 if(state.project_id!=='agent-colab'||!Array.isArray(state.tasks)||!Array.isArray(state.recent_updates)||!Array.isArray(state.insights))throw new Error('The workspace returned an invalid response.');
 const snapshot=(raw:UpdateSnapshot)=>{
  const timestamp=raw.timestamp||(raw as UpdateSnapshot & {created_at?:string}).created_at;
  if(!timestamp||!Number.isFinite(Date.parse(timestamp))||typeof raw.task_id!=='string'||typeof raw.agent_id!=='string'||typeof raw.person!=='string'||typeof raw.summary!=='string'||typeof raw.task!=='string'||!Array.isArray(raw.depends_on)||!['todo','in_progress','blocked','done'].includes(raw.status))throw new Error('The workspace returned an invalid task.');
  return {...raw,timestamp};
 };
 return {...state,tasks:state.tasks.map(snapshot),recent_updates:state.recent_updates.map(snapshot)};
}
export function buildWorkspace(state:ProjectStateResponse|null) {
 const tasks=state?.tasks??[];
 const names=[...new Set(tasks.map(t=>t.person))].sort();
 const rowHeight=Math.max(440,...names.map(name=>400+Math.ceil(new Set(tasks.filter(t=>t.person===name&&t.status!=='done').map(t=>t.agent_id)).size/2)*130));
 const members:Member[]=names.map((name,i)=>({id:name,name,color:['lilac','mint','peach'][i%3],focus:`${tasks.filter(t=>t.person===name&&t.status!=='done').length} open tasks`,initial:{x:300+(i%3)*650,y:285+Math.floor(i/3)*rowHeight}}));
 const fromSnapshot=(s:UpdateSnapshot):AgentNode=>{
  const person=members.find(m=>m.id===s.person);const siblings=tasks.filter(t=>t.person===s.person).sort((a,b)=>a.task_id.localeCompare(b.task_id));const index=Math.max(0,siblings.findIndex(t=>t.task_id===s.task_id));
  const match=s.agent_id.toLowerCase().match(/chatgpt|claude|codex|cursor|openclaw|hermes|grok/);const kind=match?.[0]??'unknown';
  const titles:Record<string,string>={chatgpt:'ChatGPT',claude:'Claude',codex:'Codex',cursor:'Cursor',openclaw:'OpenClaw',hermes:'Hermes Agent',grok:'Grok'};
  return {id:s.task_id,updateId:s.update_id,agentId:s.agent_id,person:s.person,name:titles[kind]??s.agent_id,kind,task:s.task,description:s.summary,next:s.next,status:({todo:'Planned',in_progress:'Working',blocked:'Waiting',done:'Done'} as const)[s.status],time:relativeTime(s.timestamp),timestamp:s.timestamp,initial:{x:(person?.initial.x??270)+(index%2===0?155:-155),y:(person?.initial.y??285)+150+Math.floor(index/2)*130},dependsOn:s.depends_on,artifact:s.artifact,blocker:s.blocker};
 };
 const agents=tasks.filter(t=>t.status!=='done').map(fromSnapshot);
 const groups=new Map<string,AgentNode[]>();
 for(const a of agents){const key=JSON.stringify([a.person,a.agentId]);groups.set(key,[...(groups.get(key)??[]),a]);}
 const canvasAgents=[...groups.values()].map(openTasks=>{
  openTasks.sort((a,b)=>Date.parse(b.timestamp)-Date.parse(a.timestamp));
  const representative=openTasks[0];
  const person=members.find(m=>m.id===representative.person)!;
  const agentIds=[...new Set(agents.filter(a=>a.person===representative.person).map(a=>a.agentId))].sort();
  const index=agentIds.indexOf(representative.agentId);
  return {...representative,initial:{x:person.initial.x+(index%2===0?155:-155),y:person.initial.y+150+Math.floor(index/2)*130},openTasks};
 });
 // Resolve task dependencies to their owning agent's single visible node.
 const taskPositions=Object.fromEntries(canvasAgents.flatMap(a=>a.openTasks.map(t=>[t.id,a.id])));
 return {members,agents,canvasAgents,taskPositions,activity:(state?.recent_updates??[]).map(fromSnapshot)};
}
