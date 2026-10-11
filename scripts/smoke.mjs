import assert from 'node:assert/strict';
import {test} from 'node:test';
import {dateToApple,defaults,exportData,localDate,periodRange,prepareTransaction,transactions,outflow,validateVault} from '../src/vault.js';
import * as storage from '../src/storage.js';

const records=new Map();
let failNextWrite=false;
const database={
  createObjectStore() {},
  transaction() {
    const tx={
      objectStore() {return {
        get(key) {const request={};queueMicrotask(()=>{request.result=structuredClone(records.get(key));request.onsuccess?.()});return request},
        put(value,key) {queueMicrotask(()=>{if(failNextWrite){failNextWrite=false;tx.error=new Error('Simulated storage failure');tx.onerror?.();return}records.set(key,structuredClone(value));tx.oncomplete?.()})}
      }}
    };
    return tx;
  }
};
const indexedDB={open(){const request={result:database};queueMicrotask(()=>{request.onupgradeneeded?.();request.onsuccess?.()});return request}};
globalThis.window={indexedDB};
globalThis.indexedDB=indexedDB;

const sample={id:'expense-1',title:'Coffee',amount:280,category:'food',date:dateToApple(new Date(2026,9,11,12)),notes:'Morning',isExpense:true,tags:['food'],sourceIdentifier:'upi:123456789012'};

test('local vault saves, reloads, encrypts, and restores backups',async()=>{
  const initial=await storage.initialize();
  assert.deepEqual(initial.vault,defaults());
  const candidate={...initial.vault,expenses:[sample],monthlyBudget:12000};
  await storage.saveVault(candidate);
  assert.deepEqual((await storage.initialize()).vault,candidate);
  assert.equal(outflow(transactions(candidate)),280);
  assert.equal(localDate(transactions(candidate)[0].dateMs),'2026-10-11');
  const backup=JSON.parse(exportData(candidate));
  assert.equal(backup.expenses[0].date,sample.date);
  assert.equal(backup.expenses[0].sourceIdentifier,sample.sourceIdentifier);
  assert.deepEqual(validateVault(backup).expenses[0],sample);
  assert.throws(()=>validateVault({...backup,expenses:[{...sample,amount:-1}]}),/invalid amount/);
  await storage.saveVault(defaults());
  await storage.saveVault(validateVault(backup));
  assert.equal((await storage.initialize()).vault.expenses[0].id,sample.id);
  failNextWrite=true;
  await assert.rejects(storage.saveVault({...candidate,monthlyBudget:1}),/Simulated storage failure/);
  assert.deepEqual((await storage.initialize()).vault,candidate);
  await storage.protect(candidate,'long secure passphrase');
  assert.equal(records.get('vault').format,'well-spent-encrypted-v1');
  assert.notEqual(records.get('vault').payload.includes('Coffee'),true);
  await storage.lock();
  assert.equal((await storage.initialize()).locked,true);
  await assert.rejects(storage.unlock('wrong passphrase'));
  assert.deepEqual(await storage.unlock('long secure passphrase'),candidate);
  await storage.saveVault({...candidate,monthlyBudget:15000});
  await storage.lock();
  assert.equal((await storage.unlock('long secure passphrase')).monthlyBudget,15000);
  assert.deepEqual(await storage.reset(),defaults());
  assert.equal((await storage.initialize()).locked,false);
});

test('spending periods count expenses and exclude income',()=>{
  const vault={...defaults(),expenses:[sample,{...sample,id:'refund-1',isExpense:false,amount:1000}]};
  const [start,end]=periodRange(vault,'Month');
  assert.ok(start<end);
  assert.equal(outflow(transactions(vault)),280);
});

test('transaction form data produces a saved expense and prevents duplicate UPI entries',async()=>{
  const form=new FormData();
  for(const [key,value] of Object.entries({title:'Lunch',amount:'349.50',category:'food',date:'2026-10-11',direction:'expense',notes:'With friends',tags:'food, weekend',sourceIdentifier:'upi:999999999999'}))form.set(key,value);
  const empty=defaults(),{candidate}=prepareTransaction(empty,form);
  assert.equal(candidate.title,'Lunch');
  assert.equal(candidate.amount,349.5);
  assert.equal(candidate.isExpense,true);
  assert.deepEqual(candidate.tags,['food','weekend']);
  assert.equal(localDate(transactions({...empty,expenses:[candidate]})[0].dateMs),'2026-10-11');
  const saved={...empty,expenses:[candidate]};
  await storage.saveVault(saved);
  assert.equal((await storage.initialize()).vault.expenses[0].id,candidate.id);
  assert.equal(prepareTransaction(saved,form).duplicate.id,candidate.id);
  form.set('amount','0');
  assert.throws(()=>prepareTransaction(saved,form),/valid amount/);
  form.set('amount','349.50');
  form.set('title','Lunch updated');
  const edited=prepareTransaction(saved,form,transactions(saved)[0]).candidate;
  assert.equal(edited.id,candidate.id);
  assert.equal(edited.title,'Lunch updated');
});
