import {readFile,mkdir,copyFile,readdir,unlink,access} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {imagesOf} from './model.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url));
const records=JSON.parse(await readFile(join(root,'src/data/news.json'),'utf8'));
const output=join(root,'site-public/images/news');await mkdir(output,{recursive:true});
const needed=new Set(records.filter(n=>n.status==='published').flatMap(n=>imagesOf(n).map(i=>i.src.split('/').pop())));
for(const name of needed){
 if(!/^[a-z0-9-]+\.(jpg|png|webp|gif)$/.test(name))throw Error('Invalid news image name');
 const original=join(root,'.news-editor/uploads',name),destination=join(output,name);
 try{await access(original);await copyFile(original,destination);}catch(e){if(e.code!=='ENOENT')throw e;await access(destination);}
}
for(const entry of await readdir(output,{withFileTypes:true}))if(entry.isFile()&&/^[a-z0-9-]+\.(jpg|png|webp|gif)$/.test(entry.name)&&!needed.has(entry.name))await unlink(join(output,entry.name));
