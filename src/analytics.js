import {addDays,categories,category,categoryId,cents,cycle,dayDiff,inRange,localDate,outflow,startDay} from './vault.js';

export const CHART_COLORS = ['#4079ee','#8b70e8','#36a99a','#eea750','#e47d96','#66a6d9','#ad8c68','#a8b65d','#98a2b3'];

export function summarize(items, start, end, now = new Date()) {
  const expenses = items.filter(t => t.isExpense === true);
  const spent = outflow(items);
  const income = items.filter(t => t.isExpense === false).reduce((sum,t) => sum + cents(t.amount), 0) / 100;
  const elapsedEnd = new Date(Math.max(start.getTime(), Math.min(end.getTime(), addDays(startDay(now),1).getTime())));
  const elapsedDays = Math.max(0,dayDiff(start,elapsedEnd));
  const activeDays = new Set(expenses.filter(t=>inRange(t,start,elapsedEnd)).map(t=>localDate(t.dateMs)));
  const recorded = outflow(expenses.filter(t=>inRange(t,start,elapsedEnd)));
  return {spent,income,net:income-spent,count:items.length,expenseCount:expenses.length,
    average:expenses.length?spent/expenses.length:0,dailyAverage:elapsedDays?recorded/elapsedDays:0,
    largest:expenses.length?Math.max(...expenses.map(t=>Number(t.amount))):0,
    noSpendDays:Math.max(0,elapsedDays-activeDays.size),elapsedDays};
}

export function categoryTotals(vault,items) {
  const totals = new Map();
  for(const t of items) if(t.isExpense===true) {
    const id=categoryId(t);
    totals.set(id,(totals.get(id)||0)+cents(t.amount));
  }
  const known=categories(vault);
  return [...totals].map(([id,amount])=>{const found=known.findIndex(c=>c.id===id);const index=found<0?[...id].reduce((sum,char)=>sum+char.charCodeAt(0),0):found;const info=category(vault,id),custom=(vault.customCategories||[]).some(c=>c.id===id);return {...info,amount:amount/100,color:custom&&/^#[0-9a-f]{6}$/i.test(info.color)?info.color:CHART_COLORS[index%CHART_COLORS.length]}}).sort((a,b)=>b.amount-a.amount);
}

export function budgetStats(vault,items,now=new Date()) {
  const {start,end}=cycle(vault,now),today=startDay(now),elapsedEnd=addDays(today,1);
  const days=dayDiff(start,end),elapsed=Math.max(1,Math.min(days,dayDiff(start,elapsedEnd)));
  const cycleItems=items.filter(t=>inRange(t,start,end));
  const spent=outflow(cycleItems),recorded=outflow(cycleItems.filter(t=>t.dateMs<elapsedEnd.getTime()));
  const remaining=Number(vault.monthlyBudget)-spent,remainingDays=Math.max(1,dayDiff(today,end));
  const hasExpenses=cycleItems.some(t=>t.isExpense===true&&t.dateMs<elapsedEnd.getTime());
  return {start,end,days,elapsed,spent,remaining,remainingDays,allowance:Math.max(0,remaining)/remainingDays,
    forecast:hasExpenses?recorded/elapsed*days:null,
    used:vault.monthlyBudget>0?spent/vault.monthlyBudget:0,
    pace:Array.from({length:days},(_,i)=>{
      const date=addDays(start,i),next=addDays(date,1);
      return {date,actual:date<=today?outflow(cycleItems.filter(t=>t.dateMs<next.getTime())):null,target:Number(vault.monthlyBudget)*(i+1)/days};
    })};
}

export function weekdayTotals(items,start,end,now=new Date()) {
  const counts=Array(7).fill(0),totals=Array(7).fill(0);
  const cap=new Date(Math.min(end.getTime(),addDays(startDay(now),1).getTime()));
  for(let d=new Date(start);d<cap;d=addDays(d,1)) counts[(d.getDay()+6)%7]++;
  for(const t of items) if(t.isExpense===true&&inRange(t,start,cap)) totals[(new Date(t.dateMs).getDay()+6)%7]+=cents(t.amount);
  return ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map((label,i)=>({label,total:totals[i]/100,amount:counts[i]?totals[i]/100/counts[i]:0,count:counts[i]}));
}

export function activityDays(items,now=new Date()) {
  const end=addDays(startDay(now),1),start=addDays(end,-84);
  const totals=new Map();
  for(const t of items) if(t.isExpense===true&&inRange(t,start,end)) totals.set(localDate(t.dateMs),(totals.get(localDate(t.dateMs))||0)+cents(t.amount));
  return Array.from({length:84},(_,i)=>{const date=addDays(start,i);return {date,amount:(totals.get(localDate(date))||0)/100}});
}
