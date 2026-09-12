'use client';
import { useRef, useState } from 'react';
import { Trash2, X } from 'lucide-react';

export default function ResetProject({onReset}:{onReset:()=>void}) {
 const dialog=useRef<HTMLDialogElement>(null);
 const [token,setToken]=useState('');const [confirmation,setConfirmation]=useState('');
 const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [notice,setNotice]=useState('');
 function close(){if(busy)return;dialog.current?.close();setToken('');setConfirmation('');setError('');}
 async function reset(event:React.FormEvent){
  event.preventDefault();if(busy||confirmation!=='agent-colab'||!token)return;
  setBusy(true);setError('');
  try{
   const response=await fetch('/project-state?project_id=agent-colab&confirm=agent-colab',{method:'DELETE',headers:{'x-admin-token':token},signal:AbortSignal.timeout(15000)});
   const data=await response.json();
   if(!response.ok){
    if(response.status===403)throw new Error('The admin token was not accepted. Check it and try again.');
    if(response.status===503&&String(data.error).includes('not configured'))throw new Error('Reset is not enabled. Configure AGENT_COLAB_ADMIN_TOKEN on the hub deployment first.');
    throw new Error('Reset could not be confirmed. Refresh the project before trying again.');
   }
   setNotice(`Cleared ${data.deleted_updates} log events and ${data.deleted_tasks} tasks from Agent-Colab.`);
   dialog.current?.close();setConfirmation('');onReset();
  }catch(e){setError(e instanceof Error&&e.name!=='TimeoutError'?e.message:'Reset could not be confirmed. Refresh the project before trying again.');}
  finally{setToken('');setBusy(false);}
 }
 return <div className="reset-project"><button className="reset-open" onClick={()=>{setNotice('');dialog.current?.showModal();}}><Trash2 size={14}/>Clear logs…</button>{notice&&<p role="status">{notice}</p>}
 <dialog ref={dialog} className="reset-dialog" aria-labelledby="reset-title" onCancel={e=>{e.preventDefault();close();}}>
 <form onSubmit={reset}><button type="button" className="reset-close" aria-label="Close reset dialog" disabled={busy} onClick={close}><X size={18}/></button><Trash2 size={24}/><h2 id="reset-title">Reset Agent-Colab?</h2>
 <p>This permanently deletes <strong>all log history and all tasks</strong>, including active work, for everyone in this project. It cannot be undone.</p><p className="reset-note">Logs and task state share the same event store. Browser-local Plan.md and Context.md drafts remain. Connected agents can post new work after the reset.</p>
 <label>Admin token<input autoFocus type="password" autoComplete="off" value={token} disabled={busy} onChange={e=>setToken(e.target.value)} required/></label>
 <label>Type <strong>agent-colab</strong> to confirm<input autoComplete="off" spellCheck={false} value={confirmation} disabled={busy} onChange={e=>setConfirmation(e.target.value)} required/></label>
 {error&&<p className="reset-error" role="alert">{error}</p>}<div className="reset-actions"><button type="button" onClick={close} disabled={busy}>Cancel</button><button className="reset-confirm" type="submit" disabled={busy||confirmation!=='agent-colab'||!token}>{busy?'Resetting…':'Delete all logs and tasks'}</button></div></form>
 </dialog></div>;
}
