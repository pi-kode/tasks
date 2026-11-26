import {test} from 'node:test';import assert from 'node:assert/strict';import install from '../lib/src/features/tasks.ts';import {harness} from './helper.ts';
test('task dependency cycles, readiness, metadata merge, deletion and TodoWrite',async t=>{
 const h=await harness(install);t.after(()=>h.close());
 await h.call('TaskCreate',{subject:'first',description:'one',metadata:{keep:1}});await h.call('TaskCreate',{subject:'second',description:'two'});
 await h.call('TaskUpdate',{taskId:'2',addBlockedBy:['1']});await assert.rejects(h.call('TaskUpdate',{taskId:'1',addBlockedBy:['2']}),/cycle/);
 await assert.rejects(h.call('TaskUpdate',{taskId:'2',status:'completed'}),/Blocked/);
 await h.call('TaskUpdate',{taskId:'1',metadata:{extra:2}});assert.deepEqual(h.runtime.state.tasks['1'].metadata,{keep:1,extra:2});
 await h.call('TaskUpdate',{taskId:'1',status:'deleted'});assert.deepEqual(h.runtime.state.tasks['2'].blockedBy,[]);
 await h.call('TodoWrite',{todos:[{content:'final',activeForm:'Finishing',status:'in_progress'}]});assert.equal(Object.values(h.runtime.state.tasks).length,1);
});
test('background output retained, failed status, stop and startup reconciliation',async t=>{
 const h=await harness(install);t.after(()=>h.close());await h.emit('session_start');
 const started=await h.call('TaskRun',{command:'printf hello; exit 3'});const id=started.details.job.id;
 const output=await h.call('TaskOutput',{task_id:id,block:true,timeout:5000});assert.equal(output.details.job.status,'failed');assert.match(output.details.output,/hello/);
 const sleeping=await h.call('TaskRun',{command:'sleep 30'});const stop=await h.call('TaskStop',{task_id:sleeping.details.job.id});assert.equal(stop.details.job.status,'stopped');
 await assert.rejects(h.call('TaskOutput',{task_id:'../../secret'}),/Invalid/);
});
test('startup marks orphaned job records interrupted',async t=>{
 const {Jobs}=await import('../lib/src/backends/jobs.ts');const {mkdir,writeFile}=await import('node:fs/promises');const {join}=await import('node:path');
 const h=await harness(install);t.after(()=>h.close());const root=join(h.root,'orphaned');await mkdir(root);
 const id='12345678-1234-1234-1234-123456789012';await writeFile(join(root,id+'.json'),JSON.stringify({id,command:'lost',status:'running',outputPath:join(root,'output')}));
 const registry=new Jobs(root);await registry.reconcile();assert.equal((await registry.get(id)).status,'interrupted');
});
test('todo UI updates with progress and clears after deletion',async t=>{
 const h=await harness(install);t.after(()=>h.close());
 const theme={fg:(_color:string,text:string)=>text,bold:(text:string)=>text};
 let widget:any;h.ctx.ui.setWidget=(key:string,content:any)=>{assert.equal(key,'compat-todos');widget=content;};
 const lines=()=>typeof widget==='function'?widget({},theme).render(80).join('\n'):undefined;
 h.runtime.status(h.ctx);assert.equal(widget,undefined);
 const result=await h.call('TodoWrite',{todos:[{content:'Build UI',activeForm:'Building UI',status:'in_progress'}]});
 assert.match(result.content[0].text,/→ #1 Build UI/);assert.match(lines()!,/Tasks 0\/1/);assert.match(lines()!,/▶ Build UI/);
 await h.call('TaskUpdate',{taskId:'1',status:'completed'});assert.match(lines()!,/✔ Build UI/);assert.match(lines()!,/Tasks 1\/1/);
 await h.call('TaskUpdate',{taskId:'1',status:'deleted'});assert.equal(widget,undefined);
});
test('TodoWrite renumbers items from 1 on every call',async t=>{
 const h=await harness(install);t.after(()=>h.close());
 await h.call('TodoWrite',{todos:[{content:'a',activeForm:'A',status:'pending'},{content:'b',activeForm:'B',status:'pending'}]});
 const again=await h.call('TodoWrite',{todos:[{content:'c',activeForm:'C',status:'in_progress'}]});
 assert.deepEqual(Object.keys(h.runtime.state.tasks),['1']);assert.equal(h.runtime.state.nextTask,2);assert.match(again.content[0].text,/→ #1 c/);
});
