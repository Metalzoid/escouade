// The workflows of each project and where each agent is in them (ESC-194): the reading asked of the backend when the
// Workflow tab shows a project, the tracks kept up to date by the `workflowTrack` events.

import { api } from './ipc';
import { readPref, writePref } from './prefs';
import type { Workflow, WorkflowScan, WorkflowTrack } from './types';

const NONE: WorkflowScan = { readAt: 0, workflows: [], alone: [], untraced: [], sources: [], searched: [] };

/** The corrected workflows, each step the user named marked so: its name is shown as is, the others as commands. */
export function named(effective: Workflow[], read: Workflow[]): Workflow[] {
  return effective.map((w) => {
    const asRead = new Set(read.find((r) => r.id === w.id)?.steps.map((s) => s.name) ?? []);
    return { ...w, steps: w.steps.map((s) => (asRead.has(s.name) ? s : { ...s, named: true })) };
  });
}

class Workflows {
  /** The last reading of each project, absent until asked. */
  scans = $state<Record<string, WorkflowScan>>({});
  /** The tracks of each project's agents, by agent. */
  tracks = $state<Record<string, Record<string, WorkflowTrack>>>({});
  /** The workflow chosen in the tab's menu, by project. */
  chosen = $state<Record<string, string>>({});
  /** The agent whose history the tab shows, by project (absent: the open agent). */
  reader = $state<Record<string, string>>({});
  /** The rail folded, by project (kept). */
  folded = $state<Record<string, boolean>>({});
  /** The projects whose tracks were asked once. */
  private asked = new Set<string>();

  /** The tracks of a project, asked once; the events keep them after. */
  async loadTracks(projectId: string) {
    if (this.asked.has(projectId)) return;
    this.asked.add(projectId);
    try {
      const list = (await api.getWorkflowTracks(projectId)) ?? [];
      const mine = (this.tracks[projectId] ??= {});
      // An event may have come meanwhile: the newer stays.
      for (const tr of list) if (!mine[tr.agentId] || mine[tr.agentId].updated <= tr.updated) mine[tr.agentId] = tr;
    } catch {
      this.asked.delete(projectId);
    }
  }

  /**
   * The workflows of a project as it has them (ESC-195): those of its files, with the user's corrections, those dismissed
   * left out; beside what the reading says of itself (when, where it looked). Asked again when the corrections change.
   */
  async loadScan(projectId: string) {
    try {
      // One after the other: the first reads again what changed, the second finds it read.
      const scan = await api.getWorkflows(projectId);
      const effective = await api.effectiveWorkflows(projectId);
      const read = scan ?? NONE;
      this.scans[projectId] = { ...read, workflows: named(effective ?? read.workflows, read.workflows) };
    } catch {
      // No reading: the tab says it has none.
      this.scans[projectId] ??= NONE;
    }
  }

  take(track: WorkflowTrack) {
    (this.tracks[track.projectId] ??= {})[track.agentId] = track;
  }

  drop(projectId: string, agentId: string) {
    if (this.tracks[projectId]) delete this.tracks[projectId][agentId];
  }

  list(projectId: string): WorkflowTrack[] {
    return Object.values(this.tracks[projectId] ?? {});
  }

  isFolded(projectId: string): boolean {
    // Read, never written, here: a derived value of the tab reads it.
    return this.folded[projectId] ?? readPref(`workflowFolded.${projectId}`) === '1';
  }

  setFolded(projectId: string, on: boolean) {
    this.folded[projectId] = on;
    writePref(`workflowFolded.${projectId}`, on ? '1' : '0');
  }

  /** For the tests. */
  reset() {
    this.scans = {};
    this.tracks = {};
    this.chosen = {};
    this.reader = {};
    this.folded = {};
    this.asked.clear();
  }
}

export const workflows = new Workflows();
