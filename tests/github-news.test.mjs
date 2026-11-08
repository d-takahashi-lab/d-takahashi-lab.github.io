import test from 'node:test';
import assert from 'node:assert/strict';
import {GitHubBackend} from '../scripts/news-editor/github.mjs';
import {validateArticle,withImages} from '../scripts/news-editor/model.mjs';
const drafts=new Map();
globalThis.indexedDB={open(){const request={result:{close(){},transaction(){const transaction={objectStore(){return {getAll(){const r={result:[...drafts.values()]};queueMicrotask(()=>transaction.oncomplete());return r;},put(v){drafts.set(v.key,v);const r={result:v.key};queueMicrotask(()=>transaction.oncomplete());return r;},delete(key){drafts.delete(key);const r={result:undefined};queueMicrotask(()=>transaction.oncomplete());return r;}};}};return transaction;}}};queueMicrotask(()=>request.onsuccess());return request;}};
function article(status='published'){return {id:'2026-11-04-test',date:'2026-11-04',status,type:'LAB',anchor:'news-test',link:'',images:[],ja:{title:'投稿テスト',summary:'概要',body:'本文です。'},en:{title:'',summary:'',body:''}};}
function backend(){return Object.assign(Object.create(GitHubBackend.prototype),{owner:'test-owner',repo:'test-repo',branch:'main',accessToken:'test-token',connected:true,pendingImages:new Map(),imageURLs:new Map(),published:[],version:'old-file-sha'});}
test('remote draft is stored locally without making GitHub requests',async()=>{drafts.clear();const b=backend();b.github=()=>{throw Error('Unexpected network request');};const result=await b.api('/api/save',{article:article('draft'),version:b.version});assert.equal(result.records.length,1);assert.equal(result.records[0].status,'draft');assert.equal(drafts.size,1);});
test('remote publish commits article and image atomically without force push',async()=>{drafts.clear();const b=backend(),a=article();a.images=[{src:'images/news/test-photo.png',alt:'写真'},{src:'images/news/second-photo.jpg',alt:'写真2'},{src:'images/news/already-published.jpg',alt:'公開済み'}];b.pendingImages.set('images/news/test-photo.png','data:image/png;base64,aGVsbG8=');b.pendingImages.set('images/news/second-photo.jpg','data:image/jpeg;base64,d29ybGQ=');const calls=[];b.github=async(path,data,method)=>{calls.push({path,data,method});if(path.startsWith('/git/ref/heads/'))return {object:{sha:'head-sha'}};if(path.includes('ref=head-sha'))return {sha:'old-file-sha',content:Buffer.from('[]').toString('base64')};if(path==='/git/commits/head-sha')return {tree:{sha:'old-tree'}};if(path==='/git/blobs')return {sha:'photo-blob'};if(path==='/git/trees')return {sha:'new-tree'};if(path==='/git/commits')return {sha:'new-commit'};if(path.startsWith('/git/refs/heads/'))return {};if(path.includes('ref=new-commit'))return {sha:'new-file-sha'};throw Error(path);};const result=await b.api('/api/save',{article:a,version:'old-file-sha'});assert.equal(result.version,'new-file-sha');const tree=calls.find(c=>c.path==='/git/trees').data;assert.equal(tree.base_tree,'old-tree');assert.deepEqual(tree.tree.slice(1).map(t=>t.path),['site-public/images/news/test-photo.png','site-public/images/news/second-photo.jpg']);assert.deepEqual(JSON.parse(tree.tree[0].content)[0].images.map(i=>i.src),a.images.map(i=>i.src));assert.equal(JSON.parse(tree.tree[0].content)[0].ja.title,'投稿テスト');assert.deepEqual(calls.find(c=>c.path.startsWith('/git/refs/heads/')).data,{sha:'new-commit',force:false});});
test('concurrent edit is rejected before creating Git objects',async()=>{const b=backend();const calls=[];b.github=async path=>{calls.push(path);if(path.startsWith('/git/ref/heads/'))return {object:{sha:'other-head'}};return {sha:'other-file'};};await assert.rejects(()=>b.api('/api/save',{article:article(),version:'old-file-sha'}),/別のMac/);assert.equal(calls.length,2);});

test('consecutive publications read fresh refs and preserve both articles', async () => {
 drafts.clear();
 const b=backend(), originalFetch=globalThis.fetch, cache=new Map(), reads=[];
 let head='head-0', file='old-file-sha', records=[], nextRecords;
 globalThis.fetch=async (url, options) => {
  const path=new URL(url).pathname, data=options.body?JSON.parse(options.body):null;
  // Model an intermediary caching branch reads by URL, even after a ref update.
  let result;
  if(path.includes('/git/ref/heads/')) {
   reads.push({url,cache:options.cache});
   if(!cache.has(url))cache.set(url,{object:{sha:head}});
   result=cache.get(url);
  } else if(path.endsWith('/contents/src/data/news.json')) {
   const ref=new URL(url).searchParams.get('ref');
   if(ref!==head)throw Error('A stale branch ref was reused');
   result={sha:file,content:Buffer.from(JSON.stringify(records)).toString('base64')};
  } else if(path.includes('/git/commits/'))result={tree:{sha:'tree'}};
  else if(path.endsWith('/git/trees')) {nextRecords=JSON.parse(data.tree[0].content);result={sha:'new-tree'};}
  else if(path.endsWith('/git/commits'))result={sha:'commit-'+nextRecords.length};
  else if(path.includes('/git/refs/heads/')) {assert.equal(data.force,false);head=data.sha;records=nextRecords;file='file-'+records.length;result={};}
  else throw Error(path);
  return {ok:true,json:async()=>result};
 };
 try {
  const first=await b.api('/api/save',{article:article(),version:b.version});
  const secondArticle={...article(),id:'2026-11-05-second',date:'2026-11-05',anchor:'news-second'};
  const second=await b.api('/api/save',{article:secondArticle,version:first.version});
  assert.equal(second.records.length,2);
  assert.equal(second.version,'file-2');
  assert.notEqual(reads[0].url,reads[1].url);
  assert.ok(reads.every(r=>r.cache==='no-store'));
 } finally {globalThis.fetch=originalFetch;}
});

test('legacy single-photo records are read as an images list', () => {
 const legacy={...article(),images:undefined,image:'images/news/old.jpg',imageAlt:'古い写真',imageAltEn:'',imageCaption:'説明',imageCaptionEn:''};
 const converted=withImages(legacy);
 assert.deepEqual(converted.images,[{src:'images/news/old.jpg',alt:'古い写真',altEn:'',caption:'説明',captionEn:''}]);
 assert.equal('image' in converted,false);
 assert.deepEqual(validateArticle(legacy).images,converted.images);
});
test('published photos need alt text and may not repeat', () => {
 assert.throws(()=>validateArticle({...article(),images:[{src:'images/news/a.jpg'}]}),/代替テキスト/);
 assert.throws(()=>validateArticle({...article(),images:[{src:'images/news/a.jpg',alt:'x'},{src:'images/news/a.jpg',alt:'y'}]}),/重複/);
 assert.throws(()=>validateArticle({...article(),images:[{src:'../secret.png',alt:'x'}]}),/選び直/);
});
