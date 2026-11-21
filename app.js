/* AI Transformation Model — UI layer. Depends on model.js (window.AIModel). */
(function () {
  'use strict';
  const M = window.AIModel;
  const $ = (id) => document.getElementById(id);
  const STORE_KEY = 'ai-transformation-model:v2';
  const MAX_SECTORS = 8;

  // ---------------- Default economy (the conversation's 6-sector example) ----------------
  // UI units: f, p, g, gmax in %; eta, gamma on 0–10 (÷20); Tcrit in ×; alpha in %/yr.
  function sec(name, tier, weight, f, p, eta, gamma, g, gmax, Tcrit, alpha, deploy, rd) {
    return { name, tier, weight, f, p, eta, gamma, g, gmax, Tcrit, alpha, deploy, rd: !!rd };
  }
  function defaultSectors() {
    return [
      sec('Energy & Grid', 'core', 35, 20, 100, 0.2, 0.2, 20, 20, 10, 15, 'private'),
      sec('Healthcare', 'core', 35, 25, 95, 1.0, 0.4, 35, 35, 15, 10, 'private'),
      sec('Banking & Payments', 'core', 30, 60, 70, 0.8, 1.0, 50, 50, 5, 15, 'private'),
      sec('Software & R&D', 'flex', 40, 70, 90, 0.4, 0.2, 60, 60, 3, 20, 'private', true),
      sec('Corporate Law', 'flex', 30, 60, 15, 2.0, 2.0, 40, 40, 5, 15, 'commons'),
      sec('Ad-Tech & Media', 'flex', 30, 80, 10, 3.0, 3.0, 50, 50, 3, 20, 'commons'),
    ];
  }
  function defaultState() {
    return {
      mode: 'dynamic', years: 15, startYear: 2026,
      r0: 25, phi: 0.4, Thalf: 15, slopLearning: 0,
      Tstatic: 20, Wcore: 60, fragility: 5,
      sectors: defaultSectors(), sel: 3, preset: 'dyn-base',
    };
  }

  // ---------------- Presets ----------------
  const PRESETS = {
    dynamic: [
      { id: 'dyn-base', label: 'Baseline', apply: (s) => s },
      { id: 'dyn-rsi', label: 'Strong AI R&D feedback', apply: (s) => Object.assign(s, { r0: 40, phi: 1, Thalf: 30 }) },
      { id: 'dyn-cyber', label: 'Cyber-slop on Banking', apply: (s) => { s.sectors[2].gamma = 10; return s; } },
      { id: 'dyn-slow', label: 'Slow institutions', apply: (s) => { s.sectors.forEach((x) => { x.alpha = Math.max(5, Math.round(x.alpha / 2)); x.Tcrit = Math.min(30, x.Tcrit * 2); }); return s; } },
      { id: 'dyn-learn', label: 'Institutions learn to fight slop', apply: (s) => Object.assign(s, { slopLearning: 10 }) },
    ],
    static: [
      { id: 'st-r1', label: 'Round 1 · Near-term 4×', apply: (s) => { s.Tstatic = 4; s.sectors.forEach((x) => { x.g = 0; }); return s; } },
      { id: 'st-r2', label: 'Round 2 · Redesign wave 20×', apply: (s) => { s.Tstatic = 20; return s; } },
      { id: 'st-r3', label: 'Round 3 · Cyber-slop shock', apply: (s) => { s.Tstatic = 20; s.sectors[2].gamma = 10; return s; } },
    ],
  };

  // ---------------- State persistence ----------------
  let state = load() || defaultState();
  function load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return null;
      const s = JSON.parse(raw);
      if (!s || !Array.isArray(s.sectors) || !s.sectors.length) return null;
      return Object.assign(defaultState(), s);
    } catch (e) { return null; }
  }
  function save() { try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { /* storage unavailable */ } }

  // ---------------- Formatting ----------------
  const fx = (v, d = 2) => (v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1) : v.toFixed(d)) + '×';
  const f2 = (v) => v.toFixed(2);
  const pct = (v) => (v >= 0 ? '+' : '−') + Math.abs(v * 100).toFixed(0) + '%';
  const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const seriesColor = (i) => css('--s' + ((i % 8) + 1));
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // ---------------- Control builders ----------------
  function slider(o) {
    // o: {id, label, sym, min, max, step, get, set, fmt, hint, log}
    const wrap = document.createElement('div');
    wrap.className = 'ctl';
    const toPos = (v) => (o.log ? Math.round(Math.log10(v) * 100) : v);
    const fromPos = (p) => (o.log ? Math.pow(10, p / 100) : p);
    const min = o.log ? Math.round(Math.log10(o.min) * 100) : o.min;
    const max = o.log ? Math.round(Math.log10(o.max) * 100) : o.max;
    wrap.innerHTML =
      `<label for="${o.id}">${o.label}${o.sym ? `<span class="sym">${o.sym}</span>` : ''}</label>` +
      `<output for="${o.id}" id="${o.id}-out"></output>` +
      `<input type="range" id="${o.id}" min="${min}" max="${max}" step="${o.log ? 1 : o.step}">` +
      (o.hint ? `<div class="hint">${o.hint}</div>` : '');
    const input = wrap.querySelector('input');
    const out = wrap.querySelector('output');
    input.value = toPos(o.get());
    out.textContent = o.fmt(o.get());
    input.addEventListener('input', () => {
      let v = fromPos(Number(input.value));
      if (o.log) v = Number(v.toPrecision(3));
      o.set(v);
      out.textContent = o.fmt(o.get());
      state.preset = null;
      markPresets();
      update();
    });
    return wrap;
  }

  function segmented(id, options, get, set) {
    const d = document.createElement('div');
    d.className = 'seg small';
    d.setAttribute('role', 'group');
    d.id = id;
    options.forEach(([val, label]) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = label;
      b.setAttribute('aria-pressed', String(get() === val));
      b.addEventListener('click', () => {
        set(val);
        d.querySelectorAll('button').forEach((x, i) => x.setAttribute('aria-pressed', String(options[i][0] === val)));
        state.preset = null; markPresets();
        update();
      });
      d.appendChild(b);
    });
    return d;
  }

  function buildGlobalControls() {
    const dyn = $('dyn-controls');
    dyn.innerHTML = '<h3>AI progress over time</h3>';
    dyn.append(
      slider({ id: 'g-years', label: 'Years to simulate', min: 5, max: 30, step: 1, get: () => state.years, set: (v) => (state.years = v), fmt: (v) => `${v} yrs · to ${state.startYear + v}` }),
      slider({ id: 'g-r0', label: 'Baseline AI progress', sym: 'r₀', min: 5, max: 60, step: 1, get: () => state.r0, set: (v) => (state.r0 = v), fmt: (v) => `${v}%/yr`, hint: 'Annual growth in useful AI work before any R&D feedback.' }),
      slider({ id: 'g-phi', label: 'AI R&D feedback', sym: 'φ', min: 0, max: 1, step: 0.05, get: () => state.phi, set: (v) => (state.phi = v), fmt: (v) => v.toFixed(2), hint: '0 = no recursive self-improvement · 0.5 = modest · 1 = strong.' }),
      slider({ id: 'g-thalf', label: 'Diminishing returns midpoint', sym: 'T_half', min: 5, max: 50, step: 1, get: () => state.Thalf, set: (v) => (state.Thalf = v), fmt: (v) => `${v}×`, hint: 'The level of useful AI work where data, energy and algorithmic drag halve annual progress. Growth slows past it but never stops.' }),
      slider({ id: 'g-learn', label: 'Slop learning', min: 0, max: 20, step: 1, get: () => state.slopLearning, set: (v) => (state.slopLearning = v), fmt: (v) => (v ? `−${v}%/yr` : 'off'), hint: 'Optional: η and γ decay each year as institutions learn to filter slop.' })
    );
    const st = $('static-controls');
    st.innerHTML = '<h3>Snapshot</h3>';
    st.append(
      slider({ id: 'g-T', label: 'Useful AI work vs end-2026', sym: 'T', min: 1, max: 100, log: true, get: () => state.Tstatic, set: (v) => (state.Tstatic = v), fmt: (v) => fx(v), hint: '1× = end-2026 baseline · 10× = ten times the verified work per £ · 100× = transformative.' })
    );
    const ec = $('econ-controls');
    ec.innerHTML = '<h3>Economy structure</h3>';
    ec.append(
      slider({ id: 'g-wcore', label: 'Core share of economy', sym: 'W_core', min: 20, max: 80, step: 1, get: () => state.Wcore, set: (v) => (state.Wcore = v), fmt: (v) => `${v}% · flex ${100 - v}%` }),
      slider({ id: 'g-frag', label: 'Core weak-link fragility', sym: 'ρ = 1 − x', min: 0, max: 10, step: 0.5, get: () => state.fragility, set: (v) => (state.fragility = v), fmt: (v) => `${v.toFixed(1)} · ρ = ${(1 - v).toFixed(1)}`, hint: '0 = normal average · 5 = Jones–Tonetti weak links · 10 = extreme O-ring.' })
    );
  }

  function buildPresets() {
    const el = $('presets');
    el.innerHTML = '';
    PRESETS[state.mode].forEach((p) => {
      const b = document.createElement('button');
      b.className = 'chip-btn';
      b.type = 'button';
      b.textContent = p.label;
      b.dataset.id = p.id;
      b.addEventListener('click', () => {
        const base = defaultState();
        base.mode = state.mode;
        base.sel = Math.min(state.sel, 5);
        state = p.apply(base);
        state.preset = p.id;
        rebuildAll();
      });
      el.appendChild(b);
    });
    markPresets();
  }
  function markPresets() {
    document.querySelectorAll('#presets .chip-btn').forEach((b) => b.classList.toggle('active', b.dataset.id === state.preset));
  }

  // ---------------- Sector editor ----------------
  function buildSectorTabs() {
    const tabs = $('sector-tabs');
    tabs.innerHTML = '';
    state.sectors.forEach((s, i) => {
      const b = document.createElement('button');
      b.className = 'stab';
      b.type = 'button';
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', String(i === state.sel));
      b.innerHTML = `<span class="dot" style="background:${seriesColor(i)}"></span>${esc(s.name)}<span class="tier">${s.tier}</span>`;
      b.addEventListener('click', () => { state.sel = i; buildSectorTabs(); buildSectorEditor(); update(); });
      tabs.appendChild(b);
    });
    $('add-sector').disabled = state.sectors.length >= MAX_SECTORS;
    $('del-sector').disabled = state.sectors.length <= 1;
  }

  function buildSectorEditor() {
    const s = state.sectors[state.sel];
    const ed = $('sector-edit');
    ed.innerHTML = '';
    const dyn = state.mode === 'dynamic';
    const refresh = () => { buildSectorTabs(); };

    const nameF = document.createElement('div');
    nameF.className = 'field';
    nameF.innerHTML = '<label for="s-name">Sector name</label><input class="text-in" id="s-name" maxlength="40">';
    const nameIn = nameF.querySelector('input');
    nameIn.value = s.name;
    nameIn.addEventListener('input', () => { s.name = nameIn.value || 'Sector'; refresh(); update(); });

    const tierF = document.createElement('div');
    tierF.className = 'field';
    tierF.innerHTML = '<span class="lab">Tier</span>';
    tierF.append(segmented('s-tier', [['core', 'Core · weak link'], ['flex', 'Flex · substitutable']], () => s.tier, (v) => { s.tier = v; refresh(); }));

    const depF = document.createElement('div');
    depF.className = 'field';
    depF.innerHTML = '<span class="lab">Deployment</span>';
    depF.append(segmented('s-deploy', [['private', 'Private · caps at Slop Peak'], ['commons', 'Commons · no cap']], () => s.deploy, (v) => (s.deploy = v)));

    ed.append(nameF, tierF, depF);
    ed.append(
      slider({ id: 's-weight', label: 'Weight within tier', sym: 'w̃', min: 1, max: 100, step: 1, get: () => s.weight, set: (v) => (s.weight = v), fmt: (v) => String(v), hint: 'Relative importance. Normalised within Core or Flex.' }),
      slider({ id: 's-f', label: 'Native workflow fit', sym: 'f', min: 0, max: 100, step: 1, get: () => s.f, set: (v) => (s.f = v), fmt: (v) => `${v}%`, hint: '20% ≈ physical or care work · 70% ≈ software and knowledge work.' }),
      slider({ id: 's-p', label: 'Real wealth vs arms race', sym: 'p', min: 0, max: 100, step: 1, get: () => s.p, set: (v) => (s.p = v), fmt: (v) => `${v}%`, hint: '0% = pure zero-sum (HFT, SEO) · 100% = pure wealth creation.' }),
      slider({ id: 's-eta', label: 'Internal slop / review tax', sym: 'η = x/20', min: 0, max: 10, step: 0.1, get: () => s.eta, set: (v) => (s.eta = v), fmt: (v) => `${v.toFixed(1)} · η ${(v / 20).toFixed(3)}`, hint: '0 = auto-verified (compilers) · 2 = heavy review · 10 = unverifiable chaos.' }),
      slider({ id: 's-gamma', label: 'External spam / cyber exposure', sym: 'γ = x/20', min: 0, max: 10, step: 0.1, get: () => s.gamma, set: (v) => (s.gamma = v), fmt: (v) => `${v.toFixed(1)} · γ ${(v / 20).toFixed(3)}`, hint: '0 = air-gapped · 2 = exposed · 10 = public inbox or active attack.' })
    );
    if (dyn) {
      ed.append(
        slider({ id: 's-gmax', label: 'Redesign ceiling', sym: 'g_max', min: 0, max: 90, step: 1, get: () => s.gmax, set: (v) => (s.gmax = v), fmt: (v) => `${v}%`, hint: 'How much of the remaining bottleneck a full redesign can remove. Physical sectors ≲ 50%.' }),
        slider({ id: 's-tcrit', label: 'Redesign midpoint', sym: 'T_crit', min: 2, max: 30, step: 0.5, get: () => s.Tcrit, set: (v) => (s.Tcrit = v), fmt: (v) => `${v}×`, hint: 'Useful AI work at which the sector\'s redesign target reaches half its ceiling. Adoption is fastest around here.' }),
        slider({ id: 's-alpha', label: 'Institutional catch-up speed', sym: 'α', min: 5, max: 30, step: 1, get: () => s.alpha, set: (v) => (s.alpha = v), fmt: (v) => `${v}% of gap/yr`, hint: 'How fast actual redesign closes the gap to its current target each year.' })
      );
      const rdF = document.createElement('div');
      rdF.className = 'field';
      rdF.innerHTML = `<span class="lab">AI R&amp;D feedback</span><label class="check"><input type="checkbox" id="s-rd"> This sector drives AI progress (V<sub>R&amp;D</sub>)</label>`;
      const cb = rdF.querySelector('input');
      cb.checked = !!s.rd;
      cb.addEventListener('change', () => {
        state.sectors.forEach((x) => (x.rd = false));
        s.rd = cb.checked;
        state.preset = null; markPresets();
        update();
      });
      ed.append(rdF);
    } else {
      ed.append(
        slider({ id: 's-g', label: 'Workflow redesign', sym: 'g', min: 0, max: 90, step: 1, get: () => s.g, set: (v) => (s.g = v), fmt: (v) => `${v}%`, hint: '0% = legacy process · 50% = major re-wire · 90% = hard cap.' })
      );
    }
  }

  $('add-sector').addEventListener('click', () => {
    if (state.sectors.length >= MAX_SECTORS) return;
    state.sectors.push(sec('New sector', 'flex', 20, 50, 80, 1, 1, 30, 30, 5, 15, 'private'));
    state.sel = state.sectors.length - 1;
    state.preset = null;
    rebuildAll();
  });
  $('del-sector').addEventListener('click', () => {
    if (state.sectors.length <= 1) return;
    state.sectors.splice(state.sel, 1);
    state.sel = Math.max(0, state.sel - 1);
    state.preset = null;
    rebuildAll();
  });
  $('reset').addEventListener('click', () => {
    const mode = state.mode;
    state = defaultState();
    state.mode = mode;
    state.preset = mode === 'dynamic' ? 'dyn-base' : 'st-r2';
    rebuildAll();
  });

  // ---------------- Mode ----------------
  function setMode(m) {
    state.mode = m;
    state.preset = null; // keep the user's sectors; clear the preset highlight
    rebuildAll();
  }
  $('mode-dynamic').addEventListener('click', () => setMode('dynamic'));
  $('mode-static').addEventListener('click', () => setMode('static'));

  // ---------------- Chart engine (SVG) ----------------
  function niceTicks(lo, hi, n) {
    const span = hi - lo || 1;
    const step0 = span / n;
    const mag = Math.pow(10, Math.floor(Math.log10(step0)));
    const err = step0 / mag;
    const step = (err >= 7.5 ? 10 : err >= 3.5 ? 5 : err >= 1.5 ? 2 : 1) * mag;
    const out = [];
    for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-6; v += step) out.push(Number(v.toFixed(10)));
    return out;
  }
  function logTicks(lo, hi) {
    const c = [];
    for (let e = 0; e <= 8; e++) [1, 2, 5].forEach((m) => c.push(m * Math.pow(10, e)));
    const t = c.filter((v) => v >= lo * 0.999 && v <= hi * 1.001);
    return t.length >= 2 ? t : [lo, hi];
  }

  /**
   * lineChart(el, opts)
   * opts: { xs: number[], series: [{name, color, ys, width, dash, label}], xLog, yLog, xFmt, yFmt, tipX, yFloor, baseline, height, marker, directLabels, onHoverFmt }
   */
  function lineChart(el, o) {
    const W = Math.max(280, el.clientWidth || 600);
    const H = o.height || 260;
    const m = { l: 44, r: o.directLabels ? 112 : 14, t: 10, b: 28 };
    const iw = W - m.l - m.r, ih = H - m.t - m.b;
    const xs = o.xs;
    const allY = o.series.flatMap((s) => s.ys).filter(Number.isFinite);
    let ylo = Math.min(...allY, o.baseline ?? Infinity), yhi = Math.max(...allY, o.baseline ?? -Infinity);
    if (o.yFloor != null) ylo = Math.min(ylo, o.yFloor);
    let yt;
    if (o.yLog) {
      ylo = Math.max(1, ylo); yhi = Math.max(ylo * 2, yhi);
      yt = logTicks(ylo, yhi);
      ylo = Math.min(ylo, yt[0]); yhi = Math.max(yhi, yt[yt.length - 1]);
    } else {
      const pad = (yhi - ylo) * 0.08 || 0.1;
      yt = niceTicks(ylo - pad, yhi + pad, 5);
      ylo = Math.min(ylo - pad * 0.5, yt[0]); yhi = Math.max(yhi + pad * 0.5, yt[yt.length - 1]);
      if (o.yFloor != null && ylo < o.yFloor) ylo = o.yFloor;
      yt = yt.filter((v) => v >= ylo - 1e-9 && v <= yhi + 1e-9);
    }
    const xlo = xs[0], xhi = xs[xs.length - 1];
    const X = o.xLog ? (v) => m.l + (Math.log(v) - Math.log(xlo)) / (Math.log(xhi) - Math.log(xlo)) * iw : (v) => m.l + (v - xlo) / (xhi - xlo || 1) * iw;
    const Y = o.yLog ? (v) => m.t + ih - (Math.log(v) - Math.log(ylo)) / (Math.log(yhi) - Math.log(ylo)) * ih : (v) => m.t + ih - (v - ylo) / (yhi - ylo || 1) * ih;
    const xt = o.xLog ? logTicks(xlo, xhi) : niceTicks(xlo, xhi, Math.max(3, Math.min(8, Math.floor(iw / 70))));

    const grid = css('--grid'), muted = css('--muted'), ink2 = css('--ink-2'), surface = css('--panel'), ink = css('--ink');
    let s = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(o.aria || '')}">`;
    yt.forEach((v) => {
      s += `<line x1="${m.l}" x2="${m.l + iw}" y1="${Y(v)}" y2="${Y(v)}" stroke="${grid}" stroke-width="1"/>`;
      s += `<text x="${m.l - 8}" y="${Y(v) + 4}" text-anchor="end" font-size="11" fill="${muted}" font-family="var(--font-mono)">${o.yFmt(v)}</text>`;
    });
    if (o.baseline != null && o.baseline >= ylo && o.baseline <= yhi) {
      s += `<line x1="${m.l}" x2="${m.l + iw}" y1="${Y(o.baseline)}" y2="${Y(o.baseline)}" stroke="${ink2}" stroke-width="1" stroke-dasharray="3 3" opacity="0.7"/>`;
      s += `<text x="${m.l + iw}" y="${Y(o.baseline) - 5}" text-anchor="end" font-size="10.5" fill="${muted}">${o.baselineLabel || 'baseline'}</text>`;
    }
    xt.forEach((v) => {
      s += `<text x="${X(v)}" y="${H - 8}" text-anchor="middle" font-size="11" fill="${muted}" font-family="var(--font-mono)">${o.xFmt(v)}</text>`;
    });
    s += `<line x1="${m.l}" x2="${m.l + iw}" y1="${m.t + ih}" y2="${m.t + ih}" stroke="${css('--line')}"/>`;
    if (o.marker != null) {
      const mx = X(o.marker);
      s += `<line x1="${mx}" x2="${mx}" y1="${m.t}" y2="${m.t + ih}" stroke="${ink}" stroke-width="1.5" opacity="0.6"/>`;
      s += `<text x="${mx + 5}" y="${m.t + 12}" font-size="11" fill="${ink2}">${o.markerLabel || ''}</text>`;
    }
    // series (draw thinner ones first so emphasised lines sit on top)
    const order = o.series.map((_, i) => i).sort((a, b) => (o.series[a].width || 2) - (o.series[b].width || 2));
    order.forEach((k) => {
      const se = o.series[k];
      const d = se.ys.map((y, i) => `${i ? 'L' : 'M'}${X(xs[i]).toFixed(1)},${Y(Math.max(o.yLog ? ylo : -Infinity, y)).toFixed(1)}`).join('');
      s += `<path d="${d}" fill="none" stroke="${surface}" stroke-width="${(se.width || 2) + 2}" stroke-linejoin="round" stroke-linecap="round"/>`;
      s += `<path d="${d}" fill="none" stroke="${se.color}" stroke-width="${se.width || 2}" stroke-linejoin="round" stroke-linecap="round" ${se.dash ? `stroke-dasharray="${se.dash}"` : ''}/>`;
      const ly = se.ys[se.ys.length - 1];
      s += `<circle cx="${X(xs[xs.length - 1])}" cy="${Y(ly)}" r="3.5" fill="${se.color}" stroke="${surface}" stroke-width="2"/>`;
    });
    // direct labels at line ends (de-collided)
    if (o.directLabels) {
      const labs = o.series.map((se) => ({ y: Y(se.ys[se.ys.length - 1]), t: `${se.label || se.name} ${o.yFmt(se.ys[se.ys.length - 1], true)}` }));
      const idx = labs.map((_, i) => i).sort((a, b) => labs[a].y - labs[b].y);
      for (let k = 1; k < idx.length; k++) {
        const a = labs[idx[k - 1]], b = labs[idx[k]];
        if (b.y - a.y < 14) b.y = a.y + 14;
      }
      labs.forEach((l) => { s += `<text x="${m.l + iw + 8}" y="${l.y + 4}" font-size="11.5" fill="${ink2}">${esc(l.t)}</text>`; });
    }
    s += `<g class="hover" style="display:none"><line class="hx" y1="${m.t}" y2="${m.t + ih}" stroke="${ink2}" stroke-width="1"/>`;
    o.series.forEach((se, k) => { s += `<circle class="hd" data-k="${k}" r="4" fill="${se.color}" stroke="${surface}" stroke-width="2"/>`; });
    s += `</g><rect class="hit" x="${m.l}" y="${m.t}" width="${iw}" height="${ih}" fill="transparent"/></svg><div class="tip"></div>`;
    el.innerHTML = s;

    const svg = el.querySelector('svg'), hover = svg.querySelector('.hover'), tip = el.querySelector('.tip');
    const hx = svg.querySelector('.hx'), dots = svg.querySelectorAll('.hd');
    const hit = svg.querySelector('.hit');
    function move(evt) {
      const r = svg.getBoundingClientRect();
      const px = (evt.clientX - r.left) * (W / r.width);
      let best = 0, bd = Infinity;
      xs.forEach((x, i) => { const d = Math.abs(X(x) - px); if (d < bd) { bd = d; best = i; } });
      const cx = X(xs[best]);
      hover.style.display = '';
      hx.setAttribute('x1', cx); hx.setAttribute('x2', cx);
      dots.forEach((dt) => { const se = o.series[dt.dataset.k]; dt.setAttribute('cx', cx); dt.setAttribute('cy', Y(se.ys[best])); });
      const rows = o.series.map((se, k) => ({ se, v: se.ys[best], k })).sort((a, b) => b.v - a.v);
      tip.innerHTML = `<div class="h">${o.tipX(xs[best], best)}</div>` + rows.map(({ se, v }) => `<div class="r"><i style="background:${se.color}"></i><span>${esc(se.name)}</span><b>${o.yFmt(v, true)}</b></div>`).join('') + (o.tipExtra ? o.tipExtra(best) : '');
      tip.style.display = 'block';
      const scale = r.width / W;
      const tw = tip.offsetWidth;
      let left = cx * scale + 14;
      if (left + tw > r.width) left = cx * scale - tw - 14;
      tip.style.left = Math.max(0, left) + 'px';
      tip.style.top = (m.t * scale) + 'px';
    }
    hit.addEventListener('pointermove', move);
    hit.addEventListener('pointerdown', move);
    hit.addEventListener('pointerleave', () => { hover.style.display = 'none'; tip.style.display = 'none'; });
  }

  /** Horizontal bar chart of sector V (bar) with clean speedup S (tick). */
  function barChart(el, rows) {
    const W = Math.max(280, el.clientWidth || 600);
    const rowH = 34, m = { l: Math.min(150, W * 0.36), r: 64, t: 6, b: 26 };
    const H = m.t + m.b + rows.length * rowH;
    const iw = W - m.l - m.r;
    const hi = Math.max(1.2, ...rows.map((r) => Math.max(r.V, r.S))) * 1.05;
    const X = (v) => m.l + (v / hi) * iw;
    const ticks = niceTicks(0, hi, Math.max(3, Math.floor(iw / 70)));
    const grid = css('--grid'), muted = css('--muted'), ink = css('--ink'), ink2 = css('--ink-2'), surface = css('--panel');
    let s = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Sector net value and clean speedup">`;
    ticks.forEach((v) => {
      s += `<line x1="${X(v)}" x2="${X(v)}" y1="${m.t}" y2="${H - m.b}" stroke="${grid}"/>`;
      s += `<text x="${X(v)}" y="${H - 8}" text-anchor="middle" font-size="11" fill="${muted}" font-family="var(--font-mono)">${v}×</text>`;
    });
    rows.forEach((r, i) => {
      const y = m.t + i * rowH + 7, h = rowH - 14;
      const name = r.name.length > 22 ? r.name.slice(0, 21) + '…' : r.name;
      s += `<text x="${m.l - 10}" y="${y + h / 2 + 4}" text-anchor="end" font-size="12" fill="${ink2}">${esc(name)}</text>`;
      const x0 = X(0), x1 = X(r.V), w = Math.max(2, x1 - x0);
      s += `<path d="M${x0},${y} h${w - 4} a4,4 0 0 1 4,4 v${h - 8} a4,4 0 0 1 -4,4 h${-(w - 4)} z" fill="${r.color}"><title>${esc(r.name)}: net ${f2(r.V)}×, clean speedup ${f2(r.S)}×</title></path>`;
      s += `<line x1="${X(r.S)}" x2="${X(r.S)}" y1="${y - 3}" y2="${y + h + 3}" stroke="${ink}" stroke-width="2"/>`;
      s += `<text x="${Math.max(x1, X(r.S)) + 8}" y="${y + h / 2 + 4}" font-size="11.5" fill="${ink}" font-family="var(--font-mono)">${f2(r.V)}×</text>`;
    });
    s += `<line x1="${X(1)}" x2="${X(1)}" y1="${m.t}" y2="${H - m.b}" stroke="${ink2}" stroke-dasharray="3 3"/>`;
    s += `</svg>`;
    el.innerHTML = s;
  }

  function legend(el, items) {
    el.innerHTML = items.map((it) => `<span><i class="${it.dash ? 'dash' : ''}" style="${it.dash ? `color:${it.color}` : `background:${it.color}`}"></i>${esc(it.name)}</span>`).join('');
  }

  // ---------------- Rendering ----------------
  let lastRows = null, lastSnap = null;

  function kpi(label, value, delta, cls) {
    return `<div class="kpi"><span class="eyebrow">${label}</span><span class="v">${value}</span><span class="d ${cls || ''}">${delta}</span></div>`;
  }

  function renderDynamic() {
    const rows = M.simulate(state);
    lastRows = rows; lastSnap = null;
    const xs = rows.map((r) => r.year);
    const last = rows[rows.length - 1];
    const startY = state.startYear;
    const peak = rows.reduce((a, r) => (r.Vmacro > a.Vmacro ? r : a), rows[0]);
    const yrFmt = (v) => String(Math.round(v));

    // KPIs
    const best = last.sectors.map((s, i) => ({ s, i })).sort((a, b) => b.s.V - a.s.V);
    const worst = best[best.length - 1];
    $('kpis').innerHTML =
      kpi(`Economy in ${last.year}`, fx(last.Vmacro), `${pct(last.Vmacro - 1)} real output vs ${startY}`, last.Vmacro >= 1 ? 'good' : 'bad') +
      kpi(`Useful AI work ${last.year}`, fx(last.T), `growth now ${(last.growth * 100).toFixed(1)}%/yr · half-speed at ${state.Thalf}×`) +
      kpi('Core infrastructure', fx(last.Vcore), last.Vcore < 1 ? 'Below baseline: braking AI progress' : 'Above baseline: no brake', last.Vcore >= 1 ? 'good' : 'bad') +
      kpi('Weakest sector', fx(worst.s.V), esc(state.sectors[worst.i].name), worst.s.V >= 1 ? '' : 'bad');

    // Chart 1: macro
    const c = [css('--s1'), css('--s2'), css('--s3')];
    const ser = [
      { name: 'Total economy', label: 'Total', color: c[0], ys: rows.map((r) => r.Vmacro), width: 3 },
      { name: 'Core sectors', label: 'Core', color: c[1], ys: rows.map((r) => r.Vcore), width: 2 },
      { name: 'Flex sectors', label: 'Flex', color: c[2], ys: rows.map((r) => r.Vflex), width: 2 },
    ];
    $('c1-title').textContent = 'Economy-wide value over time';
    $('c1-sub').textContent = peak.year !== last.year ? `Peaks at ${fx(peak.Vmacro)} in ${peak.year}` : `Real output index, ${startY} = 1.0`;
    legend($('c1-legend'), ser);
    lineChart($('c1'), {
      xs, series: ser, xFmt: yrFmt, yFmt: (v, t) => (t ? f2(v) + '×' : v.toFixed(v < 10 ? 1 : 0) + '×'), baseline: 1, baselineLabel: `${startY} level`,
      tipX: (x, i) => `${x} · T = ${fx(rows[i].T)}`, height: 300, directLabels: true, aria: 'Macro, core and flex value over time',
    });

    // Chart 2: T over time (log)
    $('c2-title').textContent = 'Useful AI work, T';
    $('c2-sub').textContent = 'Multiple of end-2026 verified work per £ (log scale). Growth slows as Core weakens and as T passes the diminishing-returns midpoint.';
    $('c2-legend').innerHTML = '';
    lineChart($('c2'), {
      xs, series: [{ name: 'Useful AI work', color: css('--s7'), ys: rows.map((r) => r.T), width: 2.5 }],
      yLog: true, xFmt: yrFmt, yFmt: (v, t) => (t ? fx(v) : v + '×'),
      tipX: (x) => String(x), height: 240, aria: 'Tech power T over time',
      tipExtra: (i) => `<div class="r"><i></i><span>growth next yr</span><b>${(rows[i].growth * 100).toFixed(1)}%</b></div><div class="r"><i></i><span>Core brake</span><b>${f2(rows[i].brake)}</b></div><div class="r"><i></i><span>Diminishing returns</span><b>${f2(rows[i].drag)}</b></div>`,
    });

    // Chart 3: sector V
    const sser = state.sectors.map((s, i) => ({ name: s.name, color: seriesColor(i), ys: rows.map((r) => r.sectors[i].V), width: i === state.sel ? 3 : 2, dash: s.tier === 'flex' ? '' : '' }));
    $('c3-title').textContent = 'Sector net value, Vᵢ';
    $('c3-sub').textContent = 'Each sector after bottlenecks, Red Queen losses and slop. Below 1.0 means AI made the sector worse off.';
    legend($('c3-legend'), sser);
    lineChart($('c3'), { xs, series: sser, xFmt: yrFmt, yFmt: (v, t) => (t ? f2(v) + '×' : v.toFixed(1) + '×'), baseline: 1, tipX: (x) => String(x), height: 240, aria: 'Sector values over time' });

    // Chart 4: g adoption
    $('c4-card').hidden = false;
    const gser = state.sectors.map((s, i) => ({ name: s.name, color: seriesColor(i), ys: rows.map((r) => r.sectors[i].g * 100), width: i === state.sel ? 3 : 2 }));
    legend($('c4-legend'), gser);
    lineChart($('c4'), {
      xs, series: gser, xFmt: yrFmt, yFmt: (v) => Math.round(v) + '%', yFloor: 0, tipX: (x, i) => `${x} · T = ${fx(rows[i].T)}`, height: 220, aria: 'Workflow redesign over time',
    });

    sectorStatus(last, `in ${last.year}`);
    renderTableDynamic(rows);
  }

  function renderStatic() {
    const T = state.Tstatic;
    const snap = M.snapshot(state, T, null, 0);
    lastSnap = snap; lastRows = null;
    const best = snap.sectors.map((s, i) => ({ s, i })).sort((a, b) => b.s.V - a.s.V);
    const worst = best[best.length - 1];
    $('kpis').innerHTML =
      kpi('Total economy', fx(snap.Vmacro), `${pct(snap.Vmacro - 1)} real output vs baseline`, snap.Vmacro >= 1 ? 'good' : 'bad') +
      kpi('Core sectors', fx(snap.Vcore), `weak-link average, ρ = ${(1 - state.fragility).toFixed(1)}`, snap.Vcore >= 1 ? 'good' : 'bad') +
      kpi('Flex sectors', fx(snap.Vflex), 'weighted average', snap.Vflex >= 1 ? 'good' : 'bad') +
      kpi('Weakest sector', fx(worst.s.V), esc(state.sectors[worst.i].name), worst.s.V >= 1 ? '' : 'bad');

    // Chart 1: V vs T sweep
    const pts = M.sweep(state, 1, 100, 120);
    const xs = pts.map((p) => p.T);
    const c = [css('--s1'), css('--s2'), css('--s3')];
    const ser = [
      { name: 'Total economy', label: 'Total', color: c[0], ys: pts.map((p) => p.Vmacro), width: 3 },
      { name: 'Core sectors', label: 'Core', color: c[1], ys: pts.map((p) => p.Vcore), width: 2 },
      { name: 'Flex sectors', label: 'Flex', color: c[2], ys: pts.map((p) => p.Vflex), width: 2 },
    ];
    const pk = pts.reduce((a, p) => (p.Vmacro > a.Vmacro ? p : a), pts[0]);
    $('c1-title').textContent = 'Economy-wide value across tech power';
    $('c1-sub').textContent = pk.T < 99 ? `Economy peaks at ${fx(pk.Vmacro)} when T ≈ ${fx(pk.T)}` : 'Holding these sector settings fixed';
    legend($('c1-legend'), ser);
    lineChart($('c1'), {
      xs, series: ser, xLog: true, xFmt: (v) => v + '×', yFmt: (v, t) => (t ? f2(v) + '×' : v.toFixed(1) + '×'), baseline: 1,
      marker: T, markerLabel: `now ${fx(T)}`, tipX: (x) => `T = ${fx(x)}`, height: 300, aria: 'Macro value as a function of T',
    });

    // Chart 2: sector bars
    $('c2-title').textContent = 'Sector net value at ' + fx(T);
    $('c2-sub').textContent = 'Bar = net value Vᵢ. Black tick = clean speedup Sᵢ before Red Queen losses and slop. Dashed line = baseline 1.0.';
    $('c2-legend').innerHTML = '';
    barChart($('c2'), snap.sectors.map((s, i) => ({ name: state.sectors[i].name, V: s.V, S: s.S, color: seriesColor(i) })));

    // Chart 3: each sector's V across T
    const sser = state.sectors.map((s, i) => ({ name: s.name, color: seriesColor(i), ys: [], width: i === state.sel ? 3 : 2 }));
    const sx = [];
    for (let k = 0; k <= 80; k++) {
      const t = Math.pow(100, k / 80); sx.push(t);
      const sn = M.snapshot(state, t, null, 0);
      sn.sectors.forEach((o, i) => sser[i].ys.push(o.V));
    }
    $('c3-title').textContent = 'Sector value across tech power';
    $('c3-sub').textContent = 'Private sectors flatten at their Slop Peak. Commons sectors keep scaling and can fall below 1.0.';
    legend($('c3-legend'), sser);
    lineChart($('c3'), { xs: sx, series: sser, xLog: true, xFmt: (v) => v + '×', yFmt: (v, t) => (t ? f2(v) + '×' : v.toFixed(1) + '×'), baseline: 1, marker: T, tipX: (x) => `T = ${fx(x)}`, height: 240, aria: 'Sector values across T' });

    $('c4-card').hidden = true;
    sectorStatus(snap, `at ${fx(T)}`);
    renderTableStatic(snap);
  }

  function sectorStatus(snap, when) {
    const s = snap.sectors[state.sel];
    const cfg = state.sectors[state.sel];
    if (!s) { $('sector-status').innerHTML = ''; return; }
    const pills = [];
    pills.push(`<span class="pill info">${when}: V = ${f2(s.V)}× · clean speedup S = ${f2(s.S)}× · bottleneck ε = ${f2(s.eps)}</span>`);
    if (s.capped) pills.push(`<span class="pill warn">Capped at Slop Peak T* ≈ ${fx(s.Tstar)}</span>`);
    else if (cfg.deploy === 'commons' && s.Tstar < snap.T - 1e-6) pills.push(`<span class="pill crit">Past its Slop Peak (T* ≈ ${fx(s.Tstar)}), no cap in commons</span>`);
    if (s.V < 1) pills.push(`<span class="pill crit">Below baseline</span>`);
    else if (s.V >= 2) pills.push(`<span class="pill good">More than doubled</span>`);
    $('sector-status').innerHTML = pills.join('');
  }

  function cls(v) { return v < 1 ? 'lo' : ''; }
  function renderTableDynamic(rows) {
    $('tbl-title').textContent = 'Year by year';
    const names = state.sectors.map((s) => esc(s.name));
    let h = '<thead><tr><th>Year</th><th>T</th><th>Growth</th><th>V core</th><th>V flex</th><th>V macro</th>' + names.map((n) => `<th>${n}</th>`).join('') + '</tr></thead><tbody>';
    rows.forEach((r) => {
      h += `<tr><td>${r.year}</td><td>${f2(r.T)}</td><td>${(r.growth * 100).toFixed(1)}%</td><td class="${cls(r.Vcore)}">${f2(r.Vcore)}</td><td class="${cls(r.Vflex)}">${f2(r.Vflex)}</td><td class="${cls(r.Vmacro)}"><b>${f2(r.Vmacro)}</b></td>` + r.sectors.map((s) => `<td class="${cls(s.V)}">${f2(s.V)}</td>`).join('') + '</tr>';
    });
    $('tbl').innerHTML = h + '</tbody>';
  }
  function renderTableStatic(snap) {
    $('tbl-title').textContent = 'Sector detail at ' + fx(snap.T);
    let h = '<thead><tr><th>Sector</th><th>Tier</th><th>Weight</th><th>Deploy</th><th>ε</th><th>S (clean)</th><th>T eff</th><th>Slop Peak T*</th><th>V (net)</th></tr></thead><tbody>';
    snap.sectors.forEach((s, i) => {
      const c = state.sectors[i];
      h += `<tr><td class="txt">${esc(c.name)}</td><td class="txt">${c.tier}</td><td>${f2(snap.weights[i] || 0)}</td><td class="txt">${c.deploy}</td><td>${f2(s.eps)}</td><td>${f2(s.S)}</td><td>${f2(s.Teff)}</td><td>${s.Tstar >= snap.T - 1e-6 ? '≥ ' + f2(snap.T) : f2(s.Tstar)}</td><td class="${cls(s.V)}"><b>${f2(s.V)}</b></td></tr>`;
    });
    h += `<tr><td class="txt"><b>Core</b></td><td></td><td>${(state.Wcore / 100).toFixed(2)}</td><td></td><td></td><td></td><td></td><td></td><td class="${cls(snap.Vcore)}"><b>${f2(snap.Vcore)}</b></td></tr>`;
    h += `<tr><td class="txt"><b>Flex</b></td><td></td><td>${(1 - state.Wcore / 100).toFixed(2)}</td><td></td><td></td><td></td><td></td><td></td><td class="${cls(snap.Vflex)}"><b>${f2(snap.Vflex)}</b></td></tr>`;
    h += `<tr><td class="txt"><b>Total economy</b></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td class="${cls(snap.Vmacro)}"><b>${f2(snap.Vmacro)}</b></td></tr>`;
    $('tbl').innerHTML = h + '</tbody>';
  }

  function toCSV() {
    const q = (s) => `"${String(s).replace(/"/g, '""')}"`;
    if (lastRows) {
      const head = ['year', 'T', 'growth', 'V_core', 'V_flex', 'V_macro'].concat(state.sectors.flatMap((s) => [`V ${s.name}`, `g ${s.name}`]));
      const lines = lastRows.map((r) => [r.year, r.T, r.growth, r.Vcore, r.Vflex, r.Vmacro].concat(r.sectors.flatMap((s) => [s.V, s.g])).map((v) => (typeof v === 'number' ? +v.toFixed(5) : v)).join(','));
      return [head.map(q).join(',')].concat(lines).join('\n');
    }
    const s = lastSnap;
    const head = ['sector', 'tier', 'weight', 'deploy', 'eps', 'S', 'T_eff', 'T_star', 'V'];
    const lines = s.sectors.map((o, i) => [q(state.sectors[i].name), state.sectors[i].tier, +(s.weights[i] || 0).toFixed(4), state.sectors[i].deploy, +o.eps.toFixed(5), +o.S.toFixed(5), +o.Teff.toFixed(5), +o.Tstar.toFixed(5), +o.V.toFixed(5)].join(','));
    lines.push(`"Core",,,,,,,,${s.Vcore.toFixed(5)}`, `"Flex",,,,,,,,${s.Vflex.toFixed(5)}`, `"Macro",,,,,,,,${s.Vmacro.toFixed(5)}`);
    return [head.join(',')].concat(lines).join('\n');
  }
  $('copy-csv').addEventListener('click', () => {
    const text = toCSV();
    const btn = $('copy-csv');
    const done = (msg) => { btn.textContent = msg; setTimeout(() => (btn.textContent = 'Copy as CSV'), 1600); };
    try {
      navigator.clipboard.writeText(text).then(() => done('Copied'), () => fallback());
    } catch (e) { fallback(); }
    function fallback() {
      const ta = document.createElement('textarea');
      ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); done('Copied'); } catch (e) { done('Copy failed'); }
      ta.remove();
    }
  });

  // ---------------- Orchestration ----------------
  let raf = 0;
  function update() {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      if (state.mode === 'dynamic') renderDynamic(); else renderStatic();
      save();
    });
  }

  function rebuildAll() {
    const dyn = state.mode === 'dynamic';
    $('mode-dynamic').setAttribute('aria-pressed', String(dyn));
    $('mode-static').setAttribute('aria-pressed', String(!dyn));
    if (state.sel >= state.sectors.length) state.sel = 0;
    buildGlobalControls();
    $('dyn-controls').hidden = !dyn;
    $('static-controls').hidden = dyn;
    $('lede').innerHTML = dyn
      ? 'Each year the static equation gives a snapshot of every sector and the whole economy. Two update rules then feed that snapshot back into next year\'s useful AI work <span class="mono">T</span> and each sector\'s workflow redesign <span class="mono">g<sub>i</sub></span>. Move the dials to see whether the economy compounds, stalls, or drowns in slop.'
      : 'The static equation with tech power <span class="mono">T</span> as a scenario dial. Set a level of useful AI work and each sector\'s settings to see net value after Amdahl bottlenecks, Red Queen arms races, internal slop and external spam, and how a weak Core drags down the economy.';
    buildPresets();
    buildSectorTabs();
    buildSectorEditor();
    update();
  }

  // Re-render on resize and theme changes
  let lastW = 0;
  new ResizeObserver(() => {
    const w = document.querySelector('.results').clientWidth;
    if (Math.abs(w - lastW) > 4) { lastW = w; update(); }
  }).observe(document.querySelector('.results'));
  try { matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { buildSectorTabs(); update(); }); } catch (e) { /* old browser */ }
  new MutationObserver(() => { buildSectorTabs(); update(); }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  rebuildAll();
})();
