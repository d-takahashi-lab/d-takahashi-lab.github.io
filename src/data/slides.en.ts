import { slides as originals } from './slides';

export const slides = originals.map((slide) => ({ ...slide, alt: slide.altEn }));
