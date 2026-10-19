// What the voice conversation does with words, apart from the window (ESC-97): a spoken answer to a permission or to a
// question understood, and what the agent asks put into a sentence to be read aloud.

import type { ConvItem, PermissionItem, QuestionItem, TextItem, TurnItem } from './types';

/** The credits of the voice's software and of each voice, with their licences (Réglages › À propos). */
export const CREDITS_URL = 'https://github.com/guillaume-gagnaire/escouade/blob/main/CREDITS.md';

/** Lower case, no accents, the typographic apostrophe as the plain one, words separated by single spaces. */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[’`]/g, "'")
    .replace(/[^\p{L}\p{N}']+/gu, ' ')
    .trim();
}

/** Whether `text` holds one of the words or phrases of `alternatives` (« oui|vas-y|bien sûr »), whole. */
export function says(text: string, alternatives: string): boolean {
  const t = ` ${normalize(text)} `;
  return alternatives
    .split('|')
    .map(normalize)
    .filter(Boolean)
    .some((w) => t.includes(` ${w} `));
}

export interface AnswerWords {
  yes: string;
  no: string;
  always: string;
  /** For each rank, the words that say it (« deuxième|second »): heard as a rank anywhere. */
  ordinals: string[];
  /** For each rank, its number (« deux|2 »): a rank only in an answer of ranks alone (« la deux », « 1 et 3 »). */
  numbers: string[];
  /** The last option; all of them; both of two; none. */
  last: string;
  all: string;
  both: string;
  none: string;
  /** The words around ranks in an answer of ranks alone, and that never name an option (« la », « option », « et »). */
  fillers: string;
  /** Commands, never answers: the question asked again; the questions given up. */
  repeat: string;
  cancel: string;
}

/** A spoken answer to a permission: allowed (once or always), denied, or not understood (null, also when it says both). */
export function permissionAnswer(heard: string, words: AnswerWords, canAlways: boolean): 'allow' | 'always' | 'deny' | null {
  const yes = says(heard, words.yes);
  const no = says(heard, words.no);
  const always = says(heard, words.always);
  if (no && (yes || always)) return null;
  if (no) return 'deny';
  if (always) return canAlways ? 'always' : 'allow';
  return yes ? 'allow' : null;
}

/** A question as the voice answers it: its options' labels, one or several of them, a free answer taken or not. */
export interface SpokenQuestion {
  options: string[];
  multi: boolean;
  free: boolean;
}

/**
 * The question `qi` of a request, for the voice. A free answer is taken wherever the window takes one: every question
 * but a list of choices of an MCP server's form.
 */
export function spokenQuestion(item: QuestionItem, qi: number): SpokenQuestion {
  const q = item.questions[qi];
  const options = q.options.map((o) => o.label);
  return { options, multi: !!q.multiSelect, free: !item.form || !!q.field || !options.length };
}

/**
 * What a spoken answer to a question says: the options picked (in their order), a free answer (`text`), none of them
 * (`none`, several choices only), the question to be asked again, the questions given up. Null when not understood:
 * nothing, two options for a single choice, a rank beyond the list, no option where no free answer is taken.
 */
export type SpokenAnswer =
  { kind: 'answer'; picks: string[]; text: string | null; none?: boolean } | { kind: 'repeat' } | { kind: 'cancel' } | null;

/** `normalize`, the apostrophe too a space between words (« l'option »). */
const plain = (text: string) => normalize(text).replace(/'/g, ' ').replace(/ +/g, ' ').trim();
const wordsOf = (alternatives: string) => new Set(alternatives.split('|').map(plain).join(' ').split(' ').filter(Boolean));

/** Whether `word`, heard, stands for `of`, a word of an option: the same, or its beginning (« postgres », « PostgreSQL »). */
const fits = (word: string, of: string) => word === of || (word.length >= 4 && of.startsWith(word));

/**
 * The options an answer names: those said whole (of two that hold each other, the longer: « Postgres avec Docker »),
 * else the one the answer is part of, else those a word of the answer stands for, when it is a word of one option only.
 * For several choices, all of them together (« unitaires et lint »).
 */
function named(h: string, options: string[], fillers: Set<string>, multi: boolean): Set<number> {
  const norm = options.map(plain);
  const has = (outer: string, inner: string) => !!inner && ` ${outer} `.includes(` ${inner} `);
  const whole = norm
    .map((n, i) => (has(h, n) ? i : -1))
    .filter((i) => i >= 0)
    .filter((i, _, all) => !all.some((j) => j !== i && norm[j].length > norm[i].length && has(norm[j], norm[i])));
  if (whole.length && !multi) return new Set(whole);
  const inside = norm.map((n, i) => (h.length >= 3 && has(n, h) ? i : -1)).filter((i) => i >= 0);
  if (inside.length === 1 && !whole.length) return new Set(inside);
  const optionWords = norm.map((n) => n.split(' ').filter((w) => w.length >= 3 && !fillers.has(w)));
  const found = new Set<number>(whole);
  for (const w of h.split(' ')) {
    if (w.length < 3 || fillers.has(w)) continue;
    const fit = optionWords.map((ws, i) => (ws.some((o) => fits(w, o)) ? i : -1)).filter((i) => i >= 0);
    if (fit.length === 1) found.add(fit[0]);
  }
  return found;
}

/** The ranks an answer says (from 0), and whether one is beyond the list. */
function ranked(heard: string, h: string, count: number, w: AnswerWords, fillers: Set<string>) {
  const ranks = new Set<number>();
  let beyond = false;
  const take = (i: number) => {
    if (i < count) ranks.add(i);
    else beyond = true;
  };
  w.ordinals.forEach((o, i) => {
    if (says(heard, o)) take(i);
  });
  if (count && says(heard, w.last)) take(count - 1);
  if (ranks.size || beyond) return { ranks, beyond };
  // Numbers, in an answer of ranks alone: « la deux », « 1 et 3 »; not the « un » of « un thème sombre ».
  const numbers = w.numbers.map(wordsOf);
  const rankOf = (x: string) => numbers.findIndex((n) => n.has(x));
  const all = h.split(' ');
  if (all.some((x) => rankOf(x) >= 0) && all.every((x) => rankOf(x) >= 0 || fillers.has(x))) {
    for (const x of all) if (rankOf(x) >= 0) take(rankOf(x));
  }
  return { ranks, beyond };
}

/**
 * A spoken answer to a question, understood (fr and en, by the words of the language): an option by its name, near
 * enough (no case nor accents; a word of it no other option has is enough), or by its rank (« la deuxième », « 2 »,
 * « le dernier »); several for a question of several choices (« la première et la troisième », « les deux »,
 * « toutes », « aucune »); else what was said is the free answer, when the question takes one. See `SpokenAnswer`.
 */
export function questionAnswer(heard: string, q: SpokenQuestion, w: AnswerWords): SpokenAnswer {
  const h = plain(heard);
  if (!h) return null;
  const fillers = wordsOf(w.fillers);
  const picked = named(h, q.options, fillers, q.multi);
  // « Répète », « annule »: commands, in a short sentence that names no option.
  const short = h.split(' ').length <= 6;
  if (!picked.size && short && says(heard, w.repeat)) return { kind: 'repeat' };
  if (!picked.size && short && says(heard, w.cancel)) return { kind: 'cancel' };
  const { ranks, beyond } = ranked(heard, h, q.options.length, w, fillers);
  if (beyond) return null;
  for (const r of ranks) picked.add(r);
  if (q.multi && q.options.length) {
    if (says(heard, w.all) || (q.options.length === 2 && says(heard, w.both))) {
      return { kind: 'answer', picks: [...q.options], text: null };
    }
    if (!picked.size && says(heard, w.none)) return { kind: 'answer', picks: [], text: null, none: true };
  }
  if (picked.size === 1 || (q.multi && picked.size > 1)) {
    return { kind: 'answer', picks: q.options.filter((_, i) => picked.has(i)), text: null };
  }
  if (picked.size > 1) return null;
  return q.free ? { kind: 'answer', picks: [], text: heard.trim() } : null;
}

/** What a permission is about, in a few words: its title, else its description, else the tool and its command. */
export function permissionWhat(item: PermissionItem): string {
  if (item.title) return item.title;
  if (item.description) return item.description;
  const command = typeof item.input?.command === 'string' ? item.input.command : '';
  return command ? `${item.toolName} ${command.slice(0, 80)}` : item.toolName;
}

/** How many turns the conversation has ended: one more is the end of the turn of what was said. */
export function turnsIn(items: ConvItem[]): number {
  return items.filter((i) => i.kind === 'turn').length;
}

/**
 * The end of the turn after the first `turns`: the turn, and the passage to be read the agent wrote in it (the last
 * one), if any. Null while it goes on.
 */
export function turnOver(items: ConvItem[], turns: number): { turn: TurnItem; spoken: string | null } | null {
  let seen = 0;
  let from = 0;
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    if (it.kind !== 'turn') continue;
    seen++;
    if (seen === turns) from = i + 1;
    if (seen === turns + 1) {
      const texts = items.slice(from, i).filter((x): x is TextItem => x.kind === 'text' && !x.parent && !!x.spoken);
      return { turn: it, spoken: texts.at(-1)?.spoken ?? null };
    }
  }
  return null;
}

/** A text being written: what is shown of it, its passage to be read cut off (it shows apart once written). */
export function withoutPassage(text: string): string {
  const i = text.indexOf('<spoken>');
  return i < 0 ? text : text.slice(0, i).trimEnd();
}

/** A message said in a conversation, as sent (its instruction at its end), without the instruction. */
export function withoutInstruction(text: string): { text: string; spoken: boolean } {
  const i = text.lastIndexOf('<escouade-voice>');
  if (i < 0 || !text.trimEnd().endsWith('</escouade-voice>')) return { text, spoken: false };
  return { text: text.slice(0, i).trimEnd(), spoken: true };
}
