<script lang="ts">
  import { onDestroy, untrack } from 'svelte';
  import { accountName, backToAccounts, engineOfAccount, isPrincipal, principalId, SHARED_FILES } from '../../lib/accounts';
  import { tildify } from '../../lib/format';
  import { byKey as goesByKey, engineName, offered } from '../../lib/engines';
  import { t, type Key } from '../../lib/i18n';
  import { api } from '../../lib/ipc';
  import { IS_MAC } from '../../lib/platform';
  import { app } from '../../lib/state.svelte';
  import { disposeTerminal, mountTerminal, openAccountLogin } from '../../lib/terminals';
  import type { SettingsTab } from '../../lib/settings.svelte';
  import type { Account, EngineId, MachineAccount, ShareMode } from '../../lib/types';
  import Icon from '../Icon.svelte';
  import Modal from './Modal.svelte';

  // « Ajouter un compte… » (ESC-128): for a harness (`engine`, else the one picked here), the machine's account (its
  // Principal: its usual folder, as it is), offered when its harness is signed in there and it is not added yet; or a new
  // account, made with what it shares of the machine's folder, then signed in. « Se connecter… » (`accountId`): straight
  // to the sign-in.
  // The sign-in runs the account's own program in a terminal here (`claude`, `codex login`, `copilot login`); Escouade looks for it
  // every 2 s, then closes the terminal and reads the account's quota. Closed before, the account stays, not signed in.
  // `onclose`: opened over another modal (the assistant « Nouveau projet »), back to it rather than to Réglages › Comptes.
  // Cursor CLI (ESC-43): its machine's account is the sign-in of `agent login`; a new one is its API key, kept in the system's
  // keychain and given to its processes by CURSOR_API_KEY: no terminal, « Changer la clé… » gives it again.
  // `reserveFor` (a private project's settings, ESC-141): the account added is reserved to that project alone, a new one
  // offered first (the machine's is its folder outside Escouade too), and it closes back to that project's settings.
  let {
    accountId,
    back,
    engine: asked,
    reserveFor,
    onclose,
  }: { accountId?: string; back?: SettingsTab; engine?: EngineId; reserveFor?: string; onclose?: () => void } = $props();
  /** The project the account is added for, while it is open still. */
  const reservedTo = $derived(reserveFor ? app.projects.find((p) => p.id === reserveFor) : undefined);

  /** What the modal says of the folders of a harness's accounts: Claude Code's unless the harness has its own. */
  const SAYS: Partial<Record<EngineId, { nothing: Key; never: Key; hint: Key }>> = {
    codex: {
      nothing: 'accounts.modal.codex.nothingToShare',
      never: 'accounts.modal.codex.neverShared',
      hint: 'accounts.modal.codex.signInHint',
    },
    copilot: {
      nothing: 'accounts.modal.copilot.nothingToShare',
      never: 'accounts.modal.copilot.neverShared',
      hint: 'accounts.modal.copilot.signInHint',
    },
    cursor: {
      nothing: 'accounts.modal.cursor.nothingToShare',
      never: 'accounts.modal.cursor.neverShared',
      hint: 'accounts.modal.cursor.signInHint',
    },
  };
  const CLAUDE_SAYS = {
    nothing: 'accounts.modal.nothingToShare',
    never: 'accounts.modal.neverShared',
    hint: 'accounts.modal.signInHint',
  } as const;

  /** How often the sign-in is looked for. */
  const POLL_MS = 2000;
  /** How long the sign-in the account had is left alone before it is read once more, when the first look failed. */
  const RETRY_MS = 300;
  /** How long « Connecté » is seen above its terminal before the terminal goes. */
  const SEEN_MS = 1500;

  /** The account signing in; none while it is still to make. */
  let account = $state<Account | null>(untrack(() => app.settings.accounts.find((a) => a.id === accountId) ?? null));
  /** The harness of the account: the one asked for, else the first offered (Claude Code's when it is found). */
  let engine = $state<EngineId>(untrack(() => (account ? engineOfAccount(account) : (asked ?? offered()[0]?.id ?? 'claude'))));
  /** The harnesses an account may be added to: those found, a menu from two on. */
  const engines = $derived(offered());
  const says = $derived(SAYS[engine] ?? CLAUDE_SAYS);
  let name = $state('');
  /** The API key of a new Cursor account, or the one given again (ESC-43). */
  let key = $state('');
  /** An account of Cursor other than its machine's: signed in by its key, given here. */
  const byKey = $derived(goesByKey(engine) && (!account || !isPrincipal(account)));

  /** The machine's account of the harness picked; null until read. */
  let machine = $state<MachineAccount | null>(null);
  /** What is added: the machine's account (when it is offered) or a new one. */
  let kind = $state<'machine' | 'new'>('new');
  /** The machine's account may be added: signed in there, not added yet. */
  const offersMachine = $derived(!!machine && machine.connected && !machine.added);
  /** What Principal has to share; null until known. */
  let shareable = $state<string[] | null>(null);
  let checked = $state<Record<string, boolean>>({});
  let mode = $state<ShareMode>('link');
  let busy = $state(false);
  let error = $state<string | null>(null);
  /** The sign-in's terminal, while it runs. */
  let termId = $state<string | null>(null);
  let box = $state<HTMLDivElement>();
  /** Signed in: with which email. */
  let signedIn = $state<{ email: string | null } | null>(null);
  let poll: ReturnType<typeof setInterval> | undefined;
  let seen: ReturnType<typeof setTimeout> | undefined;
  /** Signed in without its email yet: looked at once more for it. */
  let waitedForEmail = false;
  let closed = false;
  /**
   * Which sign-in the account had before its terminal opened (its status' stamp), none when it had none or could not be
   * read. A sign-in out of date is « connected » too: the user is signed in just now only once it is another one.
   * Undefined until read, once for the window (a terminal started again keeps it).
   */
  let before: string | null | undefined;
  /** A look at the sign-in is under way: the next tick waits for it. */
  let looking = false;

  /** The machine's account of the harness, once added: what a new account shares is said by its name, else as « le compte de la machine ». */
  const machineAdded = $derived(app.settings.accounts.find((a) => a.id === principalId(engine)));
  const principal = $derived(machineAdded ? accountName(machineAdded) : t('accounts.modal.machineName'));
  const shareLegend = $derived(machineAdded ? t('accounts.modal.share', { name: principal }) : t('accounts.modal.shareMachine'));
  const files = $derived((shareable ?? []).filter((n) => SHARED_FILES.includes(n)));
  const folders = $derived((shareable ?? []).filter((n) => !SHARED_FILES.includes(n)));
  const exited = $derived(termId !== null && app.exitedTerms[termId] !== undefined);
  /**
   * Why its program stopped before the sign-in, when the backend knows it (ESC-133): not found, or for Claude Code its
   * installation cut half-way, each with what to do. Null: only that it stopped is said.
   */
  let endedWhy = $state<string | null>(null);
  $effect(() => {
    if (!exited || signedIn || !account) return;
    const id = account.id;
    let stale = false;
    api
      .accountSignInEnded(id)
      .then((why) => {
        if (!stale) endedWhy = why ?? null;
      })
      .catch(() => {});
    return () => {
      stale = true;
      endedWhy = null;
    };
  });
  /** What is said of the machine's account: signed in (as whom), added already, or not signed in there. */
  function machineSays(m: MachineAccount | null): string {
    const harness = engineName(engine);
    if (!m) return t('accounts.modal.machineChecking');
    if (m.added) return t('accounts.modal.machineAdded');
    if (!m.connected) return t('accounts.modal.machineNotConnected', { harness });
    if (m.email) return t('accounts.modal.machineConnected', { harness, email: m.email });
    return t(m.signsIn ? 'accounts.modal.machineConnectedNoEmail' : 'accounts.modal.machineFound', { harness });
  }

  const title = $derived(
    account && byKey
      ? t('accounts.modal.cursor.keyTitle', { name: accountName(account) })
      : account
        ? t('accounts.modal.signInTitle', { name: accountName(account) })
        : t('accounts.modal.addTitle', { harness: engineName(engine) }),
  );

  untrack(() => {
    if (account && byKey) return;
    if (account) return void start();
    loadShareable();
    loadMachine();
  });

  /** What the machine's account of the harness picked is: offered first when it may be added. */
  function loadMachine() {
    const of = engine;
    machine = null;
    kind = 'new';
    api
      .accountMachine(of)
      .then((m) => {
        if (of !== engine) return;
        machine = m;
        kind = m.connected && !m.added && !reserveFor ? 'machine' : 'new';
      })
      .catch(() => (machine = null));
  }

  /** The harness picked changed: what it has to share, and its machine's account. */
  function pickEngine(id: EngineId) {
    if (id === engine) return;
    engine = id;
    loadShareable();
    loadMachine();
  }

  /** « Ajouter ce compte »: the machine's account added as it is, signed in already: back to the accounts. */
  async function addMachine() {
    if (busy) return;
    busy = true;
    error = null;
    try {
      const made = await reserved(await api.accountAddMachine(engine));
      if (!app.settings.accounts.some((a) => a.id === made.id)) app.settings.accounts = [...app.settings.accounts, made];
      void app.run(api.refreshUsage());
      close();
    } catch (e) {
      error = String(e);
    } finally {
      busy = false;
    }
  }

  /** What the Principal of the harness picked has to share, all ticked. */
  function loadShareable() {
    const of = engine;
    shareable = null;
    api
      .accountShareable(of)
      .then((list) => {
        if (of !== engine) return;
        shareable = list;
        checked = Object.fromEntries(list.map((n) => [n, true]));
      })
      .catch(() => (shareable = []));
  }

  // The terminal shown in the window while it runs.
  $effect(() => {
    const id = termId;
    const el = box;
    if (!id || !el) return;
    mountTerminal(id, el);
    return () => mountTerminal(id, null);
  });

  /** The account made, reserved to `reserveFor` alone when it is asked for (the backend then gives every account). */
  async function reserved(made: Account): Promise<Account> {
    if (!reserveFor) return made;
    const list = await api.accountUpdate({ ...made, projects: [reserveFor] });
    app.settings.accounts = list;
    return list.find((a) => a.id === made.id) ?? made;
  }

  async function create() {
    if (!name.trim() || busy || (byKey && !key.trim())) return;
    busy = true;
    error = null;
    try {
      const share = byKey ? [] : (shareable ?? []).filter((n) => checked[n]);
      const made = await reserved(await api.accountCreate(name.trim(), share, mode, engine));
      // The backend tells them all (`accounts`): this one at once.
      if (!app.settings.accounts.some((a) => a.id === made.id)) app.settings.accounts = [...app.settings.accounts, made];
      account = made;
      // A key refused leaves the account made, its key to give again here.
      if (byKey) return void (await giveKey());
      await start();
    } catch (e) {
      error = String(e);
    } finally {
      busy = false;
    }
  }

  /** « Enregistrer la clé »: the key kept in the keychain, then back to the accounts, which say it by its end. */
  async function giveKey() {
    if (!account || !key.trim()) return;
    error = null;
    try {
      await api.accountCursorKey(account.id, key.trim());
      key = '';
      close();
    } catch (e) {
      error = String(e);
    }
  }

  async function saveKey() {
    if (busy) return;
    busy = true;
    try {
      await giveKey();
    } finally {
      busy = false;
    }
  }

  /** The account's `claude` in a terminal, the sign-in looked for. */
  async function start() {
    if (!account || closed) return;
    error = null;
    try {
      if (before === undefined) {
        // A look that fails (the keychain busy, a file being written) is no account without a sign-in: asked once more
        // before it is taken for one, since a baseline of none would count the sign-in the account has, out of date, as
        // the user's own a moment later.
        const id = account.id;
        const look = () => api.accountStatus(id).then((s) => s.stamp);
        // After a moment: what made the first look fail (a keychain asking its user, a file being written) may be over.
        const again = async () => {
          await new Promise((resolve) => setTimeout(resolve, RETRY_MS));
          return closed ? null : look().catch(() => null);
        };
        before = await look().catch(again);
        if (closed) return;
      }
      const info = await openAccountLogin(account.id);
      if (closed) return disposeTerminal(info.id);
      termId = info.id;
      clearInterval(poll);
      poll = setInterval(check, POLL_MS);
    } catch (e) {
      error = String(e);
    }
  }

  async function check() {
    // The last look may be waiting still (the keychain asking its user): not another meanwhile.
    if (!account || signedIn || looking) return;
    looking = true;
    let s;
    try {
      s = await api.accountStatus(account.id);
    } catch {
      return;
    } finally {
      looking = false;
    }
    if (closed || signedIn || !s.connected || s.stamp === before) return;
    // Claude Code writes the email beside the sign-in: a moment more for it.
    if (!s.email && !waitedForEmail) {
      waitedForEmail = true;
      return;
    }
    signedIn = { email: s.email };
    clearInterval(poll);
    seen = setTimeout(finish, SEEN_MS);
  }

  function dropTerminal() {
    if (!termId) return;
    disposeTerminal(termId);
    // Killed here: its exit, which comes after, is nobody's to read.
    app.dropExit(termId);
    termId = null;
  }

  /** Signed in: the terminal goes, and the account's quota is read at once. */
  function finish() {
    seen = undefined;
    dropTerminal();
    void app.run(api.refreshUsage());
  }

  /** « Relancer »: its `claude` stopped before the sign-in. */
  async function restart() {
    dropTerminal();
    await start();
  }

  function stop() {
    if (closed) return;
    closed = true;
    clearInterval(poll);
    if (seen === undefined) return dropTerminal();
    // Signed in, closed before its terminal went: its quota is read all the same.
    clearTimeout(seen);
    finish();
  }

  function close() {
    stop();
    if (onclose) onclose();
    else if (reserveFor) app.modal = { kind: 'settings', tab: 'projects', projectId: reserveFor, resume: true };
    else backToAccounts(back);
  }

  onDestroy(stop);
</script>

{#snippet item(n: string)}
  <label class="w-chip pick"><input type="checkbox" name={n} bind:checked={checked[n]} /><span class="mono">{n}</span></label>
{/snippet}

{#snippet actions()}
  {#if account && byKey}
    <button class="btn" onclick={close}>{t('common.cancel')}</button>
    <button class="btn primary" disabled={busy || !key.trim()} onclick={saveKey}>{t('accounts.modal.cursor.saveKey')}</button>
  {:else if !account && kind === 'machine'}
    <button class="btn" onclick={close}>{t('common.cancel')}</button>
    <button class="btn primary" disabled={busy || !offersMachine} onclick={addMachine}>{t('accounts.modal.addMachine')}</button>
  {:else if !account}
    <button class="btn" onclick={close}>{t('common.cancel')}</button>
    <button class="btn primary" disabled={busy || !name.trim() || (byKey && !key.trim())} onclick={create}
      >{t(byKey ? 'accounts.modal.cursor.create' : 'accounts.modal.create')}</button
    >
  {:else}
    <button class="btn primary" onclick={close}>{t('accounts.modal.done')}</button>
  {/if}
{/snippet}

<!-- Signing in, only its × closes it: the account stays, not signed in. -->
{#snippet keyField()}
  <!-- The key, never shown again once kept: only its end, as its status says it. -->
  <div class="w-fld">
    <label class="lab" for="account-key">{t('accounts.modal.cursor.key')}</label>
    <input
      id="account-key"
      class="field name mono"
      type="password"
      autocomplete="off"
      spellcheck="false"
      placeholder={t('accounts.modal.cursor.keyPlaceholder')}
      bind:value={key}
      onkeydown={(e) => e.key === 'Enter' && (account ? saveKey() : create())}
    />
    <span class="help">{t('accounts.modal.cursor.keyHint')}</span>
  </div>
{/snippet}

<Modal {title} width={760} onclose={close} footer={!account || signedIn || byKey ? actions : undefined}>
  {#if reservedTo}<p class="w-notice" role="note">
      <Icon name="lock" /><span>{t('accounts.modal.reservedTo', { name: reservedTo.name })}</span>
    </p>{/if}
  {#if !account}
    {#if engines.length > 1 || kind === 'new'}
      <div class="top" class:alone={engines.length < 2 || kind !== 'new'}>
        {#if engines.length > 1}
          <div class="w-fld">
            <span class="lab" id="account-harness">{t('accounts.modal.harness')}</span>
            <div class="segmented harness" role="radiogroup" aria-labelledby="account-harness">
              {#each engines as e (e.id)}
                <button role="radio" aria-checked={engine === e.id} class:on={engine === e.id} onclick={() => pickEngine(e.id)}
                  >{e.name}</button
                >
              {/each}
            </div>
          </div>
        {/if}
        {#if kind === 'new'}
          <div class="w-fld">
            <label class="lab" for="account-name">{t('accounts.modal.name')}</label>
            <!-- svelte-ignore a11y_autofocus -->
            <input
              id="account-name"
              class="field name"
              spellcheck="false"
              autofocus
              placeholder={t('accounts.modal.namePlaceholder')}
              bind:value={name}
              onkeydown={(e) => e.key === 'Enter' && create()}
            />
          </div>
        {/if}
      </div>
    {/if}
    <!-- The machine's account or a new one (ESC-128). -->
    <div class="w-fld">
      <span class="lab" id="account-kind">{t('accounts.modal.kind')}</span>
      <div class="w-radios" role="radiogroup" aria-labelledby="account-kind">
        <button class="w-radio" role="radio" aria-checked={kind === 'machine'} disabled={!offersMachine} onclick={() => (kind = 'machine')}>
          <i class="dot"></i>
          <span><b>{t('accounts.modal.machine')}</b><span class="d">{machineSays(machine)}</span></span>
        </button>
        <button class="w-radio" role="radio" aria-checked={kind === 'new'} onclick={() => (kind = 'new')}>
          <i class="dot"></i>
          <span
            ><b>{t('accounts.modal.newAccount')}</b><span class="d"
              >{t(byKey ? 'accounts.modal.newHintKey' : 'accounts.modal.newHint')}</span
            ></span
          >
        </button>
      </div>
      {#if kind === 'machine' && machine?.dir}<span class="help">{t('accounts.modal.machineHint', { path: tildify(machine.dir) })}</span
        >{/if}
    </div>
    {#if kind === 'new' && byKey}
      {@render keyField()}
    {:else if kind === 'new'}
      {#if shareable?.length}
        <fieldset class="w-fld share">
          <legend class="lab">{shareLegend}</legend>
          {#if files.length}
            <div class="line">
              <span class="k">{t('accounts.modal.files')}</span>
              {#each files as n (n)}{@render item(n)}{/each}
              {#if !IS_MAC && mode === 'link'}<span class="help">{t('accounts.modal.filesCopied')}</span>{/if}
            </div>
          {/if}
          {#if folders.length}
            <div class="line">
              <span class="k">{t('accounts.modal.folders')}</span>
              {#each folders as n (n)}{@render item(n)}{/each}
            </div>
          {/if}
          <div class="line" role="radiogroup" aria-label={t('accounts.modal.mode')}>
            <span class="k">{t('accounts.modal.mode')}</span>
            <label class="w-chip pick"
              ><input type="radio" name="share-mode" value="link" bind:group={mode} />{t('accounts.modal.link')}</label
            >
            <label class="w-chip pick"
              ><input type="radio" name="share-mode" value="copy" bind:group={mode} />{t('accounts.modal.copy')}</label
            >
          </div>
          <span class="help">{t(says.never)}</span>
        </fieldset>
      {:else}
        {#if shareable}<span class="help">{t(says.nothing, { name: principal })}</span>{/if}
        <span class="help">{t(says.never)}</span>
      {/if}
    {/if}
  {:else if byKey}
    {@render keyField()}
  {:else}
    <div class="w-fld">
      <span class="lab">{t('accounts.modal.signIn')}</span>
      {#if termId}<div class="term" bind:this={box}></div>{/if}
      <p class="said" class:ok={signedIn} role="status">
        {#if signedIn}
          <Icon name="check-c" size={14} />{signedIn.email
            ? t('accounts.modal.connected', { email: signedIn.email })
            : t('accounts.modal.connectedNoEmail')}
        {:else if !(exited && !signedIn)}
          <span class="spin" aria-hidden="true"></span>{t(says.hint)}
        {:else}
          {t(says.hint)}
        {/if}
      </p>
    </div>
    {#if exited && !signedIn}
      <div class="ended">
        <span class:bad={!!endedWhy}>{endedWhy ?? t('accounts.modal.ended', { harness: engineName(engine) })}</span>
        <button class="btn" onclick={restart}><Icon name="restart" size={14} />{t('accounts.modal.restart')}</button>
      </div>
    {/if}
  {/if}
  {#if error}<p class="error" role="alert">{error}</p>{/if}
</Modal>

<style>
  .top {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: end;
    gap: 12px;
  }
  .top.alone {
    grid-template-columns: minmax(0, 1fr);
  }
  .harness {
    justify-self: start;
  }
  .name {
    height: 34px;
    font-size: 13px;
  }
  .w-radios {
    margin-top: 4px;
  }
  .share {
    margin: 0;
    padding: 0;
    border: none;
    gap: 8px;
  }
  .share legend {
    float: left;
    width: 100%;
    margin-bottom: 8px;
    padding: 0;
  }
  .line {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
  }
  .k {
    min-width: 64px;
    color: var(--dim);
    font-size: 12px;
  }
  /* A chip that holds its box: the box unseen over the whole chip, the chip lit when it is ticked. */
  .pick {
    position: relative;
  }
  .pick input {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    margin: 0;
    opacity: 0;
    cursor: pointer;
  }
  .pick:has(input:checked) {
    background: rgba(var(--fg-rgb), 0.07);
    color: var(--text);
  }
  .pick:has(input:focus-visible) {
    outline: 2px solid var(--p-ink);
    outline-offset: 2px;
  }
  .help {
    color: var(--muted);
    font-size: 11.5px;
    line-height: 1.5;
  }
  /* The sign-in: its program in a terminal, in the well, and what is awaited under it. */
  .term {
    height: 300px;
    padding: 10px 6px 6px 12px;
    border-radius: 9px;
    background: var(--well);
    box-shadow: inset 0 0 0 1px var(--line);
    overflow: hidden;
  }
  .term :global(.xterm) {
    height: 100%;
  }
  .term :global(.xterm-viewport) {
    background: transparent !important;
  }
  .said {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0;
    color: var(--soft);
    font-size: 12.5px;
    line-height: 1.5;
  }
  .said.ok {
    color: var(--add);
    font-weight: 550;
  }
  .spin {
    width: 12px;
    height: 12px;
    flex: none;
    border-radius: 50%;
    border: 1.5px solid var(--line-3);
    border-top-color: var(--p-ink);
    animation: spin 0.9s linear infinite;
  }
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .spin {
      animation: none;
    }
  }
  .ended {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 12.5px;
  }
  .ended span {
    flex: 1;
  }
  .ended .bad {
    color: var(--del);
    user-select: text;
  }
  .error {
    margin: 0;
    font-size: 12px;
    color: var(--del);
  }
</style>
