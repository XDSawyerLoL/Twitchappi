'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {renderTechWatch,readTechItems}=require('../modules/swapp-tech-watch-page');
test('renders candidate labels and escapes untrusted feed titles',()=>{
 const html=renderTechWatch([{section:'IA',title:'<script>alert(1)</script>',source_name:'Official',source_published_at:'2026-11-10',source_url:'https://example.org'}]);
 assert.match(html,/non encore vérifiée/);
 assert.doesNotMatch(html,/<script>alert\(1\)<\/script>/);
});
test('no database URL yields an empty list',async()=>assert.deepEqual(await readTechItems({}),[]));
