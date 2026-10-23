import { fireEvent } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { tabTo } from '../test/tip';
import { place, SHOW_DELAY, tip, WARM_FOR, type TipContent } from './tip';

/** An element of the page with a tooltip, as `use:tip` makes it. */
function tipped(html: string, content: TipContent) {
  const host = document.createElement('div');
  host.innerHTML = html;
  document.body.append(host);
  const node = host.firstElementChild as HTMLElement;
  const action = tip(node, content);
  return { node, action, host };
}

const shown = () => document.querySelector<HTMLElement>('[role="tooltip"]');

describe('use:tip', () => {
  const made: { action: ReturnType<typeof tip>; host: HTMLElement }[] = [];
  const make = (html: string, content: TipContent) => {
    const t = tipped(html, content);
    made.push(t);
    return t;
  };

  beforeEach(() => {
    vi.useFakeTimers();
    // Past any warm window a previous test left.
    vi.advanceTimersByTime(10_000);
  });

  afterEach(() => {
    for (const { action, host } of made.splice(0)) {
      action.destroy();
      host.remove();
    }
    vi.useRealTimers();
  });

  it('writes its text on the element, where nothing of the browser shows it, and takes it off with no text', () => {
    const { node, action } = make('<span>3 agents</span>', 'Agents en cours');
    expect(node).toHaveAttribute('data-tip', 'Agents en cours');
    expect(node).not.toHaveAttribute('title');
    action.update('');
    expect(node).not.toHaveAttribute('data-tip');
    action.update({ text: 'Le chemin entier', cut: true });
    expect(node).toHaveAttribute('data-tip', 'Le chemin entier');
  });

  it('shows after a short stay of the pointer, not at once, and goes when the pointer leaves', () => {
    const { node } = make('<button>Lancer</button>', 'Lancer le ticket');
    fireEvent.mouseEnter(node);
    vi.advanceTimersByTime(SHOW_DELAY - 1);
    expect(shown()).toBeNull();
    vi.advanceTimersByTime(1);
    expect(shown()).toHaveTextContent('Lancer le ticket');
    fireEvent.mouseLeave(node);
    expect(shown()).toBeNull();
  });

  it('shows a rich tooltip: its title in bold over its lines, each after its icon, and says them all as its text', () => {
    const { node, action } = make('<span>Attend</span>', {
      title: 'Son tour est fini, mais il attend :',
      rows: [
        { icon: 'agents', text: '2 agents pilotés au travail' },
        { icon: 'clock', text: 'Claude Code le relance à 15:30' },
        'Sans icône',
      ],
    });
    expect(node).toHaveAttribute(
      'data-tip',
      'Son tour est fini, mais il attend :\n2 agents pilotés au travail\nClaude Code le relance à 15:30\nSans icône',
    );
    fireEvent.mouseEnter(node);
    vi.advanceTimersByTime(SHOW_DELAY);
    const box = shown()!;
    expect(box).toHaveClass('rich');
    expect(box.querySelector('b')).toHaveTextContent('Son tour est fini, mais il attend :');
    const rows = [...box.querySelectorAll('.tip-row')];
    expect(rows.map((r) => r.textContent)).toEqual(['2 agents pilotés au travail', 'Claude Code le relance à 15:30', 'Sans icône']);
    expect(rows.map((r) => r.querySelector('svg')?.dataset.icon ?? null)).toEqual(['agents', 'clock', null]);
    expect(rows[0].querySelector('use')).toHaveAttribute('href', '#i-agents');
    // Changed while it is up: shown again, a plain text when it has no lines.
    action.update('Terminé');
    expect(box).not.toHaveClass('rich');
    expect(box.textContent).toBe('Terminé');
  });

  it('shows nothing when the pointer only passes over the element', () => {
    const { node } = make('<button>Lancer</button>', 'Lancer le ticket');
    fireEvent.mouseEnter(node);
    vi.advanceTimersByTime(SHOW_DELAY / 2);
    fireEvent.mouseLeave(node);
    vi.advanceTimersByTime(SHOW_DELAY);
    expect(shown()).toBeNull();
  });

  it('shows the next one at once while a tooltip is up or has just gone, and waits again later', () => {
    const a = make('<button>A</button>', 'Premier');
    const b = make('<button>B</button>', 'Second');
    fireEvent.mouseEnter(a.node);
    vi.advanceTimersByTime(SHOW_DELAY);
    fireEvent.mouseLeave(a.node);
    vi.advanceTimersByTime(WARM_FOR - 1);
    fireEvent.mouseEnter(b.node);
    expect(shown()).toHaveTextContent('Second');
    fireEvent.mouseLeave(b.node);
    vi.advanceTimersByTime(WARM_FOR);
    fireEvent.mouseEnter(a.node);
    expect(shown()).toBeNull();
    vi.advanceTimersByTime(SHOW_DELAY);
    expect(shown()).toHaveTextContent('Premier');
  });

  it('shows one tooltip at a time: the element the pointer enters takes it, even inside another', () => {
    const outer = make('<div><button>dedans</button></div>', 'Le groupe');
    const inner = tip(outer.node.querySelector('button')!, 'Le bouton');
    fireEvent.mouseEnter(outer.node);
    fireEvent.mouseEnter(outer.node.querySelector('button')!);
    vi.advanceTimersByTime(SHOW_DELAY);
    expect(document.querySelectorAll('[role="tooltip"]')).toHaveLength(1);
    expect(shown()).toHaveTextContent('Le bouton');
    inner.destroy();
  });

  it('leaves the tooltip to the innermost element the pointer is on, whatever the order the entries come in', () => {
    const outer = make('<div><button>dedans</button></div>', 'Le groupe');
    const button = outer.node.querySelector('button')!;
    const inner = tip(button, 'Le bouton');
    fireEvent.mouseEnter(button);
    fireEvent.mouseEnter(outer.node);
    vi.advanceTimersByTime(SHOW_DELAY);
    expect(shown()).toHaveTextContent('Le bouton');
    // Up already: the element around it does not take it either.
    fireEvent.mouseLeave(outer.node);
    fireEvent.mouseLeave(button);
    fireEvent.mouseEnter(button);
    fireEvent.mouseEnter(outer.node);
    expect(shown()).toHaveTextContent('Le bouton');
    inner.destroy();
  });

  it('shows at once to the keyboard, and goes when the focus leaves', () => {
    const { node } = make('<button>⚙</button>', 'Réglages (Ctrl+,)');
    tabTo(node);
    expect(shown()).toHaveTextContent('Réglages (Ctrl+,)');
    node.blur();
    expect(shown()).toBeNull();
  });

  it('shows nothing for the focus a click gives', () => {
    const { node } = make('<button>⚙</button>', 'Réglages');
    fireEvent.mouseDown(node);
    node.focus();
    expect(shown()).toBeNull();
    // The next focus from the keyboard shows it again.
    node.blur();
    tabTo(node);
    expect(shown()).toHaveTextContent('Réglages');
  });

  it('shows nothing for a focus the code gives, as a dialog closed with Escape gives it back to its button', () => {
    const { node } = make('<button>⚙</button>', 'Réglages (Ctrl+,)');
    fireEvent.keyDown(document.body, { key: 'Escape' });
    node.focus();
    expect(shown()).toBeNull();
    node.blur();
    tabTo(node);
    expect(shown()).toHaveTextContent('Réglages (Ctrl+,)');
  });

  it('leaves the focus of the keyboard to the innermost element: a button of a row says its own', () => {
    const row = make('<div><button>■</button></div>', 'npm run dev');
    const button = row.node.querySelector('button')!;
    const inner = tip(button, 'Arrêter');
    tabTo(button);
    expect(shown()).toHaveTextContent('Arrêter');
    inner.destroy();
  });

  it('leaves the tooltip to the element around when the one inside has nothing to say, a cut text that is not cut', () => {
    for (const order of ['inner first', 'outer first']) {
      const outer = make('<div><span>Pro</span></div>', 'Les deux quotas');
      const name = outer.node.querySelector('span')!;
      const inner = tip(name, { text: 'Pro', cut: true });
      const entries = order === 'inner first' ? [name, outer.node] : [outer.node, name];
      for (const el of entries) fireEvent.mouseEnter(el);
      vi.advanceTimersByTime(SHOW_DELAY);
      expect(shown(), order).toHaveTextContent('Les deux quotas');
      fireEvent.mouseLeave(name);
      fireEvent.mouseLeave(outer.node);
      vi.advanceTimersByTime(WARM_FOR);
      inner.destroy();
    }
  });

  it('shows the tooltip of the element around when the pointer goes back to it from one inside', () => {
    const outer = make('<div><button>dedans</button></div>', 'Le groupe');
    const button = outer.node.querySelector('button')!;
    const inner = tip(button, 'Le bouton');
    fireEvent.mouseEnter(outer.node);
    fireEvent.mouseEnter(button);
    vi.advanceTimersByTime(SHOW_DELAY);
    expect(shown()).toHaveTextContent('Le bouton');
    fireEvent.mouseLeave(button, { relatedTarget: outer.node });
    expect(shown()).toHaveTextContent('Le groupe');
    inner.destroy();
  });

  it('stays while the pointer or the focus is on the element', () => {
    const { node } = make('<button>⚙</button>', 'Réglages');
    tabTo(node);
    fireEvent.mouseEnter(node);
    fireEvent.mouseLeave(node);
    expect(shown()).toHaveTextContent('Réglages');
    // The focus on what the element holds is still on it.
    const { node: group } = make('<div><span tabindex="0">barre</span></div>', 'Groupe');
    const bar = group.querySelector('span')!;
    tabTo(bar);
    expect(shown()).toHaveTextContent('Groupe');
  });

  it('goes with Escape, which the element still gets but not the window, when the focus is on it, and comes back with the next focus', () => {
    const { node, host } = make('<button>⚙</button>', 'Réglages');
    // The element's own keys, as Svelte hands them: from a listener at the root of the app.
    const own = vi.fn();
    host.addEventListener('keydown', own);
    const further = vi.fn();
    const onWindow = (e: KeyboardEvent) => e.key === 'Escape' && further();
    window.addEventListener('keydown', onWindow);
    tabTo(node);
    fireEvent.keyDown(node, { key: 'Escape' });
    expect(shown()).toBeNull();
    expect(own).toHaveBeenCalledTimes(1);
    expect(further).not.toHaveBeenCalled();
    expect(node).toHaveFocus();
    // Escape again is the page's (a dialog to close…).
    fireEvent.keyDown(node, { key: 'Escape' });
    expect(further).toHaveBeenCalledTimes(1);
    node.blur();
    tabTo(node);
    expect(shown()).toHaveTextContent('Réglages');
    window.removeEventListener('keydown', onWindow);
  });

  it('goes with Escape pressed anywhere while the pointer shows it, the key doing its work', () => {
    const { node } = make('<button>⚙</button>', 'Réglages');
    const further = vi.fn();
    document.addEventListener('keydown', further);
    fireEvent.mouseEnter(node);
    vi.advanceTimersByTime(SHOW_DELAY);
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(shown()).toBeNull();
    expect(further).toHaveBeenCalledTimes(1);
    // Not back while the pointer stays.
    vi.advanceTimersByTime(SHOW_DELAY * 2);
    expect(shown()).toBeNull();
    document.removeEventListener('keydown', further);
  });

  it('goes on a click and stays away until the pointer comes back', () => {
    const { node } = make('<button>Lancer</button>', 'Lancer le ticket');
    fireEvent.mouseEnter(node);
    vi.advanceTimersByTime(SHOW_DELAY);
    fireEvent.mouseDown(node);
    fireEvent.click(node);
    expect(shown()).toBeNull();
    vi.advanceTimersByTime(SHOW_DELAY * 2);
    expect(shown()).toBeNull();
    fireEvent.mouseLeave(node);
    vi.advanceTimersByTime(WARM_FOR);
    fireEvent.mouseEnter(node);
    vi.advanceTimersByTime(SHOW_DELAY);
    expect(shown()).toHaveTextContent('Lancer le ticket');
  });

  it('goes when the page scrolls or the window loses the focus', () => {
    const { node } = make('<button>Lancer</button>', 'Lancer le ticket');
    fireEvent.mouseEnter(node);
    vi.advanceTimersByTime(SHOW_DELAY);
    fireEvent.scroll(document);
    expect(shown()).toBeNull();
    fireEvent.mouseLeave(node);
    fireEvent.mouseEnter(node);
    vi.advanceTimersByTime(SHOW_DELAY);
    expect(shown()).not.toBeNull();
    fireEvent.blur(window);
    expect(shown()).toBeNull();
  });

  it('stays while something else scrolls, as a conversation that follows the reply streaming in', () => {
    const { node, host } = make('<button>Interrompre</button>', 'Interrompre (Échap)');
    const conversation = document.createElement('div');
    document.body.append(conversation);
    fireEvent.mouseEnter(node);
    vi.advanceTimersByTime(SHOW_DELAY);
    fireEvent.scroll(conversation);
    expect(shown()).toHaveTextContent('Interrompre (Échap)');
    // What holds the element scrolls: it moves away from its tooltip.
    fireEvent.scroll(host);
    expect(shown()).toBeNull();
    conversation.remove();
  });

  it('does not show after Escape a tooltip that was waiting for the pointer to stay', () => {
    const { node } = make('<button>Lancer</button>', 'Lancer le ticket');
    fireEvent.mouseEnter(node);
    vi.advanceTimersByTime(SHOW_DELAY / 2);
    fireEvent.keyDown(document.body, { key: 'Escape' });
    vi.advanceTimersByTime(SHOW_DELAY);
    expect(shown()).toBeNull();
  });

  it('follows its text while it is shown, and goes when the text does', () => {
    const { node, action } = make('<button>Lancer</button>', 'Avant');
    tabTo(node);
    action.update('Après');
    expect(shown()).toHaveTextContent('Après');
    action.update(undefined);
    expect(shown()).toBeNull();
  });

  it('goes with its element', () => {
    const { node, action } = make('<button>Lancer</button>', 'Lancer le ticket');
    tabTo(node);
    action.destroy();
    expect(shown()).toBeNull();
  });

  it('keeps the lines of a text on several lines', () => {
    const { node } = make('<span>2 Claude</span>', 'Processus\nrefacto : 1 Go · 10 %');
    fireEvent.mouseEnter(node);
    vi.advanceTimersByTime(SHOW_DELAY);
    expect(shown()!.textContent).toBe('Processus\nrefacto : 1 Go · 10 %');
    expect(shown()).toHaveClass('tip-box');
  });

  it('shows the whole of a text cut short inside the element only when it is', () => {
    const { node } = make('<div><span>Bash</span><span>npm run test -- --watch</span></div>', {
      text: 'npm run test -- --watch',
      cut: true,
    });
    const arg = node.lastElementChild!;
    Object.defineProperty(arg, 'clientWidth', { configurable: true, value: 80 });
    Object.defineProperty(arg, 'scrollWidth', { configurable: true, value: 80 });
    fireEvent.mouseEnter(node);
    vi.advanceTimersByTime(SHOW_DELAY);
    expect(shown()).toBeNull();
    fireEvent.mouseLeave(node);
    Object.defineProperty(arg, 'scrollWidth', { configurable: true, value: 160 });
    vi.advanceTimersByTime(WARM_FOR);
    fireEvent.mouseEnter(node);
    vi.advanceTimersByTime(SHOW_DELAY);
    expect(shown()).toHaveTextContent('npm run test -- --watch');
  });

  it('takes a pixel more than the box, as a line of a monospace font rounds up, for a text not cut', () => {
    const { node } = make('<span>0 tok 0,00 $</span>', { text: '0 tok 0,00 $', cut: true });
    Object.defineProperty(node, 'clientHeight', { configurable: true, value: 16 });
    Object.defineProperty(node, 'scrollHeight', { configurable: true, value: 17 });
    fireEvent.mouseEnter(node);
    vi.advanceTimersByTime(SHOW_DELAY);
    expect(shown()).toBeNull();
  });

  it('shows a cut text only when it is cut', () => {
    const { node } = make('<span>refacto-de-l-authentification</span>', { text: 'refacto-de-l-authentification', cut: true });
    Object.defineProperty(node, 'clientWidth', { configurable: true, value: 100 });
    Object.defineProperty(node, 'scrollWidth', { configurable: true, value: 100 });
    fireEvent.mouseEnter(node);
    vi.advanceTimersByTime(SHOW_DELAY);
    expect(shown()).toBeNull();
    fireEvent.mouseLeave(node);
    Object.defineProperty(node, 'scrollWidth', { configurable: true, value: 180 });
    vi.advanceTimersByTime(WARM_FOR);
    fireEvent.mouseEnter(node);
    vi.advanceTimersByTime(SHOW_DELAY);
    expect(shown()).toHaveTextContent('refacto-de-l-authentification');
  });

  describe('for a screen reader', () => {
    it('describes a control that has a name of its own by its tooltip while it is up, which the focus of the keyboard puts up', () => {
      const { node } = make('<button>Lancer</button>', 'Lancer le ticket (Ctrl+Entrée)');
      expect(node).toHaveAccessibleName('Lancer');
      expect(node).not.toHaveAttribute('aria-describedby');
      tabTo(node);
      expect(node).toHaveAccessibleDescription('Lancer le ticket (Ctrl+Entrée)');
      node.blur();
      expect(node).not.toHaveAttribute('aria-describedby');
      // Nowhere a hidden copy of the text, that a search of the page's texts would meet twice.
      expect(document.body).not.toHaveTextContent('Lancer le ticket');
    });

    it('describes an element out of the tab order by an attribute, with no hidden text a search of the page would meet twice', () => {
      const { node, action } = make('<span>Δ 3</span>', 'Changements git non commités');
      expect(node).toHaveAttribute('aria-description', 'Changements git non commités');
      expect(node).not.toHaveAttribute('aria-describedby');
      expect(node).not.toHaveAttribute('aria-label');
      action.update({ text: 'Changements git non commités', aria: false });
      expect(node).not.toHaveAttribute('aria-description');
    });

    it('names a button of a symbol with its text, which the symbol does not say', () => {
      const { node, action } = make('<button>⚙</button>', 'Réglages (Ctrl+,)');
      expect(node).toHaveAccessibleName('Réglages (Ctrl+,)');
      action.update('Paramètres');
      expect(node).toHaveAccessibleName('Paramètres');
      action.update(null);
      expect(node).not.toHaveAttribute('aria-label');
    });

    it('describes an element named by its own label when the text says more, and adds nothing when it says the same', () => {
      const a = make('<button aria-label="Interrompre">■</button>', 'Interrompre (Échap)');
      expect(a.node).toHaveAccessibleName('Interrompre');
      tabTo(a.node);
      expect(a.node).toHaveAccessibleDescription('Interrompre (Échap)');
      const b = make('<button aria-label="Fermer">×</button>', 'Fermer');
      tabTo(b.node);
      expect(b.node).toHaveAccessibleName('Fermer');
      expect(b.node).not.toHaveAttribute('aria-describedby');
    });

    it('adds nothing to a cut text, already read whole, nor where the element says it itself', () => {
      const a = make('<span tabindex="0">refacto</span>', { text: 'refacto', cut: true });
      Object.defineProperty(a.node, 'scrollWidth', { configurable: true, value: 180 });
      tabTo(a.node);
      expect(a.node).not.toHaveAttribute('aria-describedby');
      expect(a.node).not.toHaveAttribute('aria-description');
      const b = make('<span role="meter" tabindex="0" aria-label="Quota" aria-valuetext="42 %">x</span>', { text: '42 %', aria: false });
      tabTo(b.node);
      expect(shown()).toHaveTextContent('42 %');
      expect(b.node).not.toHaveAttribute('aria-describedby');
      expect(b.node).toHaveAccessibleName('Quota');
    });

    it('keeps the description the element has, and takes only its own back', () => {
      const other = document.createElement('span');
      other.id = 'mine';
      other.textContent = 'Déjà là';
      document.body.append(other);
      const { node } = make('<button aria-describedby="mine">Lancer</button>', 'En plus');
      tabTo(node);
      expect(node).toHaveAccessibleDescription('Déjà là En plus');
      node.blur();
      expect(node).toHaveAttribute('aria-describedby', 'mine');
      other.remove();
    });
  });
});

describe('place', () => {
  const view = { width: 1000, height: 700 };
  const rect = (left: number, top: number, width: number, height: number) => ({
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
  });

  it('puts the tooltip above the element, centered on it', () => {
    expect(place(rect(400, 600, 100, 20), { width: 60, height: 24 }, view)).toEqual({ left: 420, top: 570 });
  });

  it('puts it below when there is no room above', () => {
    expect(place(rect(400, 4, 100, 20), { width: 60, height: 24 }, view)).toEqual({ left: 420, top: 30 });
  });

  it('keeps it in the window on both sides', () => {
    expect(place(rect(0, 600, 20, 20), { width: 200, height: 24 }, view).left).toBe(8);
    expect(place(rect(980, 600, 20, 20), { width: 200, height: 24 }, view).left).toBe(792);
  });
});
