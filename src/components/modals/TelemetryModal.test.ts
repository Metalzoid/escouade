import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { tick } from 'svelte';
import { beforeEach, describe, expect, it } from 'vitest';
import { setLang } from '../../lib/i18n';
import { app } from '../../lib/state.svelte';
import { fakeBackend, resetApp, SETTINGS } from '../../test/ipc';
import TelemetryModal from './TelemetryModal.svelte';

describe('TelemetryModal', () => {
  beforeEach(() => {
    resetApp();
    app.settings = { ...SETTINGS, telemetry: null };
    app.modal = { kind: 'telemetry' };
  });

  it('says what would be sent, and what never is, before asking', () => {
    fakeBackend();
    render(TelemetryModal);
    expect(screen.getByRole('dialog', { name: 'Aider à améliorer Escouade ?' })).toBeInTheDocument();
    expect(screen.getByText(/quelles fonctionnalités servent/)).toBeInTheDocument();
    expect(screen.getByText(/Jamais tes projets, ton code, tes conversations/)).toBeInTheDocument();
    expect(screen.getByText(/hébergé en France/)).toBeInTheDocument();
    // Pseudonymous, not anonymous (the id persists): no promise of anonymity, and how long they are kept.
    expect(screen.getByText(/sans rien qui t’identifie/)).toBeInTheDocument();
    expect(screen.getByText(/gardées 25 mois/)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/anonym/i);
  });

  it('puts no answer forward: both buttons look the same', () => {
    fakeBackend();
    render(TelemetryModal);
    const yes = screen.getByRole('button', { name: 'Partager les statistiques' });
    const no = screen.getByRole('button', { name: 'Non merci' });
    expect(yes.className).toBe(no.className);
  });

  it('shares the statistics once the user says yes', async () => {
    const backend = fakeBackend({ telemetry_set: () => null });
    render(TelemetryModal);
    await userEvent.click(screen.getByRole('button', { name: 'Partager les statistiques' }));
    expect(backend.called('telemetry_set')[0].args).toEqual({ consent: true });
    expect(app.settings.telemetry).toBe(true);
    expect(app.modal).toBeNull();
  });

  it('sends nothing when the user says no, and keeps the answer', async () => {
    const backend = fakeBackend({ telemetry_set: () => null });
    render(TelemetryModal);
    await userEvent.click(screen.getByRole('button', { name: 'Non merci' }));
    expect(backend.called('telemetry_set')[0].args).toEqual({ consent: false });
    expect(app.settings.telemetry).toBe(false);
    expect(app.modal).toBeNull();
  });

  it('asks again at the next start when closed without an answer', async () => {
    const backend = fakeBackend({ telemetry_set: () => null });
    render(TelemetryModal);
    await userEvent.keyboard('{Escape}');
    expect(backend.called('telemetry_set')).toHaveLength(0);
    expect(app.settings.telemetry).toBeNull();
    expect(app.modal).toBeNull();
  });

  it('opens the privacy page of the site, in the language of the interface', async () => {
    const backend = fakeBackend({ 'plugin:opener|open_url': () => null });
    render(TelemetryModal);
    await userEvent.click(screen.getByRole('button', { name: 'Ce qui est envoyé, en détail' }));
    expect(backend.called('plugin:opener|open_url')[0].args.url).toBe('https://escouade.dev/privacy/');
    setLang('en');
    await tick();
    expect(screen.getByRole('button', { name: 'What is sent, in detail' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'What is sent, in detail' }));
    expect(backend.called('plugin:opener|open_url')[1].args.url).toBe('https://escouade.dev/en/privacy/');
  });

  it('stays open and says why when the answer cannot be saved', async () => {
    fakeBackend({
      telemetry_set: () => {
        throw new Error('disque plein');
      },
    });
    render(TelemetryModal);
    await userEvent.click(screen.getByRole('button', { name: 'Partager les statistiques' }));
    await expect.poll(() => app.toasts.at(-1)?.kind).toBe('error');
    expect(app.settings.telemetry).toBeNull();
    expect(app.modal).toEqual({ kind: 'telemetry' });
  });
});
