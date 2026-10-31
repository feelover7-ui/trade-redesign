import {createContext,useContext,useEffect,useState,useCallback} from 'react';
import type {User} from './types';
import {api} from './api';
export const AppContext=createContext<{user:User;demo:boolean;notify:(message:string,error?:boolean)=>void;logout:()=>void}>({} as never);
export const useApp=()=>useContext(AppContext);
export const go=(path:string)=>{window.location.hash=path;};
export function useRoute(){const [route,setRoute]=useState(location.hash.slice(1)||'/market');useEffect(()=>{const onChange=()=>{setRoute(location.hash.slice(1)||'/market');window.scrollTo(0,0);};addEventListener('hashchange',onChange);return()=>removeEventListener('hashchange',onChange);},[]);return route;}
export function useResource<T>(path:string){const [data,setData]=useState<T|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(true),[version,setVersion]=useState(0);const reload=useCallback(()=>setVersion(v=>v+1),[]);useEffect(()=>{const controller=new AbortController();setLoading(true);setError('');api<T>(path,{signal:controller.signal}).then(setData).catch(e=>{if(e.name!=='AbortError')setError(e.message);}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});return()=>controller.abort();},[path,version]);return {data,error,loading,reload};}
export function useAction(){const {notify}=useApp();const [busy,setBusy]=useState(false);const run=async(fn:()=>Promise<void>,success?:string)=>{if(busy)return;setBusy(true);try{await fn();if(success)notify(success);}catch(e){notify(e instanceof Error?e.message:'처리에 실패했습니다.',true);}finally{setBusy(false);}};return {busy,run};}
