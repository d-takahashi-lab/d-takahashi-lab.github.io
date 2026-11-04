export type Language = 'ja' | 'en';
export const pageUrl = (slug: string, lang: Language = 'ja') => `${import.meta.env.BASE_URL}${lang === 'en' ? 'en/' : ''}${slug ? slug + '/' : ''}`;
export const choose = (lang: Language, ja: string, en: string) => lang === 'en' ? en : ja;
