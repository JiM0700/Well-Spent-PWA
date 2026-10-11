'use strict';
const APPLE_EPOCH = 978307200000;
const BUILT_INS = [
  {id:'food',name:'Food & dining',icon:'◉',color:'#e8ae65'}, {id:'transport',name:'Transport',icon:'↗',color:'#78a4a1'},
  {id:'utilities',name:'Utilities',icon:'⌁',color:'#8a9fce'}, {id:'entertainment',name:'Entertainment',icon:'✳',color:'#bb89bd'},
  {id:'health',name:'Health',icon:'✚',color:'#df8b83'}, {id:'shopping',name:'Shopping',icon:'◇',color:'#d29161'},
  {id:'housing',name:'Housing',icon:'⌂',color:'#9aab71'}, {id:'investment',name:'Investment',icon:'↗',color:'#68a78c'},
  {id:'other',name:'Other',icon:'·',color:'#9ca49f'}
];
const defaults = () => ({expenses:[],pendingCaptures:[],monthlyBudget:50000,cycleStartDay:1,customCategories:[],summaryEnabled:false,summaryPeriod:'daily',recurringBills:[],appThemeMode:'system',biometricsEnabled:false,hapticsEnabled:true,soundsEnabled:true,summaryTime:'20:00',summaryDay:1});
let vault = defaults(), lastSavedVault=null, storageError='', saveQueue=Promise.resolve(), saveVersion=0, currentPage='home', horizon='Month', trendPeriod='Month', trendStart='', trendEnd='', trendCategory='all', searchText='', searchCategory='all', searchBand='all', billQuery='', billCategory='all', chartSelection=null, db=null, toastTimer, lastSavedTransactionId=null, previousFocus=null, lockTimer=null;
const $ = (s,root=document)=>root.querySelector(s), $$=(s,root=document)=>[...root.querySelectorAll(s)];
const esc = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money = n => '₹'+Number(n||0).toLocaleString('en-IN',{minimumFractionDigits:0,maximumFractionDigits:2});
const safeColor = value => /^#[0-9a-f]{6}$/i.test(String(value||''))?String(value):'#8E6CEF';
const localDate = d => {const x=new Date(d);return `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,'0')}-${String(x.getDate()).padStart(2,'0')}`};
const startDay = d => new Date(d.getFullYear(),d.getMonth(),d.getDate());
const addDays = (d,n)=>new Date(d.getFullYear(),d.getMonth(),d.getDate()+n);
const dayDiff = (a,b)=>Math.round((Date.UTC(b.getFullYear(),b.getMonth(),b.getDate())-Date.UTC(a.getFullYear(),a.getMonth(),a.getDate()))/86400000);
function decodeVaultDate(value){
  if(typeof value==='string' && value.trim() && !Number.isNaN(Number(value))) value=Number(value);
  if(typeof value==='number' && Number.isFinite(value)){
    const date=new Date(value*1000+APPLE_EPOCH);
    return {date,appleSeconds:value,keepApple:true};
  }
  const date=typeof value==='string'?new Date(value):new Date(NaN);
  return {date,appleSeconds:dateToApple(date),keepApple:false};
}
const appleToDate = n=>decodeVaultDate(n).date;
const dateToApple = d=>(new Date(d).getTime()-APPLE_EPOCH)/1000;
const titleCase = s=>s.charAt(0).toUpperCase()+s.slice(1);
function toast(message){const el=$('#toast');el.textContent=message;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),2800)}
function interactionFeedback(){
  if(vault.hapticsEnabled)try{navigator.vibrate?.(12)}catch(e){}
  if(!vault.soundsEnabled)return;
  const Audio=window.AudioContext||window.webkitAudioContext;
  if(!Audio)return;
  try{
    const context=new Audio(),oscillator=context.createOscillator(),gain=context.createGain();
    oscillator.type='sine';oscillator.frequency.value=660;gain.gain.setValueAtTime(0.015,context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001,context.currentTime+0.07);
    oscillator.connect(gain);gain.connect(context.destination);oscillator.start();oscillator.stop(context.currentTime+0.07);
    oscillator.onended=()=>context.close();
  }catch(e){}
}
function openDB(){return new Promise((resolve,reject)=>{if(!('indexedDB'in window))return reject(new Error('This browser does not support local database storage.'));const req=indexedDB.open('well-spent-local',1);req.onupgradeneeded=()=>req.result.createObjectStore('data');req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)})}
function dbGet(){return new Promise((resolve,reject)=>{const req=db.transaction('data').objectStore('data').get('vault');req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)})}
function cloneVault(value){return JSON.parse(JSON.stringify(value))}
const ENCRYPTION_FORMAT='well-spent-encrypted-v1';
let encryptionKey=null,encryptionSalt=null,lockedRecord=null;
const isLocked=()=>Boolean(lockedRecord&&!encryptionKey);
function bytesToBase64(bytes){
  let result='';
  for(let i=0;i<bytes.length;i+=8192)result+=String.fromCharCode(...bytes.subarray(i,i+8192));
  return btoa(result);
}
function base64ToBytes(value){return Uint8Array.from(atob(value),char=>char.charCodeAt(0))}
async function deriveKey(passphrase,salt,iterations=250000){
  const material=await crypto.subtle.importKey('raw',new TextEncoder().encode(passphrase),'PBKDF2',false,['deriveKey']);
  return crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations,hash:'SHA-256'},material,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
}
async function sealVault(value){
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const plaintext=new TextEncoder().encode(JSON.stringify(value));
  const ciphertext=await crypto.subtle.encrypt({name:'AES-GCM',iv},encryptionKey,plaintext);
  return {format:ENCRYPTION_FORMAT,iterations:250000,salt:bytesToBase64(encryptionSalt),iv:bytesToBase64(iv),payload:bytesToBase64(new Uint8Array(ciphertext))};
}
async function openSealedVault(record,key){
  const plaintext=await crypto.subtle.decrypt({name:'AES-GCM',iv:base64ToBytes(record.iv)},key,base64ToBytes(record.payload));
  return JSON.parse(new TextDecoder().decode(plaintext));
}
function dbRawSave(value){return new Promise((resolve,reject)=>{
  if(!db)return reject(new Error('Local storage is unavailable.'));
  const tx=db.transaction('data','readwrite');
  tx.objectStore('data').put(value,'vault');
  tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
})}
async function dbSave(value=vault){if(isLocked())throw new Error('Unlock the vault before saving.');return dbRawSave(encryptionKey?await sealVault(value):value)}
function showLockScreen(){
  document.body.classList.add('vault-locked');
  $('#modalRoot').innerHTML='';
  $('#pageContent').innerHTML=`<section class="lock-card panel" aria-labelledby="lockTitle"><span class="page-kicker">LOCAL VAULT</span><h1 id="lockTitle">Unlock Well Spent</h1><p>Your records are encrypted on this device. Enter your passphrase to continue.</p><form id="unlockForm"><div class="field"><label for="unlockPassphrase">Passphrase</label><input class="input" id="unlockPassphrase" name="passphrase" type="password" autocomplete="current-password" required></div><button class="button" type="submit">Unlock vault</button><p id="unlockError" class="field-help" role="alert"></p></form><p class="field-help">Lost your passphrase? Reset this device vault, then restore a JSON backup.</p><button class="text-button" data-action="reset-locked">Reset this vault</button></section>`;
  $('#unlockPassphrase')?.focus();
}
async function unlockVault(form){
  const button=$('button[type="submit"]',form),error=$('#unlockError');
  button.disabled=true;button.textContent='Unlocking…';error.textContent='';
  try{
    const salt=base64ToBytes(lockedRecord.salt),iterations=Number(lockedRecord.iterations)||250000;
    const key=await deriveKey(String(new FormData(form).get('passphrase')||''),salt,iterations);
    const opened=await openSealedVault(lockedRecord,key);
    vault={...defaults(),...opened};lastSavedVault=cloneVault(vault);
    encryptionKey=key;encryptionSalt=salt;lockedRecord=null;storageError='';
    document.body.classList.remove('vault-locked');applyTheme();render();scheduleDigest();
    toast('Vault unlocked.');
    const action=new URL(location.href).searchParams.get('action');if(action==='add')openTransaction(null,{},true);if(action==='search')openSearch();
  }catch(e){error.textContent='Could not unlock. Check the passphrase or restore from a backup.';button.disabled=false;button.textContent='Unlock vault';}
}
async function resetLockedVault(){
  if(!isLocked()||!confirm('Erase this encrypted vault from this browser? You can restore records only from a JSON backup. This cannot be undone.'))return;
  try{
    await dbRawSave(defaults());
    lockedRecord=null;encryptionKey=null;encryptionSalt=null;vault=defaults();lastSavedVault=cloneVault(vault);
    document.body.classList.remove('vault-locked');setPage('settings');toast('Vault reset. Restore a backup from Your data.');
  }catch(e){const error=$('#unlockError');if(error)error.textContent=`Could not reset vault: ${e.message}`;}
}
function protectVault(){
  if(!globalThis.crypto?.subtle)return toast('Encrypted storage requires HTTPS or localhost.');
  modal('Protect your vault','Choose a passphrase you can remember. It cannot be recovered from this browser.',`<div class="field"><label for="newPassphrase">Passphrase (at least 12 characters)</label><input class="input" id="newPassphrase" name="passphrase" type="password" minlength="12" autocomplete="new-password" required></div><div class="field section-gap"><label for="confirmPassphrase">Confirm passphrase</label><input class="input" id="confirmPassphrase" name="confirm" type="password" minlength="12" autocomplete="new-password" required></div><p class="field-help">The on-device vault will be encrypted. Exported iOS-compatible JSON backups remain unencrypted.</p>`,'Protect vault','protectForm');
}
async function commitProtection(form){
  const values=new FormData(form),passphrase=String(values.get('passphrase')||'');
  if(passphrase.length<12||passphrase!==values.get('confirm'))return toast('Use at least 12 characters and make both entries match.');
  const button=$('[data-action="save-modal"]',form);button.disabled=true;button.textContent='Encrypting…';
  const salt=crypto.getRandomValues(new Uint8Array(16));
  try{
    await saveQueue;
    const key=await deriveKey(passphrase,salt);
    encryptionKey=key;encryptionSalt=salt;
    await dbSave(vault);
    lastSavedVault=cloneVault(vault);$('#modalRoot').innerHTML='';render();toast('Vault encrypted. Use Lock now to protect it when away.');
  }catch(e){encryptionKey=null;encryptionSalt=null;button.disabled=false;button.textContent='Protect vault';toast(`Could not encrypt vault: ${e.message}`)}
}
async function lockVault(){
  if(!encryptionKey)return;
  try{await saveQueue;var record=await dbGet()}catch(e){toast(`Could not lock vault: ${e.message}`);return}
  if(record?.format!==ENCRYPTION_FORMAT)return toast('Could not lock: encrypted data was not found.');
  lockedRecord=record;encryptionKey=null;encryptionSalt=null;vault=defaults();lastSavedVault=null;
  pendingRestore=null;previousFocus=null;lastSavedTransactionId=null;searchText='';billQuery='';
  clearInterval(window.digestInterval);const status=$('#toast');if(status){status.textContent='';status.classList.remove('show')}showLockScreen();
}
function persist(message='Saved on this device'){
  if(isLocked())return Promise.resolve(false);
  const candidate=cloneVault(vault),version=++saveVersion;
  const write=saveQueue.then(async()=>{
    let wrote=false;
    try{
      await dbSave(candidate);wrote=true;
      const readback=await dbGet();
      const stored=encryptionKey?await openSealedVault(readback,encryptionKey):readback;
      if(JSON.stringify(stored)!==JSON.stringify(candidate))throw new Error('Saved data could not be verified.');
      lastSavedVault=cloneVault(candidate);
      storageError='';
      if(version===saveVersion)toast(message);
      return true;
    }catch(e){
      let rollbackError=null;
      if(wrote&&lastSavedVault)try{await dbSave(lastSavedVault)}catch(error){rollbackError=error}
      if(version===saveVersion){
        if(lastSavedVault) vault=cloneVault(lastSavedVault);
        storageError=rollbackError?`Save verification failed and rollback also failed: ${rollbackError.message}. Restore from a backup before continuing.`:`${e?.message||'Unknown storage error'} Your last saved records were retained.`;
        applyTheme();render();toast(`Could not save. ${e?.message||'Storage is unavailable.'}`);
      }
      return false;
    }
  });
  saveQueue=write;
  return write;
}
function catId(t){return t.categoryId || (typeof t.category==='string'?t.category:t.category?.id) || 'other'}
function billCatId(b){return typeof b.category==='string'?b.category:b.category?.id||'utilities'}
function categories(){return [...BUILT_INS,...(vault.customCategories||[]).map(c=>({id:c.id,name:c.displayName||c.name||c.id,icon:c.icon||(/^[-\w.]+$/.test(c.sfSymbol||'')?'✦':c.sfSymbol)||'✦',color:c.color||c.colorHex||'#8E6CEF',...c}))]}
function category(id){return categories().find(c=>c.id===id)||{id,name:id,icon:'·',color:'#9ca49f'}}
function vaultCategory(id,existing){const c=(vault.customCategories||[]).find(x=>x.id===id);if(c)return {...(existing&&typeof existing==='object'?existing:{}),id:c.id,displayName:c.displayName||c.name||c.id,sfSymbol:c.sfSymbol||c.icon||'✦',colorHex:c.colorHex||c.color||'#8E6CEF',isCustom:true};return existing&&typeof existing==='object'&&existing.id===id?existing:(id||existing||'other')}
function asTransactions(){return (vault.expenses||[]).map(t=>({...t,dateMs:t.dateMs??(typeof t.date==='number'?appleToDate(t.date).getTime():new Date(t.date).getTime()),originalAppleDate:t.originalAppleDate??(typeof t.date==='number'?t.date:null),categoryId:catId(t)}))}
function cleanTransaction(t){const x={...t};delete x.dateMs;delete x.originalAppleDate;delete x.categoryId;delete x._categoryChanged;delete x._dateChanged;x.date=Number.isFinite(t.originalAppleDate)?t.originalAppleDate:dateToApple(t.dateMs);x.category=vaultCategory(t.categoryId,t.category);return x}
function transactionById(id){return asTransactions().find(t=>t.id===id)}
function currentCycle(now=new Date()){const day=Math.min(28,Math.max(1,Number(vault.cycleStartDay)||1));let y=now.getFullYear(),m=now.getMonth();if(now.getDate()<day){m--;if(m<0){m=11;y--}}return {start:new Date(y,m,day),end:new Date(y,m+1,day)}}
function periodRange(period,start='',end=''){const now=new Date(),today=startDay(now);if(period==='Today')return [today,addDays(today,1)];if(period==='Week'){const monday=addDays(today,-((today.getDay()+6)%7));return [monday,addDays(monday,7)]}if(period==='Month'){const c=currentCycle(now);return [c.start,c.end]}if(period==='Quarter'){const q=Math.floor(now.getMonth()/3)*3;return [new Date(now.getFullYear(),q,1),new Date(now.getFullYear(),q+3,1)]}if(period==='Year')return [new Date(now.getFullYear(),0,1),new Date(now.getFullYear()+1,0,1)];if(period==='Custom'){let a=start?new Date(`${start}T00:00:00`):today,b=end?addDays(new Date(`${end}T00:00:00`),1):addDays(today,1);if(b<=a)b=addDays(a,1);return [a,b]}return [today,addDays(today,1)]}
function previousRange(period,a,b){if(period==='Today')return [addDays(a,-1),a];if(period==='Week')return [addDays(a,-7),a];if(period==='Month'){const p=new Date(a.getFullYear(),a.getMonth()-1,a.getDate());return [p,a]}if(period==='Quarter'){const p=new Date(a.getFullYear(),a.getMonth()-3,1);return [p,a]}if(period==='Year'){const p=new Date(a.getFullYear()-1,0,1);return [p,a]}const span=dayDiff(a,b);return [addDays(a,-span),a]}
function txInRange(t,a,b){return t.dateMs>=a.getTime()&&t.dateMs<b.getTime()}
function cents(value){return Math.round((Number(value||0)+Number.EPSILON)*100)}
function outflow(ts){return ts.filter(t=>t.isExpense===true).reduce((a,t)=>a+cents(t.amount),0)/100}
function fmtDate(ms,opts={month:'short',day:'numeric'}){return new Intl.DateTimeFormat('en-IN',opts).format(new Date(ms))}
function dueDate(bill,now=new Date()){let y=now.getFullYear(),m=now.getMonth(),day=Math.max(1,Math.min(31,Number(bill.dueDay)||1));let due=new Date(y,m,Math.min(day,new Date(y,m+1,0).getDate()));if(startDay(due)<startDay(now)){m++;due=new Date(y,m,Math.min(day,new Date(y,m+1,0).getDate()))}return due}
function makePageHeading(kicker,title,description,action=''){return `<div class="page-heading"><div><span class="page-kicker">${kicker}</span><h1>${title}</h1><p>${description}</p></div>${action}</div>`}
function setPage(page,fromHistory=false){currentPage=page;if(!fromHistory&&location.hash!==`#${page}`)history.pushState({page},'',`#${page}`);$$('[data-page]').forEach(b=>{b.classList.toggle('active',b.dataset.page===page);if(b.dataset.page===page)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current')});render()}
function render(){
  const root=$('#pageContent');if(!root)return;
  if(isLocked()){showLockScreen();return}
  const pages={home:renderHome,bills:renderBills,trends:renderTrends,settings:renderSettings};
  try{
    root.innerHTML=`${storageError?`<div class="notice warning storage-warning" role="alert"><strong>Storage needs attention.</strong> ${esc(storageError)} ${location.protocol==='file:'?'Open the app from localhost or HTTPS, then reload.':'Check available browser storage and try again.'}</div>`:''}${(pages[currentPage]||renderHome)()}`;
  }catch(e){
    console.error('Could not display records:',e);
    root.innerHTML=`<div class="notice warning storage-warning" role="alert"><strong>Could not display this page.</strong> ${esc(e?.message||'Unknown error')} Your saved vault has not been deleted. <button class="text-button" data-page="settings">Open Settings for backup options →</button></div>`;
  }
  $$('[data-page]').forEach(b=>{b.classList.toggle('active',b.dataset.page===currentPage);if(b.dataset.page===currentPage)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current')});
}
function transactionRow(t,actions=true){const c=category(catId(t)),date=new Date(t.dateMs);return `<div class="transaction" data-tx="${esc(t.id)}"><div class="transaction-icon" style="color:${safeColor(c.color)}">${esc(c.icon)}</div><div class="transaction-info"><div class="transaction-title">${esc(t.title)}</div><div class="transaction-meta">${esc(c.name)} · ${fmtDate(date,{month:'short',day:'numeric',year:date.getFullYear()===new Date().getFullYear()?undefined:'numeric'})}${t.notes?` · ${esc(t.notes)}`:''}</div></div><div class="transaction-amount ${t.isExpense===false?'income':''}">${t.isExpense===false?'+':'−'}${money(t.amount)}</div>${actions?`<div class="transaction-actions"><button data-action="edit-tx" data-id="${esc(t.id)}" aria-label="Edit ${esc(t.title)}">✎</button><button data-action="delete-tx" data-id="${esc(t.id)}" aria-label="Delete ${esc(t.title)}">×</button></div>`:''}</div>`}
function groupedTransactions(items){
  let day='';
  return items.map(t=>{
    const key=localDate(t.dateMs),heading=key===day?'':`<h3 class="date-group">${fmtDate(t.dateMs,{weekday:'long',month:'short',day:'numeric',year:'numeric'})}</h3>`;
    day=key;
    return heading+transactionRow(t);
  }).join('');
}
function renderHome(){
  const ts=asTransactions().sort((a,b)=>b.dateMs-a.dateMs);
  const [a,b]=periodRange(horizon),selected=ts.filter(t=>txInRange(t,a,b));
  const spent=outflow(selected);
  const income=selected.filter(t=>t.isExpense===false).reduce((s,t)=>s+cents(t.amount),0)/100;
  const [pa,pb]=previousRange(horizon,a,b),previous=outflow(ts.filter(t=>txInRange(t,pa,pb)));
  const cycle=currentCycle(),cycleTs=ts.filter(t=>txInRange(t,cycle.start,cycle.end));
  const cycleSpend=outflow(cycleTs),cycleDays=Math.max(1,dayDiff(cycle.start,cycle.end));
  const weekRange=periodRange('Week'),weekSpend=outflow(ts.filter(t=>txInRange(t,weekRange[0],weekRange[1])));
  const weeklyTarget=Number(vault.monthlyBudget||0)/cycleDays*7;
  const today=startDay(new Date()),todaySpend=outflow(ts.filter(t=>txInRange(t,today,addDays(today,1))));
  const elapsed=Math.max(1,dayDiff(cycle.start,today)+1),remainingDays=Math.max(1,dayDiff(today,cycle.end));
  const remaining=Math.max(0,Number(vault.monthlyBudget||0)-cycleSpend);
  const runway=Math.max(0,Number(vault.monthlyBudget||0)-(cycleSpend-todaySpend))/remainingDays;
  const progress=vault.monthlyBudget>0?Math.min(100,cycleSpend/vault.monthlyBudget*100):0;
  const catTotals={};
  selected.filter(t=>t.isExpense===true).forEach(t=>catTotals[catId(t)]=((cents(catTotals[catId(t)])||0)+cents(t.amount))/100);
  const top=Object.entries(catTotals).sort((x,y)=>y[1]-x[1])[0];
  const upcoming=(vault.recurringBills||[]).filter(x=>!x.isPaid).map(x=>({...x,nextDue:dueDate(x)})).filter(x=>{const days=dayDiff(today,x.nextDue);return days>=0&&days<=7}).sort((x,y)=>x.nextDue-y.nextDue);
  const saved=lastSavedTransactionId?ts.find(t=>t.id===lastSavedTransactionId):null;
  const pendingCount=(vault.pendingCaptures||[]).length;
  return `${makePageHeading('YOUR MONEY AT A GLANCE',`Good ${new Date().getHours()<12?'morning':new Date().getHours()<18?'afternoon':'evening'}`,'A little clarity goes a long way.',`<div class="heading-actions">${pendingCount?`<button class="button secondary small" data-action="review-pending">Review ${pendingCount} pending</button>`:''}<button class="button secondary small" data-action="capture">Paste payment</button><button class="button secondary small" data-action="quick-add">Quick add</button><button class="button" data-action="add-tx">＋ &nbsp;Add transaction</button></div>`)}
  ${saved?`<div class="notice saved-notice" role="status"><strong>Saved: ${esc(saved.title)} · ${money(saved.amount)}</strong><button class="text-button" data-action="edit-tx" data-id="${esc(saved.id)}">View transaction →</button></div>`:''}
  <div class="overview-grid"><section class="hero-card"><span class="page-kicker">${horizon.toUpperCase()} SPENDING</span><div class="horizon-switch">${['Today','Week','Month'].map(x=>`<button class="${horizon===x?'active':''}" aria-pressed="${horizon===x}" data-horizon="${x}">${x}</button>`).join('')}</div><div class="hero-amount">${money(spent)}</div><div class="hero-caption">outflow in this ${horizon.toLowerCase()} · ${money(previous)} in previous ${horizon.toLowerCase()}${income?` · ${money(income)} income recorded`:''}</div><div class="hero-meta"><div>SAFE DAILY RUNWAY<strong>${money(runway)}</strong></div><div>TOP CATEGORY<strong>${top?esc(category(top[0]).name):'—'}</strong></div><div>AVERAGE / DAY<strong>${money(cycleSpend/elapsed)}</strong></div></div></section><section class="budget-card"><div class="card-top"><div><div class="card-title">Monthly envelope</div><div class="card-subtitle">Cycle starts on day ${Number(vault.cycleStartDay)||1}</div></div><button class="text-button" data-page="settings">Edit budget</button></div><div><div class="budget-progress"><span style="width:${progress}%"></span></div><div class="budget-row"><span><strong>${money(cycleSpend)}</strong> spent</span><span><strong>${money(remaining)}</strong> left</span></div></div></section></div>
  <div class="stats-row"><div class="metric-card"><div class="metric-label">TODAY'S SPEND</div><div class="metric-value">${money(todaySpend)}</div><div class="metric-note">${money(Math.max(0,runway-todaySpend))} available today</div></div><div class="metric-card"><div class="metric-label">CYCLE PROJECTION</div><div class="metric-value">${money(cycleSpend+(cycleSpend/elapsed)*Math.max(0,remainingDays-1))}</div><div class="metric-note">at your current pace</div></div><div class="metric-card"><div class="metric-label">BUDGET PROGRESS</div><div class="metric-value">${progress.toFixed(0)}%</div><div class="metric-note">${elapsed} days into this cycle</div></div><div class="metric-card"><div class="metric-label">WEEKLY PACE</div><div class="metric-value">${money(weekSpend)}</div><div class="metric-note">target ${money(weeklyTarget)} this week</div></div></div>
  <div class="content-grid"><section class="panel"><div class="panel-head"><h2>Recent activity</h2><button class="text-button" data-action="open-search">Search transactions →</button></div>${ts.length?`<div class="transaction-list">${groupedTransactions(ts.slice(0,50))}</div>`:`<div class="empty-state">Your story starts with the first transaction.<br><button class="text-button" data-action="add-tx">Add one now →</button></div>`}</section><section class="panel"><div class="panel-head"><h2>Where it went</h2><button class="text-button" data-page="trends">Explore trends →</button></div>${Object.entries(catTotals).sort((x,y)=>y[1]-x[1]).slice(0,5).map(([id,value])=>{const c=category(id),max=Math.max(...Object.values(catTotals),1);return `<div class="category-row"><span class="category-dot" style="background:${safeColor(c.color)}"></span><span class="category-name">${esc(c.name)}</span><span class="category-track"><span style="width:${value/max*100}%;background:${safeColor(c.color)}"></span></span><span class="category-value">${money(value)}</span></div>`}).join('')||'<div class="empty-state">Your category breakdown will appear here.</div>'}</section></div>
  <section class="panel section-gap"><div class="panel-head"><h2>Coming up</h2><button class="text-button" data-page="bills">All bills →</button></div>${upcoming.length?upcoming.map(x=>`<div class="due-card"><div class="due-date"><strong>${x.nextDue.getDate()}</strong><small>${x.nextDue.toLocaleDateString('en',{month:'short'})}</small></div><div class="due-info"><strong>${esc(x.title)}</strong><small>${esc(category(billCatId(x)).name)} · ${dayDiff(today,x.nextDue)===0?'Due today':`Due in ${dayDiff(today,x.nextDue)} days`}</small></div><span class="due-amount">${money(x.amount)}</span></div>`).join(''):'<div class="empty-state">No unpaid bills due in the next seven days.</div>'}</section>`;
}
function renderBills(){let bills=[...(vault.recurringBills||[])].map(x=>({...x,nextDue:dueDate(x)})).sort((a,b)=>a.nextDue-b.nextDue);const q=billQuery.trim().toLowerCase();if(q)bills=bills.filter(b=>`${b.title} ${category(billCatId(b)).name} ${b.amount}`.toLowerCase().includes(q));if(billCategory!=='all')bills=bills.filter(b=>billCatId(b)===billCategory);return `${makePageHeading('RECURRING COMMITMENTS','Bills & subscriptions','Keep fixed costs in view.',`<button class="button" data-action="add-bill">＋ &nbsp;Add bill</button>`)}<section class="panel"><div class="panel-head"><h2>Your monthly bills</h2><span class="page-kicker">${bills.length} ACTIVE</span></div><div class="search-row"><input class="input" id="billSearch" aria-label="Search bills" placeholder="Search bills…" value="${esc(billQuery)}"><select class="select filter-select" id="billCategory" aria-label="Bill category"><option value="all">All categories</option>${categories().map(c=>`<option value="${esc(c.id)}" ${billCategory===c.id?'selected':''}>${esc(c.name)}</option>`).join('')}</select></div>${bills.length?bills.map(b=>`<div class="due-card"><div class="due-date"><strong>${b.nextDue.getDate()}</strong><small>${b.nextDue.toLocaleDateString('en',{month:'short'})}</small></div><div class="due-info"><strong>${esc(b.title)}</strong><small>${esc(category(billCatId(b)).name)} · Day ${b.dueDay} each month${b.isPaid?' · Paid this cycle':''}</small></div><span class="due-amount">${money(b.amount)}</span><button class="button small ${b.isPaid?'soft':'secondary'}" data-action="toggle-bill" data-id="${esc(b.id)}">${b.isPaid?'Paid ✓':'Mark paid'}</button><button class="text-button" data-action="edit-bill" data-id="${esc(b.id)}" aria-label="Edit bill">✎</button><button class="text-button" data-action="delete-bill" data-id="${esc(b.id)}" aria-label="Delete bill">×</button></div>`).join(''):'<div class="empty-state">No recurring bills yet. Add the monthly commitments you want to keep visible.</div>'}</section><section class="notice section-gap">Paid status is a current toggle. It does not create a payment record or change your transaction history.</section>`}
function chartBuckets(period,a,b,ts){
  const buckets=[];
  const add=(start,end,label)=>{
    const s=new Date(Math.max(start.getTime(),a.getTime()));
    const e=new Date(Math.min(end.getTime(),b.getTime()));
    if(s<e)buckets.push({start:s,end:e,label});
  };
  if(period==='Today'){
    for(let h=0;h<24;h+=3)add(new Date(a.getFullYear(),a.getMonth(),a.getDate(),h),new Date(a.getFullYear(),a.getMonth(),a.getDate(),h+3),`${h%12||12}${h<12?'a':'p'}`);
  }else if(period==='Week'){
    for(let i=0;i<7;i++){const s=addDays(a,i);add(s,addDays(s,1),['M','T','W','T','F','S','S'][i]);}
  }else if(period==='Year'||period==='Quarter'||(period==='Custom'&&dayDiff(a,b)>180)){
    for(let d=new Date(a.getFullYear(),a.getMonth(),1);d<b;d=new Date(d.getFullYear(),d.getMonth()+1,1)){
      add(d,new Date(d.getFullYear(),d.getMonth()+1,1),fmtDate(d.getTime(),{month:'short',year:'2-digit'}));
    }
  }else if(period==='Custom'&&dayDiff(a,b)>35){
    for(let d=addDays(a,-((a.getDay()+6)%7));d<b;d=addDays(d,7))add(d,addDays(d,7),fmtDate(d.getTime(),{day:'numeric',month:'short'}));
  }else{
    for(let d=new Date(a);d<b;d=addDays(d,1))add(d,addDays(d,1),period==='Custom'?fmtDate(d.getTime(),{day:'numeric',month:'short'}):String(d.getDate()));
  }
  return buckets.map(x=>({...x,value:outflow(ts.filter(t=>txInRange(t,x.start,x.end)))}));
}
function renderTrends(){
  const ts=asTransactions(),[a,b]=trendPeriod==='Custom'?periodRange('Custom',trendStart,trendEnd):periodRange(trendPeriod);
  const inPeriod=ts.filter(t=>txInRange(t,a,b)&&(trendCategory==='all'||catId(t)===trendCategory));
  const expenses=inPeriod.filter(t=>t.isExpense===true),total=outflow(expenses),days=Math.max(1,dayDiff(a,b)),avg=total/days;
  const [prevStart,prevEnd]=previousRange(trendPeriod,a,b);
  const prev=outflow(ts.filter(t=>txInRange(t,prevStart,prevEnd)&&(trendCategory==='all'||catId(t)===trendCategory)));
  const delta=prev?((total-prev)/prev*100):null;
  const buckets=chartBuckets(trendPeriod,a,b,expenses),max=Math.max(...buckets.map(x=>x.value),1);
  const cats={};expenses.forEach(t=>cats[catId(t)]=((cents(cats[catId(t)])||0)+cents(t.amount))/100);
  const visible=chartSelection?inPeriod.filter(t=>txInRange(t,chartSelection.start,chartSelection.end)):inPeriod;
  const budget=Number(vault.monthlyBudget||0),budgetCard=trendPeriod==='Month'?`<div class="metric-card"><div class="metric-label">CYCLE BUDGET</div><div class="metric-value">${money(budget)}</div><div class="metric-note">${money(Math.max(0,budget-total))} remaining</div></div>`:'';
  return `${makePageHeading('PATTERNS, NOT PRESSURE','Your spending story','Notice what is changing and make the next choice yours.')}
  <div class="table-head"><div class="period-tabs">${['Today','Week','Month','Quarter','Year','Custom'].map(x=>`<button class="${trendPeriod===x?'active':''}" aria-pressed="${trendPeriod===x}" data-trend-period="${x}">${x}</button>`).join('')}</div><select class="select filter-select" id="trendCategory" aria-label="Trend category"><option value="all">All categories</option>${categories().map(c=>`<option value="${esc(c.id)}" ${trendCategory===c.id?'selected':''}>${esc(c.name)}</option>`).join('')}</select></div>
  ${trendPeriod==='Custom'?`<div class="range-row section-gap"><label class="page-kicker" for="trendStart">FROM</label><input class="input" type="date" id="trendStart" value="${esc(trendStart||localDate(a))}"><label class="page-kicker" for="trendEnd">TO</label><input class="input" type="date" id="trendEnd" value="${esc(trendEnd||localDate(addDays(b,-1)))}"></div>`:''}
  <div class="trend-summary"><div class="metric-card"><div class="metric-label">TOTAL OUTFLOW</div><div class="metric-value">${money(total)}</div></div><div class="metric-card"><div class="metric-label">DAILY AVERAGE</div><div class="metric-value">${money(avg)}</div></div><div class="metric-card"><div class="metric-label">VS PREVIOUS ${trendPeriod.toUpperCase()}</div><div class="metric-value">${delta===null?'—':`${delta>0?'+':''}${delta.toFixed(0)}%`}</div><div class="metric-note">${delta===null?'No previous period spending':`${money(prev)} · ${fmtDate(prevStart.getTime())}–${fmtDate(addDays(prevEnd,-1).getTime())}`}</div></div>${budgetCard}</div>
  <section class="panel section-gap"><div class="panel-head"><h2>Spending over time</h2><span class="page-kicker">${fmtDate(a.getTime())} — ${fmtDate(addDays(b,-1).getTime())}</span></div><div class="chart-wrap">${buckets.map((x,i)=>`<button class="chart-col ${chartSelection?.index===i?'selected':''}" data-chart="${i}" aria-label="${esc(x.label)}: ${money(x.value)}" aria-pressed="${chartSelection?.index===i}"><span class="chart-amount">${x.value?money(x.value):''}</span><span class="chart-bar" style="height:${Math.max(x.value?3:1,x.value/max*125)}px"></span><span class="chart-label">${esc(x.label)}</span></button>`).join('')}</div></section>
  <div class="content-grid"><section class="panel"><div class="panel-head"><h2>Category outflow</h2>${chartSelection?'<button class="text-button" data-action="clear-chart">Clear chart filter</button>':''}</div>${Object.entries(cats).sort((x,y)=>y[1]-x[1]).map(([id,v])=>{const c=category(id);return `<button class="category-row" data-set-category="${esc(id)}" style="width:100%;border:0;background:none;text-align:left"><span class="category-dot" style="background:${safeColor(c.color)}"></span><span class="category-name">${esc(c.name)}</span><span class="category-track"><span style="width:${total?v/total*100:0}%;background:${safeColor(c.color)}"></span></span><span class="category-value">${money(v)}</span></button>`}).join('')||'<div class="empty-state">No spending in this period.</div>'}</section><section class="panel"><div class="panel-head"><h2>${chartSelection?'Selected bucket':'Period ledger'}</h2><span class="page-kicker">${visible.length} RECORDS</span></div>${visible.slice().sort((x,y)=>y.dateMs-x.dateMs).map(t=>transactionRow(t)).join('')||'<div class="empty-state">No transactions in this selection.</div>'}</section></div>`;
}
function renderSettings(){const custom=vault.customCategories||[];return `${makePageHeading('BUILT AROUND YOUR COMFORT','Settings & privacy','A few thoughtful choices make this feel like yours.')}<div class="settings-columns"><section class="panel"><div class="setting-block"><h3>Monthly budget</h3><div class="form-grid"><div class="field"><label for="monthlyBudget">Budget amount (₹)</label><input class="input" id="monthlyBudget" type="number" min="0" step="0.01" value="${esc(vault.monthlyBudget)}"></div><div class="field"><label for="cycleStartDay">Cycle starts on day</label><input class="input" id="cycleStartDay" type="number" min="1" max="28" value="${esc(vault.cycleStartDay)}"><small class="field-help">Choose 1–28 so every month has this date.</small></div></div><div class="setting-actions"><button class="button small" data-action="save-budget">Save budget</button></div></div><div class="setting-block"><h3>Appearance</h3><div class="field"><label for="themeMode">Theme</label><select class="select" id="themeMode"><option value="system" ${vault.appThemeMode==='system'?'selected':''}>Use device setting</option><option value="light" ${vault.appThemeMode==='light'?'selected':''}>Light</option><option value="dark" ${vault.appThemeMode==='dark'?'selected':''}>Dark</option></select></div></div><div class="setting-block"><h3>Preferences</h3><div class="toggle-row"><div class="toggle-copy"><strong>Haptics</strong><small>Use subtle vibration where supported.</small></div><label class="toggle"><input type="checkbox" data-pref="hapticsEnabled" ${vault.hapticsEnabled?'checked':''}><span></span></label></div><div class="toggle-row"><div class="toggle-copy"><strong>Sound effects</strong><small>Play a soft confirmation tone when saving, where supported.</small></div><label class="toggle"><input type="checkbox" data-pref="soundsEnabled" ${vault.soundsEnabled?'checked':''}><span></span></label></div></div><div class="setting-block"><h3>Spending digest</h3><div class="toggle-row"><div class="toggle-copy"><strong>Daily or monthly reminder</strong><small>Notifications need permission and the app open at the reminder time.</small></div><label class="toggle"><input type="checkbox" id="summaryEnabled" ${vault.summaryEnabled?'checked':''}><span></span></label></div><div class="form-grid"><div class="field"><label for="summaryPeriod">Digest period</label><select class="select" id="summaryPeriod"><option value="daily" ${vault.summaryPeriod==='daily'?'selected':''}>Daily</option><option value="monthly" ${vault.summaryPeriod==='monthly'?'selected':''}>Monthly</option></select></div><div class="field"><label for="summaryTime">Time</label><input class="input" id="summaryTime" type="time" value="${esc(vault.summaryTime||'20:00')}"></div><div class="field"><label for="summaryDay">Monthly day</label><input class="input" id="summaryDay" type="number" min="1" max="28" value="${esc(vault.summaryDay||1)}"></div></div><div class="setting-actions"><button class="button small" data-action="save-digest">Save digest</button></div></div></section><section class="panel"><div class="setting-block"><h3>Your categories</h3><p class="card-subtitle">Personalize your spending labels. Deleting a category moves its transactions to Other.</p>${custom.map(c=>`<div class="category-manage"><span class="cat-color" style="background:${safeColor(c.colorHex||c.color)}"></span><span class="cat-label">${esc(c.displayName||c.name||c.id)}</span><button data-action="edit-category" data-id="${esc(c.id)}" aria-label="Edit category">✎</button><button data-action="delete-category" data-id="${esc(c.id)}" aria-label="Delete category">×</button></div>`).join('')||'<div class="empty-state">Add your own categories when you need them.</div>'}<div class="setting-actions"><button class="button secondary small" data-action="add-category">＋ Add category</button></div></div><div class="setting-block"><h3>Your data</h3><div class="notice">Your records stay in this browser profile. This PWA does not use an account, server sync, or telemetry. ${encryptionKey?"This browser vault is encrypted with your passphrase.":"Browser profile storage is not separately encrypted by this app."}</div><div class="setting-actions"><button class="button secondary small" data-action="export">↓ Export JSON backup</button><button class="button secondary small" data-action="share-backup">Share backup</button><label class="button secondary small file-picker-label">↑ Restore backup<input id="importFile" type="file" accept="application/json,.json,.txt" class="file-picker-input"></label></div><p class="field-help">Backups contain sensitive financial records and are not encrypted. Keep them somewhere private.</p></div><div class="setting-block"><h3>Delete all data</h3><p class="card-subtitle">This permanently deletes transactions, bills, categories, preferences, pending reviews, and passphrase protection from this browser.</p><div class="setting-actions"><button class="button danger small" data-action="delete-all">Delete everything</button></div></div><div class="setting-block"><h3>Device security</h3><div class="notice">${encryptionKey?"This vault is encrypted on this device. Lock it when you leave; it also locks after two minutes in a hidden tab. Keep your passphrase and an exported backup safe.":"Add a passphrase to encrypt this browser vault. Without one, browser profile storage is not separately encrypted by this app."} iOS biometric settings in a backup do not lock this PWA.</div><div class="setting-actions">${encryptionKey?'<button class="button secondary small" data-action="lock-vault">Lock now</button>':'<button class="button secondary small" data-action="protect-vault">Protect with passphrase</button>'}</div></div></section></div>`}
function closeModal(){
  $('#modalRoot').innerHTML='';pendingRestore=null;
  if(previousFocus?.isConnected)previousFocus.focus();
  previousFocus=null;
}
function modal(title,subtitle,body,submit='Save',formId='modalForm'){
  if(!$('#modalRoot .modal'))previousFocus=document.activeElement;
  const root=$('#modalRoot');
  root.innerHTML=`<div class="modal-backdrop" data-action="backdrop"><section class="modal" role="dialog" aria-modal="true" aria-label="${esc(title)}"><div class="modal-head"><div><h2>${esc(title)}</h2><p>${esc(subtitle||'')}</p></div><button class="close-button" data-action="close-modal" aria-label="Close">×</button></div><form id="${formId}">${body}${submit?`<div class="modal-actions"><button type="button" class="button secondary" data-action="close-modal">Cancel</button><button type="button" class="button" data-action="save-modal">${esc(submit)}</button></div>`:''}</form></section></div>`;
  const first=$('input:not([type=hidden]),select,textarea',root)||$('button',root);first?.focus();
  const save=$('[data-action="save-modal"]',root);
  save?.addEventListener('click',event=>{
    event.stopPropagation();
    const form=save.closest('form');if(!form)return;
    const valid=form.reportValidity?form.reportValidity():form.checkValidity();
    if(!valid){form.querySelector(':invalid')?.focus();return}
    interactionFeedback();processModalForm(form);
  });
}
function categoryOptions(selected='other'){const known=categories(),extra=known.some(c=>c.id===selected)?'':`<option value="${esc(selected)}" selected>${esc(selected)} (unlisted)</option>`;return extra+known.map(c=>`<option value="${esc(c.id)}" ${c.id===selected?'selected':''}>${esc(c.name)}</option>`).join('')}
function uid(){return globalThis.crypto?.randomUUID?crypto.randomUUID():`ws-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,10)}`}
function openTransaction(id=null,prefill={},quick=false){
  const t=id?transactionById(id):null;if(id&&!t)return;
  const date=t?new Date(t.dateMs):new Date(),tags=Array.isArray(t?.tags)?t.tags.join(', '):'';
  const details=`<div class="form-grid"><div class="field"><label for="txDate">Date</label><input class="input" id="txDate" name="date" type="date" required value="${localDate(date)}"></div><div class="field"><label>Direction</label><div class="radio-row"><label class="radio-chip"><input type="radio" name="direction" value="expense" ${(!t||t.isExpense!==false)?'checked':''}> Expense</label><label class="radio-chip"><input type="radio" name="direction" value="income" ${t?.isExpense===false?'checked':''}> Income / refund</label></div></div><div class="field full"><label for="txTags">Tags</label><input class="input" id="txTags" name="tags" value="${esc(tags)}" placeholder="travel, work"></div><div class="field full"><label for="txNotes">Notes</label><textarea class="textarea" id="txNotes" name="notes" maxlength="1000">${esc(t?.notes||'')}</textarea></div></div>`;
  modal(id?'Edit transaction':quick?'Quick add':'Add transaction',quick?'Amount, category, and title first. Add more details if you need them.':'Keep the details that help you understand the choice.',`
    <div class="form-grid ${quick?'quick-form':''}">
      <div class="field ${quick?'':'full'}"><label for="txAmount">Amount (₹)</label><input class="input" id="txAmount" name="amount" inputmode="decimal" type="number" min="0.01" step="0.01" required value="${esc(t?.amount??prefill.amount??'')}"></div>
      <div class="field"><label for="txCategory">Category</label><select class="select" id="txCategory" name="category">${categoryOptions(t?catId(t):prefill.category||'food')}</select></div>
      <div class="field full"><label for="txTitle">Title</label><input class="input" id="txTitle" name="title" required maxlength="100" value="${esc(t?.title||prefill.title||'')}"></div>
    </div>${quick?`<details class="more-details"><summary>More details</summary>${details}</details>`:details}
    <input type="hidden" name="id" value="${esc(id||'')}">
    ${prefill.sourceIdentifier?`<input type="hidden" name="sourceIdentifier" value="${esc(prefill.sourceIdentifier)}">`:''}${prefill.pendingId?`<input type="hidden" name="pendingId" value="${esc(prefill.pendingId)}">`:''}
  `,'Save transaction');
  if(quick)$('#txAmount')?.focus();
}
function openSearch(){modal('Find a transaction','Search titles, categories, notes, tags, and amounts.',`<div class="search-row"><input class="input" id="searchTransactions" aria-label="Search transactions" placeholder="Search transactions…" value="${esc(searchText)}"><select class="select filter-select" id="searchCategory" aria-label="Transaction category"><option value="all">All categories</option>${categories().map(c=>`<option value="${esc(c.id)}" ${searchCategory===c.id?'selected':''}>${esc(c.name)}</option>`).join('')}</select></div><div class="search-row"><select class="select" id="searchBand" aria-label="Transaction amount"><option value="all">Any amount</option><option value="under500" ${searchBand==='under500'?'selected':''}>Under ₹500</option><option value="500to2000" ${searchBand==='500to2000'?'selected':''}>₹500–₹2,000</option><option value="over2000" ${searchBand==='over2000'?'selected':''}>Above ₹2,000</option></select></div><div id="searchResults" class="transaction-list search-result"></div>`,'Close','searchForm');const form=$('#searchForm');form.querySelector('.modal-actions').innerHTML='<button type="button" class="button secondary" data-action="close-modal">Close</button>';renderSearchResults()}
function renderSearchResults(){
  const root=$('#searchResults');if(!root)return;
  let ts=asTransactions().sort((a,b)=>b.dateMs-a.dateMs);
  const q=searchText.trim().toLowerCase();
  if(q)ts=ts.filter(t=>[t.title,category(catId(t)).name,t.notes,...(t.tags||[]),String(Math.round(Number(t.amount||0)))].join(' ').toLowerCase().includes(q));
  if(searchCategory!=='all')ts=ts.filter(t=>catId(t)===searchCategory);
  ts=ts.filter(t=>{const n=Number(t.amount||0);return searchBand==='under500'?n<500:searchBand==='500to2000'?n>=500&&n<=2000:searchBand==='over2000'?n>2000:true});
  root.innerHTML=ts.map(t=>`<div class="search-entry" role="button" tabindex="0" data-tx="${esc(t.id)}" aria-label="Edit ${esc(t.title)}, ${money(t.amount)}">${transactionRow(t,false)}</div>`).join('')||'<div class="empty-state">No matching transactions.</div>';
  $$('[data-tx].search-entry',root).forEach(row=>{
    const open=()=>{$('#modalRoot').innerHTML='';openTransaction(row.dataset.tx)};
    row.addEventListener('click',open);
    row.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();open()}});
  });
}
function openBill(id=null){const b=(vault.recurringBills||[]).find(x=>x.id===id);modal(id?'Edit bill':'Add recurring bill','A monthly commitment to keep on your radar.',`<div class="form-grid"><div class="field full"><label for="billTitle">Bill name</label><input class="input" id="billTitle" name="title" required maxlength="100" value="${esc(b?.title||'')}"></div><div class="field"><label for="billAmount">Amount (₹)</label><input class="input" id="billAmount" name="amount" type="number" min="0.01" step="0.01" required value="${esc(b?.amount??'')}"></div><div class="field"><label for="billDue">Due day</label><input class="input" id="billDue" name="dueDay" type="number" min="1" max="31" required value="${esc(b?.dueDay??1)}"></div><div class="field"><label for="billCategory">Category</label><select class="select" id="billCategory" name="category">${categoryOptions(b?billCatId(b):'utilities')}</select></div><div class="field"><label class="toggle-row" style="border:0;padding:0"><span class="toggle-copy"><strong>Paid this cycle</strong></span><span class="toggle"><input type="checkbox" name="isPaid" ${b?.isPaid?'checked':''}><span></span></span></label></div></div><input type="hidden" name="id" value="${esc(id||'')}">`,'Save bill')}
function openCategory(id=null){const c=(vault.customCategories||[]).find(x=>x.id===id);modal(id?'Edit category':'Add category','Make it easy to recognize where your money goes.',`<div class="form-grid"><div class="field full"><label for="categoryName">Name</label><input class="input" id="categoryName" name="name" maxlength="40" required value="${esc(c?.displayName||'')}"></div><div class="field"><label for="categoryIcon">Icon or symbol</label><input class="input" id="categoryIcon" name="icon" maxlength="40" value="${esc(c?.sfSymbol||c?.icon||'✦')}"></div><div class="field"><label for="categoryColor">Color</label><input class="input" id="categoryColor" name="color" type="color" value="${safeColor(c?.colorHex||c?.color)}"></div></div><input type="hidden" name="id" value="${esc(id||'')}">`,'Save category')}
function hasExistingData(){return Boolean(vault.expenses.length||vault.recurringBills.length||vault.customCategories.length||(vault.pendingCaptures||[]).length||vault.monthlyBudget!==50000||vault.cycleStartDay!==1||vault.appThemeMode!=='system'||vault.summaryEnabled||vault.summaryPeriod!=='daily'||vault.hapticsEnabled!==true||vault.soundsEnabled!==true||vault.biometricsEnabled)}
function readFileText(file){if(typeof file.text==='function')return file.text();return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result||''));reader.onerror=()=>reject(reader.error||new Error('The selected file could not be read.'));reader.readAsText(file)})}
function validateVault(data){
  if(!data||typeof data!=='object'||Array.isArray(data))throw new Error('The file must contain a JSON object.');
  const known=['expenses','monthlyBudget','cycleStartDay','customCategories','summaryEnabled','summaryPeriod','recurringBills','appThemeMode','biometricsEnabled','hapticsEnabled','soundsEnabled'];
  if(!known.some(key=>Object.prototype.hasOwnProperty.call(data,key)))throw new Error('This file does not look like a Well Spent backup. Choose a JSON vault exported by Well Spent.');
  for(const key of ['expenses','recurringBills','customCategories'])if(data[key]!==undefined&&!Array.isArray(data[key]))throw new Error(`“${key}” must be a list.`);
  const next={...defaults(),summaryEnabled:true,...data};
  next.customCategories=(data.customCategories||[]).map((c,i)=>{
    if(!c||typeof c!=='object'||Array.isArray(c)||typeof c.id!=='string'||!c.id.trim())throw new Error(`Custom category ${i+1} is missing its ID.`);
    if(c.displayName!==undefined&&typeof c.displayName!=='string')throw new Error(`Custom category ${i+1} has an invalid name.`);
    return c;
  });
  next.expenses=(data.expenses||[]).map((t,i)=>{
    if(!t||typeof t!=='object'||Array.isArray(t))throw new Error(`Transaction ${i+1} is not an object.`);
    if(typeof t.id!=='string'||!t.id.trim())throw new Error(`Transaction ${i+1} has no ID.`);
    if(typeof t.title!=='string'||!t.title.trim())throw new Error(`Transaction “${t.id}” has no title.`);
    const amount=Number(t.amount);
    if(!Number.isFinite(amount)||amount<=0)throw new Error(`Transaction “${t.title}” has an invalid amount.`);
    const decoded=decodeVaultDate(t.date);
    if(!Number.isFinite(decoded.date.getTime()))throw new Error(`Transaction “${t.title}” has an unreadable date.`);
    if(t.isExpense!==undefined&&typeof t.isExpense!=='boolean')throw new Error(`Transaction “${t.title}” has an invalid direction.`);
    if(t.category!==undefined&&typeof t.category!=='string'&&(!t.category||typeof t.category!=='object'||Array.isArray(t.category)||typeof t.category.id!=='string'))throw new Error(`Transaction “${t.title}” has an invalid category.`);
    if(t.notes!==undefined&&typeof t.notes!=='string')throw new Error(`Transaction “${t.title}” has invalid notes.`);
    if(t.tags!==undefined&&(!Array.isArray(t.tags)||t.tags.some(tag=>typeof tag!=='string')))throw new Error(`Transaction “${t.title}” has invalid tags.`);
    if(t.sourceIdentifier!==undefined&&typeof t.sourceIdentifier!=='string')throw new Error(`Transaction “${t.title}” has an invalid source identifier.`);
    return {...t,amount,date:decoded.appleSeconds,isExpense:t.isExpense!==false,notes:t.notes??'',tags:t.tags??[]};
  });
  next.recurringBills=(data.recurringBills||[]).map((bill,i)=>{
    if(!bill||typeof bill!=='object'||Array.isArray(bill)||typeof bill.id!=='string'||!bill.id.trim()||typeof bill.title!=='string'||!bill.title.trim())throw new Error(`Bill ${i+1} is missing its ID or title.`);
    const amount=Number(bill.amount),dueDay=Number(bill.dueDay);
    if(!Number.isFinite(amount)||amount<=0)throw new Error(`Bill “${bill.title}” has an invalid amount.`);
    if(!Number.isInteger(dueDay)||dueDay<1||dueDay>31)throw new Error(`Bill “${bill.title}” has an invalid due day.`);
    if(bill.isPaid!==undefined&&typeof bill.isPaid!=='boolean')throw new Error(`Bill “${bill.title}” has an invalid paid status.`);
    if(bill.category!==undefined&&typeof bill.category!=='string'&&(!bill.category||typeof bill.category!=='object'||Array.isArray(bill.category)||typeof bill.category.id!=='string'))throw new Error(`Bill “${bill.title}” has an invalid category.`);
    return {...bill,amount,dueDay,isPaid:bill.isPaid===true};
  });
  next.monthlyBudget=Number(next.monthlyBudget);next.cycleStartDay=Number(next.cycleStartDay);
  if(!Number.isFinite(next.monthlyBudget)||next.monthlyBudget<0)throw new Error('monthlyBudget must be zero or a positive number.');
  if(!Number.isInteger(next.cycleStartDay)||next.cycleStartDay<1||next.cycleStartDay>28)throw new Error('cycleStartDay must be between 1 and 28.');
  if(!['system','light','dark'].includes(next.appThemeMode))throw new Error('appThemeMode must be system, light, or dark.');
  if(!['daily','monthly'].includes(next.summaryPeriod))throw new Error('summaryPeriod must be daily or monthly.');
  for(const key of ['summaryEnabled','biometricsEnabled','hapticsEnabled','soundsEnabled'])if(typeof next[key]!=='boolean')throw new Error(`${key} must be true or false.`);
  return next;
}
function exportData(){
  const out={...vault,expenses:asTransactions().map(cleanTransaction),recurringBills:(vault.recurringBills||[]).map(b=>({...b,category:vaultCategory(billCatId(b),b.category)})),customCategories:vault.customCategories||[]};
  delete out.summaryTime;delete out.summaryDay;delete out.pendingCaptures;
  return JSON.stringify(out,null,2);
}
function exportVault(){
  const blob=new Blob([exportData()],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download='well_spent_vault.json';document.body.append(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),30000);
  toast('Backup downloaded. Keep it somewhere private.');
}
async function shareBackup(){
  if(typeof File==='undefined')return exportVault();
  const file=new File([exportData()],'well_spent_vault.json',{type:'application/json'});
  if(navigator.canShare?.({files:[file]})){
    try{await navigator.share({title:'Well Spent backup',files:[file]});return}catch(e){if(e?.name==='AbortError')return}
  }
  exportVault();
}
let pendingRestore=null;
function showRestoreError(message){modal('Backup could not be restored','Review the details before trying again.',`<div class="notice warning">${esc(message)}</div><div class="modal-actions"><button type="button" class="button" data-action="close-modal">Done</button></div>`,'','restoreError')}
function confirmRestore(candidate){pendingRestore=candidate;const count=candidate.expenses.length,bills=candidate.recurringBills.length;modal('Replace this vault?','This backup will replace the records on this device.',`<div class="notice warning"><strong>${count} transactions · ${bills} bills</strong><br>Current transactions, bills, pending reviews, categories, and settings will be replaced. This cannot be undone.</div>`,'Restore backup','restoreConfirm')}
async function commitRestore(candidate){
  const button=$('#restoreConfirm [data-action="save-modal"]');
  if(button){button.disabled=true;button.textContent='Restoring…'}
  const previous=vault;let wrote=false;
  try{
    await saveQueue;
    const localTime=vault.summaryTime,localDay=vault.summaryDay;
    const restored={...candidate,summaryTime:localTime||'20:00',summaryDay:localDay||1,pendingCaptures:[]};
    await dbSave(restored);wrote=true;
    const readback=await dbGet();
    const stored=encryptionKey?await openSealedVault(readback,encryptionKey):readback;
    if(JSON.stringify(stored)!==JSON.stringify(restored))throw new Error('Restored data could not be verified.');
    vault=restored;lastSavedVault=cloneVault(restored);storageError='';pendingRestore=null;lastSavedTransactionId=null;
    $('#modalRoot').innerHTML='';applyTheme();render();scheduleDigest();toast('Backup restored successfully.');
  }catch(e){
    let rollbackError=null;
    if(wrote)try{await dbSave(previous)}catch(error){rollbackError=error}
    vault=previous;pendingRestore=null;storageError=`Restore failed: ${e.message}`;applyTheme();render();
    showRestoreError(rollbackError?`Restore verification failed, and the previous vault could not be written back: ${rollbackError.message}. Recover from your backup before making more changes.`:`Could not save the restored backup. Your previous data was retained. ${e.message}`);
  }
}
async function importVaultFile(file){if(!file)return;try{const parsed=JSON.parse(await readFileText(file)),candidate=validateVault(parsed);if(hasExistingData())confirmRestore(candidate);else await commitRestore(candidate)}catch(e){showRestoreError(e?.message||'The file could not be read.')}finally{const input=$('#importFile');if(input)input.value=''}}
function processModalForm(form){if(form.id==='protectForm'){commitProtection(form);return}if(form.id==='restoreConfirm'){if(pendingRestore)commitRestore(pendingRestore);return}if(form.id!=='modalForm')return;if($('input[name="dueDay"]',form))submitBill(form);else if($('input[name="name"]',form))submitCategory(form);else submitTransaction(form)}
function submitTransaction(form){
  const f=new FormData(form),id=String(f.get('id')||''),old=id?transactionById(id):null;
  const title=String(f.get('title')||'').trim(),rawAmount=Number(f.get('amount'));
  const dateText=String(f.get('date')||''),date=new Date(`${dateText}T12:00:00`),categoryId=String(f.get('category')||'');
  if(!title||!Number.isFinite(rawAmount)||rawAmount<=0||!/^\d{4}-\d{2}-\d{2}$/.test(dateText)||!Number.isFinite(date.getTime())||localDate(date)!==dateText)return toast('Add a title, a valid amount, and a valid date.');
  if(!categories().some(c=>c.id===categoryId)&&categoryId!==catId(old||{}))return toast('Choose a valid category.');
  const amount=cents(rawAmount)/100;
  const sourceIdentifier=String(f.get('sourceIdentifier')||old?.sourceIdentifier||'').trim();
  const duplicate=sourceIdentifier&&asTransactions().find(x=>x.id!==id&&x.sourceIdentifier===sourceIdentifier);
  if(duplicate){openTransaction(duplicate.id);toast('This UPI transaction is already saved. Review the existing record.');return;}
  const candidate={...(old||{}),id:id||uid(),title,amount,categoryId,dateMs:date.getTime(),isExpense:f.get('direction')==='expense',notes:String(f.get('notes')||'').trim(),tags:String(f.get('tags')||'').split(',').map(x=>x.trim()).filter(Boolean)};
  if(sourceIdentifier)candidate.sourceIdentifier=sourceIdentifier;
  candidate.originalAppleDate=old&&localDate(old.dateMs)===dateText?(old.originalAppleDate??old.date):dateToApple(date);
  const updated=asTransactions().filter(x=>x.id!==candidate.id);
  updated.push(candidate);
  vault.expenses=updated.map(t=>({...t,category:vaultCategory(t.categoryId,t.category),date:dateToApple(t.dateMs)}));
  const pendingId=String(f.get('pendingId')||'');if(pendingId)vault.pendingCaptures=(vault.pendingCaptures||[]).filter(x=>x.id!==pendingId);
  const button=$('[data-action="save-modal"]',form);
  if(button){button.disabled=true;button.textContent='Saving…'}
  persist(old?'Transaction updated':'Transaction saved').then(saved=>{
    if(button){button.disabled=false;button.textContent='Save transaction'}
    if(saved){lastSavedTransactionId=candidate.id;$('#modalRoot').innerHTML='';horizon='Month';setPage('home');const heading=$('#pageContent h1');heading?.setAttribute('tabindex','-1');heading?.focus();}
  });
}
function submitBill(form){
  const f=new FormData(form),id=String(f.get('id')||''),old=(vault.recurringBills||[]).find(x=>x.id===id);
  const title=String(f.get('title')||'').trim(),amount=cents(Number(f.get('amount')))/100,dueDay=Number(f.get('dueDay'));
  if(!title||!Number.isFinite(amount)||amount<=0||!Number.isInteger(dueDay)||dueDay<1||dueDay>31)return toast('Enter a bill name, valid amount, and due day from 1 to 31.');
  const bill={...(old||{}),id:id||uid(),title,amount,category:vaultCategory(String(f.get('category')||'other'),old?.category),dueDay,isPaid:f.get('isPaid')==='on'};
  vault.recurringBills=[...(vault.recurringBills||[]).filter(x=>x.id!==id),bill];
  const button=$('[data-action="save-modal"]',form);if(button){button.disabled=true;button.textContent='Saving…'}
  persist(old?'Bill updated':'Bill saved').then(saved=>{if(button){button.disabled=false;button.textContent='Save bill'}if(saved){$('#modalRoot').innerHTML='';setPage('bills')}});
}
function submitCategory(form){
  const f=new FormData(form),id=String(f.get('id')||''),name=String(f.get('name')||'').trim();
  if(!name)return toast('Give the category a name.');
  const categoryId=id||name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||`custom-${uid()}`;
  if(BUILT_INS.some(c=>c.id===categoryId)||(!id&&(vault.customCategories||[]).some(c=>c.id===categoryId)))return toast('That category ID is already in use.');
  const old=(vault.customCategories||[]).find(c=>c.id===id);
  const entry={...(old||{}),id:categoryId,displayName:name,sfSymbol:String(f.get('icon')||'✦'),colorHex:String(f.get('color')||'#8E6CEF'),isCustom:true};
  vault.customCategories=[...(vault.customCategories||[]).filter(c=>c.id!==id),entry];
  const button=$('[data-action="save-modal"]',form);if(button){button.disabled=true;button.textContent='Saving…'}
  persist(old?'Category updated':'Category saved').then(saved=>{if(button){button.disabled=false;button.textContent='Save category'}if(saved){$('#modalRoot').innerHTML='';setPage('settings')}});
}
function applyTheme(){const mode=vault.appThemeMode||'system';document.body.classList.toggle('theme-dark',mode==='dark'||(mode==='system'&&matchMedia('(prefers-color-scheme: dark)').matches))}
matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change',()=>{if((vault.appThemeMode||'system')==='system')applyTheme()});
async function setDigest(){
  vault.summaryEnabled=$('#summaryEnabled')?.checked||false;
  vault.summaryPeriod=$('#summaryPeriod')?.value||'daily';
  vault.summaryTime=$('#summaryTime')?.value||'20:00';
  vault.summaryDay=Math.max(1,Math.min(28,Number($('#summaryDay')?.value)||1));
  if(vault.summaryEnabled){
    if(!('Notification' in window)){
      vault.summaryEnabled=false;toast('Notifications are not supported by this browser.');render();return;
    }
    try{
      const permission=await Notification.requestPermission();
      if(permission!=='granted'){
        vault.summaryEnabled=false;toast('Notification permission was not granted.');
      }
    }catch(e){vault.summaryEnabled=false;toast('Notification permission could not be requested.')}
  }
  await persist('Digest reminder saved');scheduleDigest();render();
}
let digestLastKey='';function scheduleDigest(){clearInterval(window.digestInterval);if(!vault.summaryEnabled||!('Notification'in window)||Notification.permission!=='granted')return;const check=()=>{const now=new Date(),[h,m]=String(vault.summaryTime||'20:00').split(':').map(Number),key=localDate(now);if(now.getHours()!==h||now.getMinutes()!==m||digestLastKey===key)return;if(vault.summaryPeriod==='monthly'&&now.getDate()!==Number(vault.summaryDay||1))return;digestLastKey=key;const [a,b]=periodRange(vault.summaryPeriod==='monthly'?'Month':'Today'),spent=outflow(asTransactions().filter(t=>t.isExpense===true&&txInRange(t,a,b)));const body=`Your ${vault.summaryPeriod} spending so far: ${money(spent)}.`;const fallback=()=>new Notification('Well Spent',{body});if(navigator.serviceWorker?.ready)navigator.serviceWorker.ready.then(reg=>reg.showNotification('Well Spent',{body,icon:'icon-192.png',tag:'well-spent-digest'})).catch(fallback);else fallback()};window.digestInterval=setInterval(check,30000)}
function parseCapture(){
  modal('Review a transaction','Paste a payment message to prefill details. Nothing is read automatically.',`<div class="field"><label for="captureText">Payment message</label><textarea class="textarea" id="captureText" placeholder="Paste a transaction message here…"></textarea></div><p class="field-help">The parser only uses text you paste. Review the details before saving.</p><div class="form-grid"><div class="field"><label for="captureTitle">Title</label><input class="input" id="captureTitle" value="UPI payment"></div><div class="field"><label for="captureAmount">Amount (₹)</label><input class="input" id="captureAmount" type="number" min="0.01" step="0.01"></div><div class="field full"><label for="captureSource">UPI reference (optional)</label><input class="input" id="captureSource" placeholder="Transaction reference number"></div></div><div class="modal-actions"><button type="button" class="button soft" data-action="parse-text">Read pasted text</button><button type="button" class="button secondary" data-action="close-modal">Cancel</button><button type="button" class="button soft" data-action="queue-capture">Save for later</button><button type="button" class="button" data-action="save-capture">Review details</button></div>`,'','captureForm');
}
function showCaptureTransaction(){
  const title=$('#captureTitle').value.trim()||'UPI payment',amount=Number($('#captureAmount').value);
  if(!Number.isFinite(amount)||amount<=0)return toast('Paste a message or enter the amount.');
  const rawSource=$('#captureSource').value.trim(),sourceIdentifier=rawSource?`upi:${rawSource.replace(/^upi:/i,'')}`:'';
  const existing=sourceIdentifier&&asTransactions().find(t=>t.sourceIdentifier===sourceIdentifier);
  if(existing){closeModal();openTransaction(existing.id);toast('This UPI reference is already saved. Review the existing record.');return}
  closeModal();openTransaction(null,{title,amount,category:'other',sourceIdentifier});
}
function captureValues(){
  const title=$('#captureTitle').value.trim()||'UPI payment',amount=Number($('#captureAmount').value);
  const rawSource=$('#captureSource').value.trim(),sourceIdentifier=rawSource?`upi:${rawSource.replace(/^upi:/i,'')}`:'';
  return {title,amount,sourceIdentifier,category:'other'};
}
function queueCapture(){
  const values=captureValues();
  if(!Number.isFinite(values.amount)||values.amount<=0)return toast('Enter a valid amount before saving for later.');
  const duplicate=values.sourceIdentifier&&asTransactions().find(t=>t.sourceIdentifier===values.sourceIdentifier);
  if(duplicate){closeModal();openTransaction(duplicate.id);toast('This UPI reference is already saved.');return}
  if(values.sourceIdentifier&&(vault.pendingCaptures||[]).some(x=>x.sourceIdentifier===values.sourceIdentifier))return toast('This UPI reference is already pending review.');
  vault.pendingCaptures=[...(vault.pendingCaptures||[]),{...values,id:uid(),createdAt:Date.now()}];
  const button=$('[data-action="queue-capture"]');if(button){button.disabled=true;button.textContent='Saving…'}
  persist('Payment saved for review').then(saved=>{if(button){button.disabled=false;button.textContent='Save for later'}if(saved){closeModal();setPage('home')}});
}
function openPendingReview(){
  const pending=vault.pendingCaptures||[];
  modal('Pending payment reviews','Review each pasted payment before adding it as a transaction.',pending.length?pending.map(x=>`<div class="pending-row"><div><strong>${esc(x.title)}</strong><small>${money(x.amount)}${x.sourceIdentifier?` · ${esc(x.sourceIdentifier)}`:''}</small></div><button type="button" class="button small" data-action="review-capture" data-id="${esc(x.id)}">Review</button><button type="button" class="text-button" data-action="delete-capture" data-id="${esc(x.id)}" aria-label="Discard ${esc(x.title)}">Discard</button></div>`).join(''):'<div class="empty-state">No payments need review.</div>','', 'pendingReview');
}
function handleAction(action,el){const id=el.dataset.id;switch(action){case'add-tx':openTransaction();break;case'protect-vault':protectVault();break;case'lock-vault':lockVault();break;case'reset-locked':resetLockedVault();break;case'quick-add':openTransaction(null,{},true);break;case'save-modal':{const form=el.closest('form');if(!form)return;const valid=form.reportValidity?form.reportValidity():form.checkValidity();if(!valid){form.querySelector(':invalid')?.focus();return}processModalForm(form);break}case'capture':parseCapture();break;case'queue-capture':queueCapture();break;case'review-pending':openPendingReview();break;case'review-capture':{const capture=(vault.pendingCaptures||[]).find(x=>x.id===id);if(capture){closeModal();openTransaction(null,{...capture,pendingId:capture.id})}break}case'delete-capture':if(confirm('Discard this pending payment?')){vault.pendingCaptures=(vault.pendingCaptures||[]).filter(x=>x.id!==id);persist('Pending payment discarded').then(ok=>{if(ok)openPendingReview()})}break;case'edit-tx':openTransaction(id);break;case'delete-tx':{
  const t=transactionById(id);if(!t||!confirm(`Delete “${t.title}”?`))break;
  const removed=vault.expenses.find(x=>x.id===id);
  vault.expenses=asTransactions().filter(x=>x.id!==id).map(cleanTransaction);
  persist('Transaction deleted').then(saved=>{
    if(!saved)return;
    if(lastSavedTransactionId===id)lastSavedTransactionId=null;
    render();
    const host=$('#toast'),undo=document.createElement('button');undo.textContent=' Undo';undo.className='text-button';
    undo.onclick=()=>{vault.expenses=[...vault.expenses,removed];persist('Transaction restored').then(ok=>{if(ok)render()})};
    host.append(undo);
  });break;
}case'add-bill':openBill();break;case'edit-bill':openBill(id);break;case'toggle-bill':vault.recurringBills=(vault.recurringBills||[]).map(b=>b.id===id?{...b,isPaid:!b.isPaid}:b);persist('Bill status updated').then(render);break;case'delete-bill':{const b=vault.recurringBills.find(x=>x.id===id);if(b&&confirm(`Delete “${b.title}”?`)){vault.recurringBills=vault.recurringBills.filter(x=>x.id!==id);persist('Bill deleted').then(render)}break}case'close-modal':closeModal();break;case'backdrop':if(el.target===el)closeModal();break;case'save-budget':{const budget=Number($('#monthlyBudget').value),day=Number($('#cycleStartDay').value);if(!Number.isFinite(budget)||budget<0||!Number.isInteger(day)||day<1||day>28)return toast('Enter a valid budget and cycle start day from 1 to 28.');vault.monthlyBudget=budget;vault.cycleStartDay=day;persist('Budget updated').then(render);break}case'save-digest':setDigest();break;case'export':exportVault();break;case'share-backup':shareBackup();break;case'import':$('#importFile').click();break;case'delete-all':
  if(confirm('Permanently delete all transactions, bills, custom categories, preferences, and passphrase protection from this browser? This cannot be undone.')){
    const previous=vault;
    saveQueue.then(()=>dbRawSave(defaults())).then(()=>{
      vault=defaults();lastSavedVault=cloneVault(vault);encryptionKey=null;encryptionSalt=null;lockedRecord=null;lastSavedTransactionId=null;
      applyTheme();scheduleDigest();render();toast('All data deleted.');
    }).catch(e=>{vault=previous;storageError=`Could not delete data: ${e.message}`;render();toast(storageError)});
  }break;case'add-category':openCategory();break;case'edit-category':openCategory(id);break;case'delete-category':{const c=vault.customCategories.find(x=>x.id===id);if(!c||!confirm(`Delete “${c.displayName}”? Existing transactions and bills in this category will move to Other.`))break;vault.expenses=asTransactions().map(t=>catId(t)===id?{...t,categoryId:'other',category:'other',_categoryChanged:true}:t).map(t=>({...t,date:dateToApple(t.dateMs)}));vault.recurringBills=(vault.recurringBills||[]).map(b=>billCatId(b)===id?{...b,category:'other'}:b);vault.customCategories=vault.customCategories.filter(x=>x.id!==id);persist('Category deleted and reassigned').then(render);break}case'open-search':openSearch();break;case'clear-chart':chartSelection=null;render();break;case'parse-text':{const text=$('#captureText').value;const amountMatches=[...text.matchAll(/(?:₹|INR|Rs\.?\s*)\s*([\d,]+(?:\.\d{1,2})?)/gi),...text.matchAll(/\b([\d,]+\.\d{2})\s*(?:debited|paid|spent|sent)/gi)];const match=amountMatches[0];if(match)$('#captureAmount').value=match[1].replace(/,/g,'');const merchant=text.match(/(?:to|at|merchant)\s+([A-Za-z0-9 .&'-]{2,32})/i);if(merchant)$('#captureTitle').value=merchant[1].trim();const reference=text.match(/(?:UPI(?:\s+(?:Ref|Reference|Txn|Transaction))?|UTR|RRN|Reference(?:\s+(?:No|ID))?)\s*[:#-]?\s*(\d{8,20})/i);if(reference)$('#captureSource').value=reference[1];toast(match?'Amount found. Review the parsed fields.':'No amount found. Enter it manually.');break}case'save-capture':showCaptureTransaction();break}}
function syncPageFromHash(){if($('#modalRoot .modal'))closeModal();const page=location.hash.slice(1);if(['home','bills','trends','settings'].includes(page)&&page!==currentPage)setPage(page,true)}window.addEventListener('popstate',syncPageFromHash);window.addEventListener('hashchange',syncPageFromHash);
document.addEventListener('click',e=>{const nav=e.target.closest('[data-page]');if(nav){setPage(nav.dataset.page);return}const horizonBtn=e.target.closest('[data-horizon]');if(horizonBtn){horizon=horizonBtn.dataset.horizon;render();return}const period=e.target.closest('[data-trend-period]');if(period){trendPeriod=period.dataset.trendPeriod;chartSelection=null;if(trendPeriod==='Custom'){const [a,b]=periodRange('Custom');trendStart=localDate(a);trendEnd=localDate(addDays(b,-1))}render();return}const cat=e.target.closest('[data-set-category]');if(cat){trendCategory=cat.dataset.setCategory;render();return}const chart=e.target.closest('[data-chart]');if(chart){const [a,b]=trendPeriod==='Custom'?periodRange('Custom',trendStart,trendEnd):periodRange(trendPeriod),bucket=chartBuckets(trendPeriod,a,b,asTransactions())[Number(chart.dataset.chart)];chartSelection=chartSelection?.index===Number(chart.dataset.chart)?null:{...bucket,index:Number(chart.dataset.chart)};render();return}const button=e.target.closest('[data-action]');if(button)handleAction(button.dataset.action,button)});
document.addEventListener('visibilitychange',()=>{clearTimeout(lockTimer);if(document.hidden&&encryptionKey)lockTimer=setTimeout(()=>lockVault(),120000)});
document.addEventListener('keydown',e=>{const dialog=$('#modalRoot .modal');if(!dialog)return;if(e.key==='Escape'){closeModal();return}if(e.key==='Tab'){const focusable=$$('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),summary,[tabindex="0"]',dialog).filter(x=>x.offsetParent!==null);if(!focusable.length)return;const first=focusable[0],last=focusable.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}}});
document.addEventListener('submit',e=>{if(e.target.id==='unlockForm'){e.preventDefault();unlockVault(e.target);return}if(['protectForm','restoreConfirm','modalForm','searchForm','captureForm'].includes(e.target.id)){e.preventDefault();interactionFeedback();processModalForm(e.target)}});
document.addEventListener('change',e=>{const t=e.target;if(t.id==='importFile')importVaultFile(t.files?.[0]);if(t.id==='themeMode'){vault.appThemeMode=t.value;applyTheme();persist('Appearance updated');}if(t.dataset.pref){vault[t.dataset.pref]=t.checked;persist('Preference saved')}if(t.id==='billCategory'&&t.closest('#pageContent')){billCategory=t.value;render()}if(t.id==='searchCategory'){searchCategory=t.value;renderSearchResults()}if(t.id==='searchBand'){searchBand=t.value;renderSearchResults()}if(t.id==='summaryEnabled'&&!t.checked){vault.summaryEnabled=false;persist('Digest reminder turned off');scheduleDigest()}if(t.id==='trendCategory'){trendCategory=t.value;chartSelection=null;render()}if(t.id==='trendStart'){trendStart=t.value;if(trendEnd&&trendStart>trendEnd){trendEnd=trendStart;toast('End date moved to match the start date.')}chartSelection=null;render()}if(t.id==='trendEnd'){trendEnd=t.value;if(trendStart&&trendEnd<trendStart){trendEnd=trendStart;toast('End date must not be before the start date.')}chartSelection=null;render()}});
document.addEventListener('input',e=>{if(e.target.id==='searchTransactions'){searchText=e.target.value;renderSearchResults()}if(e.target.id==='billSearch'){billQuery=e.target.value;const pos=e.target.selectionStart;render();const field=$('#billSearch');field?.focus();field?.setSelectionRange(pos,pos)}});
$('#quickAddTop').addEventListener('click',()=>openTransaction(null,{},true));
async function init(){const d=$('#topDate');d.textContent=new Intl.DateTimeFormat('en-IN',{weekday:'short',month:'short',day:'numeric'}).format(new Date());try{db=await openDB();const saved=await dbGet();if(saved?.format===ENCRYPTION_FORMAT){lockedRecord=saved}else{if(saved)vault={...defaults(),...saved};lastSavedVault=cloneVault(vault)}}catch(e){lastSavedVault=cloneVault(vault);storageError=`${e.message} This browser context may not allow IndexedDB.`;console.error(e)}if(['home','bills','trends','settings'].includes(location.hash.slice(1)))currentPage=location.hash.slice(1);applyTheme();render();if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js').catch(e=>console.warn('Offline support could not be enabled:',e));if(!isLocked())scheduleDigest();const action=new URL(location.href).searchParams.get('action');if(!isLocked()&&action==='add')openTransaction(null,{},true);if(!isLocked()&&action==='search')openSearch()}
init();
