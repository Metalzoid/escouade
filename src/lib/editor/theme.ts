// The editor's look, in the 2.0 design (`#editor`): the text on the panel, the numbers in their 52 px column, the
// marks of the changes in a 3 px one between them and the text, the current line barely lit, the matches of the search
// in the project's colour. Every colour is a token of src/app.css, which has its value in both themes: switching the
// theme repaints the editor at once. `editorTheme(dark)` also tells CodeMirror which of its own base themes to use.

import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import type { Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { tags } from '@lezer/highlight';
import { t, type Key } from '../i18n';

/** The colours of the code, the design's (`.k`, `.f`, `.s`, `.t`, `.n`, `.c` of the preview). */
export const SYNTAX = {
  keyword: 'var(--syn-k)',
  function: 'var(--syn-f)',
  string: 'var(--syn-s)',
  type: 'var(--syn-t)',
  number: 'var(--syn-n)',
  comment: 'var(--code-dim)',
} as const;

const highlight = HighlightStyle.define([
  {
    tag: [tags.keyword, tags.modifier, tags.controlKeyword, tags.operatorKeyword, tags.definitionKeyword, tags.moduleKeyword],
    color: SYNTAX.keyword,
  },
  { tag: tags.heading, color: SYNTAX.keyword, fontWeight: '700' },
  { tag: [tags.string, tags.special(tags.string), tags.regexp, tags.inserted], color: SYNTAX.string },
  { tag: [tags.number, tags.bool, tags.null, tags.atom], color: SYNTAX.number },
  { tag: [tags.comment, tags.lineComment, tags.blockComment, tags.docComment], color: SYNTAX.comment },
  { tag: [tags.typeName, tags.className, tags.namespace, tags.tagName], color: SYNTAX.type },
  { tag: [tags.function(tags.variableName), tags.function(tags.propertyName), tags.macroName], color: SYNTAX.function },
  { tag: [tags.attributeName, tags.labelName], color: SYNTAX.function },
  { tag: tags.strong, fontWeight: '700' },
  { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: tags.link, color: SYNTAX.type, textDecoration: 'underline' },
  { tag: tags.invalid, color: 'var(--del)' },
]);

/** A match of the search (the preview's `.hit`). */
const HIT = {
  background: 'color-mix(in oklch, var(--p) 32%, transparent)',
  boxShadow: '0 0 0 1px color-mix(in oklch, var(--p) 50%, transparent)',
  borderRadius: '3px',
};

const RULES = {
  '&': { height: '100%', backgroundColor: 'transparent', color: 'var(--code-fg)', fontSize: 'var(--editor-font, 12.5px)' },
  // « Taille du texte de l’éditeur » (`--editor-font`, set by the window): the lines grow with it, as the preview's 1.75.
  '.cm-scroller': { fontFamily: 'var(--mono)', lineHeight: '1.75' },
  '.cm-content': { caretColor: 'var(--text)', padding: '6px 0 24px' },
  '.cm-line': { padding: '0 16px 0 0' },
  '.cm-cursor, .cm-dropCursor': { borderLeft: '2px solid var(--text)' },
  '.cm-gutters': { backgroundColor: 'transparent', color: 'var(--code-nb)', border: 'none' },
  '.cm-lineNumbers .cm-gutterElement': { minWidth: '52px', padding: '0', textAlign: 'right' },
  // The current line, its number included (`.l.cur`).
  '.cm-activeLine, .cm-activeLineGutter': { backgroundColor: 'rgba(var(--fg-rgb), 0.03)' },
  '.cm-lineNumbers .cm-activeLineGutter': { color: 'var(--soft)' },
  // As specific as the base theme's rules (it has one per focus), or its colors win over ours.
  '.cm-selectionBackground, &.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, ::selection': {
    backgroundColor: 'var(--sel)',
  },
  // The marks of the changes: 3 px between the numbers and the text, 14 px from each; green for a line added, amber
  // for one modified, a red notch where lines were removed.
  '.cm-change-gutter .cm-gutterElement': { padding: '0 14px' },
  '.cm-change': { width: '3px', height: '100%', position: 'relative' },
  '.cm-change.changed::before': {
    content: '""',
    position: 'absolute',
    inset: '0',
    borderRadius: '2px',
    background: 'var(--add)',
  },
  '.cm-change.modified::before': { background: 'var(--git-m)' },
  '.cm-change.deleted::after': {
    content: '""',
    position: 'absolute',
    left: '0',
    top: '-3px',
    width: '5px',
    height: '6px',
    background: 'var(--del)',
    clipPath: 'polygon(0 0, 100% 50%, 0 100%)',
  },
  // The changes shown in the text (« Voir les changements », « Comparer »), in the colors of the gutter's marks:
  // the lines of the other version above each block, then the block. As specific as the merge view's own rules,
  // or its colors win over ours.
  '&.cm-merge-b .cm-changedLine': { backgroundColor: 'color-mix(in oklch, var(--add) 8%, transparent)' },
  '&.cm-merge-b .cm-changedText': { background: 'color-mix(in oklch, var(--add) 24%, transparent)' },
  '.cm-deletedChunk': { backgroundColor: 'color-mix(in oklch, var(--del) 9%, transparent)' },
  '.cm-deletedChunk .cm-deletedText': { background: 'color-mix(in oklch, var(--del) 28%, transparent)' },
  '.cm-deletedChunk .cm-blockAction': {
    height: '20px',
    margin: '0',
    padding: '0 8px',
    border: 'none',
    borderRadius: '6px',
    backgroundColor: 'var(--raise-2)',
    boxShadow: 'inset 0 0 0 1px var(--line-2)',
    color: 'var(--text)',
    fontFamily: 'var(--font)',
    fontSize: '11px',
    fontWeight: '550',
    lineHeight: '20px',
    cursor: 'pointer',
  },
  '.cm-deletedChunk .cm-blockAction:hover': { boxShadow: 'inset 0 0 0 1px var(--line-3)' },
  // The matches of the search, the one the cursor is on stronger (`.hit`, `.cur-hit`), its text over the colour.
  '.cm-searchMatch': HIT,
  '.cm-searchMatch.cm-searchMatch-selected': { background: 'color-mix(in oklch, var(--p) 55%, transparent)' },
  '.cm-searchMatch.cm-searchMatch-selected, .cm-searchMatch.cm-searchMatch-selected span': { color: 'var(--on-hit)' },
  '&.cm-focused .cm-matchingBracket': { backgroundColor: 'rgba(var(--fg-rgb), 0.08)', outline: '1px solid var(--line-2)' },
  // The search floats at the top right of the text (`.find`): 8 px under the line of the path, 18 px from the edge. Its
  // own look is CodeEditor.svelte's (lib/editor/find.ts draws it).
  '.cm-panels': { backgroundColor: 'transparent', color: 'var(--text)' },
  '.cm-panels.cm-panels-top': { position: 'absolute', top: '8px', right: '18px', left: 'auto', zIndex: '3', border: 'none' },
};

// Made once each: a theme is a style sheet put in the page, and one made for each file opened would pile them up.
const THEMES = {
  dark: [EditorView.theme(RULES, { dark: true }), syntaxHighlighting(highlight)],
  light: [EditorView.theme(RULES, { dark: false }), syntaxHighlighting(highlight)],
};

/** The editor's theme in the window's theme: the same tokens, CodeMirror told whether it is dark. */
export const editorTheme = (dark = true): Extension => (dark ? THEMES.dark : THEMES.light);

/** The texts CodeMirror asks for (search panel, merge view…), by the English phrase it asks with, and the key of their text. */
const PHRASE_KEYS = {
  Accept: 'editor.cm.accept',
  Reject: 'editor.cm.reject',
  'Revert this chunk': 'editor.compare.revertBlock',
  '$ unchanged lines': 'editor.cm.unchangedLines',
  Find: 'editor.cm.find',
  Replace: 'editor.cm.replace',
  next: 'editor.cm.next',
  previous: 'editor.cm.previous',
  all: 'editor.cm.all',
  'match case': 'editor.cm.matchCase',
  'by word': 'editor.cm.byWord',
  regexp: 'editor.cm.regexp',
  replace: 'editor.cm.replaceVerb',
  'replace all': 'editor.cm.replaceAll',
  close: 'editor.cm.close',
  'current match': 'editor.cm.currentMatch',
  'replaced $ matches': 'editor.cm.replacedMatches',
  'replaced match on line $': 'editor.cm.replacedOnLine',
  'on line': 'editor.cm.onLine',
  'Go to line': 'editor.cm.goToLine',
  go: 'editor.cm.go',
} as const satisfies Record<string, Key>;

/** CodeMirror's texts (search panel, merge view…) in the language of the interface, for `EditorState.phrases`. */
export function phrases(): Record<string, string> {
  return Object.fromEntries(Object.entries(PHRASE_KEYS).map(([phrase, key]) => [phrase, t(key)]));
}
