import records from './news.json';
import type {Language} from '../lib/i18n';
export interface NewsImage {src:string;alt:string;altEn:string;caption:string;captionEn:string;}
export interface NewsRecord {
 id:string;date:string;status:string;type:string;anchor:string;link:string;
 images:NewsImage[];
 ja:{title:string;summary:string;body:string};en:{title:string;summary:string;body:string};
}
// Scheduled posts: a published article dated in the future stays hidden until that date (JST).
// The deploy workflow rebuilds the site every day just after midnight JST to release them.
const todayJST=new Date(Date.now()+9*3600_000).toISOString().slice(0,10);
export const publishedNews=(lang:Language='ja')=>(records as NewsRecord[])
 .filter(n=>n.status==='published'&&n.date<=todayJST&&n[lang].title.trim()&&n[lang].body.trim())
 .sort((a,b)=>b.date.localeCompare(a.date)||a.id.localeCompare(b.id));
export const newsOpening = (body: string) => body.trim().split(/\r?\n/, 1)[0] || '';
export const localizedNews=(lang:Language)=>publishedNews(lang).map(n=>({...n,
 heading:n[lang].title,text:newsOpening(n[lang].body)||n[lang].title,continues:newsOpening(n[lang].body)!==n[lang].body.trim(),detail:n[lang].body,
 date:n.date.replaceAll('-','.'),articleSlug:`news/${n.id}`,
}));
