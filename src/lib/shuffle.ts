/** One randomized cycle, without repeating the last photograph at the boundary. */
export function shuffleCycle<T>(items: readonly T[], previous?: T, random = Math.random): T[] {
 const result = [...items];
 for (let i = result.length - 1; i > 0; i--) {
  const j = Math.floor(random() * (i + 1));
  [result[i], result[j]] = [result[j], result[i]];
 }
 if (result.length > 1 && previous !== undefined && result[0] === previous) {
  const j = 1 + Math.floor(random() * (result.length - 1));
  [result[0], result[j]] = [result[j], result[0]];
 }
 return result;
}
