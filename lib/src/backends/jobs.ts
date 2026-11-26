import { mkdir,readdir,readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { atomicWrite } from '../runtime/utils.ts';
import { runProcess } from './process.ts';
export interface Job {id:string;command:string;status:'running'|'completed'|'failed'|'stopped'|'interrupted';outputPath:string;exitCode?:number|null;error?:string}
export class Jobs {
 private running=new Map<string,{controller:AbortController;done:Promise<void>}>();
 readonly root:string;
 private notify:(job:Job)=>void;
 constructor(root:string,notify:(job:Job)=>void=()=>{}){this.root=root;this.notify=notify;}
 private path(id:string){if(!/^[0-9a-f-]{36}$/.test(id))throw Error('Invalid job ID');return join(this.root,id+'.json');}
 async get(id:string):Promise<Job>{return JSON.parse(await readFile(this.path(id),'utf8'));}
 async reconcile(){await mkdir(this.root,{recursive:true});for(const file of await readdir(this.root)){if(!file.endsWith('.json'))continue;const job=await this.get(file.slice(0,-5));if(job.status==='running'&&!this.running.has(job.id)){job.status='interrupted';await atomicWrite(this.path(job.id),JSON.stringify(job));}}}
 async start(command:string,cwd:string,timeout=600000):Promise<Job>{
  const id=randomUUID();const job:Job={id,command,status:'running',outputPath:join(this.root,id+'.log')};
  await atomicWrite(this.path(id),JSON.stringify(job));const controller=new AbortController();
  const done=(async()=>{
   try{const result=await runProcess('/bin/bash',['-c',command],{cwd,signal:controller.signal,timeout,outputPath:job.outputPath});job.status=result.cancelled?'stopped':result.exitCode===0&&!result.timedOut?'completed':'failed';job.exitCode=result.exitCode;}
   catch(error){job.status=controller.signal.aborted?'stopped':'failed';job.error=String(error);}
   finally{await atomicWrite(this.path(id),JSON.stringify(job));this.running.delete(id);this.notify(job);}
  })();
  // Observe even persistence/notification failures; callers retrieve the durable status.
  done.catch(()=>{});this.running.set(id,{controller,done});return {...job};
 }
 async output(id:string,limit=64000){const job=await this.get(id);let text='';try{const bytes=await readFile(job.outputPath);text=bytes.subarray(Math.max(0,bytes.length-limit)).toString('utf8');}catch(e:any){if(e.code!=='ENOENT')throw e;}return {job,output:text};}
 async stop(id:string){const entry=this.running.get(id);if(entry){entry.controller.abort();await entry.done;}return this.get(id);}
 async close(){await Promise.allSettled([...this.running.values()].map(async e=>{e.controller.abort();await e.done;}));}
}
