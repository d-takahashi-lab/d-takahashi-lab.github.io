import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
const root=fileURLToPath(new URL('../../',import.meta.url));
const output=join(root,'site-public/admin');await mkdir(output,{recursive:true});
const config=JSON.parse(await readFile(new URL('./github-config.json',import.meta.url),'utf8'));
const attribute=value=>String(value).replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;').replaceAll('>','&gt;');
let html=await readFile(new URL('./index.html',import.meta.url),'utf8');
// Version both modules together so a browser never pairs a new github.mjs with a cached model.mjs.
const backendVersion=createHash('sha256').update(await readFile(new URL('./github.mjs',import.meta.url))).update(await readFile(new URL('./model.mjs',import.meta.url))).digest('hex').slice(0,12);
const connection=`<section class="connection"><h2>News 投稿画面</h2><p class="hint">GitHubに接続すると、記事の編集・写真追加・公開ができます。下書きはこのブラウザに保存され、公開済みの記事は掲載設定で保存するまで変更されません。</p><form id="github-connect"><details><summary>接続先の設定</summary><fieldset class="row"><label>GitHubアカウント / Organization<input name="github-owner" value="${attribute(config.owner)}" required autocomplete="username"></label><label>リポジトリ<input name="github-repo" value="${attribute(config.repo)}" required></label><label>公開ブランチ<input name="github-branch" value="${attribute(config.branch)}" required></label></fieldset></details><label>GitHubアクセストークン<input name="github-token" type="password" autocomplete="off" required></label><p class="note">対象リポジトリだけを選択したFine-grained tokenを使い、ContentsをRead and writeに設定してください。トークンはGitHubへの通信にだけ使用し、保存しません。<a href="https://github.com/settings/personal-access-tokens" target="_blank" rel="noopener noreferrer">GitHubでトークンを作成 ↗</a></p><button class="primary" type="submit">GitHubに接続</button></form><p id="connection-status" role="status" aria-live="polite"></p></section>`;
html=html.replace('%%TOKEN%%','').replace('<title>News編集','<meta name="robots" content="noindex,nofollow"><title>News編集').replace('<div class="shell">',connection+'<div class="shell" id="editor-shell" hidden>')
 .replace('生命適応科学研究室 · このMacの編集画面','生命適応科学研究室 · GitHub連携')
 .replace('<button id="build" type="button">サイトに反映</button>','<button id="build" type="button">公開状況を見る</button>')
 .replace('href="http://127.0.0.1:4321/news/"','href="../news/"')
 .replace('下書きは公開サイトに含まれません。写真も記事も保存先はこのMacのウェブサイトフォルダです。','下書きはこのブラウザ内だけに保存されます。別のMacでも公開済みの記事を編集・投稿できます。')
 .replace('<script>\nconst $','<script type="module">\nimport {GitHubBackend} from "./github.mjs";\nwindow.NewsBackend=new GitHubBackend();\nconst $')
 .replace('from "./github.mjs"','from "./github.mjs?v='+backendVersion+'"')
 .replace('</style>','.connection{max-width:1000px;padding:32px 5%;margin:auto}.connection form{display:grid;gap:20px}.connection h2{font-size:28px;font-weight:400}#connection-status{font-size:14px;line-height:1.8;margin-top:16px}</style>');
await writeFile(join(output,'index.html'),html);
await writeFile(join(output,'github.mjs'),(await readFile(new URL('./github.mjs',import.meta.url),'utf8')).replace("from './model.mjs'","from './model.mjs?v="+backendVersion+"'"));
await copyFile(new URL('./model.mjs',import.meta.url),join(output,'model.mjs'));
