import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readCheckOptions,selectChecks,changedPaths} from './check-selection.mjs';
const suites=[
 {name:'docs',reaches:[/\.md$/]},
 {name:'storage',reaches:[/^source\/src\/storage/]},
 {name:'mobile',reaches:[/mobile\.css$/]},
];
test('a documentation change does not force unrelated game or phone suites',()=>{
 assert.deepEqual(selectChecks(suites,readCheckOptions([]),['README.md']).map(s=>s.name),['docs']);
 assert.deepEqual(selectChecks(suites,readCheckOptions([]),[]),[]);
});
test('explicit comma-separated checks override inference and remove duplicate names',()=>{
 const options=readCheckOptions(['--only','docs,storage','--only=docs','--list']);
 assert.deepEqual(selectChecks(suites,options,['source/src/mobile.css']).map(s=>s.name),['docs','storage']);
 assert.equal(options.list,true);
});
test('all checks need an explicit request',()=>{
 assert.equal(selectChecks(suites,readCheckOptions(['--all']),[]).length,3);
 assert.throws(()=>readCheckOptions(['--all','--only=docs']),/ambiguous/);
});
test('invalid selections fail with useful suite names',()=>{
 assert.throws(()=>readCheckOptions(['--only']),/needs a suite name/);
 assert.throws(()=>readCheckOptions(['--only=,,,']),/needs a suite name/);
 assert.throws(()=>selectChecks(suites,readCheckOptions(['--only=typo']),[]),/Unknown suite.*docs, storage, mobile/);
});
test('changed paths preserve spaces, Unicode and rename destinations',()=>{
 assert.deepEqual(changedPaths(' M materials/card sheet.xlsx\0R  source/src/new café.ts\0source/src/old.ts\0?? AGENTS.md\0'),['materials/card sheet.xlsx','source/src/new café.ts','AGENTS.md']);
});
