export const APPLE_EPOCH = 978307200000;
export const BUILT_INS = [
  {id:'food',name:'Food & dining',icon:'◉',color:'#4ca9df'}, {id:'transport',name:'Transport',icon:'↗',color:'#3cb8dc'},
  {id:'utilities',name:'Utilities',icon:'⌁',color:'#68b6e4'}, {id:'entertainment',name:'Entertainment',icon:'✳',color:'#73c1ed'},
  {id:'health',name:'Health',icon:'✚',color:'#45a7d4'}, {id:'shopping',name:'Shopping',icon:'◇',color:'#5eaee1'},
  {id:'housing',name:'Housing',icon:'⌂',color:'#80c7e9'}, {id:'investment',name:'Investment',icon:'↗',color:'#2c98cb'},
  {id:'other',name:'Other',icon:'·',color:'#8cb9d0'}
];
export const defaults = () => ({expenses:[],pendingCaptures:[],monthlyBudget:50000,cycleStartDay:1,customCategories:[],summaryEnabled:false,summaryPeriod:'daily',recurringBills:[],appThemeMode:'system',biometricsEnabled:false,hapticsEnabled:true,soundsEnabled:true,summaryTime:'20:00',summaryDay:1});
export const clone = value => JSON.parse(JSON.stringify(value));
export const uid = () => crypto.randomUUID?.() || `ws-${Date.now()}-${Math.random().toString(36).slice(2)}`;
export const money = value => '₹'+Number(value||0).toLocaleString('en-IN',{maximumFractionDigits:2});
export const cents = value => Math.round((Number(value)||0)*100);
export const localDate = value => {const d=new Date(value);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};
export const dateToApple = value => (new Date(value).getTime()-APPLE_EPOCH)/1000;
export function decodeDate(value) {
  if(typeof value==='string'&&value.trim()&&!Number.isNaN(Number(value)))value=Number(value);
  const date=typeof value==='number'?new Date(value*1000+APPLE_EPOCH):new Date(value);
  return {date,appleSeconds:typeof value==='number'?value:dateToApple(date)};
}
export const categoryId = item => item.categoryId || (typeof item.category==='string'?item.category:item.category?.id) || 'other';
export const billCategoryId = item => typeof item.category==='string'?item.category:item.category?.id||'utilities';
export const categories = vault => [...BUILT_INS,...(vault.customCategories||[]).map(c=>({id:c.id,name:c.displayName||c.name||c.id,icon:c.icon||(/^[-\w.]+$/.test(c.sfSymbol||'')?'✦':c.sfSymbol)||'✦',color:c.colorHex||c.color||'#5db8e9'}))];
export const category = (vault,id) => categories(vault).find(c=>c.id===id)||{id,name:id,icon:'·',color:'#8cb9d0'};
export function vaultCategory(vault,id,existing) {
  const c=(vault.customCategories||[]).find(x=>x.id===id);
  if(c)return {...(existing&&typeof existing==='object'?existing:{}),id:c.id,displayName:c.displayName||c.name||c.id,sfSymbol:c.sfSymbol||c.icon||'✦',colorHex:c.colorHex||c.color||'#5db8e9',isCustom:true};
  return existing&&typeof existing==='object'&&existing.id===id?existing:(id||existing||'other');
}
export const transactions = vault => (vault.expenses||[]).map(t=>({...t,dateMs:typeof t.date==='number'?t.date*1000+APPLE_EPOCH:new Date(t.date).getTime(),categoryId:categoryId(t)}));
export const startDay = d => new Date(d.getFullYear(),d.getMonth(),d.getDate());
export const addDays = (d,n) => new Date(d.getFullYear(),d.getMonth(),d.getDate()+n);
export const dayDiff = (a,b) => Math.round((Date.UTC(b.getFullYear(),b.getMonth(),b.getDate())-Date.UTC(a.getFullYear(),a.getMonth(),a.getDate()))/86400000);
export function cycle(vault,now=new Date()) {const day=Math.min(28,Math.max(1,Number(vault.cycleStartDay)||1));let y=now.getFullYear(),m=now.getMonth();if(now.getDate()<day){m--;if(m<0){m=11;y--}}return {start:new Date(y,m,day),end:new Date(y,m+1,day)}}
export function periodRange(vault,period,start='',end='') {const now=new Date(),today=startDay(now);if(period==='Today')return [today,addDays(today,1)];if(period==='Week'){const monday=addDays(today,-((today.getDay()+6)%7));return [monday,addDays(monday,7)]}if(period==='Month'){const c=cycle(vault);return [c.start,c.end]}if(period==='Quarter'){const q=Math.floor(now.getMonth()/3)*3;return [new Date(now.getFullYear(),q,1),new Date(now.getFullYear(),q+3,1)]}if(period==='Year')return [new Date(now.getFullYear(),0,1),new Date(now.getFullYear()+1,0,1)];if(period==='Custom'){const a=start?new Date(`${start}T00:00:00`):today,b=end?addDays(new Date(`${end}T00:00:00`),1):addDays(today,1);return [a,b<=a?addDays(a,1):b]}return [today,addDays(today,1)]}
export function previousRange(period,a,b) {if(period==='Today')return [addDays(a,-1),a];if(period==='Week')return [addDays(a,-7),a];if(period==='Month')return [new Date(a.getFullYear(),a.getMonth()-1,a.getDate()),a];if(period==='Quarter')return [new Date(a.getFullYear(),a.getMonth()-3,1),a];if(period==='Year')return [new Date(a.getFullYear()-1,0,1),a];return [addDays(a,-dayDiff(a,b)),a]}
export const inRange = (t,a,b) => t.dateMs>=a.getTime()&&t.dateMs<b.getTime();
export const outflow = items => items.filter(t=>t.isExpense===true).reduce((sum,t)=>sum+cents(t.amount),0)/100;
export const fmtDate = (ms,options={month:'short',day:'numeric'}) => new Intl.DateTimeFormat('en-IN',options).format(new Date(ms));
export function chartBuckets(period,a,b,items) {
  const result=[];
  if(period==='Today')for(let hour=0;hour<24;hour+=3)result.push([new Date(a.getFullYear(),a.getMonth(),a.getDate(),hour),new Date(a.getFullYear(),a.getMonth(),a.getDate(),hour+3)]);
  else if(period==='Quarter'||period==='Year')for(let d=new Date(a);d<b;d=new Date(d.getFullYear(),d.getMonth()+1,1))result.push([new Date(d),new Date(d.getFullYear(),d.getMonth()+1,1)]);
  else {const step=period==='Custom'?Math.max(1,Math.ceil(dayDiff(a,b)/31)):1;for(let d=new Date(a);d<b;d=addDays(d,step))result.push([new Date(d),addDays(d,step)]);}
  return result.map(([start,end])=>{const clippedEnd=end>b?b:end,bucketItems=items.filter(t=>inRange(t,start,clippedEnd));return {a:start,b:clippedEnd,items:bucketItems,amount:outflow(bucketItems)}});
}
export function dueDate(bill,now=new Date()) {let y=now.getFullYear(),m=now.getMonth(),day=Math.max(1,Math.min(31,Number(bill.dueDay)||1));let due=new Date(y,m,Math.min(day,new Date(y,m+1,0).getDate()));if(startDay(due)<startDay(now)){m++;due=new Date(y,m,Math.min(day,new Date(y,m+1,0).getDate()))}return due}
export function validateVault(data) {
  if(!data||typeof data!=='object'||Array.isArray(data))throw new Error('The file must contain a JSON object.');
  const known=['expenses','monthlyBudget','cycleStartDay','customCategories','summaryEnabled','summaryPeriod','recurringBills','appThemeMode','biometricsEnabled','hapticsEnabled','soundsEnabled'];
  if(!known.some(key=>Object.hasOwn(data,key)))throw new Error('This file does not look like a Well Spent backup.');
  for(const key of ['expenses','recurringBills','customCategories'])if(data[key]!==undefined&&!Array.isArray(data[key]))throw new Error(`${key} must be a list.`);
  const next={...defaults(),summaryEnabled:true,...data};
  next.customCategories=(data.customCategories||[]).map((c,i)=>{if(!c||typeof c!=='object'||Array.isArray(c)||typeof c.id!=='string'||!c.id.trim())throw new Error(`Custom category ${i+1} is missing its ID.`);if(c.displayName!==undefined&&typeof c.displayName!=='string')throw new Error(`Custom category ${i+1} has an invalid name.`);return c});
  next.expenses=(data.expenses||[]).map((t,i)=>{if(!t||typeof t!=='object'||Array.isArray(t))throw new Error(`Transaction ${i+1} is not an object.`);if(typeof t.id!=='string'||!t.id.trim())throw new Error(`Transaction ${i+1} has no ID.`);if(typeof t.title!=='string'||!t.title.trim())throw new Error(`Transaction “${t.id}” has no title.`);const amount=Number(t.amount),decoded=decodeDate(t.date);if(!Number.isFinite(amount)||amount<=0)throw new Error(`Transaction “${t.title}” has an invalid amount.`);if(!Number.isFinite(decoded.date.getTime()))throw new Error(`Transaction “${t.title}” has an unreadable date.`);if(t.isExpense!==undefined&&typeof t.isExpense!=='boolean')throw new Error(`Transaction “${t.title}” has an invalid direction.`);if(t.category!==undefined&&typeof t.category!=='string'&&(!t.category||typeof t.category!=='object'||Array.isArray(t.category)||typeof t.category.id!=='string'))throw new Error(`Transaction “${t.title}” has an invalid category.`);if(t.notes!==undefined&&typeof t.notes!=='string')throw new Error(`Transaction “${t.title}” has invalid notes.`);if(t.tags!==undefined&&(!Array.isArray(t.tags)||t.tags.some(tag=>typeof tag!=='string')))throw new Error(`Transaction “${t.title}” has invalid tags.`);return {...t,amount,date:decoded.appleSeconds,isExpense:t.isExpense!==false,notes:t.notes??'',tags:t.tags??[]}});
  next.recurringBills=(data.recurringBills||[]).map((bill,i)=>{if(!bill||typeof bill!=='object'||Array.isArray(bill)||typeof bill.id!=='string'||!bill.id.trim()||typeof bill.title!=='string'||!bill.title.trim())throw new Error(`Bill ${i+1} is missing its ID or title.`);const amount=Number(bill.amount),dueDay=Number(bill.dueDay);if(!Number.isFinite(amount)||amount<=0||!Number.isInteger(dueDay)||dueDay<1||dueDay>31)throw new Error(`Bill “${bill.title}” has invalid amount or due day.`);return {...bill,amount,dueDay,isPaid:bill.isPaid===true}});
  next.monthlyBudget=Number(next.monthlyBudget);next.cycleStartDay=Number(next.cycleStartDay);
  if(!Number.isFinite(next.monthlyBudget)||next.monthlyBudget<0)throw new Error('Budget must be zero or positive.');
  if(!Number.isInteger(next.cycleStartDay)||next.cycleStartDay<1||next.cycleStartDay>28)throw new Error('Cycle start day must be 1–28.');
  if(!['system','light','dark'].includes(next.appThemeMode)||!['daily','monthly'].includes(next.summaryPeriod))throw new Error('Invalid preference in backup.');
  for(const key of ['summaryEnabled','biometricsEnabled','hapticsEnabled','soundsEnabled'])if(typeof next[key]!=='boolean')throw new Error(`${key} must be true or false.`);
  return next;
}
export function exportData(vault) {const out={...vault,expenses:transactions(vault).map(t=>{const {dateMs,categoryId,originalAppleDate,_categoryChanged,_dateChanged,...rest}=t;return {...rest,date:t.date,category:vaultCategory(vault,categoryId,t.category)}}),recurringBills:(vault.recurringBills||[]).map(b=>({...b,category:vaultCategory(vault,billCategoryId(b),b.category)}))};delete out.summaryTime;delete out.summaryDay;delete out.pendingCaptures;return JSON.stringify(out,null,2)}
export function prepareTransaction(vault,form,item=null,prefill={}) {
  const title=String(form.get('title')||'').trim(),amount=cents(form.get('amount'))/100;
  const dateText=String(form.get('date')||''),date=new Date(`${dateText}T12:00:00`),cat=String(form.get('category')||'');
  if(!title||!Number.isFinite(amount)||amount<=0||!Number.isFinite(date.getTime())||localDate(date)!==dateText)throw new Error('Enter a title, valid amount, and date.');
  if(!categories(vault).some(c=>c.id===cat)&&cat!==categoryId(item||{}))throw new Error('Choose a valid category.');
  const source=String(form.get('sourceIdentifier')||item?.sourceIdentifier||prefill.sourceIdentifier||'').trim();
  const duplicate=source&&transactions(vault).find(t=>t.id!==item?.id&&t.sourceIdentifier===source);
  if(duplicate)return {duplicate};
  const candidate={...(item||{}),id:item?.id||uid(),title,amount,category:vaultCategory(vault,cat,item?.category),date:item&&localDate(item.dateMs)===dateText?item.date:dateToApple(date),isExpense:form.get('direction')!=='income',notes:String(form.get('notes')||'').trim(),tags:String(form.get('tags')||'').split(',').map(t=>t.trim()).filter(Boolean)};
  for(const key of ['dateMs','categoryId','originalAppleDate','_categoryChanged','_dateChanged'])delete candidate[key];
  if(source)candidate.sourceIdentifier=source;
  return {candidate};
}
export function parseCapture(text) {const match=text.match(/(?:₹|INR|Rs\.?\s*)\s*([\d,]+(?:\.\d{1,2})?)/i)||text.match(/\b([\d,]+\.\d{2})\s*(?:debited|paid|spent|sent)/i);const merchant=text.match(/(?:to|at|merchant)\s+([A-Za-z0-9 .&'-]{2,32})/i);const reference=text.match(/(?:UPI(?:\s+(?:Ref|Reference|Txn|Transaction))?|UTR|RRN|Reference(?:\s+(?:No|ID))?)\s*[:#-]?\s*(\d{8,20})/i);return {amount:match?.[1].replace(/,/g,'')||'',title:merchant?.[1].trim()||'',sourceIdentifier:reference?.[1]||''}}
