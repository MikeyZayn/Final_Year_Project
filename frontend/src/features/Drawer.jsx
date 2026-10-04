import {useEffect,useId,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
export function DrawerTile({title,description,icon='↗',children}) {
 const [open,setOpen]=useState(false); const trigger=useRef(null);
 return <><button ref={trigger} className="drawer-tile" type="button" onClick={()=>setOpen(true)} aria-haspopup="dialog"><span className="drawer-tile-icon" aria-hidden="true">{icon}</span><span><strong>{title}</strong><small>{description}</small></span><span className="drawer-arrow" aria-hidden="true">↗</span></button>{open && <Drawer title={title} onClose={()=>{setOpen(false); window.requestAnimationFrame(()=>trigger.current?.focus());}}>{typeof children === 'function' ? children(() => {setOpen(false); window.requestAnimationFrame(()=>trigger.current?.focus());}) : children}</Drawer>}</>;
}
export function Drawer({title,children,onClose}) {
 const id=useId(),panel=useRef(null),close=useRef(onClose);close.current=onClose;
 useEffect(()=>{
  const before=document.body.style.overflow;document.body.style.overflow='hidden';panel.current?.querySelector('button')?.focus();
  function key(e) {
   if(document.querySelector('.settings-overlay')) return;
   if(e.key==='Escape'){e.preventDefault();close.current();}
   if(e.key==='Tab'){
    const fs=[...panel.current.querySelectorAll('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),a[href],[tabindex="0"]')];const first=fs[0],last=fs.at(-1);
    if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}
    else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}
   }
  }
  document.addEventListener('keydown',key);return()=>{document.body.style.overflow=before;document.removeEventListener('keydown',key)};
 },[]);
 return createPortal(<div className="drawer-backdrop" onClick={onClose}><aside ref={panel} className="dashboard-drawer" role="dialog" aria-modal="true" aria-labelledby={id} onClick={e=>e.stopPropagation()}><header className="drawer-header"><div><span className="eyebrow">THEMBA WORKSPACE</span><h2 id={id}>{title}</h2></div><button className="secondary-button" type="button" aria-label="Close drawer" onClick={onClose}>Close ×</button></header><div className="drawer-content">{children}</div></aside></div>,document.querySelector('.app')||document.body);
}
export function PageControls({page,total,pageSize=10,onChange}) {
 const pages=Math.max(1,Math.ceil(total/pageSize));if(pages===1)return null;
 return <nav className="page-controls" aria-label="List pages"><button className="secondary-button" disabled={page===0} onClick={()=>onChange(page-1)} type="button">← Previous</button><span>Page {page+1} of {pages}</span><button className="secondary-button" disabled={page+1>=pages} onClick={()=>onChange(page+1)} type="button">Next →</button></nav>;
}
