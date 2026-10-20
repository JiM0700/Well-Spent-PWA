import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtemp,readdir,readFile,writeFile,rm} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {transformWithOxc} from 'vite';
import {dateToApple,defaults} from '../src/vault.js';

test('all rebuilt screens render populated and empty vaults without changing records',async()=>{
  const source=resolve(fileURLToPath(new URL('../src/',import.meta.url)));
  const output=await mkdtemp(resolve(source,'.render-test-'));
  try {
    for(const file of await readdir(source)) {
      if(!/\.(jsx|js)$/.test(file))continue;
      const content=await readFile(resolve(source,file),'utf8');
      if(file.endsWith('.jsx')) {
        const transformed=await transformWithOxc(content,resolve(source,file));
        await writeFile(resolve(output,file.replace(/\.jsx$/,'.mjs')),transformed.code.replace(/(['"])(\.\/[^'"]+)\.jsx\1/g,'$1$2.mjs$1'));
      } else await writeFile(resolve(output,file),content);
    }
    const {default:App,TransactionForm}=await import(pathToFileURL(resolve(output,'App.mjs')).href);
    const vault={...defaults(),expenses:[{id:'render-1',title:'Coffee',amount:280,category:'food',date:dateToApple(new Date()),isExpense:true,notes:'',tags:[]}],recurringBills:[{id:'bill-1',title:'Internet',amount:999,category:'utilities',dueDay:5,isPaid:false}]};
    const before=structuredClone(vault);
    const expected={home:'Coffee',activity:'Coffee',bills:'Internet',trends:'Transaction ledger',settings:'Your data'};
    for(const [page,needle] of Object.entries(expected)) {
      const markup=renderToStaticMarkup(React.createElement(App,{bootstrapVault:vault,bootstrapPage:page}));
      assert.ok(markup.includes(needle),`${page} failed to render ${needle}`);
      assert.ok(!/Spending digest|Vibration|Sound effects/.test(markup),`${page} exposes a removed feature`);
      const emptyMarkup=renderToStaticMarkup(React.createElement(App,{bootstrapVault:defaults(),bootstrapPage:page}));
      assert.ok(emptyMarkup.includes('well spent'),`${page} failed with an empty vault`);
    }
    assert.deepEqual(vault,before,'rendering must not modify the dataset');
    const form=renderToStaticMarkup(React.createElement(TransactionForm,{vault,onSave:()=>{},onClose:()=>{}}));
    assert.ok(form.includes('type="submit"'));
    assert.ok(form.includes('Save transaction'));
    assert.ok(form.includes('name="date"'));
    assert.ok(form.includes('name="direction"'));
  } finally {
    await rm(output,{recursive:true,force:true});
  }
});
