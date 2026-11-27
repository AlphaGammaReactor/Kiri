// Getting-started checklist on Home: screens report the first time a student does each step.
export type Step = "run" | "save" | "reliable" | "word" | "version" | "glossary";
const subs = new Set<(s: Step) => void>();
export const progress = {
  mark(s: Step) { subs.forEach((f) => f(s)); },
  on(f: (s: Step) => void) { subs.add(f); return () => { subs.delete(f); }; },
};
