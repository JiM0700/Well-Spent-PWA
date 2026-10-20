import React,{useCallback,useEffect,useMemo,useRef,useState} from 'react';
import * as storage from './storage.js';
import {billCategoryId,categories,categoryId,cents,clone,defaults,dueDate,dayDiff,exportData,fmtDate,money,parseCapture,prepareTransaction,transactions,uid,validateVault,vaultCategory} from './vault.js';
import Icon from './Icons.jsx';
import {Brand,Empty,FormActions,Heading,Modal,TransactionForm,TransactionList} from './UI.jsx';
import {SpendingChart} from './Charts.jsx';
import {Insights,Overview} from './Dashboard.jsx';
import {Activity,BillForm,Bills,Settings} from './Pages.jsx';

export {TransactionForm} from './UI.jsx';
const PAGES=[{id:'home',label:'Overview',short:'Overview',icon:'home'},{id:'activity',label:'Transactions',short:'Activity',icon:'activity'},{id:'trends',label:'Insights',short:'Insights',icon:'trends'},{id:'bills',label:'Bills & subscriptions',short:'Bills',icon:'bills'},{id:'settings',label:'Settings',short:'Settings',icon:'settings'}];
const initialPage=()=>PAGES.some(p=>p.id===location.hash.slice(1))?location.hash.slice(1):'home';

function Search({vault,items,onEdit,onClose}) {
  const [query,setQuery]=useState('');
  const found=items.filter(t=>[t.title,categories(vault).find(c=>c.id===categoryId(t))?.name,t.notes,...(t.tags||[]),String(t.amount)].join(' ').toLowerCase().includes(query.toLowerCase().trim()));
  return <><div className="search-input global-search-input"><Icon name="search"/><input className="input" data-autofocus type="search" aria-label="Search transactions" placeholder="A purchase, a note, a category…" value={query} onChange={e=>setQuery(e.target.value)}/><kbd>esc</kbd></div><div className="search-results">{found.slice(0,40).map(t=><button className="search-result" key={t.id} onClick={()=>onEdit(t.id)}><span className="search-result-icon"><Icon name={t.isExpense===false?'down':'up'} size={18}/></span><span><strong>{t.title}</strong><small>{fmtDate(t.dateMs,{day:'numeric',month:'short',year:'numeric'})}</small></span><strong className={t.isExpense===false?'positive':''}>{t.isExpense===false?'+':'−'}{money(t.amount)}</strong><Icon name="chevron" size={16}/></button>)}{!found.length&&<Empty title="No matches just yet.">Try a title, amount, category, note, or tag.</Empty>}</div><div className="search-footer"><span>{found.length} matching {found.length===1?'transaction':'transactions'}{found.length>40?' · showing the first 40':''}</span><button className="text-button" onClick={onClose}>Done</button></div></>;
}

export default function App({bootstrapVault=null,bootstrapPage=null}={}) {
  const [vault,setVault]=useState(bootstrapVault||defaults),vaultRef=useRef(vault);
  const [ready,setReady]=useState(Boolean(bootstrapVault)),[locked,setLocked]=useState(false),[protectedVault,setProtected]=useState(false);
  const [page,setPage]=useState(bootstrapPage||initialPage),[modal,setModal]=useState(null),[busy,setBusy]=useState(false),busyRef=useRef(false);
  const [error,setError]=useState(''),[formError,setFormError]=useState(''),[toast,setToast]=useState(null),toastTimer=useRef(null);
  const [horizon,setHorizon]=useState('Month'),[period,setPeriod]=useState('Month'),[start,setStart]=useState(''),[end,setEnd]=useState(''),[trendCat,setTrendCat]=useState('all'),[chartIndex,setChartIndex]=useState(null);
  const all=useMemo(()=>transactions(vault).sort((a,b)=>b.dateMs-a.dateMs),[vault]);
  const notify=useCallback((message,action)=>{clearTimeout(toastTimer.current);setToast({message,action});toastTimer.current=setTimeout(()=>setToast(null),action?9000:4500)},[]);
  const close=useCallback(()=>{setModal(null);setFormError('')},[]);
  const open=useCallback(value=>{setFormError('');setModal(value)},[]);
  const navigate=useCallback(next=>{setPage(next);setModal(null);setFormError('');if(location.hash!==`#${next}`)history.pushState({page:next},'',`#${next}`);window.scrollTo({top:0,behavior:'instant'})},[]);
  const updateVault=useCallback(next=>{vaultRef.current=next;setVault(next)},[]);
  const edit=id=>open({type:'transaction',id});

  useEffect(()=>{
    let active=true;
    if(!bootstrapVault)storage.initialize().then(result=>{
      if(!active)return;
      updateVault(result.vault);setLocked(result.locked);setProtected(result.locked||storage.isProtected());setReady(true);
      const action=new URL(location.href).searchParams.get('action');
      if(!result.locked&&action==='add')open({type:'transaction'});
      if(!result.locked&&action==='search')open({type:'search'});
    }).catch(e=>{if(active){setError(`${e.message} Changes cannot be saved until local storage is available.`);setReady(true)}});
    const sync=()=>{const hash=location.hash.slice(1);if(PAGES.some(p=>p.id===hash)){setPage(hash);setModal(null)}};
    window.addEventListener('hashchange',sync);window.addEventListener('popstate',sync);
    return()=>{active=false;clearTimeout(toastTimer.current);window.removeEventListener('hashchange',sync);window.removeEventListener('popstate',sync)};
  },[bootstrapVault,open,updateVault]);
  useEffect(()=>{
    const media=window.matchMedia?.('(prefers-color-scheme: dark)');
    const apply=()=>{const dark=vault.appThemeMode==='dark'||vault.appThemeMode==='system'&&media?.matches;document.body.classList.toggle('theme-dark',dark);document.querySelector('meta[name="theme-color"]')?.setAttribute('content',dark?'#15171c':'#f5f6f8')};
    apply();media?.addEventListener?.('change',apply);return()=>media?.removeEventListener?.('change',apply);
  },[vault.appThemeMode]);
  useEffect(()=>{if(!modal)return;const before=document.body.style.overflow;document.body.style.overflow='hidden';return()=>{document.body.style.overflow=before}},[modal]);
  useEffect(()=>{
    if(locked||!ready)return;
    const onKey=e=>{
      if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k'){e.preventDefault();open({type:'search'})}
      if(!modal&&!e.metaKey&&!e.ctrlKey&&!e.altKey&&e.key==='n'&&!e.target.closest('input,select,textarea,[contenteditable="true"]')){e.preventDefault();open({type:'transaction'})}
    };
    window.addEventListener('keydown',onKey);return()=>window.removeEventListener('keydown',onKey);
  },[locked,modal,ready,open]);
  useEffect(()=>{
    if(!protectedVault||locked)return;
    let timer;
    const visibility=()=>{clearTimeout(timer);if(document.hidden)timer=setTimeout(async()=>{try{await storage.lock();updateVault(defaults());setLocked(true);setModal(null);setToast(null)}catch(e){setError(e.message)}},120000)};
    document.addEventListener('visibilitychange',visibility);return()=>{clearTimeout(timer);document.removeEventListener('visibilitychange',visibility)};
  },[protectedVault,locked,updateVault]);

  const commit=useCallback(async(change,message,action)=>{
    if(busyRef.current)return false;
    busyRef.current=true;setBusy(true);setFormError('');
    try{const next=typeof change==='function'?change(clone(vaultRef.current)):change;const saved=await storage.saveVault(next);updateVault(saved);setError('');if(message)notify(message,action);return true}
    catch(e){const message=`Could not save: ${e.message} Your previous records were retained.`;setError(message);setFormError(message);return false}
    finally{busyRef.current=false;setBusy(false)}
  },[notify,updateVault]);
  const saveTransaction=async(form,item,prefill={})=>{
    let prepared;
    try{prepared=prepareTransaction(vaultRef.current,form,item,prefill)}catch(e){setFormError(e.message);return}
    if(prepared.duplicate){edit(prepared.duplicate.id);notify('This payment reference is already in your records.');return}
    const candidate=prepared.candidate;
    const saved=await commit(next=>({...next,expenses:[...next.expenses.filter(t=>t.id!==candidate.id),candidate],pendingCaptures:(next.pendingCaptures||[]).filter(p=>p.id!==prefill.pendingId)}),item?'Transaction updated.':'Transaction added.',{label:'View',run:()=>edit(candidate.id)});
    if(saved)close();
  };
  const confirm=(title,description,label,run,danger=true)=>open({type:'confirm',title,description,label,run,danger});
  const deleteTransaction=id=>{
    const original=vaultRef.current.expenses.find(t=>t.id===id);if(!original)return;
    confirm('Delete this transaction?',`“${original.title}” (${money(original.amount)}) will be removed from your records.`,'Delete transaction',async()=>{
      const saved=await commit(next=>({...next,expenses:next.expenses.filter(t=>t.id!==id)}),'Transaction deleted.',{label:'Undo',run:async()=>{const restored=await commit(next=>({...next,expenses:next.expenses.some(t=>t.id===id)?next.expenses:[...next.expenses,original]}),'Transaction restored.');if(restored)setToast(null)}});
      if(saved)close();
    });
  };
  const saveBill=async(form,item)=>{
    const title=String(form.get('title')||'').trim(),amount=cents(form.get('amount'))/100,dueDay=Number(form.get('dueDay')),cat=String(form.get('category')||'');
    if(!title||!Number.isFinite(amount)||amount<=0||!Number.isInteger(dueDay)||dueDay<1||dueDay>31){setFormError('Enter a name, a positive amount, and a due day from 1 to 31.');return}
    const bill={...(item||{}),id:item?.id||uid(),title,amount,dueDay,category:vaultCategory(vaultRef.current,cat,item?.category),isPaid:form.has('isPaid')};
    const saved=await commit(next=>({...next,recurringBills:[...next.recurringBills.filter(b=>b.id!==bill.id),bill]}),item?'Bill updated.':'Bill added.');if(saved)close();
  };
  const deleteBill=b=>confirm('Remove this bill?',`“${b.title}” will be removed from recurring bills. Saved transactions are kept.`,'Remove bill',async()=>{if(await commit(next=>({...next,recurringBills:next.recurringBills.filter(x=>x.id!==b.id)}),'Bill removed.'))close()});
  const markBill=b=>{
    if(!b){confirm('Start a new bill cycle?','All recurring bills will be marked unpaid so you can track the next cycle.','Start new cycle',async()=>{if(await commit(next=>({...next,recurringBills:next.recurringBills.map(x=>({...x,isPaid:false}))}),'New bill cycle started.'))close()},false);return}
    commit(next=>({...next,recurringBills:next.recurringBills.map(x=>x.id===b.id?{...x,isPaid:!b.isPaid}:x)}),b.isPaid?'Bill marked unpaid.':'One less thing. Bill marked paid.');
  };
  const saveBudget=async form=>{
    const budget=Number(form.get('budget')),day=Number(form.get('day'));
    if(!Number.isFinite(budget)||budget<0||!Number.isInteger(day)||day<1||day>28){notify('Enter a valid budget and a cycle day from 1 to 28.');return}
    await commit(next=>({...next,monthlyBudget:budget,cycleStartDay:day}),'Your budget is updated.');
  };
  const saveCategory=async(form,item)=>{
    const name=String(form.get('name')||'').trim(),icon=String(form.get('icon')||'✦').trim()||'✦',color=String(form.get('color')||'#4079ee');
    if(!name){setFormError('Give the category a name.');return}
    const c={...(item||{}),id:item?.id||uid(),displayName:name,sfSymbol:icon,colorHex:color,isCustom:true};
    const saved=await commit(next=>{
      next.customCategories=[...next.customCategories.filter(x=>x.id!==c.id),c];
      next.expenses=next.expenses.map(t=>categoryId(t)===c.id?{...t,category:vaultCategory(next,c.id,t.category)}:t);
      next.recurringBills=next.recurringBills.map(b=>billCategoryId(b)===c.id?{...b,category:vaultCategory(next,c.id,b.category)}:b);return next;
    },item?'Category updated.':'Category added.');if(saved)close();
  };
  const deleteCategory=c=>confirm('Remove this category?',`“${c.displayName||c.name}” will be removed. Its transactions and bills will move to Other.`,'Remove category',async()=>{
    if(await commit(next=>({...next,customCategories:next.customCategories.filter(x=>x.id!==c.id),expenses:next.expenses.map(t=>categoryId(t)===c.id?{...t,category:'other'}:t),recurringBills:next.recurringBills.map(b=>billCategoryId(b)===c.id?{...b,category:'other'}:b)}),'Category removed.'))close();
  });
  const download=()=>{
    const blob=new Blob([exportData(vaultRef.current)],{type:'application/json'}),url=URL.createObjectURL(blob),link=document.createElement('a');
    link.href=url;link.download='well_spent_vault.json';document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);notify('Backup downloaded. Keep it somewhere private.');
  };
  const importFile=async file=>{
    if(!file)return;
    try{const candidate=validateVault(JSON.parse(await file.text()));confirm('Restore this backup?',`${candidate.expenses.length} transactions and ${candidate.recurringBills.length} bills will replace this device’s vault. Export a backup first if you want to keep your current records.`,'Restore backup',async()=>{if(await commit({...candidate,pendingCaptures:[]},'Your backup is restored.'))close()})}
    catch(e){open({type:'message',title:'This backup could not be opened.',description:e.message})}
  };
  const protect=async form=>{
    const pass=String(form.get('passphrase')||'');
    if(pass.length<12){setFormError('Use at least 12 characters.');return}
    if(pass!==String(form.get('confirm')||'')){setFormError('The passphrases don’t match.');return}
    if(busyRef.current)return;busyRef.current=true;setBusy(true);setFormError('');
    try{await storage.protect(vaultRef.current,pass);setProtected(true);close();notify('Your local vault is now encrypted.')}
    catch(e){setFormError(`Could not protect the vault: ${e.message}`)}finally{busyRef.current=false;setBusy(false)}
  };
  const lock=async()=>{if(busyRef.current)return;try{await storage.lock();updateVault(defaults());setLocked(true);setModal(null);setToast(null);setError('')}catch(e){setError(e.message)}};
  const unlock=async form=>{
    if(busyRef.current)return;busyRef.current=true;setBusy(true);setFormError('');
    try{updateVault(await storage.unlock(String(form.get('passphrase')||'')));setProtected(true);setLocked(false);setError('');const action=new URL(location.href).searchParams.get('action');if(action==='add')open({type:'transaction'});if(action==='search')open({type:'search'})}
    catch{setFormError('That passphrase didn’t unlock the vault. Please try again.')}finally{busyRef.current=false;setBusy(false)}
  };
  const erase=()=>confirm('Delete all local data?','Transactions, bills, custom categories, preferences, and passphrase protection will be permanently removed from this browser. Export a backup first.','Delete everything',async()=>{
    if(busyRef.current)return;busyRef.current=true;setBusy(true);
    try{updateVault(await storage.erase());setProtected(false);setLocked(false);close();setError('');notify('All local data has been deleted.')}
    catch(e){setFormError(e.message)}finally{busyRef.current=false;setBusy(false)}
  });
  const capture=form=>{
    const text=String(form.get('message')||''),parsed=parseCapture(text);
    if(!parsed.amount&&!parsed.title){setFormError('We couldn’t find an amount or merchant. You can add the transaction manually.');return}
    open({type:'transaction',prefill:{...parsed,notes:text}});
  };

  const upcoming=(vault.recurringBills||[]).filter(b=>!b.isPaid&&dayDiff(new Date(),dueDate(b))<=7).sort((a,b)=>dueDate(a)-dueDate(b));
  const transactionItem=modal?.type==='transaction'&&modal.id?all.find(t=>t.id===modal.id):null;
  const billItem=modal?.type==='bill'?(vault.recurringBills||[]).find(b=>b.id===modal.id):null;
  const categoryItem=modal?.type==='category'?(vault.customCategories||[]).find(c=>c.id===modal.id):null;
  const nav=p=><button key={p.id} className={`nav-item ${page===p.id?'active':''}`} aria-current={page===p.id?'page':undefined} onClick={()=>navigate(p.id)}><Icon name={p.icon}/><span className="nav-word">{p.label}</span><span className="nav-short">{p.short}</span>{page===p.id&&<span className="nav-active-dot"/>}</button>;
  if(!ready)return <div className="loading-screen"><Brand/><span className="loading-track"/><span>Opening your space…</span></div>;
  return <>
    <div className="app-shell" inert={modal?true:undefined}>
      <a className="skip-link" href="#page-content">Skip to content</a>
      <aside className="sidebar"><a className="brand" href="#home" onClick={e=>{e.preventDefault();navigate('home')}} aria-label="Well Spent home"><Brand/></a><div className="workspace-label"><span className="workspace-avatar">Y</span><span>Your personal space<small>A little more in control.</small></span><Icon name="chevron" size={14}/></div><span className="nav-section-label">WORKSPACE</span><nav className="nav-list" aria-label="Main navigation">{!locked&&PAGES.slice(0,3).map(nav)}</nav><span className="nav-section-label second-label">PLAN & PERSONALIZE</span><nav className="nav-list" aria-label="Planning and preferences">{!locked&&PAGES.slice(3).map(nav)}</nav><div className="sidebar-bottom"><div className="privacy-note"><span className="privacy-symbol"><Icon name="shield" size={24}/></span><strong>Just your business.</strong><p>Your data stays on this device.<br/>Always private. Always yours.</p>{!locked&&<button className="text-button" onClick={()=>navigate('settings')}>Your privacy <Icon name="arrow" size={14}/></button>}</div><div className="sidebar-foot"><span className="live-dot"/>PRIVATE BY DESIGN</div></div></aside>
      <main className="main-content"><header className="topbar"><a className="mobile-brand" href="#home" onClick={e=>{e.preventDefault();navigate('home')}} aria-label="Well Spent home"><Brand/></a><div className="topbar-location">Your workspace<Icon name="chevron" size={12}/><strong>{PAGES.find(p=>p.id===page)?.label}</strong></div>{!locked&&<><button className="topbar-search" onClick={()=>open({type:'search'})} aria-label="Search all transactions"><Icon name="search" size={16}/><span>Find a transaction</span><kbd>⌘ K</kbd></button><span className="topbar-divider"/><span className="topbar-status"><span className="live-dot"/>{protectedVault?'Vault encrypted':'Saved on this device'}</span><button className="icon-button topbar-add" onClick={()=>open({type:'transaction'})} aria-label="Add transaction"><Icon name="plus" size={20}/></button></>}</header>
        {error&&<div className="notice warning storage-warning" role="alert"><Icon name="shield" size={20}/><span><strong>Your storage needs attention.</strong>{error}</span></div>}
        <div className="page-content" id="page-content" tabIndex="-1" key={locked?'locked':page}>
          {locked?<section className="lock-card panel"><span className="lock-illustration"><Icon name="lock" size={30}/></span><span className="page-kicker">A MOMENT OF PRIVACY</span><h1>Welcome back.</h1><p>Your financial life is safely tucked away. Enter your passphrase to pick up where you left off.</p><form onSubmit={e=>{e.preventDefault();unlock(new FormData(e.currentTarget))}}><div className="field"><label htmlFor="unlockPassphrase">Your passphrase</label><input className="input" id="unlockPassphrase" name="passphrase" type="password" autoComplete="current-password" required autoFocus/></div>{formError&&<p className="form-error" role="alert">{formError}</p>}<button className="button" disabled={busy}><Icon name="lock" size={17}/>{busy?'Unlocking…':'Unlock your space'}</button></form><button className="text-button reset-vault" onClick={erase}>Lost your passphrase? Reset this vault</button></section>:<>
          {page==='home'&&<Overview vault={vault} all={all} horizon={horizon} setHorizon={setHorizon} Heading={Heading} TransactionList={TransactionList} SpendingChart={SpendingChart} upcoming={upcoming} onAdd={()=>open({type:'transaction'})} onSearch={()=>navigate('activity')} onEdit={(id,p)=>id?edit(id):open({type:'transaction',prefill:{...p,pendingId:p.id}})} onDelete={deleteTransaction} onBills={()=>navigate('bills')} onTrends={(p,i)=>{setPeriod(p);setChartIndex(i);setTrendCat('all');navigate('trends')}} onBudget={()=>navigate('settings')} onCapture={()=>open({type:'capture'})} onDismiss={id=>commit(next=>({...next,pendingCaptures:(next.pendingCaptures||[]).filter(p=>p.id!==id)}),'Payment review dismissed.')}/>}
          {page==='activity'&&<Activity vault={vault} items={all} onAdd={()=>open({type:'transaction'})} onEdit={edit} onDelete={deleteTransaction}/>}
          {page==='trends'&&<Insights vault={vault} all={all} period={period} setPeriod={setPeriod} start={start} setStart={setStart} end={end} setEnd={setEnd} trendCat={trendCat} setTrendCat={setTrendCat} chartIndex={chartIndex} setChartIndex={setChartIndex} Heading={Heading} TransactionList={TransactionList} SpendingChart={SpendingChart} onEdit={edit} onDelete={deleteTransaction}/>}
          {page==='bills'&&<Bills vault={vault} onAdd={()=>open({type:'bill'})} onEdit={id=>open({type:'bill',id})} onDelete={deleteBill} onPaid={markBill}/>}
          {page==='settings'&&<Settings vault={vault} busy={busy} protectedVault={protectedVault} onBudget={saveBudget} onTheme={value=>commit(next=>({...next,appThemeMode:value}),'Appearance updated.')} onCategory={id=>open({type:'category',id})} onDeleteCategory={deleteCategory} onExport={download} onImport={importFile} onProtect={()=>open({type:'protect'})} onLock={lock} onErase={erase}/>}
          </>}
        </div>
      </main>
      {!locked&&<nav className="bottom-nav" aria-label="Mobile navigation">{PAGES.map(nav)}</nav>}
    </div>
    {toast&&!locked&&<div className="toast" role="status" aria-live="polite"><span className="toast-icon"><Icon name="check" size={17}/></span><span>{toast.message}</span>{toast.action&&<button onClick={toast.action.run}>{toast.action.label}</button>}<button className="toast-dismiss" onClick={()=>setToast(null)} aria-label="Dismiss message"><Icon name="close" size={15}/></button></div>}
    {modal&&<Modal key={`${modal.type}-${modal.id||''}`} title={modal.type==='transaction'?(transactionItem?'Edit the details.':'A little detail. A clearer picture.'):modal.type==='bill'?(billItem?'Update your bill.':'Plan for a monthly bill.'):modal.type==='search'?'Find a moment.':modal.type==='category'?(categoryItem?'Edit your category.':'Make room for a category.'):modal.type==='protect'?'Keep your space private.':modal.type==='capture'?'Let’s skip the typing.':modal.title} subtitle={modal.type==='transaction'?'A purchase, a payday, or something in between.':modal.type==='bill'?'Set it once. Keep it in view.':modal.type==='search'?'Search across all your saved transactions.':modal.type==='category'?'A name and a little personality for your spending.':modal.type==='protect'?'Choose a passphrase you’ll remember. It cannot be recovered.':modal.type==='capture'?'Paste a UPI or payment message. Review the details before saving.':modal.description} onClose={close} className={modal.type==='search'?'search-modal':modal.type==='confirm'?'confirm-modal':''}>{dismiss=><>
      {formError&&<div className="form-error" role="alert">{formError}</div>}
      {modal.type==='transaction'&&<TransactionForm key={modal.id||modal.prefill?.pendingId||'new'} vault={vault} item={transactionItem} prefill={modal.prefill} busy={busy} onClose={dismiss} onSave={saveTransaction}/>}
      {modal.type==='bill'&&<BillForm vault={vault} item={billItem} busy={busy} onClose={dismiss} onSave={saveBill}/>}
      {modal.type==='search'&&<Search vault={vault} items={all} onEdit={edit} onClose={dismiss}/>}
      {modal.type==='category'&&<form onSubmit={e=>{e.preventDefault();saveCategory(new FormData(e.currentTarget),categoryItem)}}><div className="form-grid"><div className="field full"><label htmlFor="categoryName">Category name</label><input className="input" id="categoryName" name="name" required maxLength="40" placeholder="Something worth keeping track of" defaultValue={categoryItem?.displayName||categoryItem?.name||''}/></div><div className="field"><label htmlFor="categoryIcon">Symbol</label><input className="input" id="categoryIcon" name="icon" maxLength="40" defaultValue={categoryItem?.sfSymbol||categoryItem?.icon||'✦'}/></div><div className="field"><label htmlFor="categoryColor">Color</label><input className="input color-input" id="categoryColor" name="color" type="color" defaultValue={/^#[0-9a-f]{6}$/i.test(categoryItem?.colorHex||'')?categoryItem.colorHex:'#4079ee'}/></div></div><FormActions busy={busy} onClose={dismiss} label={categoryItem?'Save changes':'Add category'}/></form>}
      {modal.type==='protect'&&<form onSubmit={e=>{e.preventDefault();protect(new FormData(e.currentTarget))}}><div className="field"><label htmlFor="newPassphrase">Passphrase · at least 12 characters</label><input className="input" id="newPassphrase" name="passphrase" type="password" minLength="12" autoComplete="new-password" required/></div><div className="field section-gap"><label htmlFor="confirmPassphrase">Confirm passphrase</label><input className="input" id="confirmPassphrase" name="confirm" type="password" minLength="12" autoComplete="new-password" required/></div><p className="field-help">This protects the local vault. Downloaded JSON backups remain unencrypted.</p><FormActions busy={busy} onClose={dismiss} label="Protect my vault"/></form>}
      {modal.type==='capture'&&<form onSubmit={e=>{e.preventDefault();capture(new FormData(e.currentTarget))}}><div className="field"><label htmlFor="captureText">Payment message</label><textarea className="textarea" id="captureText" name="message" required rows="6" placeholder="Paste your payment message here…"/></div><div className="local-processing"><Icon name="shield" size={15}/>Read privately on your device.</div><FormActions busy={busy} onClose={dismiss} label="Review details"/></form>}
      {modal.type==='confirm'&&<form onSubmit={e=>{e.preventDefault();modal.run()}}><FormActions busy={busy} onClose={dismiss} danger={modal.danger} label={modal.label}/></form>}
      {modal.type==='message'&&<div className="modal-actions"><button className="button" onClick={dismiss}>Got it</button></div>}
    </>}</Modal>}
  </>;
}
