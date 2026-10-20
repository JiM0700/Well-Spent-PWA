import assert from 'node:assert/strict';
import {test} from 'node:test';
import {activityDays,budgetStats,categoryTotals,summarize,weekdayTotals} from '../src/analytics.js';
import {dateToApple,defaults,transactions} from '../src/vault.js';

const expense=(id,amount,day,extra={})=>({id,title:id,amount,date:dateToApple(new Date(2026,9,day,12)),category:'food',isExpense:true,...extra});
const start=new Date(2026,9,1),end=new Date(2026,10,1),now=new Date(2026,9,20,15);

test('metrics separate income and expenses and count elapsed calendar days',()=>{
  const items=transactions({...defaults(),expenses:[expense('a',100.1,1),expense('b',200.2,1),expense('income',500,3,{isExpense:false})]});
  const stats=summarize(items,start,end,now);
  assert.equal(stats.spent,300.3);
  assert.equal(stats.income,500);
  assert.equal(stats.net,199.7);
  assert.equal(stats.noSpendDays,19);
  assert.equal(stats.elapsedDays,20);
  assert.equal(stats.expenseCount,2);
  assert.equal(stats.average,150.15);
  assert.equal(stats.largest,200.2);
});

test('budget forecasts use recorded expenses to date and retain future entries',()=>{
  const vault={...defaults(),monthlyBudget:1000,cycleStartDay:15,expenses:[expense('a',100,15),expense('b',200,20),expense('future',900,25),expense('income',500,16,{isExpense:false})]};
  const before=structuredClone(vault),budget=budgetStats(vault,transactions(vault),now);
  assert.equal(budget.spent,1200);
  assert.equal(budget.remaining,-200);
  assert.equal(budget.elapsed,6);
  assert.equal(budget.days,31);
  assert.equal(budget.forecast,1550);
  assert.equal(budget.allowance,0);
  assert.equal(budget.pace[5].actual,300);
  assert.equal(budget.pace[6].actual,null);
  assert.deepEqual(vault,before);
  assert.equal(budgetStats(defaults(),[],now).forecast,null);
  assert.equal(budgetStats({...defaults(),monthlyBudget:0},[],now).used,0);
});

test('category analytics retain unknown and custom categories',()=>{
  const vault={...defaults(),customCategories:[{id:'custom',displayName:'Pets',colorHex:'#123456'}],expenses:[expense('a',200,1,{category:'archived'}),expense('b',100,1,{category:'custom'}),expense('c',50,2,{isExpense:false})]};
  const totals=categoryTotals(vault,transactions(vault));
  assert.equal(totals.length,2);
  assert.equal(totals[0].id,'archived');
  assert.equal(totals[0].amount,200);
  assert.equal(totals[1].name,'Pets');
  assert.equal(totals[1].color,'#123456');
});

test('weekday averages include days with no expenses and calendars include today',()=>{
  const items=transactions({...defaults(),expenses:[expense('a',60,5)]});
  const days=weekdayTotals(items,new Date(2026,9,5),new Date(2026,9,19),now);
  assert.equal(days[0].label,'Mon');
  assert.equal(days[0].count,2);
  assert.equal(days[0].amount,30);
  const activity=activityDays(items,now);
  assert.equal(activity.length,84);
  assert.equal(activity.at(-1).date.getDate(),20);
  assert.equal(activity.reduce((s,d)=>s+d.amount,0),60);
});
