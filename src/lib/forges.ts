// The code hosts as the window marks them: a badge per kind, a neutral one for a kind it does not
// know (a later version's, or a host no account says yet).

const BADGES: Record<string, { letter: string; color: string; ink: string }> = {
  github: { letter: 'GH', color: '#e8e3dc', ink: '#1b1917' },
  gitlab: { letter: 'GL', color: 'oklch(0.68 0.17 45)', ink: '#fff' },
  bitbucket: { letter: 'BB', color: 'oklch(0.58 0.15 255)', ink: '#fff' },
  gitea: { letter: 'GT', color: 'oklch(0.62 0.14 150)', ink: '#fff' },
};

const UNKNOWN = { letter: '?', color: 'var(--line)', ink: 'var(--muted)' };

export const forgeBadge = (kind: string | null) => (kind && BADGES[kind]) || UNKNOWN;
