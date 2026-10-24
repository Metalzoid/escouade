// Gutter marks of the lines changed since the reference version.

import { RangeSet, StateEffect, StateField, type Range, type Text } from '@codemirror/state';
import { gutter, GutterMarker } from '@codemirror/view';
import type { LineChanges } from './changes';

class ChangeMark extends GutterMarker {
  constructor(readonly kind: string) {
    super();
  }
  eq(other: GutterMarker) {
    return other instanceof ChangeMark && other.kind === this.kind;
  }
  toDOM() {
    const d = document.createElement('div');
    d.className = `cm-change ${this.kind}`;
    return d;
  }
}

// A line added is green, one that took the place of lines of the reference amber (the design's `--add` and `--git-m`).
const ADDED = new ChangeMark('changed');
const MODIFIED = new ChangeMark('changed modified');
const DELETED = new ChangeMark('deleted');
const ADDED_DELETED = new ChangeMark('changed deleted');
const MODIFIED_DELETED = new ChangeMark('changed modified deleted');

export const setChanges = StateEffect.define<LineChanges>();

export function markerRanges(doc: Text, c: LineChanges): Range<GutterMarker>[] {
  const kinds = new Map<number, ChangeMark>();
  for (const n of c.deleted) kinds.set(n, DELETED);
  const modified = new Set(c.modified ?? []);
  for (const n of c.changed) {
    const m = modified.has(n);
    kinds.set(n, kinds.has(n) ? (m ? MODIFIED_DELETED : ADDED_DELETED) : m ? MODIFIED : ADDED);
  }
  return [...kinds.keys()]
    .filter((n) => n >= 1 && n <= doc.lines)
    .sort((a, b) => a - b)
    .map((n) => kinds.get(n)!.range(doc.line(n).from));
}

const marks = StateField.define<RangeSet<GutterMarker>>({
  create: () => RangeSet.empty,
  update(set, tr) {
    for (const e of tr.effects) if (e.is(setChanges)) return RangeSet.of(markerRanges(tr.state.doc, e.value));
    return tr.docChanged ? set.map(tr.changes) : set;
  },
});

export const changeGutter = () => [marks, gutter({ class: 'cm-change-gutter', markers: (v) => v.state.field(marks) })];
