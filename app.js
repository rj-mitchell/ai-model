/* AI Transformation Model — UI layer. Depends on model.js (window.AIModel). */
(function () {
  'use strict';
  const M = window.AIModel;
  const $ = (id) => document.getElementById(id);
  const STORE_KEY = 'ai-transformation-model:v17';
  const MAX_SECTORS = 8;
  const defaultState = () => M.defaultState();

  // ---------------- Presets ----------------
  const PRESETS = [
    { id: 'dyn-base', label: 'Median expert (AGI 2050)', apply: (s) => s },
    { id: 'dyn-sf', label: 'Superforecasters (AGI 2047)', apply: (s) => Object.assign(s, { agiYear: 2047 }) },
    { id: 'dyn-short', label: 'Forecasting sites (AGI ~2031)', apply: (s) => Object.assign(s, { agiYear: 2031, r0: 45 }) },
    { id: 'dyn-labs', label: 'Lab leaders (AGI ~2028)', apply: (s) => Object.assign(s, { agiYear: 2028, r0: 60, phi: 0.8 }) },
    { id: 'dyn-robotics', label: 'Robotics breakthrough', apply: (s) => M.applyRobotics(s) },
    { id: 'dyn-cyber', label: 'Sustained cyber-attack on finance', apply: (s) => { s.sectors[3].gamma = 40; return s; } },
    { id: 'dyn-slow', label: 'Slow institutions', apply: (s) => { s.sectors.forEach((x) => { x.alpha = Math.max(5, Math.round(x.alpha / 2)); x.Tcrit = Math.min(30, x.Tcrit * 2 + 1); }); return s; } },
  ];

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
  // displayed multiples use two significant figures: the inputs are judgement calls, so more digits would be false precision
  const fx = (v) => (!Number.isFinite(v) ? '–' : v >= 1e5 ? v.toExponential(1).replace('e+', 'e') + '×' : v >= 10 ? Math.round(v).toLocaleString('en-GB') + '×' : v >= 1 ? v.toFixed(1) + '×' : v.toFixed(2) + '×');
  const f2 = (v) => (Number.isFinite(v) ? v.toFixed(2) : '–');
  const pc = (v, d = 0) => (v * 100).toFixed(d) + '%';
  const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const seriesColor = (i) => css('--s' + ((i % 8) + 1));
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // ---------------- Control builders ----------------
  function touched() { state.preset = null; markPresets(); update(); }

  // evidence line under a slider: plausible range, confidence, note and linked sources
  const EV_UNIT = { weight: '% of GDP', f: '%', fmax: '%', p: '%', eta: ' / 10', gamma: ' / 10', gmax: '%', Tcrit: '×', alpha: '%/yr', agiYear: '', r0: '%/yr', hLoop: '%', adoptSpeed: '%/yr', Nmax: '%' };
  const srcShort = (k) => (M.SOURCES[k] ? M.SOURCES[k].t.split(/[,:(]/)[0].trim() : k);
  const srcLinks = (src) => src.map((k) => (M.SOURCES[k] ? `<a href="${M.SOURCES[k].u}" target="_blank" rel="noopener" title="${esc(M.SOURCES[k].t)}">${esc(srcShort(k))}</a>` : '')).filter(Boolean).join(', ');
  function evidenceHTML(key, ev) {
    if (!ev) return '';
    const u = EV_UNIT[key] != null ? EV_UNIT[key] : '';
    const links = srcLinks(ev.src);
    return `<div class="ev"><b>Evidence:</b> ${ev.lo}–${ev.hi}${u} · ${esc(ev.c)} confidence. ${esc(ev.note)}${links ? ` <span class="ev-src">${links}</span>` : ''}</div>`;
  }

  function slider(o) {
    const wrap = document.createElement('div');
    wrap.className = 'ctl';
    wrap.innerHTML =
      `<label for="${o.id}">${o.label}${o.sym ? `<span class="sym">${o.sym}</span>` : ''}</label>` +
      `<output for="${o.id}" id="${o.id}-out"></output>` +
      `<input type="range" id="${o.id}" min="${o.min}" max="${o.max}" step="${o.step}">` +
      (o.hint ? `<div class="hint">${o.hint}</div>` : '') + (o.ev ? evidenceHTML(o.evKey, o.ev) : '');
    const input = wrap.querySelector('input');
    const out = wrap.querySelector('output');
    input.value = o.get();
    out.textContent = o.fmt(o.get());
    input.addEventListener('input', () => {
      o.set(Number(input.value));
      out.textContent = o.fmt(o.get());
      touched();
    });
    return wrap;
  }

  function segmented(id, options, get, set, after) {
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
        if (after) after();
        touched();
      });
      d.appendChild(b);
    });
    return d;
  }

  function group(parent, title, open, note) {
    const det = document.createElement('details');
    det.className = 'group';
    if (open) det.open = true;
    det.innerHTML = `<summary><h3>${title}</h3></summary>`;
    const body = document.createElement('div');
    body.className = 'group-body';
    if (note) body.innerHTML = `<p class="hint">${note}</p>`;
    det.appendChild(body);
    parent.appendChild(det);
    return body;
  }

  function buildGlobalControls() {
    const host = $('controls');
    host.innerHTML = '';
    const E = M.GLOBAL_EVIDENCE;
    const g = group(host, 'Settings', true);
    g.append(
      slider({ id: 'g-years', label: 'Years to simulate', min: 5, max: 40, step: 1, get: () => state.years, set: (v) => (state.years = v), fmt: (v) => `${v} yrs · to ${state.startYear + v}` }),
      slider({ ev: E.agiYear, evKey: 'agiYear', id: 'g-agi', label: 'Year AI can do most non-physical work (AGI)', min: 2028, max: 2070, step: 1, get: () => state.agiYear, set: (v) => (state.agiYear = v), fmt: (v) => String(v), hint: 'AI that beats a 90th-percentile professional on 90% of non-physical tasks at no more than 5× the cost. By this year, AI can do 90% of the work it could ever do in each sector.' }),
      slider({ ev: E.r0, evKey: 'r0', id: 'g-r0', label: 'Speed of AI progress', sym: 'r₀', min: 5, max: 60, step: 1, get: () => state.r0, set: (v) => (state.r0 = v), fmt: (v) => `${v}%/yr`, hint: 'Yearly growth in useful AI work (verified work per £) at the start.' }),
      slider({ ev: E.adoptSpeed, evKey: 'adoptSpeed', id: 'g-adoptspeed', label: 'Adoption speed', sym: 'λ', min: 5, max: 60, step: 1, get: () => state.adoptSpeed, set: (v) => (state.adoptSpeed = v), fmt: (v) => `${v}%/yr`, hint: 'How fast use of what AI can already do spreads. An S-curve that speeds up as AI’s advantage grows.' }),
      slider({ ev: E.hLoop, evKey: 'hLoop', id: 'g-hloop', label: 'Human-in-the-loop share before rebuilding', sym: 'h', min: 5, max: 60, step: 5, get: () => state.hLoop, set: (v) => (state.hLoop = v), fmt: (v) => `${v}% · caps assisted work at ${(100 / v).toFixed(1)}×`, hint: 'In existing processes, people still direct and check AI’s work, which caps the speedup until the work itself is rebuilt around AI.' }),
      slider({ ev: E.Nmax, evKey: 'Nmax', id: 'g-nmax', label: 'AI-native products, mature size', sym: 'N', min: 0, max: 50, step: 1, get: () => state.Nmax, set: (v) => (state.Nmax = v), fmt: (v) => `${v}% of today's economy`, hint: 'Goods and services that don’t exist yet.' })
    );
    const fixed = group(host, 'Fixed assumptions', false, 'Held constant, with the evidence behind each. They are still varied in the uncertainty band.');
    const list = document.createElement('dl');
    list.className = 'fixed-list';
    list.innerHTML = Object.keys(M.FIXED_INFO).map((k) => {
      const f = M.FIXED_INFO[k], links = srcLinks(f.ev.src);
      return `<dt>${esc(f.label)}</dt><dd><b>${esc(f.value)}</b> · ${esc(f.ev.note)}${links ? ` <span class="ev-src">${links}</span>` : ''}</dd>`;
    }).join('');
    fixed.append(list);
  }

  function buildPresets() {
    const el = $('presets');
    el.innerHTML = '';
    PRESETS.forEach((p) => {
      const b = document.createElement('button');
      b.className = 'chip-btn';
      b.type = 'button';
      b.textContent = p.label;
      b.dataset.id = p.id;
      b.addEventListener('click', () => {
        const base = defaultState();
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
    const ev = (k) => s.evidence && s.evidence[k];

    const nameF = document.createElement('div');
    nameF.className = 'field';
    nameF.innerHTML = '<label for="s-name">Sector name</label><input class="text-in" id="s-name" maxlength="40">';
    const nameIn = nameF.querySelector('input');
    nameIn.value = s.name;
    nameIn.addEventListener('input', () => { s.name = nameIn.value || 'Sector'; s.basis = ''; buildSectorTabs(); update(); });

    const tierF = document.createElement('div');
    tierF.className = 'field';
    tierF.innerHTML = '<span class="lab">Tier</span>';
    tierF.append(segmented('s-tier', [['core', 'Core · weak link'], ['flex', 'Flex · substitutable']], () => s.tier, (v) => { s.tier = v; }, buildSectorTabs));

    ed.append(nameF, tierF);
    if (s.basis) {
      const b = document.createElement('div');
      b.className = 'basis';
      b.innerHTML = `<span class="pill info">Basis</span> ${esc(s.basis)} Settings come from published evidence where it exists, shown under each slider, rounded; the rest is judgement anchored on that evidence.`;
      ed.append(b);
    }
    ed.append(
      slider({ ev: ev('weight'), evKey: 'weight', id: 's-weight', label: 'Size', sym: 'share of GDP', min: 1, max: 40, step: 0.5, get: () => s.weight, set: (v) => (s.weight = v), fmt: (v) => `${v}% of GDP`, hint: 'Value added at the start. Core sectors’ combined share sets how much of the economy is Core.' }),
      slider({ ev: ev('f'), evKey: 'f', id: 's-f', label: 'Work AI can speed up today', sym: 'f₀', min: 0, max: 95, step: 1, get: () => s.f, set: (v) => { s.f = v; if (s.fmax < v) s.fmax = v; }, fmt: (v) => `${v}%`, hint: 'About 25% for physical and hands-on work, about 50% for knowledge work.' }),
      slider({ ev: ev('fmax'), evKey: 'fmax', id: 's-fmax', label: 'Work AI could ever speed up', sym: 'f_max', min: 0, max: 95, step: 1, get: () => s.fmax, set: (v) => (s.fmax = Math.max(v, s.f)), fmt: (v) => `${v}%`, hint: 'The ceiling as capability broadens (agents, some robotics). The rest stays human.' }),
      slider({ ev: ev('p'), evKey: 'p', id: 's-p', label: 'Real wealth vs arms race', sym: 'p', min: 0, max: 100, step: 1, get: () => s.p, set: (v) => (s.p = v), fmt: (v) => `${v}%`, hint: '0% = pure zero-sum competition · 100% = pure wealth creation.' }),
      slider({ ev: ev('eta'), evKey: 'eta', id: 's-eta', label: 'Review burden (slop)', sym: 'η', min: 0, max: 10, step: 0.1, get: () => s.eta, set: (v) => (s.eta = v), fmt: (v) => `${v.toFixed(1)} / 10`, hint: '0 = auto-verified · 2 = mostly checkable (code) · 5 = needs expert review · 7 = error-prone and costly to check · 10 = unverifiable.' }),
      slider({ ev: ev('gamma'), evKey: 'gamma', id: 's-gamma', label: 'Exposure to spam, fraud and attack', sym: 'γ', min: 0, max: 40, step: 0.1, get: () => s.gamma, set: (v) => (s.gamma = v), fmt: (v) => `${v.toFixed(1)} / 10`, hint: '0 = air-gapped · 4 = targeted attacks · 7 = prime fraud target · 9 = flooded with bots · above 10 = crisis scenario.' }),
      slider({ ev: ev('gmax'), evKey: 'gmax', id: 's-gmax', label: 'Rebuilding ceiling', sym: 'g_max', min: 0, max: 90, step: 1, get: () => s.gmax, set: (v) => (s.gmax = v), fmt: (v) => `${v}%`, hint: 'How much of the remaining bottleneck can be removed by rebuilding around AI: plant, equipment, sites, systems, rules, contracts and roles.' }),
      slider({ ev: ev('Tcrit'), evKey: 'Tcrit', id: 's-tcrit', label: 'Rebuilding midpoint', sym: 'T_crit', min: 0.5, max: 30, step: 0.5, get: () => s.Tcrit, set: (v) => (s.Tcrit = v), fmt: (v) => `${v}×`, hint: 'How much better than today AI must be before half the rebuilding is worth the cost.' }),
      slider({ ev: ev('alpha'), evKey: 'alpha', id: 's-alpha', label: 'Rebuilding speed', sym: 'α', min: 5, max: 30, step: 1, get: () => s.alpha, set: (v) => (s.alpha = v), fmt: (v) => `${v}% of gap/yr`, hint: 'How fast the sector closes the gap to the rebuilding worth doing. Slow where capital is long-lived, sites are fixed and rules, contracts and habits change slowly.' })
    );
  }

  $('add-sector').addEventListener('click', () => {
    if (state.sectors.length >= MAX_SECTORS) return;
    state.sectors.push({ name: 'New sector', tier: 'flex', weight: 10, f: 40, fmax: 70, p: 75, eta: 3, gamma: 5, gmax: 40, Tcrit: 3, alpha: 12, rd: false, basis: '' });
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
    state = defaultState();
    rebuildAll();
  });

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
    for (let e = 0; e <= 12; e++) [1, 2, 5].forEach((m) => c.push(m * Math.pow(10, e)));
    let t = c.filter((v) => v >= lo * 0.999 && v <= hi * 1.001);
    if (t.length > 7) t = t.filter((v) => /^1/.test(String(v)));
    return t.length >= 2 ? t : [lo, hi];
  }
  const tickFmtX = (v) => (v >= 1e4 ? '1e' + Math.round(Math.log10(v)) : String(v)) + '×';

  /**
   * lineChart(el, opts)
   * opts: { xs, series: [{name, color, ys, width, dash, label}], band: {lo, hi, color, name}, xLog, yLog, xFmt, yFmt,
   *         tipX, tipExtra, yFloor, yCeil, baseline, baselineLabel, height, marker, markerLabel, directLabels, aria }
   */
  function lineChart(el, o) {
    const W = Math.max(280, el.clientWidth || 600);
    const H = o.height || 260;
    const m = { l: 48, r: o.directLabels ? 112 : 14, t: o.yLabel ? 26 : 10, b: 28 };
    const iw = W - m.l - m.r, ih = H - m.t - m.b;
    const xs = o.xs;
    const allY = o.series.flatMap((s) => s.ys).concat(o.band ? o.band.lo.concat(o.band.hi) : []).filter(Number.isFinite);
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
      if (o.yCeil != null && yhi > o.yCeil) yhi = o.yCeil;
      yt = yt.filter((v) => v >= ylo - 1e-9 && v <= yhi + 1e-9);
    }
    const xlo = xs[0], xhi = xs[xs.length - 1];
    const X = o.xLog ? (v) => m.l + (Math.log(v) - Math.log(xlo)) / (Math.log(xhi) - Math.log(xlo)) * iw : (v) => m.l + (v - xlo) / (xhi - xlo || 1) * iw;
    const Yr = o.yLog ? (v) => m.t + ih - (Math.log(v) - Math.log(ylo)) / (Math.log(yhi) - Math.log(ylo)) * ih : (v) => m.t + ih - (v - ylo) / (yhi - ylo || 1) * ih;
    const Y = (v) => Yr(o.yLog ? Math.max(ylo, v) : v);
    const xt = o.xLog ? logTicks(xlo, xhi) : niceTicks(xlo, xhi, Math.max(3, Math.min(8, Math.floor(iw / 70))));

    const grid = css('--grid'), muted = css('--muted'), ink2 = css('--ink-2'), surface = css('--panel'), ink = css('--ink');
    let s = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(o.aria || '')}">`;
    if (o.yLabel) s += `<text x="4" y="12" font-size="11.5" fill="${ink2}">${esc(o.yLabel)}</text>`;
    yt.forEach((v) => {
      s += `<line x1="${m.l}" x2="${m.l + iw}" y1="${Y(v)}" y2="${Y(v)}" stroke="${grid}" stroke-width="1"/>`;
      s += `<text x="${m.l - 8}" y="${Y(v) + 4}" text-anchor="end" font-size="11" fill="${muted}" font-family="var(--font-mono)">${o.yFmt(v)}</text>`;
    });
    if (o.band) {
      const up = o.band.hi.map((y, i) => `${i ? 'L' : 'M'}${X(xs[i]).toFixed(1)},${Y(y).toFixed(1)}`).join('');
      const dn = o.band.lo.map((y, i) => [X(xs[i]).toFixed(1), Y(y).toFixed(1)]).reverse().map(([a, b]) => `L${a},${b}`).join('');
      s += `<path d="${up}${dn}Z" fill="${o.band.color}" opacity="0.16"/>`;
    }
    if (o.baseline != null && o.baseline >= ylo && o.baseline <= yhi) {
      s += `<line x1="${m.l}" x2="${m.l + iw}" y1="${Y(o.baseline)}" y2="${Y(o.baseline)}" stroke="${ink2}" stroke-width="1" stroke-dasharray="3 3" opacity="0.7"/>`;
      s += `<text x="${m.l + iw - 4}" y="${Y(o.baseline) + 14}" text-anchor="end" font-size="10.5" fill="${muted}">${o.baselineLabel || 'baseline'}</text>`;
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
    const order = o.series.map((_, i) => i).sort((a, b) => (o.series[a].width || 2) - (o.series[b].width || 2));
    order.forEach((k) => {
      const se = o.series[k];
      const d = se.ys.map((y, i) => `${i ? 'L' : 'M'}${X(xs[i]).toFixed(1)},${Y(y).toFixed(1)}`).join('');
      s += `<path d="${d}" fill="none" stroke="${surface}" stroke-width="${(se.width || 2) + 2}" stroke-linejoin="round" stroke-linecap="round"/>`;
      s += `<path d="${d}" fill="none" stroke="${se.color}" stroke-width="${se.width || 2}" stroke-linejoin="round" stroke-linecap="round" ${se.dash ? `stroke-dasharray="${se.dash}"` : ''}/>`;
      const ly = se.ys[se.ys.length - 1];
      s += `<circle cx="${X(xs[xs.length - 1])}" cy="${Y(ly)}" r="3.5" fill="${se.color}" stroke="${surface}" stroke-width="2"/>`;
    });
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
      const rows = o.series.map((se) => ({ se, v: se.ys[best] })).sort((a, b) => b.v - a.v);
      tip.innerHTML = `<div class="h">${o.tipX(xs[best], best)}</div>` + rows.map(({ se, v }) => `<div class="r"><i style="background:${se.color}"></i><span>${esc(se.name)}</span><b>${o.yFmt(v, true)}</b></div>`).join('') +
        (o.band ? `<div class="r"><i style="background:${o.band.color};opacity:.35;height:8px"></i><span>${esc(o.band.name || '10–90% range')}</span><b>${o.yFmt(o.band.lo[best], true)}–${o.yFmt(o.band.hi[best], true)}</b></div>` : '') +
        (o.tipExtra ? o.tipExtra(best) : '');
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

  function legend(el, items) {
    el.innerHTML = items.map((it) => it.band
      ? `<span><i style="background:${it.color};opacity:.35;height:10px;width:14px"></i>${esc(it.name)}</span>`
      : `<span><i class="${it.dash ? 'dash' : ''}" style="${it.dash ? `color:${it.color}` : `background:${it.color}`}"></i>${esc(it.name)}</span>`).join('');
  }

  // ---------------- Monte Carlo (fixed settings; debounced, cached, computed in small batches) ----------------
  let mcCache = { key: null, data: null }, mcTimer = 0, mcJob = 0, mcProgress = null;
  function mcKey() { const s = Object.assign({}, state); delete s.sel; delete s.preset; return JSON.stringify(s); }
  function scheduleMC() {
    clearTimeout(mcTimer);
    mcJob++;
    mcProgress = null;
    const key = mcKey();
    if (mcCache.key === key) return;
    const job = mcJob;
    mcTimer = setTimeout(() => {
      const { runs, spread, corr } = M.MC;
      const snap = M.withBeta(JSON.parse(JSON.stringify(state)));
      const r = M.rng(20261121);
      const acc = { Vmacro: [], T: [] };
      let done = 0;
      const step = () => {
        if (job !== mcJob) return; // superseded by a newer change
        const t0 = performance.now();
        while (done < runs && performance.now() - t0 < 30) {
          const o = M.mcRun(snap, r, spread, corr);
          acc.Vmacro.push(o.Vmacro); acc.T.push(o.T);
          done++;
        }
        mcProgress = { done, runs };
        if (done < runs) {
          const el = document.getElementById('mc-progress');
          if (el) el.textContent = `running uncertainty ${done}/${runs}…`;
          setTimeout(step, 0);
        } else {
          mcCache = { key, data: { Vmacro: M.summarise(acc.Vmacro), T: M.summarise(acc.T) } };
          mcProgress = null;
          render();
        }
      };
      step();
    }, 200);
  }
  function currentMC() { return mcCache.key === mcKey() ? mcCache.data : null; }
  const mcPending = () => `<span id="mc-progress">running uncertainty${mcProgress ? ` ${mcProgress.done}/${mcProgress.runs}` : ''}…</span>`;

  // ---------------- Rendering ----------------
  let lastRows = null;

  function kpi(label, value, delta, cls) {
    return `<div class="kpi"><span class="eyebrow">${label}</span><span class="v">${value}</span><span class="d ${cls || ''}">${delta}</span></div>`;
  }

  function render() {
    const rows = M.simulate(state);
    lastRows = rows;
    const mc = currentMC();
    const xs = rows.map((r) => r.year);
    const last = rows[rows.length - 1];
    const startY = state.startYear;
    const yrFmt = (v) => String(Math.round(v));
    const L = rows.length - 1;
    const tg = M.FIXED.trendGrowth;

    // KPIs
    const best = last.sectors.map((s, i) => ({ s, i })).sort((a, b) => b.s.V - a.s.V);
    const worst = best[best.length - 1];
    const head = mc ? mc.Vmacro.p50[L] : last.Vmacro;
    const annual = Math.pow(head, 1 / Math.max(1, last.t)) - 1;
    const gdpTxt = ` · GDP ${fx(head * last.trend)} its ${startY} level, against ${fx(last.trend)} without further AI`;
    const econSub = mc
      ? `times what output would be without further AI · median of ${M.MC.runs} runs · adds ${(annual * 100).toFixed(1)}%/yr · 80% range ${fx(mc.Vmacro.p10[L])}–${fx(mc.Vmacro.p90[L])}${gdpTxt}`
      : `times what output would be without further AI · central run · adds ${(annual * 100).toFixed(1)}%/yr${gdpTxt} · ${mcPending()}`;
    $('kpis').innerHTML =
      kpi(`Output vs no further AI, ${last.year}`, fx(head), econSub, head >= 1 ? 'good' : 'bad') +
      kpi(`Useful AI work ${last.year}`, fx(mc ? mc.T.p50[L] : last.T), `${mc ? `median · 80% range ${fx(mc.T.p10[L])}–${fx(mc.T.p90[L])} · ` : ''}growth now ${(last.growth * 100).toFixed(1)}%/yr`) +
      kpi('Core infrastructure', fx(last.Vcore), !last.hasC ? 'No Core sectors' : last.Vcore < 1 ? 'Below baseline: braking AI progress' : 'Above baseline: no brake', !last.hasC || last.Vcore >= 1 ? 'good' : 'bad') +
      kpi('Weakest sector', fx(worst.s.V), esc(state.sectors[worst.i].name), worst.s.V >= 1 ? '' : 'bad') +
      kpi('Tasks done with AI', pc(last.automationFixed), `of ${startY}'s work (${pc(rows[0].automationFixed)} in ${startY})`) +
      kpi('AI-native products', pc(last.newShare), `of the economy in ${last.year}`);

    // Chart 1: GDP with and without further AI (start year = 1, both include trend growth)
    const c = [css('--s1'), css('--s2'), css('--s3')];
    const tr = rows.map((r) => r.trend);
    const ser = [
      { name: 'With AI, whole economy (central run)', label: 'With AI', color: c[0], ys: rows.map((r, i) => r.Vmacro * tr[i]), width: 3 },
      { name: 'With AI, Core sectors', label: 'Core', color: c[1], ys: rows.map((r, i) => r.Vcore * tr[i]), width: 2 },
      { name: 'With AI, Flex sectors', label: 'Flex', color: c[2], ys: rows.map((r, i) => r.Vflex * tr[i]), width: 2 },
      { name: `Without further AI (${tg.toFixed(1)}%/yr trend)`, label: 'No further AI', color: css('--ink-2'), ys: tr.slice(), width: 2, dash: '6 4' },
    ].filter((se) => se.ys.every(Number.isFinite));
    if (mc) ser.push({ name: 'With AI, median of runs', label: 'Median', color: c[0], ys: mc.Vmacro.p50.map((v, i) => v * tr[i]), width: 1.5, dash: '2 3' });
    const band = mc ? { lo: mc.Vmacro.p10.map((v, i) => v * tr[i]), hi: mc.Vmacro.p90.map((v, i) => v * tr[i]), color: c[0], name: 'With AI, 80% range' } : null;
    $('c1-title').textContent = 'GDP with and without further AI';
    $('c1-sub').textContent = `Real GDP, ${startY} = 1. Both worlds grow ${tg.toFixed(1)}% a year from everything except AI, the current average for advanced economies (IMF). The gap is what AI adds.`;
    legend($('c1-legend'), ser.concat(band ? [{ name: 'With AI, 80% range', color: c[0], band: true }] : []));
    lineChart($('c1'), {
      xs, series: ser, band, xFmt: yrFmt, yFmt: (v, t) => (t ? fx(v) : v.toFixed(v < 10 ? 1 : 0) + '×'), baseline: 1, baselineLabel: `${startY} level`, yLabel: `GDP, ${startY} = 1`,
      tipX: (x, i) => `${x} · with AI ${fx(rows[i].Vmacro)} of no further AI · T = ${fx(rows[i].T)}`, height: 300, directLabels: true, aria: 'GDP with and without further AI over time',
    });

    // Chart 2: T over time (log)
    $('c2-title').textContent = 'Useful AI work, T';
    $('c2-sub').textContent = 'Multiple of end-2026 verified work per £ (log scale).';
    const tBand = mc ? { lo: mc.T.p10, hi: mc.T.p90, color: css('--s7'), name: '80% range' } : null;
    legend($('c2-legend'), tBand ? [{ name: 'Useful AI work', color: css('--s7') }, { name: '80% range', color: css('--s7'), band: true }] : []);
    lineChart($('c2'), {
      xs, series: [{ name: 'Useful AI work', color: css('--s7'), ys: rows.map((r) => r.T), width: 2.5 }], band: tBand,
      yLog: true, xFmt: yrFmt, yFmt: (v, t) => (t ? fx(v) : tickFmtX(v)),
      tipX: (x) => String(x), height: 240, aria: 'Useful AI work over time',
      tipExtra: (i) => `<div class="r"><i></i><span>growth next yr</span><b>${(rows[i].growth * 100).toFixed(1)}%</b></div>`,
    });

    // Chart 3: sector V
    const sser = state.sectors.map((s, i) => ({ name: s.name, color: seriesColor(i), ys: rows.map((r) => r.sectors[i].V), width: i === state.sel ? 3 : 2 }));
    $('c3-title').textContent = 'Sector output vs no further AI';
    $('c3-sub').textContent = 'Each sector after bottlenecks, arms races and slop. Below 1.0 means AI made the sector worse off.';
    legend($('c3-legend'), sser);
    lineChart($('c3'), { xs, series: sser, xFmt: yrFmt, yFmt: (v, t) => (t ? fx(v) : v.toFixed(1) + '×'), baseline: 1, baselineLabel: 'no further AI', yLabel: '× sector output without further AI', tipX: (x) => String(x), height: 240, aria: 'Sector output over time' });

    // Chart 4: rebuilding around AI
    const gser = state.sectors.map((s, i) => ({ name: s.name, color: seriesColor(i), ys: rows.map((r) => r.sectors[i].g * 100), width: i === state.sel ? 3 : 2 }));
    legend($('c4-legend'), gser);
    lineChart($('c4'), { xs, series: gser, xFmt: yrFmt, yFmt: (v) => Math.round(v) + '%', yFloor: 0, tipX: (x, i) => `${x} · T = ${fx(rows[i].T)}`, height: 220, aria: 'Rebuilding around AI over time' });

    // Chart 5: spending shares (Baumol)
    const shser = state.sectors.map((s, i) => ({ name: s.name, color: seriesColor(i), ys: rows.map((r) => r.shares[i] * 100), width: i === state.sel ? 3 : 2 }));
    if (state.Nmax > 0) shser.push({ name: 'AI-native products', color: css('--s7'), ys: rows.map((r) => r.newShare * 100), width: 2, dash: '5 4' });
    $('c5-sub').textContent = 'Share of total spending. When sectors are complements, spending shifts toward the ones AI speeds up least (the Baumol effect).';
    legend($('c5-legend'), shser);
    lineChart($('c5'), { xs, series: shser, xFmt: yrFmt, yFmt: (v, t) => (t ? v.toFixed(1) + '%' : Math.round(v) + '%'), yFloor: 0, tipX: (x) => String(x), height: 240, aria: 'Spending shares over time' });

    // Chart 6: tasks done with AI
    const aser = [{ name: `Whole economy (${startY} mix of work)`, color: css('--s1'), ys: rows.map((r) => r.automationFixed * 100), width: 2.5 }];
    state.sectors.forEach((s, i) => { if (i === state.sel) aser.push({ name: s.name, color: seriesColor(i), ys: rows.map((r) => (1 - r.sectors[i].eps) * 100), width: 2, dash: '2 3' }); });
    $('c6-sub').textContent = 'Share of work time AI handles, weighted by the starting economy. A task measure, not a forecast of jobs or wages.';
    legend($('c6-legend'), aser);
    lineChart($('c6'), { xs, series: aser, xFmt: yrFmt, yFmt: (v, t) => (t ? v.toFixed(1) + '%' : Math.round(v) + '%'), yFloor: 0, yCeil: 100, tipX: (x) => String(x), height: 240, aria: 'Tasks done with AI over time' });

    sectorStatus(last, `in ${last.year}`);
    renderTable(rows);
  }

  function sectorStatus(snap, when) {
    const s = snap.sectors[state.sel];
    const cfg = state.sectors[state.sel];
    if (!s) { $('sector-status').innerHTML = ''; return; }
    const pills = [];
    const fitTxt = s.fAvail - s.f > 0.005 ? `AI used for ${pc(s.f)} of the ${pc(s.fAvail)} it can do` : `AI used for ${pc(s.f)}`;
    pills.push(`<span class="pill info">${when}: output ≈ ${fx(s.V)} · speedup ≈ ${fx(s.S)} · ${fitTxt} · rebuilt ${pc(s.g)}</span>`);
    if (s.capped) pills.push(`<span class="pill warn">Holding back at its Slop Peak (${fx(s.Tstar)})</span>`);
    if (s.V < 1) pills.push(`<span class="pill crit">Below baseline</span>`);
    else if (s.V >= 2) pills.push(`<span class="pill good">More than doubled</span>`);
    const P = M.sectorParams(cfg);
    if (P.p < 0.5 && s.slop > 0 && P.p <= s.slop * (1 - P.p)) pills.push(`<span class="pill warn">Arms-race regime: any further speedup lowers this sector's value</span>`);
    $('sector-status').innerHTML = pills.join('');
  }

  function cls(v) { return v < 1 ? 'lo' : ''; }
  function renderTable(rows) {
    $('tbl-title').textContent = 'Year by year';
    const names = state.sectors.map((s) => esc(s.name));
    let h = '<thead><tr><th>Year</th><th>T</th><th>V core</th><th>V flex</th><th>New products</th><th>Whole economy (× no further AI)</th><th>GDP with AI (' + state.startYear + ' = 1)</th><th>GDP without further AI</th><th>Tasks done with AI</th>' + names.map((n) => `<th>${n}</th>`).join('') + '</tr></thead><tbody>';
    rows.forEach((r) => {
      h += `<tr><td>${r.year}</td><td>${fx(r.T).replace('×', '')}</td><td class="${cls(r.Vcore)}">${f2(r.Vcore)}</td><td class="${cls(r.Vflex)}">${f2(r.Vflex)}</td>` +
        `<td>${f2(r.newGoods)}</td><td class="${cls(r.Vmacro)}"><b>${f2(r.Vmacro)}</b></td><td>${f2(r.gdp)}</td><td>${f2(r.gdpNoAI)}</td><td>${pc(r.automationFixed)}</td>` +
        r.sectors.map((s) => `<td class="${cls(s.V)}">${f2(s.V)}</td>`).join('') + '</tr>';
    });
    $('tbl').innerHTML = h + '</tbody>';
  }

  function toCSV() {
    const q = (s) => `"${String(s).replace(/"/g, '""')}"`;
    const n = (v) => (typeof v === 'number' ? +v.toPrecision(6) : v);
    const head = ['year', 'T', 'V_core', 'V_flex', 'new_products', 'V_macro_vs_no_further_AI', 'gdp_with_ai', 'gdp_without_further_ai', 'tasks_done_with_ai'].concat(state.sectors.flatMap((s) => [`V ${s.name}`, `rebuilt ${s.name}`, `ai_in_use ${s.name}`, `spending_share ${s.name}`]));
    const lines = lastRows.map((r) => [r.year, r.T, r.Vcore, r.Vflex, r.newGoods, r.Vmacro, r.gdp, r.gdpNoAI, r.automationFixed].concat(r.sectors.flatMap((s, i) => [s.V, s.g, s.f, r.shares[i]])).map(n).join(','));
    return [head.map(q).join(',')].concat(lines).join('\n');
  }
  $('copy-csv').addEventListener('click', () => {
    const text = toCSV();
    const btn = $('copy-csv');
    const done = (msg) => { btn.textContent = msg; setTimeout(() => (btn.textContent = 'Copy as CSV'), 1600); };
    function fallback() {
      const ta = document.createElement('textarea');
      ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); done('Copied'); } catch (e) { done('Copy failed'); }
      ta.remove();
    }
    try { navigator.clipboard.writeText(text).then(() => done('Copied'), fallback); } catch (e) { fallback(); }
  });

  // ---------------- Orchestration ----------------
  let raf = 0;
  function update() {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => { render(); save(); scheduleMC(); });
  }

  function renderSources() {
    const el = $('sources-list');
    if (!el) return;
    el.innerHTML = Object.keys(M.SOURCES).map((k) => `<li><a href="${M.SOURCES[k].u}" target="_blank" rel="noopener">${esc(M.SOURCES[k].t)}</a></li>`).join('');
  }

  function rebuildAll() {
    if (state.sel >= state.sectors.length) state.sel = 0;
    buildGlobalControls();
    buildPresets();
    renderSources();
    buildSectorTabs();
    buildSectorEditor();
    update();
  }

  let lastW = 0;
  new ResizeObserver(() => {
    const w = document.querySelector('.results').clientWidth;
    if (Math.abs(w - lastW) > 4) { lastW = w; update(); }
  }).observe(document.querySelector('.results'));
  try { matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { buildSectorTabs(); update(); }); } catch (e) { /* old browser */ }
  new MutationObserver(() => { buildSectorTabs(); update(); }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  rebuildAll();
})();
