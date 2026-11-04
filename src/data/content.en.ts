// Existing English records were checked against the former English website.
import {localizedNews} from './news';
export const news=localizedNews('en');
export const newsTypes={LAB:'Lab',EVENT:'Seminar',PAPER:'Publication',AWARD:'Award'} as const;
