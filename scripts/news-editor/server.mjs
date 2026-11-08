import {createServer} from 'node:http';
import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {createHash,randomBytes,randomUUID,timingSafeEqual} from 'node:crypto';
import {spawn} from 'node:child_process';
import {validateArticle,replaceArticle,withImages} from './model.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url));
const file=join(root,'src/data/news.json');
const port=Number(process.env.NEWS_EDITOR_PORT||4322),origin=`http://127.0.0.1:${port}`;
const token=randomBytes(32).toString('hex');
const version=s=>createHash('sha256').update(s).digest('hex');
const draftsFile=join(root,'.news-editor/drafts.json');
const readRecords=async()=>{
 const raw=await readFile(file,'utf8');let draftRaw='[]';try{draftRaw=await readFile(draftsFile,'utf8');}catch(e){if(e.code!=='ENOENT')throw e;}
 const published=JSON.parse(raw).filter(n=>n.status==='published').map(withImages),drafts=JSON.parse(draftRaw).map(withImages);let records=[...published];for(const draft of drafts)records=replaceArticle(records,draft);
 return {raw,draftRaw,published,drafts,records,version:version(raw+'\n'+draftRaw)};
};
async function atomic(path,value){await mkdir(join(root,'.news-editor'),{recursive:true});const temporary=path+'.'+randomUUID()+'.tmp';await writeFile(temporary,JSON.stringify(value,null,2)+'\n',{flag:'wx'});await rename(temporary,path);}

let saving=false,building=false,build={state:'idle',message:''};
function send(res,status,value,type='application/json'){res.writeHead(status,{'Content-Type':type+'; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','X-Frame-Options':'DENY'});res.end(type==='application/json'?JSON.stringify(value):value);}
async function body(req){let size=0;const parts=[];for await(const part of req){size+=part.length;if(size>12000000)throw Error('ファイルは8MB以下にしてください。');parts.push(part);}return JSON.parse(Buffer.concat(parts).toString());}
function run(command,args){return new Promise((resolve,reject)=>{const child=spawn(command,args,{cwd:root,env:{...process.env,ASTRO_TELEMETRY_DISABLED:'1'},stdio:['ignore','pipe','pipe']});let log='';const collect=d=>{log=(log+d.toString()).slice(-12000);};child.stdout.on('data',collect);child.stderr.on('data',collect);child.on('error',reject);child.on('close',code=>code===0?resolve(log):reject(Error(log)));});}
const server=createServer(async(req,res)=>{
 try{
  if(req.headers.host!==`127.0.0.1:${port}`){send(res,403,{error:'このMacのローカルアドレスから開いてください。'});return;}
  const url=new URL(req.url,origin);
  if(!['GET','POST'].includes(req.method)){send(res,405,{error:'Method not allowed'});return;}
  if(req.method==='POST'){
   const supplied=Buffer.from(String(req.headers['x-news-token']||''));const expected=Buffer.from(token);
   if(req.headers.origin!==origin||supplied.length!==expected.length||!timingSafeEqual(supplied,expected)){send(res,403,{error:'編集画面を再読み込みしてください。'});return;}
  }
  if(req.method==='GET'&&url.pathname==='/'){
   const html=(await readFile(new URL('./index.html',import.meta.url),'utf8')).replace('%%TOKEN%%',token);send(res,200,html,'text/html');return;
  }
  if(req.method==='GET'&&url.pathname==='/api/news'){const data=await readRecords();send(res,200,{records:data.records,version:data.version});return;}
  if(req.method==='GET'&&url.pathname==='/api/build'){send(res,200,build);return;}
  if(req.method==='POST'&&url.pathname==='/api/save'){
   if(saving||building){send(res,409,{error:'処理中です。完了を待ってから保存してください。'});return;}
   saving=true;
   try{
    const data=await body(req),old=await readRecords();
    if(data.version!==old.version){send(res,409,{error:'別の画面で更新されています。未保存の記事をコピーしてから、一覧を再読み込みしてください。'});return;}
    const article=validateArticle(data.article);
    const backups=join(root,'.news-editor/backups');await mkdir(backups,{recursive:true});
    await writeFile(join(backups,Date.now()+'-'+randomUUID()+'.json'),JSON.stringify({news:old.published,drafts:old.drafts}),{flag:'wx'});
    if(article.status==='draft')await atomic(draftsFile,replaceArticle(old.drafts,article));
    else{await atomic(file,replaceArticle(old.published,article));await atomic(draftsFile,old.drafts.filter(n=>n.id!==article.id));}
    const saved=await readRecords();send(res,200,{records:saved.records,version:saved.version,id:article.id});
   }finally{saving=false;}
   return;
  }
  if(req.method==='POST'&&url.pathname==='/api/image'){
   const data=await body(req),bytes=Buffer.from(String(data.base64||''),'base64');
   if(bytes.length>8*1024*1024||bytes.length<12)throw Error('写真は8MB以下のJPEG・PNG・WebP・GIFを選んでください。');
   let extension='';
   if(bytes[0]===255&&bytes[1]===216&&bytes[2]===255)extension='jpg';
   else if(bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))extension='png';
   else if(bytes.subarray(0,4).toString()==='RIFF'&&bytes.subarray(8,12).toString()==='WEBP')extension='webp';
   else if(['GIF87a','GIF89a'].includes(bytes.subarray(0,6).toString()))extension='gif';
   if(!extension)throw Error('JPEG・PNG・WebP・GIFを選んでください。');
   const path='images/news/'+randomUUID()+'.'+extension;await mkdir(join(root,'.news-editor/uploads'),{recursive:true});await writeFile(join(root,'.news-editor/uploads',path.split('/').pop()),bytes,{flag:'wx'});send(res,200,{path});return;
  }
  if(req.method==='POST'&&url.pathname==='/api/build'){
   if(building||saving){send(res,409,{error:'処理中です。'});return;}
   building=true;build={state:'running',message:'サイトを生成しています…'};send(res,202,build);
   (async()=>{try{const astro=join(root,'node_modules/astro/bin/astro.mjs');await run(process.execPath,[astro,'check']);await run(process.execPath,[join(root,'scripts/news-editor/prepare-assets.mjs')]);await run(process.execPath,[join(root,'scripts/news-editor/package-admin.mjs')]);await run(process.execPath,[astro,'build']);build={state:'done',message:'プレビューに反映しました。GitHub Pagesへの公開はGitHubへのpush後です。'};}catch(e){build={state:'error',message:e.message};}finally{building=false;}})();return;
  }
  if(req.method==='GET'&&/^\/images\/news\/[a-z0-9-]+\.(jpg|png|webp|gif)$/.test(url.pathname)){
   let bytes;try{bytes=await readFile(join(root,'.news-editor/uploads',url.pathname.split('/').pop()));}catch{bytes=await readFile(join(root,'site-public',url.pathname.slice(1)));}const ext=url.pathname.split('.').pop();res.writeHead(200,{'Content-Type':{jpg:'image/jpeg',png:'image/png',webp:'image/webp',gif:'image/gif'}[ext],'X-Content-Type-Options':'nosniff'});res.end(bytes);return;
  }
  send(res,404,{error:'Not found'});
 }catch(e){send(res,400,{error:e.message||'保存できませんでした。'});}
});
server.listen(port,'127.0.0.1',()=>console.log(`News editor: ${origin}\nこのMac専用。GitHub Pagesに編集APIは公開されません。`));
server.on('error',e=>{console.error(e.message);process.exitCode=1;});
