import records from './publications.json';
export const publications = records;
export type Publication = typeof records[number];
export const publicationTypes = { article: '原著論文', review: '総説', chapter: '書籍章' } as const;
export const years = [...new Set(records.map(p => p.year))].sort((a,b) => b-a);
export const findPaper = (doi: string) => records.find(p => p.doi === doi)!;
