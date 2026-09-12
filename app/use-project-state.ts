'use client';
import { useCallback, useEffect, useState } from 'react';
import type { ProjectStateResponse } from '../lib/contracts';
import { normalizeState } from '../lib/workspace-view';
export function useProjectState(){
 const [state,setState]=useState<ProjectStateResponse|null>(null);const [error,setError]=useState('');const [loading,setLoading]=useState(true);const [lastUpdated,setLastUpdated]=useState<string|null>(null);const [attempt,setAttempt]=useState(0);
 useEffect(()=>{let stopped=false;let timer:ReturnType<typeof setTimeout>;let controller:AbortController;
  async function poll(){controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),12000);try{const response=await fetch('/project-state?project_id=agent-colab',{cache:'no-store',signal:controller.signal});if(!response.ok)throw new Error(`Workspace unavailable (${response.status}).`);const data=normalizeState(await response.json());if(!stopped){setState(data);setLastUpdated(new Date().toISOString());setError('');}}catch(e){if(!stopped)setError(e instanceof Error&&e.name!=='AbortError'?e.message:'The workspace request timed out.');}finally{clearTimeout(timeout);if(!stopped){setLoading(false);timer=setTimeout(poll,5000);}}}
  void poll();return()=>{stopped=true;clearTimeout(timer);controller?.abort();};
 },[attempt]);
 const refresh=useCallback(()=>setAttempt(a=>a+1),[]);
 return {state,error,loading,lastUpdated,refresh};
}
