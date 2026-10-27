// The Diagram view of a workflow (ESC-245), as the preview draws it and as « Copier en Mermaid » writes it. Loaded by
// index.html (a classic script: file:// refuses modules) and by mermaid.mjs, which renders the same workflows with
// Mermaid for the comparison. The data has the shape of the app's `Workflow` (src/lib/types.ts): steps in their order,
// transitions (forward, or `back` with their condition and `max`), entries (a door and the step it enters), an exit.
(function () {
  /** The four cases of the ticket: GSD, a workflow with choices, a loop of one prompt, « Tickets ». */
  const WF = {
    gsd: {
      name: 'GSD',
      steps: [
        { id: 'discuss', name: 'Discuter', cmd: '/gsd:discuss-phase' },
        { id: 'plan', name: 'Planifier', cmd: '/gsd:plan-phase' },
        { id: 'exec', name: 'Exécuter', cmd: '/gsd:execute-phase' },
        { id: 'verify', name: 'Vérifier', cmd: '/gsd:verify-work' },
      ],
      go: [
        ['discuss', 'plan'],
        ['plan', 'exec'],
        ['exec', 'verify'],
      ],
      back: [
        { from: 'plan', to: 'plan', cond: 'plan refusé par gsd-plan-checker', max: 3 },
        { from: 'verify', to: 'plan', cond: 'écarts' },
      ],
      entries: [
        { door: '/gsd:autonomous', to: 'discuss' },
        { door: '/gsd:next', to: 'discuss' },
        { door: '/gsd:quick', to: 'exec' },
      ],
      exit: { from: 'verify', cond: 'phase validée', label: 'Phase finie', again: 'phase suivante' },
    },
    ship: {
      name: 'Livraison',
      steps: [
        { id: 'build', name: 'Construire', cmd: '/build' },
        { id: 'test', name: 'Tester', cmd: 'npm test' },
        { id: 'fix', name: 'Corriger', cmd: '/fix' },
        { id: 'review', name: 'Relire', cmd: '/review' },
        { id: 'merge', name: 'Merger', cmd: '/ship' },
      ],
      go: [
        ['build', 'test'],
        ['test', 'fix', 'rouges'],
        ['test', 'review', 'verts'],
        ['review', 'merge', 'approuvée'],
      ],
      back: [
        { from: 'fix', to: 'test', cond: 'à retester', max: 3 },
        { from: 'review', to: 'build', cond: 'changements demandés' },
      ],
      entries: [
        { door: '/ship-feature', to: 'build' },
        { door: '/hotfix', to: 'fix' },
      ],
      exit: { from: 'merge', label: 'PR mergée' },
    },
    ralph: {
      name: 'Boucle PROMPT.md',
      steps: [
        { id: 'pick', name: 'Choisir', cmd: 'fix_plan.md' },
        { id: 'do', name: 'Faire', cmd: '' },
        { id: 'test', name: 'Tester', cmd: 'npm test' },
        { id: 'tick', name: 'Cocher et commiter', cmd: 'fix_plan.md' },
      ],
      go: [
        ['pick', 'do'],
        ['do', 'test'],
        ['test', 'tick', 'vert'],
      ],
      back: [{ from: 'test', to: 'do', cond: 'rouge' }],
      entries: [
        { door: 'PROMPT.md', to: 'pick' },
        { door: '/loop', to: 'pick' },
      ],
      exit: { from: 'tick', cond: 'plus de case vide, ou 18 tours', label: 'Sortie', again: 'tour suivant' },
    },
    tickets: {
      name: 'Tickets',
      steps: [
        { id: 'todo', name: 'À faire', cmd: 'pilote auto ou Lancer' },
        { id: 'doing', name: 'En cours', cmd: 'travail, puis critères' },
        { id: 'review', name: 'À tester', cmd: 'Tester le ticket' },
        { id: 'done', name: 'Terminé', cmd: 'merge, PR ou push' },
      ],
      go: [
        ['todo', 'doing'],
        ['doing', 'review', 'critères atteints'],
        ['review', 'done', 'Valider'],
      ],
      back: [
        { from: 'doing', to: 'doing', cond: 'critères non atteints', max: 5 },
        { from: 'review', to: 'doing', cond: 'Renvoyer' },
      ],
      entries: [],
      exit: null,
    },
  };

  // ---------- Mermaid ----------

  /**
   * A label of the repository as Mermaid reads it, inside double quotes: every character that could close the quotes,
   * open HTML or a Markdown string, or start an entity, is written as an entity code; a line break is a space.
   */
  function esc(s) {
    return String(s)
      .replace(/[\r\n\t]+/g, ' ')
      .replace(/#/g, '#35;')
      .replace(/"/g, '#quot;')
      .replace(/&/g, '#amp;')
      .replace(/</g, '#lt;')
      .replace(/>/g, '#gt;')
      .replace(/`/g, '#96;')
      .replace(/[\u0000-\u001f\u007f]/g, '')
      .trim();
  }

  /** The Mermaid code of a workflow, without its agents (they move; a doc or a PR keeps the workflow). */
  function toMermaid(w, { dir = 'TD' } = {}) {
    const id = (s) => `s${w.steps.findIndex((x) => x.id === s) + 1}`;
    const out = [`flowchart ${dir}`, `  %% ${esc(w.name)} : généré par Escouade`];
    w.entries.forEach((e, i) => out.push(`  in${i + 1}(["${esc(e.door)}"]) --> ${id(e.to)}`));
    for (const s of w.steps) out.push(`  ${id(s.id)}["${esc(s.name)}${s.cmd ? `<br>${esc(s.cmd)}` : ''}"]`);
    for (const [from, to, cond] of w.go) out.push(`  ${id(from)} -->${cond ? `|"${esc(cond)}"|` : ''} ${id(to)}`);
    for (const b of w.back) {
      const say = [b.cond, b.max ? `${b.max} tours max` : ''].filter(Boolean).join(' · ');
      out.push(`  ${id(b.from)} -.->${say ? `|"${esc(say)}"|` : ''} ${id(b.to)}`);
    }
    if (w.exit) {
      out.push(`  ${id(w.exit.from)} -->${w.exit.cond ? `|"${esc(w.exit.cond)}"|` : ''} out((("${esc(w.exit.label)}")))`);
      if (w.exit.again) out.push(`  out -.->|"${esc(w.exit.again)}"| ${id(w.steps[0].id)}`);
    }
    const n = w.go.length;
    const backs = w.back.map((_, i) => n + w.entries.length + i).join(',');
    out.push('  classDef door stroke-dasharray: 3 3');
    if (w.entries.length) out.push(`  class ${w.entries.map((_, i) => `in${i + 1}`).join(',')} door`);
    // The entries' links come first in Mermaid's count: in1 --> …, then the forward ones, then the ways back.
    if (backs) out.push(`  linkStyle ${backs} stroke-dasharray: 4 3`);
    return out.join('\n');
  }

  // ---------- The drawing of Escouade (a layered layout) ----------

  /** Ranks by the longest forward path; a rank's steps side by side in their order. */
  function layers(w) {
    const rank = Object.fromEntries(w.steps.map((s) => [s.id, 0]));
    for (let k = 0; k < w.steps.length; k++) for (const [a, b] of w.go) rank[b] = Math.max(rank[b], rank[a] + 1);
    const rows = [];
    for (const s of w.steps) (rows[rank[s.id]] ||= []).push(s);
    return { rank, rows };
  }

  let ctx;
  function measure(text, font) {
    ctx ||= document.createElement('canvas').getContext('2d');
    ctx.font = font;
    return ctx.measureText(text).width;
  }
  function fit(text, font, max) {
    if (measure(text, font) <= max) return text;
    let t = text;
    while (t.length > 1 && measure(t + '…', font) > max) t = t.slice(0, -1);
    return t.trimEnd() + '…';
  }
  const X = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const FONT = "'Inter Variable', Inter, system-ui, 'Segoe UI', sans-serif";
  const MONO = "'JetBrains Mono', ui-monospace, Consolas, monospace";

  /**
   * The SVG of a workflow. `dir` TD (the column of 340 px) or LR (enlarged). `state`: the open agent's progress
   * ({ done: [ids], on: id, next: id, took: ['verify>plan'] }), the agents on each step ({ id: [{ name, cur, wait }] }).
   */
  function draw(w, { dir = 'TD', width = 312, state = {}, agents = {}, names = false } = {}) {
    const lr = dir === 'LR';
    const { rank, rows } = layers(w);
    const at = Object.fromEntries(w.steps.map((s) => [s.id, s]));
    const done = new Set(state.done || []);
    const took = new Set(state.took || []);
    // The ways back to another step go by a gutter: the left one when the step leaving has a neighbour on its right.
    const backs = w.back.filter((b) => b.from !== b.to);
    const selfs = Object.fromEntries(w.back.filter((b) => b.from === b.to).map((b) => [b.from, b]));
    const side = (b) => {
      const row = rows[rank[b.from]];
      return row.length > 1 && row[row.length - 1].id !== b.from ? 'L' : 'R';
    };
    const lanesR = backs.filter((b) => side(b) === 'R').sort((a, b) => rank[a.from] - rank[a.to] - (rank[b.from] - rank[b.to]));
    const lanesL = backs.filter((b) => side(b) === 'L');
    const again = w.exit && w.exit.again;
    // Across, a lane holds the condition of its way back on it: wider.
    const LANE = lr ? 26 : 11;
    // Geometry, in « main » (the flow: y in TD, x in LR) and « cross » coordinates.
    const NODE_MAIN = lr ? 152 : 46; // a node's size along the flow
    const GAP = lr ? 52 : 34;
    // Across, the next round goes under the steps with the ways back, and the doors into a later step above them.
    const entryBand = lr && w.entries.some((e) => rank[e.to] > 0) ? 34 : 0;
    const againL = again && !lr ? 1 : 0;
    const againR = again && lr ? 1 : 0;
    const before = (lr ? 14 : 6) + (lanesL.length + againL) * LANE + (lanesL.length || againL ? 8 : 0) + entryBand;
    const after = (lr ? 14 : 6) + (lanesR.length + againR) * LANE + (lanesR.length || againR ? 8 : 0);
    // Across, a step is 56 px high, its agents by name under it, in its slot.
    const crossSize = lr ? 56 + (names ? 26 : 0) : width - before - after;
    const crossGap = lr ? 30 : 10;
    const cols = Math.max(...rows.map((r) => r.length));
    const crossTotal = lr ? cols * crossSize + (cols - 1) * crossGap : crossSize;
    const box = {};
    const midEntries = w.entries.filter((e) => rank[e.to] > 0);
    const topEntries = w.entries.filter((e) => rank[e.to] === 0);
    let main = lr ? 12 : 4;
    const doorsAt = main;
    if (topEntries.length) main += lr ? 0 : 22 + 22;
    if (lr && topEntries.length) main += Math.max(...topEntries.map((e) => measure(e.door, `500 11px ${MONO}`))) + 14 + 40;
    const entryMain = {};
    const entryOff = {};
    // Where an edge comes into a step: its middle, or clear of the door that comes in above it.
    const doorW = Object.fromEntries(midEntries.map((e) => [e.to, measure(e.door, `500 11px ${MONO}`) + 14]));
    const arrive = (id) => box[id].cross + (doorW[id] && !lr ? Math.max(box[id].crossSize / 2, doorW[id] + 30) : box[id].crossSize / 2);
    // Between two ranks, a gap: in the column, the condition of a way back takes the top of the gap, the choices the
    // bottom; a gap that holds both is taller. A way back says its condition in the gap the least taken on its way.
    const forkGap = new Set(w.go.filter(([f], _, all) => all.filter(([g]) => g === f).length > 1).map(([f]) => rank[f]));
    const retIn = {};
    const retGap = new Map();
    for (const b of backs) {
      const score = (x) => (retIn[x] || 0) * 2 + (forkGap.has(x) ? 1 : 0);
      let best = rank[b.to];
      for (let g = rank[b.to]; g < rank[b.from]; g++) if (score(g) < score(best)) best = g;
      retGap.set(b, best);
      retIn[best] = (retIn[best] || 0) + 1;
    }
    const gapOf = (g) => (lr ? GAP : retIn[g] && forkGap.has(g) ? 56 : retIn[g] ? 46 : forkGap.has(g) ? 40 : GAP);
    const splitAt = (g) => (lr ? GAP / 2 : retIn[g] ? 30 : gapOf(g) / 2);
    rows.forEach((row, r) => {
      const off = row.some((s) => midEntries.some((e) => e.to === s.id)) && !lr ? 26 : 0;
      main += off;
      for (const s of row) entryOff[s.id] = off;
      const slot = lr ? crossSize : (crossSize - crossGap * (row.length - 1)) / row.length;
      const each = lr ? 56 : slot;
      const span = slot * row.length + crossGap * (row.length - 1);
      const start = before + (lr ? (crossTotal - span) / 2 : 0);
      row.forEach((s, i) => {
        box[s.id] = { main, mainSize: NODE_MAIN, cross: start + i * (slot + crossGap), crossSize: each };
        entryMain[s.id] = main;
      });
      main += NODE_MAIN + gapOf(r);
    });
    main -= gapOf(rows.length - 1);
    let exitBox = null;
    if (w.exit) {
      // Across, the gap before the exit holds its condition.
      main += lr && w.exit.cond ? Math.max(GAP, measure(w.exit.cond, `500 10.5px ${FONT}`) + 36) : GAP;
      const label = w.exit.label;
      const len = measure(label, `600 12px ${FONT}`) + 44;
      const ex = box[w.exit.from];
      exitBox = lr
        ? { main, mainSize: len, cross: ex.cross + ex.crossSize / 2 - 15, crossSize: 30 }
        : { main, mainSize: 30, cross: before + crossSize / 2 - len / 2, crossSize: len };
      main += exitBox.mainSize;
    }
    main += lr ? 14 : 6;
    const W = lr ? main : width;
    const H = lr ? before + crossTotal + after : main;
    // From (main, cross) to (x, y), and a box to { x, y, w, h }.
    const P = (m, c) => (lr ? [m, c] : [c, m]);
    const R = (b) => (lr ? { x: b.main, y: b.cross, w: b.mainSize, h: b.crossSize } : { x: b.cross, y: b.main, w: b.crossSize, h: b.mainSize });
    const parts = { edges: [], back: [], nodes: [], chips: [] };
    const path = (pts, r = 6) => {
      // An orthogonal path with rounded corners.
      let d = `M${pts[0][0]} ${pts[0][1]}`;
      for (let i = 1; i < pts.length; i++) {
        const [x, y] = pts[i];
        const next = pts[i + 1];
        if (!next) {
          d += ` L${x} ${y}`;
          break;
        }
        const [px, py] = pts[i - 1];
        const k1 = Math.min(r, Math.hypot(x - px, y - py) / 2);
        const k2 = Math.min(r, Math.hypot(next[0] - x, next[1] - y) / 2);
        const ux = Math.sign(x - px), uy = Math.sign(y - py), vx = Math.sign(next[0] - x), vy = Math.sign(next[1] - y);
        d += ` L${x - ux * k1} ${y - uy * k1} Q${x} ${y} ${x + vx * k2} ${y + vy * k2}`;
      }
      return d;
    };
    const arrow = (x, y, dx, dy, cls) => {
      const s = 4;
      return `<path class="${cls} head" d="M${x - dx * s - dy * s} ${y - dy * s - dx * s} L${x} ${y} L${x - dx * s + dy * s} ${y - dy * s + dx * s}" />`;
    };
    const chip = (x, y, text, cls, anchor = 'mid', max = lr ? 200 : 150) => {
      const font = `500 10.5px ${FONT}`;
      const t = fit(text, font, max);
      const tw = measure(t, font);
      const icon = cls.includes('ret') ? 13 : 0;
      const cw = tw + 12 + icon;
      const left = anchor === 'end' ? x - cw : anchor === 'start' ? x : x - cw / 2;
      parts.chips.push(
        `<g class="dg-chip ${cls}"><title>${X(text)}</title><rect x="${left}" y="${y - 9}" width="${cw}" height="18" rx="9" />${icon ? `<use href="#i-restart" x="${left + 5}" y="${y - 5}" width="10" height="10" />` : ''}<text x="${left + 6 + icon}" y="${y + 3.6}">${X(t)}</text></g>`,
      );
    };
    // The entries: at the head, into the first step; one into a later step comes in just above it.
    const doorPill = (x, y, text) => {
      const font = `500 11px ${MONO}`;
      const tw = measure(text, font);
      parts.nodes.push(`<g class="dg-door"><rect x="${x}" y="${y}" width="${tw + 14}" height="20" rx="10" /><text x="${x + 7}" y="${y + 13.5}">${X(text)}</text></g>`);
      return tw + 14;
    };
    if (topEntries.length) {
      const first = R(box[topEntries[0].to]);
      if (lr) {
        let y = first.y + first.h / 2 - (topEntries.length * 26 - 6) / 2;
        for (const e of topEntries) {
          const wd = doorPill(doorsAt, y, e.door);
          parts.edges.push(`<path class="dg-e door" d="${path([[doorsAt + wd, y + 10], [first.x - 14, y + 10], [first.x - 14, first.y + first.h / 2], [first.x - 1, first.y + first.h / 2]], 5)}" />`);
          y += 26;
        }
        parts.edges.push(arrow(first.x - 1, first.y + first.h / 2, 1, 0, 'dg-e door'));
      } else {
        const widths = topEntries.map((e) => measure(e.door, `500 11px ${MONO}`) + 14);
        const total = widths.reduce((a, b) => a + b, 0) + (widths.length - 1) * 6;
        let x = first.x + first.w / 2 - total / 2;
        const cx = first.x + first.w / 2;
        topEntries.forEach((e, i) => {
          doorPill(x, doorsAt, e.door);
          const mx = x + widths[i] / 2;
          parts.edges.push(`<path class="dg-e door" d="${path([[mx, doorsAt + 20], [mx, doorsAt + 30], [cx, doorsAt + 30], [cx, first.y - 1]], 5)}" />`);
          x += widths[i] + 6;
        });
        parts.edges.push(arrow(cx, first.y - 1, 0, 1, 'dg-e door'));
      }
    }
    for (const e of midEntries) {
      const b = R(box[e.to]);
      if (lr) {
        const wd = doorPill(b.x + 8, b.y - 32, e.door);
        parts.edges.push(`<path class="dg-e door" d="M${b.x + 8 + wd / 2} ${b.y - 12} V${b.y - 1}" />` + arrow(b.x + 8 + wd / 2, b.y - 1, 0, 1, 'dg-e door'));
      } else {
        const wd = doorPill(b.x + 8, b.y - 25, e.door);
        parts.edges.push(`<path class="dg-e door" d="M${b.x + 8 + wd / 2} ${b.y - 5} V${b.y - 1}" />` + arrow(b.x + 8 + wd / 2, b.y - 1, 0, 1, 'dg-e door'));
      }
    }
    // The forward edges: from the end of a step to the start of the next, by the middle of the gap.
    for (const [from, to, cond] of w.go) {
      const a = box[from], b = box[to];
      const am = a.main + a.mainSize, bm = b.main;
      const ac = a.cross + a.crossSize / 2, bc = arrive(to);
      const mid = am + splitAt(rank[from]);
      const walked = done.has(from) && (done.has(to) || state.on === to);
      const cls = `dg-e${walked ? ' walked' : ''}`;
      const pts = Math.abs(ac - bc) < 0.5 ? [P(am, ac), P(bm - 1, bc)] : [P(am, ac), P(mid, ac), P(mid, bc), P(bm - 1, bc)];
      parts.edges.push(`<path class="${cls}" d="${path(pts)}" />` + arrow(...P(bm - 1, bc), lr ? 1 : 0, lr ? 0 : 1, cls));
      if (cond) {
        // A choice: the step's way out is marked, each branch says when.
        const [cx, cy] = lr ? P(mid + (bm - mid) / 2, bc) : P(bm - 12 - entryOff[to], bc);
        chip(cx, cy, cond, 'cond');
      }
    }
    const forks = new Set(w.go.filter(([f], _, all) => all.filter(([g]) => g === f).length > 1).map(([f]) => f));
    // The ways back, by a lane of their gutter: out of the side of the step, back into the side of the earlier one.
    const laneX = (b) => {
      if (side(b) === 'R') return before + crossTotal + 8 + lanesR.indexOf(b) * LANE + 3;
      return before - entryBand - 8 - againL * LANE - lanesL.indexOf(b) * LANE - 3;
    };
    for (const b of backs) {
      const s = box[b.from], t = box[b.to];
      const L = laneX(b);
      const right = side(b) === 'R';
      const sEdge = right ? s.cross + s.crossSize : s.cross;
      const tEdge = right ? t.cross + t.crossSize : t.cross;
      const sm = s.main + s.mainSize * (lr ? 0.88 : 0.66);
      const tm = t.main + t.mainSize * (lr ? 0.82 : 0.34);
      const cls = `dg-b${took.has(`${b.from}>${b.to}`) ? ' took' : ''}`;
      const dir1 = right ? 1 : -1;
      parts.back.push(`<path class="${cls}" d="${path([P(sm, sEdge), P(sm, L), P(tm, L), P(tm, tEdge + dir1 * 1)], 7)}" />` + arrow(...P(tm, tEdge + dir1 * 1), lr ? 0 : -dir1, lr ? -dir1 : 0, cls));
      const say = b.cond + (b.max ? ` · ${b.max} tours max` : '');
      if (lr) chip(...P(t.main + t.mainSize + GAP / 2 + (s.main - t.main - t.mainSize - GAP) / 2, L), say, 'ret' + (took.has(`${b.from}>${b.to}`) ? ' took' : ''), 'mid', 220);
      else chip(right ? L + 5 : L - 5, box[rows[retGap.get(b)][0].id].main + NODE_MAIN + 12, say, 'ret' + (took.has(`${b.from}>${b.to}`) ? ' took' : ''), right ? 'end' : 'start');
    }
    // The exit, and the next round back to the first step (dashed, by the outer lane of the left gutter).
    if (exitBox) {
      const a = box[w.exit.from];
      const am = a.main + a.mainSize, ac = a.cross + a.crossSize / 2;
      const em = exitBox.main, ec = exitBox.cross + exitBox.crossSize / 2;
      const walked = done.has(w.exit.from);
      parts.edges.push(`<path class="dg-e${walked ? ' walked' : ''}" d="${path([P(am, ac), P(em - 1, ec)])}" />` + arrow(...P(em - 1, ec), lr ? 1 : 0, lr ? 0 : 1, 'dg-e'));
      if (w.exit.cond) chip(...(lr ? P(am + (em - am) / 2, ac) : [ac, am + (em - am) / 2 - 1]), w.exit.cond, 'cond', 'mid', lr ? 160 : 210);
      const e = R(exitBox);
      parts.nodes.push(
        `<g class="dg-exit"><rect x="${e.x}" y="${e.y}" width="${e.w}" height="${e.h}" rx="${Math.min(e.w, e.h) / 2}" /><circle cx="${e.x + 15}" cy="${e.y + e.h / 2}" r="5" /><circle class="in" cx="${e.x + 15}" cy="${e.y + e.h / 2}" r="2.2" /><text x="${e.x + 27}" y="${e.y + e.h / 2 + 4}">${X(w.exit.label)}</text></g>`,
      );
      if (again) {
        const f = box[w.steps[0].id];
        const L = before - 8 - 3;
        const sm = lr ? exitBox.main + exitBox.mainSize / 2 : exitBox.main + exitBox.mainSize / 2;
        const sx = lr ? exitBox.cross + exitBox.crossSize : exitBox.cross;
        const tm = f.main + f.mainSize / 2;
        const Lc = lr ? before + crossTotal + 8 + lanesR.length * LANE + 3 : L;
        const tEdge = lr ? f.cross + f.crossSize : f.cross;
        const s2 = lr ? 1 : -1;
        parts.back.push(`<path class="dg-b again" d="${path([P(sm, sx), P(sm, Lc), P(tm, Lc), P(tm, tEdge - s2)], 8)}" />` + arrow(...P(tm, tEdge - s2), lr ? 0 : 1, lr ? -1 : 0, 'dg-b again'));
        if (lr) chip(...P((tm + sm) / 2, Lc), w.exit.again, 'again');
        else chip((L + exitBox.cross) / 2, sm, w.exit.again, 'again', 'mid', exitBox.cross - L - 10);
      }
    }
    // The steps: done, on (the open agent's), next; a step that loops on itself says how many rounds; who is on it.
    for (const s of w.steps) {
      const b = R(box[s.id]);
      const st = state.on === s.id ? 'on' : done.has(s.id) ? 'done' : [].concat(state.next || []).includes(s.id) ? 'next' : '';
      const nameFont = `600 12.5px ${FONT}`;
      const room = b.w - 24 - (st === 'done' ? 16 : 0) - (agents[s.id] ? 8 + Math.min(agents[s.id].length, 3) * 9 : 0);
      const lead = st === 'done' ? `<use class="ck" href="#i-check" x="${b.x + 9}" y="${b.y + 9}" width="14" height="14" />` : '';
      const nx = b.x + 10 + (st === 'done' ? 16 : 0);
      const loop = selfs[s.id];
      let foot = '';
      const cmdRoom = b.w - 20 - (loop ? 54 : 0);
      if (s.cmd) foot += `<text class="cmd" x="${b.x + 10}" y="${b.y + b.h - (lr ? 14 : 10)}">${X(fit(s.cmd, `500 10.5px ${MONO}`, cmdRoom))}</text>`;
      if (loop) {
        const lx = b.x + b.w - 50, ly = b.y + b.h - (lr ? 26 : 22);
        foot += `<g class="dg-self${took.has(`${s.id}>${s.id}`) ? ' took' : ''}"><title>${X(`${loop.cond} : la même étape, jusqu’à ${loop.max} tours`)}</title><rect x="${lx}" y="${ly}" width="44" height="16" rx="8" /><use href="#i-restart" x="${lx + 5}" y="${ly + 3}" width="10" height="10" /><text x="${lx + 18}" y="${ly + 11.6}">×${loop.max}</text></g>`;
      }
      let dots = '';
      const on = agents[s.id] || [];
      on.slice(0, 3).forEach((a, i) => {
        const cx = b.x + b.w - 12 - i * 9;
        dots += `<circle class="ag${a.cur ? ' cur' : ''}${a.wait ? ' wait' : ''}" cx="${cx}" cy="${b.y + 13}" r="4"><title>${X(a.name)}</title></circle>`;
      });
      if (on.length > 3) dots += `<text class="more" x="${b.x + b.w - 40}" y="${b.y + 16}" text-anchor="end">+${on.length - 3}</text>`;
      const tag = st === 'next' && room > 120 ? `<text class="tag" x="${b.x + b.w - 10 - (on.length ? 8 + Math.min(on.length, 3) * 9 : 0)}" y="${b.y + 16.5}" text-anchor="end">prochaine</text>` : '';
      const fork = forks.has(s.id) ? `<path class="dg-fork" d="${lr ? `M${b.x + b.w} ${b.y + b.h / 2 - 5} l5 5 l-5 5 l-5 -5 z` : `M${b.x + b.w / 2 - 5} ${b.y + b.h} l5 -5 l5 5 l-5 5 z`}" />` : '';
      parts.nodes.push(
        `<g class="dg-node ${st}" tabindex="0" role="button" aria-label="${X(s.name)}${st === 'on' ? ', en cours' : st === 'done' ? ', faite' : st === 'next' ? ', prochaine' : ''}"><rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="9" />${lead}<text class="nm" x="${nx}" y="${b.y + 17}">${X(fit(s.name, nameFont, room - (st === 'next' && room > 120 ? 58 : 0)))}</text>${foot}${dots}${tag}${fork}</g>`,
      );
      if (names && on.length) {
        // Enlarged: the agents by their names, under their step.
        const y = b.y + b.h + 6;
        // The open agent first, else the first; the others by their count. Clear of the ways back, which leave and come in
        // at the end of the step.
        const a = on.find((x) => x.cur) || on[0];
        const more = on.length > 1 ? `+${on.length - 1}` : '';
        const t = fit(a.name, `500 10.5px ${FONT}`, b.w * 0.72 - 22 - (more ? 22 : 0));
        const tw = measure(t, `500 10.5px ${FONT}`) + 22;
        parts.nodes.push(
          `<g class="dg-who${a.cur ? ' cur' : ''}${a.wait ? ' wait' : ''}"><title>${X(on.map((x) => x.name).join(', '))}</title><rect x="${b.x}" y="${y}" width="${tw}" height="18" rx="9" /><circle cx="${b.x + 9}" cy="${y + 9}" r="3" /><text x="${b.x + 16}" y="${y + 12.6}">${X(t)}</text>${more ? `<text class="more" x="${b.x + tw + 5}" y="${y + 12.6}">${more}</text>` : ''}</g>`,
        );
      }
    }
    return {
      width: W,
      height: H,
      svg: `<svg class="dg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${X(w.name)} en diagramme">${parts.back.join('')}${parts.edges.join('')}${parts.nodes.join('')}${parts.chips.join('')}</svg>`,
    };
  }

  const api = { WF, esc, toMermaid, draw };
  if (typeof window !== 'undefined') window.Diagram = api;
})();
