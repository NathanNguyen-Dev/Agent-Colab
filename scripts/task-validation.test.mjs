import test from 'node:test';
import assert from 'node:assert/strict';
import {findOpenDuplicate} from '../lib/task-validation.ts';
const task={task_id:'existing',task:'Build greeting API',status:'in_progress',agent_id:'backend',person:'Khang'};
test('rejects equivalent open titles including across owners',()=>{assert.equal(findOpenDuplicate({...task,task_id:'new',person:'Nathan',task:' BUILD  greeting API '},[task]),task);});
test('allows stable task progress and new work after completion',()=>{assert.equal(findOpenDuplicate(task,[task]),undefined);assert.equal(findOpenDuplicate({...task,task_id:'new'},[{...task,status:'done'}]),undefined);assert.equal(findOpenDuplicate({...task,task_id:'new',task:'Build greeting UI'},[task]),undefined);});
