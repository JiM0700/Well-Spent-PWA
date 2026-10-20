import React,{useEffect,useId,useRef,useState} from 'react';
import Icon from './Icons.jsx';
import {categories,category,categoryId,fmtDate,localDate,money} from './vault.js';

export function Brand({compact=false}) {
  return <span className="brand-content"><span className="brand-mark"><svg viewBox="0 0 28 28" fill="none" aria-hidden="true"><path d="m5 9 4 12 5-14 5 14 4-12" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round"/></svg></span>{!compact&&<span>well spent<span className="brand-period">.</span></span>}</span>;
}
export function Heading({kicker,title,description,children}) {
  return <div className="page-heading"><div><span className="page-kicker">{kicker}</span><h1>{title}</h1>{description&&<p>{description}</p>}</div>{children&&<div className="heading-actions">{children}</div>}</div>;
}
export function Segmented({options,value,onChange,label}) {
  const index=Math.max(0,options.findIndex(o=>(o.value??o)===value));
  return <div className="segmented" role="group" aria-label={label} style={{'--segments':options.length,'--selected-index':index}}><span className="segment-indicator" aria-hidden="true"/>{options.map(o=>{const v=o.value??o;return <button type="button" key={v} aria-pressed={v===value} className={v===value?'active':''} onClick={()=>onChange(v)}>{o.label??o}</button>})}</div>;
}
export function Empty({title='Nothing here yet',children,icon='wallet',action,onAction}) {
  return <div className="empty-state"><span className="empty-icon"><Icon name={icon} size={25}/></span><strong>{title}</strong>{children&&<p>{children}</p>}{action&&<button className="button secondary small" onClick={onAction}><Icon name="plus" size={16}/>{action}</button>}</div>;
}
export function Modal({title,subtitle,children,onClose,className=''}) {
  const ref=useRef(null),timer=useRef(null),titleId=useId(),descId=useId();
  const [closing,setClosing]=useState(false);
  const close=()=>{if(closing)return;setClosing(true);timer.current=setTimeout(onClose,window.matchMedia?.('(prefers-reduced-motion: reduce)').matches?0:160)};
  const closeRef=useRef(close);closeRef.current=close;
  useEffect(()=>{
    const before=document.activeElement;
    const frame=requestAnimationFrame(()=>(ref.current?.querySelector('[data-autofocus]')||ref.current?.querySelector('input:not([type=hidden]),textarea,select')||ref.current?.querySelector('button'))?.focus({preventScroll:true}));
    const onKey=e=>{
      if(e.key==='Escape'){e.preventDefault();closeRef.current();return}
      if(e.key!=='Tab')return;
      const nodes=[...ref.current.querySelectorAll('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),summary,[tabindex="0"]')].filter(el=>el.getClientRects().length);
      if(!nodes.length){e.preventDefault();return}
      if(e.shiftKey&&document.activeElement===nodes[0]){e.preventDefault();nodes.at(-1).focus()}
      else if(!e.shiftKey&&document.activeElement===nodes.at(-1)){e.preventDefault();nodes[0].focus()}
    };
    document.addEventListener('keydown',onKey);
    return()=>{cancelAnimationFrame(frame);clearTimeout(timer.current);document.removeEventListener('keydown',onKey);if(before?.isConnected)before.focus({preventScroll:true})};
  },[]);
  return <div className={`modal-backdrop ${closing?'is-closing':''}`} onClick={e=>{if(e.target===e.currentTarget)close()}}><section ref={ref} className={`modal ${className}`} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={subtitle?descId:undefined}><div className="sheet-handle"/><div className="modal-head"><div><span className="page-kicker">WELL SPENT / YOUR SPACE</span><h2 id={titleId}>{title}</h2>{subtitle&&<p id={descId}>{subtitle}</p>}</div><button type="button" className="close-button" onClick={close} aria-label="Close dialog"><Icon name="close" size={19}/></button></div>{typeof children==='function'?children(close):children}</section></div>;
}
export function FormActions({onClose,label='Save',busy=false,danger=false}) {
  return <div className="modal-actions"><button className="button secondary" type="button" onClick={onClose}>Cancel</button><button className={`button ${danger?'danger':''}`} type="submit" disabled={busy}>{busy?<><span className="button-spinner"/>Saving…</>:label}</button></div>;
}
export function CategorySelect({vault,value,name='category',id,required=true}) {
  const list=categories(vault),extra=value&&!list.some(c=>c.id===value)?[{id:value,name:`${value} (archived)`}]:[];
  return <select className="select" id={id} name={name} defaultValue={value||'food'} required={required}>{[...extra,...list].map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select>;
}
const categoryIcons={food:'coffee',transport:'up',utilities:'spark',entertainment:'spark',health:'health',shopping:'bag',housing:'house',investment:'trends',other:'wallet'};
export function CategoryIcon({vault,id}) {
  const c=category(vault,id);
  return <span className={`transaction-icon category-${Object.hasOwn(categoryIcons,id)?id:'custom'}`} style={{'--category-accent':/^#[0-9a-f]{6}$/i.test(c.color)?c.color:undefined}}>{categoryIcons[id]?<Icon name={categoryIcons[id]} size={19}/>:c.icon}</span>;
}
export function TransactionList({vault,items,onEdit,onDelete,empty='Add your first transaction to get started.'}) {
  if(!items.length)return <Empty title="A little space for your next story.">{empty}</Empty>;
  let previous='';
  return <div className="transaction-list">{items.map(t=>{
    const day=localDate(t.dateMs),show=day!==previous;previous=day;
    const today=localDate(new Date()),label=day===today?'Today':fmtDate(t.dateMs,{weekday:'short',day:'numeric',month:'short',year:'numeric'});
    return <React.Fragment key={t.id}>{show&&<h3 className="date-group">{label}</h3>}<div className="transaction"><CategoryIcon vault={vault} id={categoryId(t)}/><button className="transaction-info" onClick={()=>onEdit(t.id)} aria-label={`Edit ${t.title}`}><span className="transaction-title">{t.title}</span><span className="transaction-meta">{category(vault,categoryId(t)).name}{t.notes?` · ${t.notes}`:''}</span></button><div className={`transaction-amount ${t.isExpense===false?'income':''}`}>{t.isExpense===false?'+':'−'}{money(t.amount)}<small>{t.isExpense===false?'Income / refund':'Expense'}</small></div><button className="subtle-icon transaction-delete" onClick={()=>onDelete(t.id)} aria-label={`Delete ${t.title}`}><Icon name="close" size={16}/></button></div></React.Fragment>;
  })}</div>;
}
export function TransactionForm({vault,item,prefill={},busy,onClose,onSave,quick=false}) {
  const [direction,setDirection]=useState(item?.isExpense===false?'income':'expense');
  return <form onSubmit={e=>{e.preventDefault();onSave(new FormData(e.currentTarget),item,prefill)}}>
    <Segmented options={[{value:'expense',label:'Expense'},{value:'income',label:'Income / refund'}]} value={direction} onChange={setDirection} label="Transaction direction"/><input type="hidden" name="direction" value={direction}/>
    <div className="amount-field"><label htmlFor="txAmount">{direction==='expense'?'How much did you spend?':'How much came in?'}</label><div><span>₹</span><input id="txAmount" name="amount" data-autofocus type="number" inputMode="decimal" min="0.01" max="999999999999" step="0.01" placeholder="0.00" required defaultValue={item?.amount??prefill.amount??''}/></div></div>
    <div className="form-grid"><div className="field full"><label htmlFor="txTitle">What was it for?</label><input className="input" id="txTitle" name="title" required maxLength="100" placeholder={direction==='expense'?'Coffee, groceries, a little treat…':'Salary, refund…'} defaultValue={item?.title||prefill.title||''}/></div><div className="field"><label htmlFor="txCategory">Category</label><CategorySelect vault={vault} id="txCategory" value={item?categoryId(item):prefill.category}/></div><div className="field"><label htmlFor="txDate">Date</label><input className="input" id="txDate" name="date" type="date" required defaultValue={item?localDate(item.dateMs):localDate(new Date())}/></div></div>
    <details className="more-details" open={Boolean(item?.notes||item?.tags?.length||prefill.notes)}><summary>Notes & tags <span>Optional</span><Icon name="chevron" size={14}/></summary><div className="form-grid"><div className="field full"><label htmlFor="txNotes">A note to remember</label><textarea className="textarea" id="txNotes" name="notes" rows="2" maxLength="1000" placeholder="A little context for later" defaultValue={item?.notes||prefill.notes||''}/></div><div className="field full"><label htmlFor="txTags">Tags</label><input className="input" id="txTags" name="tags" placeholder="work, weekend, travel" defaultValue={item?.tags?.join(', ')||''}/><small className="field-help">Separate tags with commas.</small></div></div></details>
    {(prefill.sourceIdentifier||item?.sourceIdentifier)&&<input type="hidden" name="sourceIdentifier" value={prefill.sourceIdentifier||item?.sourceIdentifier}/>}
    <FormActions onClose={onClose} busy={busy} label={item?'Save changes':'Save transaction'}/>
  </form>;
}
