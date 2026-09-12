import type { UpdateRequest, UpdateSnapshot } from './contracts';

export function findOpenDuplicate(request: UpdateRequest, tasks: UpdateSnapshot[]) {
 const normalize=(title:string)=>title.normalize('NFKC').trim().replace(/\s+/g,' ').toLowerCase();
 return tasks.find(t=>t.task_id!==request.task_id && t.status!=='done' && normalize(t.task)===normalize(request.task));
}
