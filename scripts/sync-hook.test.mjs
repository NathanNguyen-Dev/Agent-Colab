import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,readdirSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawn} from 'node:child_process';
import {createServer} from 'node:http';
const script=resolve('.agents/skills/agent-colab-sync/scripts/sync-hook.mjs');
test('hooks read context, retry stable starts, preserve blocked work, and never auto-complete',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'colab-hook-'));let tasks=[],posts=[],fail=2,reads=0;
 const server=createServer(async(req,res)=>{res.setHeader('Content-Type','application/json');if(req.method==='GET'){reads++;res.end(JSON.stringify({tasks,insights:[]}));return;}let raw='';for await(const part of req)raw+=part;const p=JSON.parse(raw);posts.push(p);if(fail-->0){res.statusCode=503;res.end('{}');return;}tasks=[{...p,sequence:'1',timestamp:new Date().toISOString()}];res.statusCode=201;res.end('{}');});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const config=join(dir,'config.json');writeFileSync(config,JSON.stringify({person:'Test human',agent_id:'test-codex',base_url:`http://127.0.0.1:${server.address().port}`}));
 const run=(event,extra=[])=>new Promise((resolve,reject)=>{const c=spawn(process.execPath,[script,'--runtime','codex',...extra],{env:{...process.env,AGENT_COLAB_CONFIG:config,AGENT_COLAB_STATE_DIR:dir,AGENT_COLAB_SYNC:'1'}});let out='';c.stdout.on('data',b=>out+=b);c.on('error',reject);c.on('exit',code=>code===0?resolve(out):reject(Error(String(code))));c.stdin.end(JSON.stringify(event));});
 const prompt={session_id:'isolated-session',hook_event_name:'UserPromptSubmit',prompt_id:'one',prompt:'Verify lifecycle'};
 try{
  const out=await run(prompt);assert(out.includes('Your task_id:'));assert.equal(reads,1);assert.equal(posts.length,3);assert.deepEqual(posts[0],posts[2]);
  await run(prompt);assert.equal(posts.length,3,'replayed prompt does not post twice');
  tasks[0]={...tasks[0],status:'blocked',blocker:'Needs review',depends_on:['dependency']};
  await run({...prompt,hook_event_name:'Stop'});assert.equal(posts.length,3);assert.equal(tasks[0].status,'blocked');
  const context=await run({...prompt,prompt_id:'two',prompt:'Continue work'});assert(context.includes('Needs review'));assert(context.includes('blocked'));assert.equal(posts.length,3);
  const before=readdirSync(dir).map(n=>[n,readFileSync(join(dir,n),'utf8')]);await run({...prompt,session_id:'dry'},['--dry-run']);assert.deepEqual(readdirSync(dir).map(n=>[n,readFileSync(join(dir,n),'utf8')]),before);
  tasks=[];fail=10;await run({...prompt,session_id:'outage'});const pending=readdirSync(dir).filter(n=>n!== 'config.json'&&n.endsWith('.json')).flatMap(n=>JSON.parse(readFileSync(join(dir,n))).pending);assert.equal(pending.length,1);const id=pending[0].update_id;
  fail=0;await run({...prompt,session_id:'outage'});assert.equal(posts.at(-1).update_id,id);assert.equal(tasks[0].status,'in_progress');
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));rmSync(dir,{recursive:true,force:true});}
});
