import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {stripTypeScriptTypes} from 'node:module';
// Execute the actual relay with framework-only imports replaced by small adapters.
const source=readFileSync('lib/hub-proxy.ts','utf8').replace(/^import .*;\n/gm,'');
const js=stripTypeScriptTypes(source);
const {forwardToHub}=await import('data:text/javascript;base64,'+Buffer.from("const NextResponse={json:(body,init)=>Response.json(body,init)};const normalizeState=s=>s;const findOpenDuplicate=()=>undefined;\n"+js).toString('base64'));
test('DELETE relays verb, confirmation and caller token, and preserves upstream rejection',async()=>{
 const oldBase=process.env.HUB_API_URL;const original=globalThis.fetch;process.env.HUB_API_URL='https://mock-hub.example';let calls=[];
 try{globalThis.fetch=async(url,init)=>{calls.push({url:String(url),...init});return Response.json({error:'invalid token'},{status:403});};
 const response=await forwardToHub(new Request('http://localhost/project-state?project_id=agent-colab&confirm=agent-colab',{method:'DELETE',headers:{'x-admin-token':'test-only'}}));
 assert.equal(response.status,403);assert.equal(calls.length,1);assert.equal(calls[0].method,'DELETE');assert.equal(calls[0].headers['x-admin-token'],'test-only');assert.equal(calls[0].url,'https://mock-hub.example/project-state?project_id=agent-colab&confirm=agent-colab');
 globalThis.fetch=async()=>Response.json({project_id:'agent-colab',deleted_updates:0,deleted_tasks:0});const success=await forwardToHub(new Request('http://localhost/project-state?project_id=agent-colab&confirm=agent-colab',{method:'DELETE'}));assert.equal((await success.json()).deleted_updates,0);
 }finally{globalThis.fetch=original;if(oldBase===undefined)delete process.env.HUB_API_URL;else process.env.HUB_API_URL=oldBase;}
});
