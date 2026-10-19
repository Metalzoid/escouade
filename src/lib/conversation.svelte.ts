// The voice conversation (ESC-97), for the whole window: one at a time, with the agent of the composer it was started
// from. The backend keeps the microphone open, finds the end of a sentence by its silence, transcribes it, reads aloud
// and hears a barge-in (`voice::conversation`); this leads it: what is heard goes to the agent, the passage the agent
// wrote to be read is read once its turn is over, then it listens again. A permission of the agent is read, and a
// spoken answer answers it. A request of questions is asked one question at a time (ESC-131): the voice says the
// question, its choices show in the overlay, the answer said (or chosen there) answers it and is ticked in the card,
// then the next is asked; the request goes once the last has its answer. An answer not understood has its question
// asked again, twice at most, then the conversation is on pause, and says so.

import {
  permissionAnswer,
  permissionWhat,
  questionAnswer,
  spokenQuestion,
  turnOver,
  turnsIn,
  type AnswerWords,
  type SpokenAnswer,
} from './conversation';
import { conversationOf } from './conversations.svelte';
import { dictation } from './dictation.svelte';
import { t } from './i18n';
import { api } from './ipc';
import { answerOf, draftIfAny, draftOf } from './question-answers.svelte';
import { app } from './state.svelte';
import type { Agent, ConvItem, PermissionItem, QuestionItem, QuestionOption, VoiceEvent } from './types';

export type ConvPhase =
  'idle' | 'starting' | 'offer' | 'downloading' | 'listening' | 'hearing' | 'transcribing' | 'working' | 'speaking' | 'question' | 'paused';

/** What it does once a reading is over. */
type After = 'listen' | 'pause' | 'answer';

/** The question asked aloud, one of a request of one or several: the overlay shows it with its choices. */
export interface ConvAsk {
  itemId: string;
  /** Its rank in the request (from 0), and how many questions the request has. */
  index: number;
  total: number;
  question: string;
  options: QuestionOption[];
  multi: boolean;
  /** A free answer is taken (« Autre »). */
  free: boolean;
  /** Answers not understood so far: it is asked again twice at most, then the conversation is on pause. */
  misses: number;
}

/** How long what was understood is lit before the next question. */
const FLASH_MS = 700;

/** The words of spoken answers, in the language of what the conversation says (`t`). */
export function spokenWords(): AnswerWords {
  return {
    yes: t('voice.conversation.words.yes'),
    no: t('voice.conversation.words.no'),
    always: t('voice.conversation.words.always'),
    ordinals: t('voice.conversation.words.ordinals').split(';'),
    numbers: t('voice.conversation.words.numbers').split(';'),
    last: t('voice.conversation.words.last'),
    all: t('voice.conversation.words.all'),
    both: t('voice.conversation.words.both'),
    none: t('voice.conversation.words.none'),
    fillers: t('voice.conversation.words.fillers'),
    repeat: t('voice.conversation.words.repeat'),
    cancel: t('voice.conversation.words.cancel'),
  };
}

class VoiceConversation {
  phase = $state<ConvPhase>('idle');
  /** The agent it talks with. */
  agentId = $state<string | null>(null);
  level = $state(0);
  /** How loud the agent's voice being played is (0 to 1): what the orb follows while it speaks. */
  played = $state(0);
  /** The subtitle: what the user said (once transcribed), or the sentence of the agent being heard. */
  subtitle = $state<{ who: 'user' | 'agent'; text: string } | null>(null);
  /** What the user said last, and what was read last. */
  heard = $state('');
  said = $state('');
  /** What is to be downloaded before it can start. */
  offer = $state<{ kind: 'model' | 'voice'; id: string; size: number } | null>(null);
  progress = $state<{ id: string; done: number; total: number } | null>(null);
  /** Every voice being downloaded, how far: Réglages › Voix shows them. */
  voiceDownloads = $state<Record<string, { done: number; total: number }>>({});
  /** The question being asked aloud, with its choices. */
  ask = $state<ConvAsk | null>(null);
  /** What was understood of the last answer, lit a moment before the next question: options, or a free answer. */
  understood = $state<{ picks: string[]; text: string | null } | null>(null);
  /** The last answer was not understood: the overlay says so too. */
  missed = $state(false);
  /** How long an answer understood is shown before the next question (the tests: 0). */
  flashMs = FLASH_MS;
  private session: number | null = null;
  private reading: number | null = null;
  private after: After = 'listen';
  /** The turns of the agent's conversation when the last sentence was sent: one more is its answer. */
  private turns: number | null = null;
  /** The permission read aloud, or the request whose questions are asked, waiting for a spoken answer. */
  private asking: QuestionItem | PermissionItem | null = null;
  /** The ones already read: each is read once. */
  private asked = new Set<string>();
  /** Readings asked so far: the number of an older one, answered late, is not taken for the last one's. */
  private says = 0;
  /** The next question, on its way once what was understood has been seen. */
  private flash: ReturnType<typeof setTimeout> | null = null;

  get active() {
    return this.phase !== 'idle';
  }

  /** The full-window panel shows: from the microphone's opening to the end (not while a download is offered). */
  get overlay() {
    return this.phase !== 'idle' && this.phase !== 'offer' && this.phase !== 'downloading';
  }

  /** « Conversation » in the composer of `agent`. */
  async start(agentId: string) {
    if (this.phase !== 'idle' && this.phase !== 'offer') return;
    if (dictation.phase !== 'idle') dictation.cancel();
    this.phase = 'starting';
    this.agentId = agentId;
    this.offer = null;
    try {
      const r = await api.conversationStart();
      if (this.phase !== 'starting' || this.agentId !== agentId) {
        if (r.kind === 'listening') void api.conversationStop();
        return;
      }
      if (r.kind === 'needsModel') {
        this.offer = { kind: 'model', id: r.model, size: r.size };
        this.phase = 'offer';
      } else if (r.kind === 'needsVoice') {
        this.offer = { kind: 'voice', id: r.voice, size: r.size };
        this.phase = 'offer';
      } else if (r.kind === 'unavailable') {
        app.toast(t('voice.conversation.unavailable'), 'error');
        this.reset();
      } else {
        this.session = r.session;
        this.phase = 'listening';
        // A question already waiting (the agent of a ticket asks without being spoken to): asked at once.
        this.recheck();
      }
    } catch (e) {
      this.reset();
      app.toast(String(e), 'error');
    }
  }

  /** « Télécharger » of the offer: the model or the voice comes, then the conversation starts. */
  async download() {
    const offer = this.offer;
    const agentId = this.agentId;
    if (!offer || !agentId || this.phase !== 'offer') return;
    this.phase = 'downloading';
    this.progress = { id: offer.id, done: 0, total: offer.size };
    try {
      if (offer.kind === 'model') await api.voiceDownload(offer.id);
      else await api.speechDownload(offer.id);
      if (this.phase !== 'downloading') return;
      this.progress = null;
      this.phase = 'idle';
      await this.start(agentId);
    } catch (e) {
      if (this.phase === 'downloading') {
        app.toast(t('voice.downloadFailed', { error: String(e) }), 'error');
        this.reset();
      }
    }
  }

  /** « Arrêter », Escape, the agent's composer gone. */
  stop() {
    if (this.phase === 'idle') return;
    if (this.phase === 'downloading' && this.offer) {
      if (this.offer.kind === 'model') void api.voiceDownloadCancel(this.offer.id);
      else void api.speechDownloadCancel(this.offer.id);
    }
    void api.conversationStop().catch(() => {});
    this.reset();
  }

  /**
   * « Reprendre » after a pause: the question it paused on is asked again, if it still waits; else it listens again
   * (a request given up by « annule », or a permission, is answered in the window).
   */
  resume() {
    if (this.phase !== 'paused' || this.session === null) return;
    const item = this.asking;
    if (item?.kind === 'question' && this.ask && this.stillAsked(item)) {
      this.ask.misses = 0;
      this.missed = false;
      return this.say(this.questionText(), 'answer');
    }
    this.asking = null;
    this.ask = null;
    this.phase = 'listening';
    void api.conversationListen(this.session);
    this.recheck();
  }

  /** What the backend says. */
  take(e: VoiceEvent) {
    if (e.kind === 'download' || e.kind === 'speechDownload') {
      const id = e.kind === 'download' ? e.model : e.voice;
      if (e.kind === 'speechDownload') this.voiceDownloads[id] = { done: e.done, total: e.total };
      if (this.progress?.id === id) this.progress = { id, done: e.done, total: e.total };
      return;
    }
    if (!('session' in e) || e.session !== this.session || this.session === null) return;
    const session = this.session;
    switch (e.kind) {
      case 'convLevel':
        this.level = e.level;
        this.played = e.played;
        break;
      case 'convSentence':
        if (this.ours(e.reading)) this.subtitle = { who: 'agent', text: e.text };
        break;
      case 'convSpeech':
        if (this.phase === 'listening' || this.phase === 'question') this.phase = 'hearing';
        break;
      case 'convTranscribing':
        this.phase = 'transcribing';
        break;
      case 'convHeard':
        if (e.error) app.toast(e.error, 'error');
        void this.heardSaid(e.text, session);
        break;
      case 'convBargeIn':
        if (this.ours(e.reading)) {
          this.reading = null;
          this.phase = 'hearing';
        }
        break;
      case 'convSpoken':
        if (!this.ours(e.reading)) break;
        this.reading = null;
        if (e.error) app.toast(t('voice.speech.previewFailed', { error: e.error }), 'error');
        if (this.after === 'pause') {
          this.phase = 'paused';
          void api.conversationHold(session);
        } else {
          // The backend listens again by itself.
          this.phase = this.after === 'answer' ? 'question' : 'listening';
          if (this.phase === 'listening') this.recheck();
        }
        break;
      case 'convEnded':
        if (e.error) app.toast(e.error, 'error');
        this.reset();
        break;
    }
  }

  /** Whether `reading` is the one under way: its number, or any while its number is not known yet (one at a time). */
  private ours(reading: number) {
    return this.reading !== null && (this.reading === reading || this.reading === -1);
  }

  /** A sentence heard: an answer to what the agent asks, or a message for it. */
  private async heardSaid(text: string, session: number) {
    const agentId = this.agentId;
    if (!agentId) return;
    if (!text.trim()) {
      // Nothing understood: it listens again, waiting for the answer still if one was asked.
      this.phase = this.asking ? 'question' : 'listening';
      void api.conversationListen(session);
      if (!this.asking) this.recheck();
      return;
    }
    this.heard = text;
    this.subtitle = { who: 'user', text };
    if (this.asking) return this.answer(text, session);
    this.turns = turnsIn(conversationOf(agentId).items);
    this.phase = 'working';
    try {
      await api.conversationSend(agentId, text);
    } catch (e) {
      app.toast(t('voice.conversation.sendFailed', { error: String(e) }), 'error');
      this.turns = null;
      if (this.session === session) {
        this.phase = 'listening';
        void api.conversationListen(session);
      }
    }
  }

  /** A spoken answer to the permission read, or to the question asked. */
  private async answer(text: string, session: number) {
    const item = this.asking!;
    if (item.kind === 'question') return this.answerQuestion(item, text, session);
    const agentId = this.agentId!;
    this.asking = null;
    // Held before the answer goes: the agent may answer back at once, and its passage be read before a hold sent after.
    void api.conversationHold(session);
    try {
      const r = permissionAnswer(text, spokenWords(), item.canAlways);
      if (!r) return this.pause();
      this.phase = 'working';
      await api.answerPermission(agentId, item.id, r, r === 'deny' ? text : undefined);
    } catch (e) {
      app.toast(String(e), 'error');
      this.pause();
    }
  }

  /** Whether the request `item` still waits for its answers (not answered in the window, nor elsewhere). */
  private stillAsked(item: QuestionItem) {
    const agent = this.agentId ? app.agents[this.agentId] : undefined;
    return !agent || agent.pending.includes(item.id);
  }

  /** The answer said to the question asked: taken, the question asked again, or the questions given up. */
  private answerQuestion(item: QuestionItem, text: string, session: number) {
    const ask = this.ask;
    if (!ask || ask.itemId !== item.id) return;
    if (!this.stillAsked(item)) return this.backToWork(session);
    const r = questionAnswer(text, spokenQuestion(item, ask.index), spokenWords());
    if (r?.kind === 'answer') return this.takeAnswer(item, ask.index, r);
    if (r?.kind === 'repeat') {
      this.missed = false;
      return this.say(this.questionText(), 'answer');
    }
    if (r?.kind === 'cancel') {
      // The card waits in the window, with the answers already given; « Reprendre » listens again.
      this.ask = null;
      this.understood = null;
      this.missed = false;
      return this.say(t('voice.conversation.say.cancelled'), 'pause');
    }
    ask.misses++;
    this.missed = true;
    if (ask.misses > 2) return this.pause();
    this.say(this.questionText(true), 'answer');
  }

  /** The question asked, as said: where it is among the request's, and whether it takes several answers. */
  private questionText(missed = false) {
    const ask = this.ask!;
    return [
      missed ? t('voice.conversation.say.missed') : '',
      ask.total > 1 ? t('voice.conversation.say.step', { n: ask.index + 1, total: ask.total }) : '',
      ask.question,
      ask.multi ? t('voice.conversation.say.several') : '',
    ]
      .filter(Boolean)
      .join(' ');
  }

  /** The first question of `item` that has no answer yet, asked aloud; the request sent once all have one. */
  private askNext(item: QuestionItem) {
    const draft = draftIfAny(item.id);
    const index = item.questions.findIndex((q) => !answerOf(draft, q.question));
    if (index < 0) return this.send(item);
    const q = item.questions[index];
    const spoken = spokenQuestion(item, index);
    this.asking = item;
    this.ask = {
      itemId: item.id,
      index,
      total: item.questions.length,
      question: q.question,
      options: q.options,
      multi: spoken.multi,
      free: spoken.free,
      misses: 0,
    };
    this.understood = null;
    this.missed = false;
    this.say(this.questionText(), 'answer');
  }

  /** An answer to the question `index` of `item`: ticked in its card, lit a moment, then the next question. */
  private takeAnswer(item: QuestionItem, index: number, r: Extract<SpokenAnswer, { kind: 'answer' }>) {
    const q = item.questions[index].question;
    const draft = draftOf(item.id);
    if (r.picks.length) {
      draft.picks[q] = r.picks;
      delete draft.texts[q];
    } else {
      draft.picks[q] = [];
      draft.texts[q] = r.none ? t('voice.conversation.overlay.none') : (r.text ?? '');
    }
    this.understood = { picks: r.picks, text: r.picks.length ? null : draft.texts[q] };
    this.next(item);
  }

  /** What was understood is seen a moment, then the next question is asked (or the request sent). */
  private next(item: QuestionItem) {
    const session = this.session;
    if (session === null) return;
    this.missed = false;
    // Nothing is heard meanwhile; the question still being read (chosen in the overlay meanwhile) stops.
    const reading = this.reading !== null;
    this.reading = null;
    this.phase = 'question';
    if (reading) void api.conversationListen(session).then(() => api.conversationHold(session));
    else void api.conversationHold(session);
    if (this.flash) clearTimeout(this.flash);
    this.flash = setTimeout(() => {
      this.flash = null;
      if (this.session === session && this.asking === item) this.askNext(item);
    }, this.flashMs);
  }

  /** Every question answered: the request goes, all its answers together, as the card's button sends them. */
  private async send(item: QuestionItem) {
    const agentId = this.agentId!;
    const session = this.session!;
    const draft = draftIfAny(item.id);
    const answers = Object.fromEntries(item.questions.map((q) => [q.question, answerOf(draft, q.question)]));
    this.ask = null;
    this.understood = null;
    this.asking = null;
    this.phase = 'working';
    void api.conversationHold(session);
    try {
      await api.answerQuestion(agentId, item.id, answers);
    } catch (e) {
      app.toast(String(e), 'error');
      if (this.session === session) this.pause();
    }
  }

  /** The request answered in the window meanwhile: back to waiting for the agent. */
  private backToWork(session: number) {
    this.asking = null;
    this.ask = null;
    this.understood = null;
    this.missed = false;
    this.phase = 'working';
    void api.conversationHold(session);
  }

  /** An option of the question asked, clicked in the overlay or chosen by its key: ticked (several choices), or taken. */
  choose(index: number) {
    const item = this.asking;
    const ask = this.ask;
    if (item?.kind !== 'question' || !ask || this.flash) return;
    const label = ask.options[index]?.label;
    if (label === undefined) return;
    if (ask.multi) {
      const draft = draftOf(item.id);
      const cur = draft.picks[ask.question] ?? [];
      draft.picks[ask.question] = cur.includes(label) ? cur.filter((x) => x !== label) : [...cur, label];
      return;
    }
    this.takeAnswer(item, ask.index, { kind: 'answer', picks: [label], text: null });
  }

  /** « Valider » of a question of several choices: the options ticked are its answer (none ticked: « Aucune »). */
  validate() {
    const item = this.asking;
    const ask = this.ask;
    if (item?.kind !== 'question' || !ask?.multi || this.flash) return;
    const ticked = draftIfAny(item.id)?.picks[ask.question] ?? [];
    const picks = ask.options.map((o) => o.label).filter((l) => ticked.includes(l));
    this.takeAnswer(item, ask.index, { kind: 'answer', picks, text: null, none: !picks.length });
  }

  /** An option ticked by hand in the card of `itemId`: the question asked, answered so, is taken and the next asked. */
  answeredInWindow(itemId: string) {
    const item = this.asking;
    const ask = this.ask;
    if (item?.kind !== 'question' || !ask || item.id !== itemId || this.flash) return;
    const draft = draftIfAny(item.id);
    if (!answerOf(draft, ask.question)) return;
    this.understood = { picks: draft?.picks[ask.question] ?? [], text: null };
    this.next(item);
  }

  /** Says it did not understand, then holds until « Reprendre » (the answers already given stay ticked). */
  private pause() {
    this.say(t('voice.conversation.say.pausedQuestion'), 'pause');
  }

  private say(text: string, after: After) {
    const session = this.session;
    if (session === null) return;
    this.after = after;
    this.said = text;
    this.phase = after === 'answer' ? 'question' : 'speaking';
    // While the reading starts, its number is not known: a barge-in or an end of it is not taken for another one.
    this.reading = -1;
    const mine = ++this.says;
    api
      .conversationSay(session, text)
      .then((n) => {
        if (this.says === mine && this.reading === -1 && this.session === session) this.reading = n;
      })
      .catch((e) => {
        app.toast(String(e), 'error');
        if (this.session === session) {
          this.phase = 'listening';
          void api.conversationListen(session);
        }
      });
  }

  /**
   * The agent and its conversation as they change (the composer's effect): its permission is read, its questions
   * asked, the end of its turn has its passage read.
   */
  observe(agent: Agent, items: ConvItem[]) {
    if (agent.id !== this.agentId || this.session === null) return;
    const phase = this.phase;
    if (phase !== 'working' && phase !== 'listening' && phase !== 'question' && phase !== 'paused') return;
    const pending = agent.pending.length ? items.find((i) => i.id === agent.pending[0]) : undefined;
    // Asked while it works for what was said, or while it listens (an agent that asks by itself).
    const asks = pending && (pending.kind === 'question' || pending.kind === 'permission');
    if ((phase === 'working' || phase === 'listening') && asks && !this.asked.has(pending.id)) {
      this.asked.add(pending.id);
      if (pending.kind === 'question') return this.askNext(pending);
      this.asking = pending;
      return this.say(t('voice.conversation.say.permission', { name: agent.name, what: permissionWhat(pending) }), 'answer');
    }
    // Answered in the window meanwhile: back to waiting for the agent.
    if ((phase === 'question' || phase === 'paused') && this.asking && !agent.pending.includes(this.asking.id)) {
      if (this.flash) clearTimeout(this.flash);
      this.flash = null;
      if (this.reading === null) return this.backToWork(this.session);
      this.asking = null;
      this.ask = null;
      this.understood = null;
      return;
    }
    if (phase !== 'working' || this.turns === null) return;
    const over = turnOver(items, this.turns);
    if (!over) return;
    this.turns = null;
    const text =
      over.spoken ??
      (over.turn.isError && !over.turn.interrupted ? t('voice.conversation.say.error') : t('voice.conversation.say.noPassage'));
    this.say(text, 'listen');
  }

  /** The agent as it is now: its question asked if one waits (at the start, after a reading, after a pause). */
  private recheck() {
    const agent = this.agentId ? app.agents[this.agentId] : undefined;
    if (agent) this.observe(agent, conversationOf(agent.id).items);
  }

  private reset() {
    this.phase = 'idle';
    this.agentId = null;
    this.session = null;
    this.reading = null;
    this.after = 'listen';
    this.turns = null;
    this.asking = null;
    this.ask = null;
    this.understood = null;
    this.missed = false;
    if (this.flash) clearTimeout(this.flash);
    this.flash = null;
    this.offer = null;
    this.progress = null;
    this.level = 0;
    this.played = 0;
    this.subtitle = null;
    this.heard = '';
    this.said = '';
  }

  /** Back to rest (the tests). */
  clear() {
    this.reset();
    this.asked.clear();
    this.flashMs = FLASH_MS;
  }
}

export const conversation = new VoiceConversation();
