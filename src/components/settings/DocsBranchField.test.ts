import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import DocsBranchHost from './DocsBranchField.host.test.svelte';

describe('« Branche des docs » (ESC-258)', () => {
  it('is the current branch (empty) or a fixed one named', async () => {
    const seen: string[] = [];
    render(DocsBranchHost, { value: '', onchange: (v: string) => seen.push(v) });
    expect(screen.getByRole('button', { name: 'La branche courante' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText(/Les docs suivent la branche de chaque dossier/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Une branche fixe' }));
    expect(seen.at(-1)).toBe('docs');
    const name = screen.getByRole('textbox', { name: 'Nom de la branche des docs' });
    await userEvent.clear(name);
    await userEvent.type(name, 'spec');
    expect(seen.at(-1)).toBe('spec');
    expect(screen.getByText('Les docs vivent sur spec, dans un worktree tenu par Escouade.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'La branche courante' }));
    expect(seen.at(-1)).toBe('');
  });

  it('opens on the fixed branch the project has', () => {
    render(DocsBranchHost, { value: 'docs', onchange: () => {} });
    expect(screen.getByRole('button', { name: 'Une branche fixe' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('textbox', { name: 'Nom de la branche des docs' })).toHaveValue('docs');
  });
});
