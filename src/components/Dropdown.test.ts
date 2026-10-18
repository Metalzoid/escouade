import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { setLang } from '../lib/i18n';
import Dropdown from './Dropdown.svelte';

const options = [
  { value: 'opus', label: 'Opus' },
  { value: 'sonnet', label: 'Sonnet' },
];
const props = (over: Record<string, unknown> = {}) => ({
  caption: 'Modèle',
  value: 'opus',
  options,
  open: false,
  onToggle: () => {},
  onPick: () => {},
  ...over,
});

describe('Dropdown', () => {
  it('names its trigger after its caption and its value, with the colon of French', () => {
    render(Dropdown, props());
    const trigger = screen.getByRole('button', { name: 'Modèle : Opus' });
    expect(trigger).toHaveAttribute('data-tip', 'Modèle : Opus');
  });

  it('keeps the title it is given', () => {
    render(Dropdown, props({ title: 'Changer de modèle' }));
    expect(screen.getByRole('button', { name: 'Modèle : Opus' })).toHaveAttribute('data-tip', 'Changer de modèle');
  });

  it('names its trigger with the colon of English, and offers its options', async () => {
    setLang('en');
    const onPick = vi.fn();
    render(Dropdown, props({ caption: 'Model', open: true, onPick }));
    expect(screen.getByRole('button', { name: 'Model: Opus' })).toHaveAttribute('data-tip', 'Model: Opus');
    expect(screen.getByRole('menu', { name: 'Model' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('menuitemradio', { name: 'Sonnet' }));
    expect(onPick).toHaveBeenCalledWith('sonnet');
  });

  it('can be read and not changed: no menu, no click, and its title says why', async () => {
    const onToggle = vi.fn();
    render(Dropdown, props({ readonly: true, title: 'Ne change plus', onToggle }));
    const trigger = screen.getByRole('button', { name: 'Modèle : Opus' });
    // Not disabled: it stays readable, and reachable with the keyboard for its title.
    expect(trigger).not.toBeDisabled();
    expect(trigger).toHaveAttribute('aria-disabled', 'true');
    expect(trigger).not.toHaveAttribute('aria-haspopup');
    expect(trigger).toHaveAttribute('data-tip', 'Ne change plus');
    await userEvent.click(trigger);
    expect(onToggle).not.toHaveBeenCalled();
  });
});

describe('Dropdown with a search and favorites (ESC-44)', () => {
  const many = [
    { value: 'ollama/qwen', label: 'Qwen3 Coder', detail: 'Ollama (local)', favorite: false },
    { value: 'ollama/gpt-oss', label: 'gpt-oss 20b', detail: 'Ollama (local)', favorite: true },
    { value: 'lmstudio/devstral', label: 'Devstral Small', detail: 'LM Studio (local)', favorite: false },
  ];

  it('filters its options by name, provider or id, and picks the first with Enter', async () => {
    setLang('fr');
    const onPick = vi.fn();
    render(Dropdown, props({ options: many, value: 'ollama/qwen', open: true, searchable: true, onPick }));
    const search = screen.getByRole('searchbox', { name: 'Rechercher' });
    await userEvent.type(search, 'studio');
    expect(screen.getAllByRole('menuitemradio').map((b) => b.textContent)).toEqual([expect.stringContaining('Devstral Small')]);
    await userEvent.clear(search);
    await userEvent.type(search, 'introuvable');
    expect(screen.queryAllByRole('menuitemradio')).toHaveLength(0);
    expect(screen.getByText('Aucun résultat')).toBeInTheDocument();
    await userEvent.clear(search);
    await userEvent.type(search, 'gpt{Enter}');
    expect(onPick).toHaveBeenCalledWith('ollama/gpt-oss');
  });

  it('marks an option as a favorite, or no longer, with its star', async () => {
    setLang('fr');
    const onFavorite = vi.fn();
    render(Dropdown, props({ options: many, value: 'ollama/qwen', open: true, searchable: true, onFavorite }));
    const on = screen.getByRole('button', { name: 'Retirer des favoris : gpt-oss 20b' });
    expect(on).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(on);
    expect(onFavorite).toHaveBeenLastCalledWith('ollama/gpt-oss', false);
    await userEvent.click(screen.getByRole('button', { name: 'Ajouter aux favoris : Qwen3 Coder' }));
    expect(onFavorite).toHaveBeenLastCalledWith('ollama/qwen', true);
  });

  it('has neither search nor stars unless asked', () => {
    render(Dropdown, props({ open: true }));
    expect(screen.queryByRole('searchbox')).toBeNull();
    expect(screen.queryByRole('button', { name: /favoris/ })).toBeNull();
  });
});
