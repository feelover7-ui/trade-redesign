import {useRef,useState,type ReactNode} from 'react';
import {UploadCloud} from 'lucide-react';
/** Shared file intake; dropped paths/text are never treated as files. Native button remains keyboard accessible. */
export default function DropArea({accept,multiple=false,disabled=false,onFiles,title,description,buttonLabel='파일 선택',testId='file-upload',className='',children}:{accept:string;multiple?:boolean;disabled?:boolean;onFiles:(files:File[])=>void;title:string;description:string;buttonLabel?:string;testId?:string;className?:string;children?:ReactNode}){
 const input=useRef<HTMLInputElement>(null),depth=useRef(0);const [over,setOver]=useState(false),[error,setError]=useState('');
 const acceptFiles=(files:File[])=>{if(disabled)return;setError('');if(!files.length){setError('파일을 선택하세요. 폴더나 링크는 업로드할 수 없습니다.');return;}if(!multiple&&files.length!==1){setError('한 번에 파일 한 개만 올려주세요.');return;}onFiles(files);};
 return <div className={'file-drop '+className+(over?' is-over':'')+(disabled?' is-busy':'')} data-testid={testId+'-dropzone'} role="group" aria-label={title} aria-disabled={disabled}
 onDragEnter={e=>{e.preventDefault();e.stopPropagation();if(Array.from(e.dataTransfer.types).includes('Files')){depth.current++;if(!disabled)setOver(true);}}}
 onDragOver={e=>{e.preventDefault();e.stopPropagation();e.dataTransfer.dropEffect=disabled?'none':'copy';}}
 onDragLeave={e=>{e.preventDefault();e.stopPropagation();depth.current=Math.max(0,depth.current-1);if(!depth.current)setOver(false);}}
 onDrop={e=>{e.preventDefault();e.stopPropagation();depth.current=0;setOver(false);if(disabled)return;const directory=Array.from(e.dataTransfer.items).some(item=>item.webkitGetAsEntry?.()?.isDirectory);if(directory){setError('폴더 대신 파일을 올려주세요.');return;}acceptFiles(Array.from(e.dataTransfer.files));}}>
 <input ref={input} data-testid={testId} type="file" hidden accept={accept} multiple={multiple} disabled={disabled} onChange={e=>{const files=Array.from(e.currentTarget.files||[]);e.currentTarget.value='';if(files.length)acceptFiles(files);}}/>
 <UploadCloud size={29} aria-hidden="true"/><strong>{over?'여기에 놓아 업로드하세요':title}</strong><span>{description}</span>
 <button type="button" className="button secondary" disabled={disabled} onClick={()=>input.current?.click()}>{buttonLabel}</button>{children}
 {error?<p className="drop-error" role="alert">{error}</p>:null}
 </div>;
}
