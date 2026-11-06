import {validateArticle,replaceArticle} from './model.mjs';
const decode=s=>new TextDecoder().decode(Uint8Array.from(atob(s.replace(/\s/g,'')),c=>c.charCodeAt(0)));
const localDrafts={
 async database(){return new Promise((resolve,reject)=>{const r=indexedDB.open('lab-news-drafts',1);r.onupgradeneeded=()=>r.result.createObjectStore('drafts',{keyPath:'key'});r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});},
 async request(mode,callback){const db=await this.database();try{return await new Promise((resolve,reject)=>{const transaction=db.transaction('drafts',mode);const request=callback(transaction.objectStore('drafts'));transaction.oncomplete=()=>resolve(request.result);transaction.onerror=()=>reject(transaction.error);transaction.onabort=()=>reject(transaction.error||Error('下書きの保存に失敗しました。'));});}finally{db.close();}},
 async all(prefix){return (await this.request('readonly',s=>s.getAll())).filter(d=>d.key.startsWith(prefix+'/'));},
 async put(value){return this.request('readwrite',s=>s.put(value));},
 async remove(key){return this.request('readwrite',s=>s.delete(key));},
};
export class GitHubBackend {
 constructor(){this.pendingImages=new Map();this.imageURLs=new Map();this.published=[];this.version='';this.onConnect=null;this.connected=false;
  document.querySelector('#github-connect').addEventListener('submit',e=>{e.preventDefault();this.connect();});
  for(const key of ['owner','repo','branch'])document.querySelector('[name="github-'+key+'"]').value=localStorage.getItem('news-github-'+key)||document.querySelector('[name="github-'+key+'"]').value||(key==='branch'?'main':'');
 }
 get prefix(){return this.owner+'/'+this.repo;}
 get actionsURL(){return 'https://github.com/'+this.prefix+'/actions';}
 async github(path,data,method=data?'POST':'GET'){
  // Branch refs change after each save. A cached ref can falsely conflict with our own commit.
  const freshPath=method==='GET'&&path.startsWith('/git/ref/heads/')?path+(path.includes('?')?'&':'?')+'editor_read='+crypto.randomUUID():path;
  const response=await fetch('https://api.github.com/repos/'+this.prefix+freshPath,{method,...(method==='GET'?{cache:'no-store'}:{}),headers:{Accept:'application/vnd.github+json',Authorization:'Bearer '+this.accessToken,'X-GitHub-Api-Version':'2026-03-10','Content-Type':'application/json'},...(data?{body:JSON.stringify(data)}:{})});
  const result=await response.json();if(!response.ok){if(response.status===401||response.status===403)throw Error('GitHubの認証・権限を確認してください。対象リポジトリのContents: Read and writeが必要です。');if(response.status===404)throw Error('リポジトリ・ブランチ・記事データを確認してください。新サイトのソースを先にGitHubへ配置する必要があります。');if(response.status===422)throw Error('別の更新が先に保存されたか、ブランチが保護されています。下書きを保存して接続し直してください。');throw Error('GitHub: '+(result.message||response.status));}return result;
 }
 async connect(){const form=document.querySelector('#github-connect'),status=document.querySelector('#connection-status'),button=form.querySelector('button[type="submit"]');button.disabled=true;status.textContent='GitHubへ接続しています…';
  try{this.owner=form.elements['github-owner'].value.trim();this.repo=form.elements['github-repo'].value.trim();this.branch=form.elements['github-branch'].value.trim();this.accessToken=form.elements['github-token'].value.trim();
   if(!/^[a-zA-Z0-9-]+$/.test(this.owner)||!/^[a-zA-Z0-9_.-]+$/.test(this.repo)||!this.branch||!this.accessToken)throw Error('アカウント名・リポジトリ名・ブランチ・トークンを入力してください。');
   this.ref=await this.github('/git/ref/heads/'+encodeURIComponent(this.branch));
   const source=await this.github('/contents/src/data/news.json?ref='+encodeURIComponent(this.ref.object.sha));
   this.published=JSON.parse(decode(source.content));this.version=source.sha;this.connected=true;
   for(const key of ['owner','repo','branch'])localStorage.setItem('news-github-'+key,this[key]);
   form.elements['github-token'].value='';document.querySelector('#editor-shell').hidden=false;form.hidden=true;
   status.textContent=this.prefix+' / '+this.branch+' に接続中（認証情報はこの画面を閉じると破棄）';
   await this.onConnect?.();
  }catch(e){this.accessToken='';this.connected=false;status.textContent=e.message;}finally{button.disabled=false;}
 }
 async records(){const drafts=await localDrafts.all(this.prefix);let result=[...this.published];for(const d of drafts){for(const [path,data]of Object.entries(d.images||{}))this.pendingImages.set(path,data);result=replaceArticle(result,d.article);}return result;}
 async photoURL(path){if(this.pendingImages.has(path))return this.pendingImages.get(path);if(this.imageURLs.has(path))return this.imageURLs.get(path);const source=await this.github('/contents/site-public/'+path+'?ref='+encodeURIComponent(this.branch));const value='data:image/'+(path.endsWith('.jpg')?'jpeg':path.split('.').pop())+';base64,'+source.content.replace(/\s/g,'');this.imageURLs.set(path,value);return value;}
 async api(path,data){
  if(!this.connected)throw Error('先にGitHubへ接続してください。');
  if(path==='/api/news')return {records:await this.records(),version:this.version};
  if(path==='/api/build')return {state:'idle',message:'GitHubに保存すると公開処理が始まります。完了後にNewsを再読み込みしてください。'};
  if(path==='/api/image'){
   const bytes=Uint8Array.from(atob(data.base64),c=>c.charCodeAt(0));if(bytes.length>8*1024*1024)throw Error('写真は8MB以下にしてください。');
   let extension='';if(bytes[0]===255&&bytes[1]===216&&bytes[2]===255)extension='jpg';else if([137,80,78,71,13,10,26,10].every((n,i)=>bytes[i]===n))extension='png';else if(String.fromCharCode(...bytes.slice(0,4))==='RIFF'&&String.fromCharCode(...bytes.slice(8,12))==='WEBP')extension='webp';else if(['GIF87a','GIF89a'].includes(String.fromCharCode(...bytes.slice(0,6))))extension='gif';if(!extension)throw Error('JPEG・PNG・WebP・GIFを選んでください。');
   const path='images/news/'+crypto.randomUUID()+'.'+extension;this.pendingImages.set(path,'data:image/'+(extension==='jpg'?'jpeg':extension)+';base64,'+data.base64);return {path};
  }
  if(path!=='/api/save')throw Error('Unknown editor operation');
  const article=validateArticle(data.article),key=this.prefix+'/'+article.id;
  if(article.status==='draft'){
   const images=article.image&&this.pendingImages.has(article.image)?{[article.image]:this.pendingImages.get(article.image)}:{};
   await localDrafts.put({key,article,images});return {records:await this.records(),version:this.version,id:article.id};
  }
  // One Git commit publishes article data and its image together. Never force-push.
  const head=await this.github('/git/ref/heads/'+encodeURIComponent(this.branch));
  const source=await this.github('/contents/src/data/news.json?ref='+encodeURIComponent(head.object.sha));
  if(source.sha!==data.version)throw Error('別のMacで記事が更新されています。いったん下書き保存し、この画面を再読み込みしてから接続し直してください。');
  const existing=JSON.parse(decode(source.content)),records=replaceArticle(existing,article);
  const parent=await this.github('/git/commits/'+head.object.sha);
  const tree=[{path:'src/data/news.json',mode:'100644',type:'blob',content:JSON.stringify(records,null,2)+'\n'}];
  if(article.image&&this.pendingImages.has(article.image)){
   const blob=await this.github('/git/blobs',{content:this.pendingImages.get(article.image).split(',')[1],encoding:'base64'});
   tree.push({path:'site-public/'+article.image,mode:'100644',type:'blob',sha:blob.sha});
  }
  const createdTree=await this.github('/git/trees',{base_tree:parent.tree.sha,tree});
  const commit=await this.github('/git/commits',{message:'News: '+article.ja.title,tree:createdTree.sha,parents:[head.object.sha]});
  await this.github('/git/refs/heads/'+encodeURIComponent(this.branch),{sha:commit.sha,force:false},'PATCH');
  this.published=records;const saved=await this.github('/contents/src/data/news.json?ref='+commit.sha);this.version=saved.sha;
  await localDrafts.remove(key);return {records:await this.records(),version:this.version,id:article.id};
 }
}
