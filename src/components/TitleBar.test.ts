import { fireEvent, render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { tick } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buffers } from '../lib/editor/buffers.svelte';
import { setLang } from '../lib/i18n';
import { menu } from '../lib/menu.svelte';
import { handleShortcut } from '../lib/shortcuts';
import { PROJECT_COLORS } from '../lib/theme';
import { app } from '../lib/state.svelte';
import { agent, fakeBackend, gitInfo, project, resetApp } from '../test/ipc';
import ConfirmModal from './modals/ConfirmModal.svelte';
import TitleBar from './TitleBar.svelte';
import { getByTip } from '../test/tip';

async function closeProjectFromMenu(name: string) {
  await fireEvent.contextMenu(screen.getByRole('button', { name: new RegExp(name) }));
  menu.open!.items.find((i) => i.label.startsWith('Fermer le projet'))!.onClick!();
  if (app.modal?.kind !== 'confirm') throw new Error('no confirmation');
  render(ConfirmModal, app.modal);
  await userEvent.click(screen.getByRole('button', { name: 'Fermer le projet' }));
}

describe('TitleBar', () => {
  beforeEach(() =>
    resetApp({
      projects: [project(), project({ id: 'p2', name: 'studio-web' })],
      agents: [agent({ status: 'waiting' }), agent({ id: 'b1', projectId: 'p2', status: 'running' })],
    }),
  );

  it('shows the app’s logo', () => {
    fakeBackend();
    render(TitleBar);
    expect(screen.getByRole('img', { name: 'Escouade' })).toHaveAttribute('src', '/logo.svg');
  });

  it('makes the tab of a project with an agent to look at blink, in the color of what happened', async () => {
    fakeBackend();
    render(TitleBar);
    const other = screen.getByRole('button', { name: /studio-web/ });
    expect(other).not.toHaveClass('alert');
    app.attention = { b1: true };
    app.agents.b1 = { ...app.agents.b1, status: 'error' };
    await Promise.resolve();
    expect(other).toHaveClass('alert');
    expect(other.style.getPropertyValue('--alert')).toBe('var(--del)');
    expect(other).toHaveAttribute('data-tip', expect.stringContaining('À voir'));
    // The active project's own tab does not blink: its agent's card does.
    app.attention = { a1: true };
    await Promise.resolve();
    expect(screen.getByRole('button', { name: /demo-api/ })).not.toHaveClass('alert');
  });

  it('shows one tab per project with its waiting badge and git counter', () => {
    fakeBackend();
    app.git = { p1: gitInfo({ modified: 2, added: 1, total: 3 }) };
    render(TitleBar);
    const tab = screen.getByRole('button', { name: /demo-api/ });
    expect(tab).toHaveTextContent('Δ 3');
    expect(tab.querySelector('.pill')).toHaveTextContent('1');
    expect(screen.getByRole('button', { name: /studio-web/ }).querySelector('.pill')).toBeNull();
  });

  it('opens « Vue d’ensemble » from its button, left of the project tabs, and goes back with it', async () => {
    fakeBackend();
    app.openStats();
    render(TitleBar);
    const button = screen.getByRole('button', { name: 'Vue d’ensemble' });
    expect(
      button.compareDocumentPosition(screen.getByRole('button', { name: /demo-api/ })) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(button).toHaveAttribute('data-tip', expect.stringContaining('Ctrl+Maj+A'));
    expect(button).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(button);
    expect(app.ui.view).toBe('overview');
    expect(button).toHaveAttribute('aria-pressed', 'true');
    // Nor a project's tab, nor the statistics', is the one on screen.
    expect(screen.getByRole('button', { name: /Stats/ })).not.toHaveClass('active');
    expect(screen.getByRole('button', { name: /demo-api/ })).not.toHaveClass('active');
    await userEvent.click(button);
    expect(app.ui.view).toBe('stats');
  });

  it('switches project and opens the stats', async () => {
    fakeBackend();
    render(TitleBar);
    await userEvent.click(screen.getByRole('button', { name: /studio-web/ }));
    expect(app.project?.id).toBe('p2');
    await userEvent.click(screen.getByRole('button', { name: /Stats/ }));
    expect(app.ui.view).toBe('stats');
  });

  it('closes a project once the backend removed it', async () => {
    const backend = fakeBackend();
    render(TitleBar);
    await closeProjectFromMenu('studio-web');
    expect(backend.called('remove_project')[0].args).toEqual({ id: 'p2', erase: false });
    expect(app.projects.map((p) => p.id)).toEqual(['p1']);
  });

  it('warns that a closed project’s unsaved files are lost, then forgets its editor', async () => {
    const backend = fakeBackend({
      fs_read: () => ({ kind: 'text', text: 'a\n', size: 2, hash: 'h1', eol: 'lf', bom: false }),
      fs_base: () => null,
      set_unsaved: () => null,
    });
    await app.openEditor({ projectId: 'p2', source: 'project', path: 'x.ts' });
    const k = (await buffers.open('p2', 'project', 'x.ts')).key;
    buffers.edit(k, 'mine\n');
    render(TitleBar);
    await fireEvent.contextMenu(screen.getByRole('button', { name: /studio-web/ }));
    menu.open!.items.find((i) => i.label.startsWith('Fermer le projet'))!.onClick!();
    expect((app.modal as any).body).toMatch(/ 1 fichier non enregistré dans l’éditeur sera perdu\.$/);
    await (app.modal as any).onConfirm(false);
    expect(app.editor.p2).toBeUndefined();
    expect(buffers.all[k]).toBeUndefined();
    expect(backend.called('set_unsaved').at(-1)?.args).toEqual({ count: 0 });
  });

  it('stops the launch commands of a closed project without calling it a crash', async () => {
    const run = { id: 'c9', name: 'Front', command: 'npm run dev', shell: 'pwsh', cwd: '' };
    resetApp({ projects: [project(), project({ id: 'p2', name: 'studio-web', runCommands: [run] })] });
    app.launches.c9 = { status: 'running', ptyId: 't9', name: 'Front', stopping: false, code: null, startedAt: 1 };
    let stoppingDuringRemoval = false;
    const backend = fakeBackend({ remove_project: () => void (stoppingDuringRemoval = app.launches.c9.stopping) });
    render(TitleBar);
    await closeProjectFromMenu('studio-web');
    // The backend kills them while removing the project: their exits are expected.
    expect(stoppingDuringRemoval).toBe(true);
    expect(backend.called('term_kill')[0].args).toEqual({ id: 't9' });
    expect(app.launches.c9).toBeUndefined();
  });

  it('stops the test launches of the agents of a closed project too, and forgets them', async () => {
    const run = { id: 'c9', name: 'Front', command: 'npm run dev', shell: 'pwsh', cwd: '' };
    resetApp({
      projects: [project(), project({ id: 'p2', name: 'studio-web', runCommands: [run] })],
      agents: [agent(), agent({ id: 'b1', projectId: 'p2' })],
    });
    const running = (ptyId: string) => ({ status: 'running' as const, ptyId, name: 'web', stopping: false, code: null, startedAt: 1 });
    app.launches.c9 = running('t9');
    app.launches['test:b1:run:0'] = running('t8');
    app.launches['test:a1:run:0'] = running('t7');
    const seen: Record<string, boolean> = {};
    const backend = fakeBackend({
      remove_project: () => {
        for (const id of ['c9', 'test:b1:run:0', 'test:a1:run:0']) seen[id] = app.launches[id].stopping;
      },
    });
    render(TitleBar);
    await closeProjectFromMenu('studio-web');
    // The backend kills them with the project: their exits are expected, and the other project's stay.
    expect(seen).toEqual({ c9: true, 'test:b1:run:0': true, 'test:a1:run:0': false });
    expect(backend.called('term_kill').map((c) => c.args.id)).toEqual(['t9', 't8']);
    expect(Object.keys(app.launches)).toEqual(['test:a1:run:0']);
  });

  it('leaves the launch commands alone when the project could not be closed', async () => {
    const run = { id: 'c9', name: 'Front', command: 'npm run dev', shell: 'pwsh', cwd: '' };
    resetApp({ projects: [project(), project({ id: 'p2', name: 'studio-web', runCommands: [run] })] });
    app.launches.c9 = { status: 'running', ptyId: 't9', name: 'Front', stopping: false, code: null, startedAt: 1 };
    const backend = fakeBackend({
      remove_project: () => {
        throw new Error('projet verrouillé');
      },
    });
    render(TitleBar);
    await closeProjectFromMenu('studio-web');
    expect(backend.called('term_kill')).toHaveLength(0);
    expect(app.launches.c9).toMatchObject({ status: 'running', stopping: false });
  });

  it('sets a project’s color from its tab menu', async () => {
    const backend = fakeBackend();
    render(TitleBar);
    await fireEvent.contextMenu(screen.getByRole('button', { name: /studio-web/ }));
    const colors = menu.open!.items.find((i) => i.label === 'Couleur')!.colors!;
    expect(colors.values).toEqual(PROJECT_COLORS);
    expect(colors.selected).toBe(project().color);
    colors.onPick(PROJECT_COLORS[3]);
    expect(app.projects.find((p) => p.id === 'p2')?.color).toBe(PROJECT_COLORS[3]);
    expect(backend.called('update_project')[0].args.project).toMatchObject({ id: 'p2', color: PROJECT_COLORS[3] });
  });

  it('opens the settings of a project, its launch commands with them, from its tab menu', async () => {
    fakeBackend();
    render(TitleBar);
    await fireEvent.contextMenu(screen.getByRole('button', { name: /studio-web/ }));
    menu.open!.items.find((i) => i.label === 'Réglages du projet…')!.onClick!();
    expect(app.modal).toEqual({ kind: 'settings', tab: 'projects', projectId: 'p2' });
  });

  it('keeps the project when the backend could not remove it', async () => {
    fakeBackend({
      remove_project: () => {
        throw new Error('projet verrouillé');
      },
    });
    render(TitleBar);
    await closeProjectFromMenu('studio-web');
    expect(app.projects.map((p) => p.id)).toEqual(['p1', 'p2']);
    expect(app.toasts.at(-1)?.text).toMatch(/projet verrouillé/);
  });
});

describe('TitleBar editor button', () => {
  it('opens the editor on the active project', async () => {
    resetApp({ projects: [project(), project({ id: 'p2', name: 'studio-web' })] });
    app.ui.activeProject = 'p2';
    fakeBackend();
    render(TitleBar);
    await userEvent.click(screen.getByRole('button', { name: 'Ouvrir l’éditeur du projet' }));
    expect(app.editor.p2).toMatchObject({ on: true, source: 'project' });
  });

  it('is not offered behind the statistics, where no project is shown', async () => {
    resetApp();
    app.ui.view = 'stats';
    fakeBackend();
    render(TitleBar);
    expect(screen.queryByRole('button', { name: 'Ouvrir l’éditeur du projet' })).not.toBeInTheDocument();
  });
});

/**
 * Gives the strip of the tabs the layout jsdom has not: tabs 100 px wide, 2 px apart, in a room `view` wide which is
 * on screen from x = 100.
 */
function layout(view: number): HTMLElement {
  const strip = document.querySelector<HTMLElement>('.scroller')!;
  const tabs = [...strip.querySelectorAll<HTMLElement>('.tab')];
  const set = (el: HTMLElement, prop: string, value: unknown) => Object.defineProperty(el, prop, { configurable: true, value });
  tabs.forEach((t, i) => (set(t, 'offsetLeft', i * 102), set(t, 'offsetWidth', 100)));
  set(strip, 'clientWidth', view);
  set(strip, 'scrollWidth', tabs.length * 102 - 2);
  set(strip, 'getBoundingClientRect', () => ({ left: 100, right: 100 + view, top: 9, bottom: 46, width: view, height: 37, x: 100, y: 9 }));
  return strip;
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Turns the wheel over `el`: false when the event was prevented (the browser's own scroll not done). */
const wheel = (el: Element, init: WheelEventInit) =>
  el.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, ...init }));

describe('TitleBar with more projects than its room holds', () => {
  const NAMES = [
    'demo-api',
    'studio-web',
    'billing',
    'mobile-app',
    'docs',
    'infra',
    'design-system',
    'analytics',
    'auth-service',
    'search',
  ];
  const tab = (name: string) => screen.getByRole('button', { name: new RegExp(name) });

  beforeEach(() => {
    resetApp({
      projects: NAMES.map((name, i) => project({ id: `p${i + 1}`, name })),
      agents: NAMES.map((_, i) => agent({ id: `a${i + 1}`, projectId: `p${i + 1}`, name: `agent-${i + 1}` })),
    });
    fakeBackend();
  });

  it('scrolls its tabs sideways with the wheel, and leaves a touchpad’s sideways swipe to the browser', () => {
    render(TitleBar);
    const strip = layout(400);
    expect(wheel(tab('billing'), { deltaY: 100 })).toBe(false);
    expect(strip.scrollLeft).toBe(100);
    expect(wheel(tab('billing'), { deltaY: -30 })).toBe(false);
    expect(strip.scrollLeft).toBe(70);
    expect(wheel(tab('billing'), { deltaX: 40, deltaY: 2 })).toBe(true);
    expect(strip.scrollLeft).toBe(70);
  });

  it('leaves the wheel alone when every tab fits', () => {
    render(TitleBar);
    const strip = layout(2000);
    expect(wheel(tab('billing'), { deltaY: 100 })).toBe(true);
    expect(strip.scrollLeft).toBe(0);
  });

  it('opens a tab’s menu on a middle click without starting the browser’s autoscroll in the strip', async () => {
    render(TitleBar);
    layout(400);
    const press = (button: number) => {
      const e = new MouseEvent('mousedown', { bubbles: true, cancelable: true, button });
      tab('billing').dispatchEvent(e);
      return e.defaultPrevented;
    };
    // The middle button's own press would start the autoscroll (Chromium, over a box that scrolls); the left one's
    // starts the drag of the tab, and is left alone.
    expect(press(1)).toBe(true);
    expect(press(0)).toBe(false);
    await fireEvent(tab('billing'), new MouseEvent('auxclick', { bubbles: true, cancelable: true, button: 1 }));
    expect(menu.open?.items.some((i) => i.label === 'Couleur')).toBe(true);
  });

  it('keeps « + » out of the strip that scrolls, and the window’s handle right of them', () => {
    render(TitleBar);
    const strip = layout(400);
    const add = screen.getByRole('button', { name: 'Ajouter un projet' });
    expect(strip.contains(tab('search'))).toBe(true);
    expect(strip.contains(add)).toBe(false);
    const handle = document.querySelector('.spacer')!;
    expect(handle).toHaveAttribute('data-tauri-drag-region');
    expect(add.compareDocumentPosition(handle) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('brings the chosen project’s tab into view, however it was chosen', async () => {
    render(TitleBar);
    const strip = layout(400);
    // A click on a tab cut by the right edge: the whole of it, and the room of the fade after it (28 px).
    await userEvent.click(tab('mobile-app'));
    expect(strip.scrollLeft).toBe(306 + 100 + 28 - 400);
    // Ctrl+9, as a notification's click, selects the project: its tab comes from out of view.
    expect(handleShortcut(new KeyboardEvent('keydown', { key: '9', code: 'Digit9', ctrlKey: true }), false)).toBe(true);
    await tick();
    expect(strip.scrollLeft).toBe(816 + 100 + 28 - 400);
    // No project's tab is chosen in « Vue d’ensemble »; an agent picked there brings back its project's.
    app.toggleOverview();
    await tick();
    expect(strip.scrollLeft).toBe(544);
    app.selectAgent('a2');
    await tick();
    expect(strip.scrollLeft).toBe(102 - 28);
    // Back from the statistics to the project out of view.
    strip.scrollLeft = 600;
    app.openStats();
    await tick();
    app.selectProject('p2');
    await tick();
    expect(strip.scrollLeft).toBe(74);
  });

  it('fades the edges that have tabs out of view', async () => {
    render(TitleBar);
    const strip = layout(400);
    const fade = (side: string) => document.querySelector(`.fade.${side}`);
    await fireEvent.scroll(strip);
    expect(fade('left')).toBeNull();
    expect(fade('right')).not.toBeNull();
    strip.scrollLeft = 300;
    await fireEvent.scroll(strip);
    expect(fade('left')).not.toBeNull();
    expect(fade('right')).not.toBeNull();
    strip.scrollLeft = 1018 - 400;
    await fireEvent.scroll(strip);
    expect(fade('left')).not.toBeNull();
    expect(fade('right')).toBeNull();
  });

  it('colors the fade of an edge where a tab out of view blinks, in the color of what happened', async () => {
    render(TitleBar);
    const strip = layout(400);
    await fireEvent.scroll(strip);
    const right = () => document.querySelector<HTMLElement>('.fade.right')!;
    expect(right()).not.toHaveClass('alert');
    app.attention = { a9: true };
    app.agents.a9 = { ...app.agents.a9, status: 'waiting' };
    await tick();
    expect(right()).toHaveClass('alert');
    expect(right().style.getPropertyValue('--alert')).toBe('var(--wait)');
    // A question and an error out of view: the error's color.
    app.attention = { a9: true, a10: true };
    app.agents.a10 = { ...app.agents.a10, status: 'error' };
    await tick();
    expect(right().style.getPropertyValue('--alert')).toBe('var(--del)');
    // A tab in view blinks by itself: the fades say nothing of it.
    app.attention = { a2: true };
    await tick();
    expect(right()).not.toHaveClass('alert');
    expect(document.querySelector('.fade.left')).toBeNull();
  });

  it('scrolls while a tab is dragged near an edge of the strip, and stops once it is dropped', async () => {
    render(TitleBar);
    const strip = layout(400);
    const over = (x: number) =>
      tab('billing').dispatchEvent(new MouseEvent('dragover', { bubbles: true, cancelable: true, clientX: x, clientY: 30 }));
    await fireEvent.dragStart(tab('demo-api'));
    over(300);
    await wait(80);
    expect(strip.scrollLeft).toBe(0);
    // 5 px from the edge, the pointer held still: the strip goes on scrolling, frame after frame (11 px each).
    over(495);
    await vi.waitFor(() => expect(strip.scrollLeft).toBeGreaterThan(30));
    over(105);
    await vi.waitFor(() => expect(strip.scrollLeft).toBeLessThan(0));
    await fireEvent.dragEnd(tab('demo-api'));
    const dropped = strip.scrollLeft;
    await wait(80);
    expect(strip.scrollLeft).toBe(dropped);
  });

  it('does not scroll for a drag below the strip', async () => {
    render(TitleBar);
    const strip = layout(400);
    await fireEvent.dragStart(tab('demo-api'));
    window.dispatchEvent(new MouseEvent('dragover', { clientX: 495, clientY: 300 }));
    await wait(80);
    expect(strip.scrollLeft).toBe(0);
    await fireEvent.dragEnd(tab('demo-api'));
  });

  it('nor for a drag over the rest of the bar, away from the strip', async () => {
    render(TitleBar);
    const strip = layout(400);
    await fireEvent.dragStart(tab('demo-api'));
    // The strip is from 100 to 500 on screen: the buttons at the right of the bar are past its edge's zone.
    window.dispatchEvent(new MouseEvent('dragover', { clientX: 700, clientY: 30 }));
    await wait(80);
    expect(strip.scrollLeft).toBe(0);
    await fireEvent.dragEnd(tab('demo-api'));
  });

  it('brings the tab back when its project, already on screen, is chosen again (a notification, a shortcut)', async () => {
    render(TitleBar);
    const strip = layout(400);
    // demo-api is on screen, its tab taken out of view by the wheel.
    strip.scrollLeft = 500;
    expect(handleShortcut(new KeyboardEvent('keydown', { key: '1', code: 'Digit1', ctrlKey: true }), false)).toBe(true);
    await tick();
    expect(strip.scrollLeft).toBe(0);
    strip.scrollLeft = 500;
    // A notification's click selects the project, then its agent.
    app.selectProject('p1');
    app.selectAgent('a1');
    await tick();
    expect(strip.scrollLeft).toBe(0);
  });

  describe('as its room changes', () => {
    /** Calls the strip's ResizeObserver, as a change of size of the room or of the tabs does. */
    let resized = () => {};
    beforeEach(() => {
      vi.stubGlobal(
        'ResizeObserver',
        class {
          constructor(cb: ResizeObserverCallback) {
            resized = () => cb([], this as unknown as ResizeObserver);
          }
          observe() {}
          unobserve() {}
          disconnect() {}
        },
      );
    });
    afterEach(() => vi.unstubAllGlobals());

    it('keeps the tab on screen in view when the room narrows (the window restored down)', async () => {
      render(TitleBar);
      const strip = layout(1100);
      app.selectProject('p8');
      await tick();
      resized();
      expect(strip.scrollLeft).toBe(0);
      layout(400);
      resized();
      expect(strip.scrollLeft).toBe(714 + 100 + 28 - 400);
    });

    it('leaves the strip where it was scrolled by hand, away from the tab on screen, until it comes back to it', async () => {
      render(TitleBar);
      const strip = layout(400);
      resized();
      wheel(tab('billing'), { deltaY: 500 });
      await fireEvent.scroll(strip);
      layout(380);
      resized();
      expect(strip.scrollLeft).toBe(500);
      // Scrolled back to the tab on screen: it is kept in view again.
      wheel(tab('billing'), { deltaY: -500 });
      await fireEvent.scroll(strip);
      layout(360);
      resized();
      expect(strip.scrollLeft).toBe(0);
      app.selectProject('p10');
      await tick();
      wheel(tab('billing'), { deltaY: -400 });
      await fireEvent.scroll(strip);
      layout(400);
      resized();
      expect(strip.scrollLeft).toBe(1018 - 360 - 400);
    });
  });

  it('has a thin scroll bar, whose thumb drags the strip', async () => {
    render(TitleBar);
    const strip = layout(400);
    await fireEvent.scroll(strip);
    const thumb = document.querySelector<HTMLElement>('.thumb')!;
    // 400 px in view of 1018: a thumb 157 px wide, for 618 px of scroll over its run of 243 px.
    expect(parseFloat(thumb.style.width)).toBeCloseTo(157.17, 1);
    expect(thumb.style.left).toBe('0px');
    thumb.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0, buttons: 1, clientX: 150 }));
    window.dispatchEvent(new MouseEvent('pointermove', { buttons: 1, clientX: 200 }));
    expect(strip.scrollLeft).toBeCloseTo((50 * 618) / (400 - 157.17), 1);
    window.dispatchEvent(new MouseEvent('pointerup', { clientX: 200 }));
    window.dispatchEvent(new MouseEvent('pointermove', { buttons: 1, clientX: 300 }));
    expect(strip.scrollLeft).toBeCloseTo((50 * 618) / (400 - 157.17), 1);
  });

  it('lets go of the thumb released out of the window, where its release was not seen', async () => {
    render(TitleBar);
    const strip = layout(400);
    await fireEvent.scroll(strip);
    const thumb = document.querySelector<HTMLElement>('.thumb')!;
    thumb.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0, buttons: 1, clientX: 150 }));
    window.dispatchEvent(new MouseEvent('pointermove', { buttons: 1, clientX: 200 }));
    const at = strip.scrollLeft;
    // Back in the window with no button down: the thumb is let go, and a later press elsewhere drags nothing.
    window.dispatchEvent(new MouseEvent('pointermove', { buttons: 0, clientX: 300 }));
    window.dispatchEvent(new MouseEvent('pointermove', { buttons: 1, clientX: 350 }));
    expect(strip.scrollLeft).toBe(at);
    expect(thumb).not.toHaveClass('held');
  });

  it('has no scroll bar when every tab fits', async () => {
    render(TitleBar);
    const strip = layout(2000);
    await fireEvent.scroll(strip);
    expect(document.querySelector('.thumb')).toBeNull();
    expect(document.querySelector('.fade')).toBeNull();
  });
});

describe('TitleBar in English', () => {
  beforeEach(() => {
    resetApp({
      projects: [project(), project({ id: 'p2', name: 'studio-web' })],
      agents: [agent({ status: 'waiting' }), agent({ id: 'b1', projectId: 'p2', status: 'error' })],
    });
    setLang('en');
  });

  it('names its buttons, its tooltips and the shortcut of the overview in English', () => {
    fakeBackend();
    app.git = { p1: gitInfo({ total: 3 }) };
    app.attention = { b1: true };
    render(TitleBar);
    expect(screen.getByRole('button', { name: 'Overview' })).toHaveAttribute('data-tip', 'All agents of all projects (Ctrl+Shift+A)');
    expect(screen.getByRole('button', { name: 'Stats' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add a project' })).toHaveAttribute('data-tip', 'Add a project');
    expect(screen.getByRole('button', { name: 'Open the project’s editor' })).toHaveAttribute(
      'data-tip',
      'Browse and edit the project’s files',
    );
    expect(getByTip(document.body, 'Uncommitted git changes')).toHaveTextContent('Δ 3');
    expect(getByTip(document.body, 'Agents waiting for an answer')).toHaveTextContent('1');
    expect(screen.getByRole('button', { name: /studio-web/ })).toHaveAttribute(
      'data-tip',
      expect.stringContaining('Needs a look: refacto-auth'),
    );
    expect(screen.getByRole('button', { name: 'Minimize' })).toHaveAttribute('data-tip', 'Minimize');
    expect(screen.getByRole('button', { name: 'Close' })).toHaveAttribute('data-tip', 'Close (the app stays in the notification area)');
  });

  it('writes the menu of a project’s tab in English', async () => {
    fakeBackend();
    render(TitleBar);
    await fireEvent.contextMenu(screen.getByRole('button', { name: /demo-api/ }));
    const labels = menu.open!.items.map((i) => i.label);
    expect(labels).toEqual(expect.arrayContaining(['Rename…', 'Color', 'Project settings…', 'Open the folder', 'Close the project…']));
    expect(labels.some((l) => /a worktree per agent$/.test(l))).toBe(true);
    menu.open!.items.find((i) => i.label === 'Rename…')!.onClick!();
    expect(app.modal).toMatchObject({ kind: 'rename', title: 'Rename the project' });
  });
});
