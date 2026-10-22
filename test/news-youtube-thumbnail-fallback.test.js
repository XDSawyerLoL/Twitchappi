'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const extras = require('../assets/swapp-article-extras');

test('official thumbnail fallback keeps the exact article video and editor artwork priority', () => {
  const article = {trailerUrl:'https://www.youtube.com/watch?v=YLaTMaSX4ZE'};
  assert.ok(extras.cardImageSources(article).includes('https://img.youtube.com/vi/YLaTMaSX4ZE/hqdefault.jpg'));
  assert.equal(extras.cardImageSources({...article,thumbnail:{url:'https://example.org/editor.jpg'}})[0], 'https://example.org/editor.jpg');
  assert.deepEqual(extras.cardImageSources({trailerUrl:'https://evil.example/watch?v=YLaTMaSX4ZE'}), []);
});

test('failed initial and late RSS thumbnails recover once without changing unrelated images', () => {
  const handlers = {};
  const initial = {tagName:'IMG',complete:true,naturalWidth:0,src:'https://i.ytimg.com/vi/YLaTMaSX4ZE/hqdefault.jpg'};
  const doc = {readyState:'complete',querySelectorAll:()=>[initial],addEventListener:(name,fn)=>{handlers[name]=fn;}};
  vm.runInNewContext(fs.readFileSync(require.resolve('../assets/swapp-article-extras'),'utf8'), {document:doc, URL});
  assert.equal(initial.src, 'https://img.youtube.com/vi/YLaTMaSX4ZE/hqdefault.jpg');
  const late = {tagName:'IMG',src:'https://i.ytimg.com/vi/Lg-Ctg6k_Ao/hqdefault.jpg'};
  handlers.error({target:late});
  assert.equal(late.src, 'https://img.youtube.com/vi/Lg-Ctg6k_Ao/hqdefault.jpg');
  handlers.error({target:late});
  assert.equal(late.src, 'https://img.youtube.com/vi/Lg-Ctg6k_Ao/hqdefault.jpg');
  const other = {tagName:'IMG',src:'https://example.org/editor.jpg'};
  handlers.error({target:other});
  assert.equal(other.src, 'https://example.org/editor.jpg');
});
