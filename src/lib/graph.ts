// Lays out a commit list (children before parents) on lanes, like `git log --graph`.

import type { Commit } from './types';

export interface Segment {
  from: number;
  to: number;
  /** Lane identity (stable along a branch), for its color and its highlight. */
  lane: number;
}

export interface GraphRow {
  col: number;
  lane: number;
  /** From the row's top edge (column `from`) to the node's middle (column `to`). */
  top: Segment[];
  /** From the node's middle (column `from`) to the row's bottom edge (column `to`). */
  bottom: Segment[];
  width: number;
}

interface Lane {
  /** The commit this lane leads to next. */
  hash: string;
  id: number;
  /** Kept for the trunk until its first commit: nothing drawn in it above. */
  reserved?: boolean;
}

/**
 * Each lane waits for a commit. Lanes waiting for the same commit converge on it (a fork
 * point); its first parent continues its lane, other parents join a lane already waiting for
 * them or open a new one (a merge). `trunk`: the commit the trunk starts at (the folder's), kept to the first column
 * from the top, as the preview draws it, and the lane the others converge on.
 */
export function layout(commits: Commit[], trunk: string | null = null): GraphRow[] {
  const lanes: (Lane | null)[] = [];
  let nextId = 0;
  let trunkId = -1;
  if (trunk && commits.some((c) => c.hash === trunk)) {
    trunkId = nextId++;
    lanes.push({ hash: trunk, id: trunkId, reserved: true });
  }
  const free = (skip = -1) => {
    const i = lanes.findIndex((l, j) => l === null && j !== skip);
    return i >= 0 ? i : lanes.length;
  };
  return commits.map((c) => {
    // Several lanes waiting for it converge on it: the trunk's, when it is one of them.
    const onTrunk = lanes.findIndex((l) => l?.hash === c.hash && l.id === trunkId);
    let col = onTrunk >= 0 ? onTrunk : lanes.findIndex((l) => l?.hash === c.hash);
    const before = lanes.length;
    const lane = col >= 0 ? lanes[col]!.id : nextId++;
    if (col < 0) col = free();
    const top: Segment[] = [];
    lanes.forEach((l, i) => {
      if (l && !l.reserved) top.push({ from: i, to: l.hash === c.hash ? col : i, lane: l.id });
    });
    lanes.forEach((l, i) => {
      if (l?.hash === c.hash) lanes[i] = null;
    });
    const opened = new Set<number>();
    const joins: Segment[] = [];
    c.parents.forEach((p, k) => {
      if (k === 0) {
        lanes[col] = { hash: p, id: lane };
        opened.add(col);
        return;
      }
      const waiting = lanes.findIndex((l) => l?.hash === p);
      if (waiting >= 0) {
        joins.push({ from: col, to: waiting, lane: lanes[waiting]!.id });
      } else {
        const slot = free(col);
        lanes[slot] = { hash: p, id: nextId++ };
        opened.add(slot);
      }
    });
    const bottom: Segment[] = [];
    lanes.forEach((l, i) => {
      if (l && !l.reserved) bottom.push({ from: opened.has(i) ? col : i, to: i, lane: l.id });
    });
    bottom.push(...joins);
    const width = Math.max(before, lanes.length, col + 1);
    while (lanes.length && lanes[lanes.length - 1] === null) lanes.pop();
    return { col, lane, top, bottom, width };
  });
}

/** Commits of a branch: from the one it points at, following first parents. */
export function branchCommits(commits: Commit[], branch: string | null): Set<string> {
  const out = new Set<string>();
  if (!branch) return out;
  const byHash = new Map(commits.map((c) => [c.hash, c]));
  let cur = commits.find((c) => c.refs.includes(branch));
  while (cur && !out.has(cur.hash)) {
    out.add(cur.hash);
    cur = cur.parents[0] ? byHash.get(cur.parents[0]) : undefined;
  }
  return out;
}

/**
 * The agents' own commits, by hash: those of an agent's branch, following first parents, down to where it left its base
 * (the first one of its base's own line of first parents): merged, they stay the agent's. Who a commit is from, in the
 * history: the agent rather than the author git names.
 */
export function agentCommits(commits: Commit[], agents: { branch: string; base: string; name: string }[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const a of agents) {
    const base = branchCommits(commits, a.base);
    for (const hash of branchCommits(commits, a.branch)) {
      if (base.has(hash)) break;
      if (!out.has(hash)) out.set(hash, a.name);
    }
  }
  return out;
}

/** Where the trunk starts: the commit the folder is on (HEAD), else the base branch's, else the first. */
export function trunkTip(commits: Commit[], base: string | null): string | null {
  return (
    (commits.find((c) => c.refs.includes('HEAD')) ?? (base ? commits.find((c) => c.refs.includes(base)) : undefined) ?? commits[0])?.hash ??
    null
  );
}

/** The lane drawn in the colour of the trunk: the one of its first commit. */
export function mainLane(commits: Commit[], rows: GraphRow[], base: string | null): number | null {
  const tip = trunkTip(commits, base);
  return rows[commits.findIndex((c) => c.hash === tip)]?.lane ?? null;
}
