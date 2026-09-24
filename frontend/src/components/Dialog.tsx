import { useEffect, useRef, type ReactNode } from 'react';
export function Dialog({ label, onClose, children }: { label: string; onClose: () => void; children: ReactNode }) {
  const ref=useRef<HTMLDivElement>(null);
  const close=useRef(onClose);
  useEffect(()=>{close.current=onClose;},[onClose]);
  useEffect(()=>{
    const previous=document.activeElement as HTMLElement;
    const container=ref.current!;
    const focusables=()=>Array.from(container.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select, textarea, [tabindex="0"]'));
    (focusables()[0]||container).focus();
    const handler=(e:KeyboardEvent)=>{if(e.key==='Escape')close.current();if(e.key==='Tab'){const list=focusables();const first=list[0];const last=list[list.length-1];if(!first){e.preventDefault();return;}if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}};
    const overflow=document.body.style.overflow;document.body.style.overflow='hidden';
    container.addEventListener('keydown',handler);
    return()=>{container.removeEventListener('keydown',handler);document.body.style.overflow=overflow;previous?.focus();};
  },[]);
  return <div ref={ref} role="dialog" aria-modal="true" aria-label={label} tabIndex={-1} className="fixed inset-0 bg-black/40 z-[1600] flex items-center justify-center p-4 overflow-y-auto">{children}</div>;
}
