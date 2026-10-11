import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile,writeFile,unlink} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {transformWithOxc} from 'vite';
import {dateToApple,defaults} from '../src/vault.js';

test('React pages and transaction form render with empty and populated vaults',async()=>{
  const source=resolve(fileURLToPath(new URL('../src/App.jsx',import.meta.url)));
  const output=resolve(fileURLToPath(new URL('../src/.App.render-test.mjs',import.meta.url)));
  const transformed=await transformWithOxc(await readFile(source,'utf8'),source);
  await writeFile(output,transformed.code);
  try {
    const {default:App,TransactionForm}=await import(pathToFileURL(output).href);
    const vault={...defaults(),expenses:[{id:'render-1',title:'Coffee',amount:280,category:'food',date:dateToApple(new Date()),isExpense:true,notes:'',tags:[]}],recurringBills:[{id:'bill-1',title:'Internet',amount:999,category:'utilities',dueDay:5,isPaid:false}]};
    const expected={home:'Coffee',bills:'Internet',trends:'Transaction ledger',settings:'Your data'};
    for(const [page,needle] of Object.entries(expected)) {
      const markup=renderToStaticMarkup(React.createElement(App,{bootstrapVault:vault,bootstrapPage:page}));
      assert.ok(markup.includes(needle),`${page} failed to render ${needle}`);
      const emptyMarkup=renderToStaticMarkup(React.createElement(App,{bootstrapVault:defaults(),bootstrapPage:page}));
      assert.ok(emptyMarkup.includes('well spent'),`${page} failed with an empty vault`);
      console.log(`${page} screen renders`);
    }
    const form=renderToStaticMarkup(React.createElement(TransactionForm,{vault,quick:true,onSave:()=>{},onClose:()=>{}}));
    assert.ok(form.includes('type="submit"'));
    assert.ok(form.includes('Save transaction'));
    assert.ok(form.includes('name="date"'));
    console.log('transaction form renders with a submit button');
  } finally {
    await unlink(output);
  }
});
