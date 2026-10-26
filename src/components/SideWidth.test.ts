// The width of the sidebar of the agents and the Kanban (ESC-204): its right edge dragged as the rail's, kept in the
// settings, held to the room the window leaves the work.
import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { railWidth } from '../lib/rail-width.svelte';
import { chosenSide, ROOM_FOR_WORK, SIDE_MAX, SIDE_MIN, SIDE_USUAL, sideRoom, sideShown, sideWidth } from '../lib/side-width.svelte';
import { app } from '../lib/state.svelte';
import { agent, fakeBackend, project, resetApp } from '../test/ipc';
import '../test/pointer';
import Sidebar from './Sidebar.svelte';

const edge = () => screen.getByRole('separator', { name: 'Largeur de la barre des agents' });

/** The width last saved in the settings. */
const saved = (backend: ReturnType<typeof fakeBackend>) => backend.called('save_settings').at(-1)?.args.settings.sideWidth;

describe('the sidebar’s width', () => {
  it('is 276 px, between 220 and 480, held to what the window leaves beside the rail and the work', () => {
    expect(sideShown(null, 1440, 52)).toBe(SIDE_USUAL);
    expect(sideShown(400, 1440, 52)).toBe(400);
    expect(sideShown(999, 1440, 52)).toBe(SIDE_MAX);
    expect(sideShown(10, 1440, 52)).toBe(SIDE_MIN);
    // The work keeps what a window of 1 000 px left it beside the rail and the sidebar: 672 px.
    expect(ROOM_FOR_WORK).toBe(672);
    expect(sideRoom(1000, 52)).toBe(SIDE_USUAL);
    // The runner's window (1 024 px): 300 px at most beside the narrowest rail, less beside a wider one.
    expect(sideRoom(1024, 52)).toBe(300);
    expect(sideShown(480, 1024, 52)).toBe(300);
    expect(sideShown(480, 1024, 76)).toBe(SIDE_USUAL);
    expect(sideShown(null, 1028, 80)).toBe(SIDE_USUAL);
    // Never under its narrowest, whatever the room.
    expect(sideRoom(900, 300)).toBe(SIDE_MIN);
    expect(sideRoom(1920, 52)).toBe(SIDE_MAX);
  });

  it('reads the width kept in the settings, and nothing that is not one', () => {
    for (const [kept, read] of [
      [320, 320],
      [300.6, 301],
      [900, SIDE_MAX],
      [10, SIDE_MIN],
      [0, null],
      [undefined, null],
      [NaN, null],
      [-4, null],
    ] as const)
      expect(chosenSide(kept)).toBe(read);
  });
});

describe('the sidebar’s edge', () => {
  beforeEach(() => {
    railWidth.window = 1440;
    resetApp({ projects: [project(), project({ id: 'p2', name: 'studio-web' })], agents: [agent()] });
    app.ui.view = 'project';
    app.ui.activeProject = 'p1';
  });

  it('is dragged, moved by the keyboard, kept for the whole app, and a double click gives its usual width back', async () => {
    const backend = fakeBackend();
    render(Sidebar, { project: project() });
    const e = edge();
    expect(e).toHaveAttribute('aria-orientation', 'vertical');
    expect(e).toHaveAttribute('aria-valuenow', String(SIDE_USUAL));
    expect(e).toHaveAttribute('aria-valuemin', String(SIDE_MIN));
    expect(e).toHaveAttribute('aria-valuemax', String(SIDE_MAX));
    expect(e).toHaveAttribute('tabindex', '0');
    e.focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(sideWidth.shown).toBe(SIDE_USUAL + 16);
    await waitFor(() => expect(saved(backend)).toBe(SIDE_USUAL + 16));
    await userEvent.keyboard('{End}');
    expect(sideWidth.shown).toBe(SIDE_MAX);
    expect(e).toHaveAttribute('aria-valuenow', String(SIDE_MAX));
    await userEvent.keyboard('{Home}');
    expect(sideWidth.shown).toBe(SIDE_MIN);
    await waitFor(() => expect(saved(backend)).toBe(SIDE_MIN));
    // Dragged: the width follows the pointer, kept once let go, once.
    const saves = backend.called('save_settings').length;
    await fireEvent.pointerDown(e, { button: 0, pointerId: 1, clientX: 272 });
    await fireEvent.pointerMove(e, { pointerId: 1, buttons: 1, clientX: 372 });
    expect(sideWidth.shown).toBe(SIDE_MIN + 100);
    await fireEvent.pointerUp(e, { pointerId: 1 });
    await waitFor(() => expect(saved(backend)).toBe(SIDE_MIN + 100));
    expect(backend.called('save_settings')).toHaveLength(saves + 1);
    // The same width for every project.
    app.ui.activeProject = 'p2';
    expect(sideWidth.shown).toBe(SIDE_MIN + 100);
    // Dragged past its widest: held there.
    await fireEvent.pointerDown(e, { button: 0, pointerId: 2, clientX: 372 });
    await fireEvent.pointerMove(e, { pointerId: 2, buttons: 1, clientX: 1200 });
    await fireEvent.pointerUp(e, { pointerId: 2 });
    expect(sideWidth.shown).toBe(SIDE_MAX);
    // A narrow window draws it narrower, and says so to a screen reader; the width chosen comes back with the room.
    railWidth.window = 1024;
    expect(sideWidth.shown).toBe(300);
    await waitFor(() => expect(e).toHaveAttribute('aria-valuemax', '300'));
    railWidth.window = 1440;
    expect(sideWidth.shown).toBe(SIDE_MAX);
    // Double click: the usual width.
    await fireEvent.dblClick(e);
    expect(sideWidth.shown).toBe(SIDE_USUAL);
    await waitFor(() => expect(saved(backend)).toBe(0));
  });
});
