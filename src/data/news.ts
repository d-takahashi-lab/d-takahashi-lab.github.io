import records from './news.json';
import type {Language} from '../lib/i18n';
export interface NewsRecord {
 id:string;date:string;status:string;type:string;anchor:string;link:string;
 image:string;imageAlt:string;imageAltEn:string;imageCaption:string;imageCaptionEn:string;
 ja:{title:string;summary:string;body:string};en:{title:string;summary:string;body:string};
}
export const publishedNews=(lang:Language='ja')=>(records as NewsRecord[])
 .filter(n=>n.status==='published'&&n[lang].title.trim()&&n[lang].body.trim())
 .sort((a,b)=>b.date.localeCompare(a.date)||a.id.localeCompare(b.id));
export const newsOpening = (body: string) => body.trim().split(/\r?\n/, 1)[0] || '';
export const localizedNews=(lang:Language)=>publishedNews(lang).map(n=>({...n,
 heading:n[lang].title,text:newsOpening(n[lang].body)||n[lang].title,continues:newsOpening(n[lang].body)!==n[lang].body.trim(),detail:n[lang].body,
 date:n.date.replaceAll('-','.'),articleSlug:`news/${n.id}`,
}));
