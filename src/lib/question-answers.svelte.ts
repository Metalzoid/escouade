// The answers of a question card being given (ESC-131), apart from the card: the voice conversation ticks them as they
// are said, the card shows them at once and takes them when it sends, and what is ticked by hand the voice takes.

/** By question (its text): the options ticked, and what is written (a field of a form, a free answer said). */
export interface QuestionDraft {
  picks: Record<string, string[]>;
  texts: Record<string, string>;
}

const drafts = $state<Record<string, QuestionDraft>>({});

/** The answers of the request `id` so far (made empty the first time; not to be called while deriving). */
export function draftOf(id: string): QuestionDraft {
  return (drafts[id] ??= { picks: {}, texts: {} });
}

/** The answers of the request `id`, if any were given: read while deriving. */
export function draftIfAny(id: string): QuestionDraft | undefined {
  return drafts[id];
}

/** The answer of the question `question` as sent: the options ticked, else what was written or said. */
export function answerOf(draft: QuestionDraft | undefined, question: string): string {
  const picks = draft?.picks[question] ?? [];
  return picks.length ? picks.join(', ') : (draft?.texts[question] ?? '').trim();
}

/** The tests: no answer given. */
export function clearDrafts() {
  for (const k of Object.keys(drafts)) delete drafts[k];
}
