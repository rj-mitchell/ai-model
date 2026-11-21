/* AI Transformation Model — UI layer (v3). Depends on model.js (window.AIModel). */
(function () {
  'use strict';
  const M = window.AIModel;
  const $ = (id) => document.getElementById(id);
  const STORE_KEY = 'ai-transformation-model:v6';
  const MAX_SECTORS = 8;

  // ---------------- Default economy (the conversation's 6-sector example) ----------------
  // UI units: f, fmax, p, g, gmax in %; eta, gamma on 0–10 (÷20); Tcrit in ×; alpha in %/yr.
  function sec(name, tier, weight, f, fmax, p, eta, gamma, g, gmax, Tcrit, alpha, deploy, rd) {
    return { name, tier, weight, f, fmax, p, eta, gamma, g, gmax, Tcrit, alpha, deploy, rd: !!rd };
  }
  function defaultSectors() {
    return [
      sec('Energy & Grid', 'core', 35, 20, 45, 100, 0.2, 0.2, 20, 20, 10, 15, 'private'),
      sec('Healthcare', 'core', 35, 25, 55, 95, 1.0, 0.4, 35, 35, 15, 10, 'private'),
      sec('Banking & Payments', 'core', 30, 60, 90, 70, 0.8, 1.0, 50, 50, 3, 15, 'private'),
      sec('Software & R&D', 'flex', 40, 70, 95, 90, 0.4, 0.2, 60, 60, 1, 30, 'private', true),
      sec('Corporate Law', 'flex', 30, 60, 85, 15, 2.0, 2.0, 40, 40, 3, 15, 'commons'),
      sec('Ad-Tech & Media', 'flex', 30, 80, 95, 10, 3.0, 3.0, 50, 50, 1.5, 25, 'commons'),
    ];
  }
  function defaultState() {
    return {
      mode: 'dynamic', years: 15, startYear: 2026,
      r0: 25, phi: 0.4, Thalf: 15, growthCap: 200,
      Tstatic: 20, Wcore: 60, fragility: 5,
      // extensions (each has a neutral value that switches it off)
      beta: 0.1, dEta: 0.1, dGamma: 0.1, cfx: 1.5, kappa: 1,
      adopt0: 30, adoptSpeed: 25, aiNow: 2,
      Nmax: 10, Tnew: 10, newSpeed: 15,
      hmax: 0, Trisk: 30, loss: 100,
      setbackYear: 0, setbackSize: 0,
      spread: 25, runs: 150, corr: 50,
      sectors: defaultSectors(), sel: 3, preset: 'dyn-base',
    };
  }

  // ---------------- Presets ----------------
  const PRESETS = {
    dynamic: [
      { id: 'dyn-base', label: 'Baseline', apply: (s) => s },
      { id: 'dyn-rsi', label: 'Strong AI R&D feedback', apply: (s) => Object.assign(s, { r0: 40, phi: 1, Thalf: 30 }) },
      { id: 'dyn-explosive', label: 'Fast takeoff', apply: (s) => { Object.assign(s, { r0: 50, phi: 1, Thalf: 50, beta: 0.4, dEta: 0.4, dGamma: 0.4, Nmax: 50, adoptSpeed: 40, Tnew: 15, years: 25 }); return s; } },
      { id: 'dyn-cyber', label: 'Cyber-slop on Banking', apply: (s) => { s.sectors[2].gamma = 10; return s; } },
      { id: 'dyn-winter', label: 'AI setback in 2030', apply: (s) => Object.assign(s, { setbackYear: 2030, setbackSize: 60 }) },
      { id: 'dyn-slow', label: 'Slow institutions', apply: (s) => { s.sectors.forEach((x) => { x.alpha = Math.max(5, Math.round(x.alpha / 2)); x.Tcrit = Math.min(30, x.Tcrit * 2 + 1); }); return s; } },
      { id: 'dyn-learn', label: 'Institutions learn to fight slop', apply: (s) => Object.assign(s, { dEta: 0.4, dGamma: 0.4 }) },
      { id: 'dyn-risk', label: 'High catastrophe risk', apply: (s) => Object.assign(s, { hmax: 5, Trisk: 20, loss: 100 }) },
    ],
    static: [
      { id: 'st-r1', label: 'Near-term 4×, no redesign', apply: (s) => { s.Tstatic = 4; s.sectors.forEach((x) => { x.g = 0; }); return s; } },
      { id: 'st-r2', label: 'Redesign wave 20×', apply: (s) => { s.Tstatic = 20; return s; } },
      { id: 'st-r3', label: 'Cyber-slop shock 20×', apply: (s) => { s.Tstatic = 20; s.sectors[2].gamma = 10; return s; } },
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
  const fx = (v, d = 2) => (!Number.isFinite(v) ? '–' : v >= 1e5 ? v.toExponential(1).replace('e+', 'e') + '×' : v >= 100 ? v.toFixed(0) + '×' : v >= 10 ? v.toFixed(1) + '×' : v.toFixed(d) + '×');
  const f2 = (v) => (Number.isFinite(v) ? v.toFixed(2) : '–');
  const pct = (v) => (v >= 0 ? '+' : '−') + Math.abs(v * 100).toFixed(0) + '%';
  const pc = (v, d = 0) => (v * 100).toFixed(d) + '%';
  const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const seriesColor = (i) => css('--s' + ((i % 8) + 1));
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // ---------------- Control builders ----------------
  function touched() { state.preset = null; markPresets(); update(); }

  function slider(o) {
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
      if (o.after) o.after();
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

  function todaySliders() {
    return [
      slider({ id: 'g-ainow', label: 'Speedup from today\'s AI', sym: 'A', min: 1, max: 5, step: 0.1, get: () => state.aiNow, set: (v) => (state.aiNow = v), fmt: (v) => `${v.toFixed(1)}× faster`, hint: 'How much faster end-2026 AI does the work it is already used for, compared with doing it without AI. This is what adoption and redesign catch up on, even if AI stops improving. 1 = no gain from catching up.' }),
      slider({ id: 'g-adopt0', label: 'Native fit already in use', sym: 'a₀', min: 0, max: 100, step: 5, get: () => state.adopt0, set: (v) => (state.adopt0 = v), fmt: (v) => `${v}% of f₀ in 2026`, hint: 'How much of the work AI could already do is actually done with AI at end-2026. 30% puts about 15% of all tasks on AI, close to published estimates for chatbots without purpose-built tools.' })
    ];
  }

  function buildGlobalControls() {
    const dyn = state.mode === 'dynamic';
    const host = $('controls');
    host.innerHTML = '';
    if (dyn) {
      const g = group(host, 'AI progress over time', true);
      g.append(
        slider({ id: 'g-years', label: 'Years to simulate', min: 5, max: 60, step: 1, get: () => state.years, set: (v) => (state.years = v), fmt: (v) => `${v} yrs · to ${state.startYear + v}` }),
        slider({ id: 'g-r0', label: 'Baseline AI progress', sym: 'r₀', min: 5, max: 60, step: 1, get: () => state.r0, set: (v) => (state.r0 = v), fmt: (v) => `${v}%/yr`, hint: 'Annual growth in useful AI work in year one, before feedbacks.' }),
        slider({ id: 'g-phi', label: 'AI R&D feedback', sym: 'φ', min: 0, max: 1, step: 0.05, get: () => state.phi, set: (v) => (state.phi = v), fmt: (v) => v.toFixed(2), hint: '0 = no recursive self-improvement · 0.5 = modest · 1 = strong.' }),
        slider({ id: 'g-thalf', label: 'Diminishing returns midpoint', sym: 'T_half', min: 5, max: 50, step: 1, get: () => state.Thalf, set: (v) => (state.Thalf = v), fmt: (v) => `${v}×`, hint: 'Where data, energy and algorithmic drag halve annual progress. Growth slows past it but never stops.' }),
        slider({ id: 'g-cap', label: 'Speed limit on AI progress', sym: 'cap', min: 50, max: 500, step: 10, get: () => state.growthCap, set: (v) => (state.growthCap = v), fmt: (v) => `${v}%/yr · ${(1 + v / 100).toFixed(1)}× a year`, hint: 'Compute, chips and energy can only be built so fast. Growth in useful AI work bends smoothly toward this ceiling; well below it, it has no effect.' })
      );
      const ad = group(host, 'Adoption', true);
      ad.append(
        ...todaySliders(),
        slider({ id: 'g-adoptspeed', label: 'Adoption speed', sym: 'λ', min: 5, max: 60, step: 1, get: () => state.adoptSpeed, set: (v) => (state.adoptSpeed = v), fmt: (v) => `${v}% of gap/yr`, hint: 'How fast organisations start using AI for work it can already do. Separate from workflow redesign, which is slower.' })
      );
    } else {
      const g = group(host, 'Snapshot', true);
      g.append(slider({ id: 'g-T', label: 'Useful AI work vs end-2026', sym: 'T', min: 1, max: 100, log: true, get: () => state.Tstatic, set: (v) => (state.Tstatic = v), fmt: (v) => fx(v), hint: '1× = end-2026 baseline · 10× = ten times the verified work per £ · 100× = transformative.' }));
      g.append(...todaySliders());
    }

    const ec = group(host, 'Economy structure', true);
    ec.append(
      slider({ id: 'g-wcore', label: 'Core share of economy', sym: 'W_core', min: 20, max: 80, step: 1, get: () => state.Wcore, set: (v) => (state.Wcore = v), fmt: (v) => `${v}% · flex ${100 - v}%`, hint: 'Core carries this share of any change in the total economy.' }),
      slider({ id: 'g-frag', label: 'Core weak-link fragility', sym: 'ρ = 1 − x', min: 0, max: 10, step: 0.5, get: () => state.fragility, set: (v) => (state.fragility = v), fmt: (v) => `${v.toFixed(1)} · ρ = ${(1 - v).toFixed(1)}`, hint: '0 = normal average · 5 = Jones–Tonetti weak links · 10 = extreme O-ring.' })
    );
    {
      ec.append(
        slider({ id: 'g-cfx', label: 'Core–Flex complementarity', sym: 'ρ_m = 1 − x', min: 0, max: 3, step: 0.1, get: () => state.cfx, set: (v) => (state.cfx = v), fmt: (v) => `${v.toFixed(1)} · σ = ${(1 / v).toFixed(2).replace('Infinity', '∞')}`, hint: '0 = Core and Flex are substitutes · 1 = constant spending shares · above 1 = Baumol effect: spending shifts to the slower tier and the slow tier limits growth.' }),
        slider({ id: 'g-kappa', label: 'Flex dependence on Core', sym: 'κ', min: 0, max: 2, step: 0.1, get: () => state.kappa, set: (v) => (state.kappa = v), fmt: (v) => v.toFixed(1), hint: 'When Core falls below baseline, Flex output is scaled by V_core^κ (no power, no payments, no Flex). Has no effect while Core ≥ 1.' })
      );
    }

    const cap = group(host, 'Capability and slop', true);
    {
      cap.append(
        slider({ id: 'g-beta', label: 'Capability breadth', sym: 'β', min: 0, max: 1, step: 0.05, get: () => state.beta, set: (v) => (state.beta = v), fmt: (v) => v.toFixed(2), hint: 'How fast better AI expands native fit f toward each sector\'s ceiling f_max. 0 = fixed.' }),
        slider({ id: 'g-deta', label: 'Verification keeps pace', sym: 'δ_η', min: 0, max: 1, step: 0.05, get: () => state.dEta, set: (v) => (state.dEta = v), fmt: (v) => v.toFixed(2), hint: 'More reliable AI needs less human review: internal slop scales with T^−δ. 0 = off.' }),
        slider({ id: 'g-dgamma', label: 'Defensive AI', sym: 'δ_γ', min: 0, max: 1, step: 0.05, get: () => state.dGamma, set: (v) => (state.dGamma = v), fmt: (v) => v.toFixed(2), hint: 'Filters and fraud detection improve with AI too: ambient slop scales with T^−δ. 0 = off (attacks keep growing with T).' })
      );
    }

    if (dyn) {
      const fb = group(host, 'Shocks', true);
      {
        fb.append(
          slider({ id: 'g-sby', label: 'AI setback year', min: 2027, max: 2086, step: 1, get: () => state.setbackYear || 2030, set: (v) => (state.setbackYear = v), fmt: (v) => (state.setbackSize ? String(v) : `${v} (off)`) }),
          slider({ id: 'g-sbs', label: 'Setback size', min: 0, max: 90, step: 5, get: () => state.setbackSize, set: (v) => { state.setbackSize = v; if (v && !state.setbackYear) state.setbackYear = 2030; }, fmt: (v) => (v ? `T falls ${v}%` : 'none'), hint: 'Regulation, a compute crunch or an AI winter. Useful AI work drops once, then the loop resumes.', after: () => { const o = $('g-sby-out'); if (o) o.textContent = state.setbackSize ? String(state.setbackYear) : `${state.setbackYear} (off)`; } })
        );
      }
    }

    const np = group(host, 'New AI-native products', false);
    {
      np.append(
        slider({ id: 'g-nmax', label: 'Mature size', sym: 'N_max', min: 0, max: 100, step: 1, get: () => state.Nmax, set: (v) => (state.Nmax = v), fmt: (v) => `${v}% of 2026 economy`, hint: 'Value from goods and services that do not exist today. Pure judgement: there is no data for this.' }),
        slider({ id: 'g-tnew', label: 'Midpoint', sym: 'T_new', min: 2, max: 50, step: 1, get: () => state.Tnew, set: (v) => (state.Tnew = v), fmt: (v) => `${v}×`, hint: 'Useful AI work at which the new sector reaches half its mature size.' })
      );
      if (dyn) np.append(slider({ id: 'g-nspeed', label: 'Build-out speed', min: 5, max: 30, step: 1, get: () => state.newSpeed, set: (v) => (state.newSpeed = v), fmt: (v) => `${v}% of gap/yr` }));
    }

    if (dyn) {
      const rk = group(host, 'Catastrophic risk', false, 'Off by default: there is no agreed number. Set your own.');
      {
        rk.append(
          slider({ id: 'g-hmax', label: 'Annual risk at maturity', sym: 'h_max', min: 0, max: 20, step: 0.1, get: () => state.hmax, set: (v) => (state.hmax = v), fmt: (v) => (v ? `${v.toFixed(1)}%/yr` : 'off'), hint: 'Yearly chance of a catastrophe once AI is far past the midpoint below.' }),
          slider({ id: 'g-trisk', label: 'Risk midpoint', sym: 'T_risk', min: 2, max: 100, step: 1, get: () => state.Trisk, set: (v) => (state.Trisk = v), fmt: (v) => `${v}×`, hint: 'Useful AI work at which the yearly risk reaches half its maximum.' }),
          slider({ id: 'g-loss', label: 'Value lost in a catastrophe', min: 10, max: 100, step: 5, get: () => state.loss, set: (v) => (state.loss = v), fmt: (v) => `${v}%`, hint: '100% = everything lost. Used for the risk-adjusted value.' })
        );
      }
    }

    const un = group(host, 'Uncertainty', false);
    un.append(
      slider({ id: 'g-spread', label: 'Parameter uncertainty', min: 0, max: 60, step: 5, get: () => state.spread, set: (v) => (state.spread = v), fmt: (v) => (v ? `±${v}% (1σ)` : 'off'), hint: 'Every sector setting and AI dial is randomly varied by this much in each run. The shaded band shows the middle 80% of outcomes.' }),
      slider({ id: 'g-corr', label: 'Errors shared across sectors', min: 0, max: 100, step: 10, get: () => state.corr, set: (v) => (state.corr = v), fmt: (v) => `${v}%`, hint: '0% = each sector\'s settings are wrong independently, so errors cancel out. 100% = every sector is misjudged in the same direction, which widens the band.' }),
      slider({ id: 'g-runs', label: 'Simulation runs', min: 50, max: 400, step: 50, get: () => state.runs, set: (v) => (state.runs = v), fmt: (v) => String(v) })
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

    const nameF = document.createElement('div');
    nameF.className = 'field';
    nameF.innerHTML = '<label for="s-name">Sector name</label><input class="text-in" id="s-name" maxlength="40">';
    const nameIn = nameF.querySelector('input');
    nameIn.value = s.name;
    nameIn.addEventListener('input', () => { s.name = nameIn.value || 'Sector'; buildSectorTabs(); update(); });

    const tierF = document.createElement('div');
    tierF.className = 'field';
    tierF.innerHTML = '<span class="lab">Tier</span>';
    tierF.append(segmented('s-tier', [['core', 'Core · weak link'], ['flex', 'Flex · substitutable']], () => s.tier, (v) => { s.tier = v; }, buildSectorTabs));

    const depF = document.createElement('div');
    depF.className = 'field';
    depF.innerHTML = '<span class="lab">Deployment</span>';
    depF.append(segmented('s-deploy', [['private', 'Private · caps at Slop Peak'], ['commons', 'Commons · no cap']], () => s.deploy, (v) => (s.deploy = v)));

    ed.append(nameF, tierF, depF);
    ed.append(
      slider({ id: 's-weight', label: 'Weight within tier', sym: 'w̃', min: 1, max: 100, step: 1, get: () => s.weight, set: (v) => (s.weight = v), fmt: (v) => String(v), hint: 'Relative size in 2026. Normalised within Core or Flex.' }),
      slider({ id: 's-f', label: 'Native workflow fit today', sym: 'f₀', min: 0, max: 95, step: 1, get: () => s.f, set: (v) => { s.f = v; if (s.fmax < v) s.fmax = v; }, fmt: (v) => `${v}%`, hint: '20% ≈ physical or care work · 70% ≈ software and knowledge work. Capped at 95%.' })
    );
    ed.append(slider({ id: 's-fmax', label: 'Native fit ceiling', sym: 'f_max', min: 0, max: 95, step: 1, get: () => s.fmax, set: (v) => (s.fmax = Math.max(v, s.f)), fmt: (v) => `${v}%`, hint: 'The most of this workflow AI could ever compress, as capability broadens (agents, robotics).' }));
    ed.append(
      slider({ id: 's-p', label: 'Real wealth vs arms race', sym: 'p', min: 0, max: 100, step: 1, get: () => s.p, set: (v) => (s.p = v), fmt: (v) => `${v}%`, hint: '0% = pure zero-sum (HFT, SEO) · 100% = pure wealth creation.' }),
      slider({ id: 's-eta', label: 'Internal slop / review tax', sym: 'η = x/20', min: 0, max: 10, step: 0.1, get: () => s.eta, set: (v) => (s.eta = v), fmt: (v) => `${v.toFixed(1)} · η ${(v / 20).toFixed(3)}`, hint: '0 = auto-verified (compilers) · 2 = heavy review · 10 = unverifiable chaos.' }),
      slider({ id: 's-gamma', label: 'External spam / cyber exposure', sym: 'γ = x/20', min: 0, max: 10, step: 0.1, get: () => s.gamma, set: (v) => (s.gamma = v), fmt: (v) => `${v.toFixed(1)} · γ ${(v / 20).toFixed(3)}`, hint: '0 = air-gapped · 2 = exposed · 10 = public inbox or active attack.' })
    );
    if (dyn) {
      ed.append(
        slider({ id: 's-gmax', label: 'Redesign ceiling', sym: 'g_max', min: 0, max: 90, step: 1, get: () => s.gmax, set: (v) => (s.gmax = v), fmt: (v) => `${v}%`, hint: 'How much of the remaining bottleneck a full redesign can remove. Physical sectors ≲ 50%.' }),
        slider({ id: 's-tcrit', label: 'Redesign midpoint', sym: 'T_crit', min: 0.5, max: 30, step: 0.5, get: () => s.Tcrit, set: (v) => (s.Tcrit = v), fmt: (v) => `${v}×`, hint: 'Useful AI work at which the redesign target reaches half its ceiling. Below 1× means today\'s AI already justifies more than half the redesign (software, media); physical and regulated sectors sit well above 1×.' }),
        slider({ id: 's-alpha', label: 'Institutional catch-up speed', sym: 'α', min: 5, max: 30, step: 1, get: () => s.alpha, set: (v) => (s.alpha = v), fmt: (v) => `${v}% of gap/yr`, hint: 'How fast actual redesign closes the gap to its current target each year.' })
      );
      const rdF = document.createElement('div');
      rdF.className = 'field';
      rdF.innerHTML = `<span class="lab">AI R&amp;D feedback</span><label class="check"><input type="checkbox" id="s-rd"> This sector drives AI progress (V<sub>R&amp;D</sub>)</label>`;
      const cb = rdF.querySelector('input');
      cb.checked = !!s.rd;
      cb.addEventListener('change', () => { state.sectors.forEach((x) => (x.rd = false)); s.rd = cb.checked; touched(); });
      ed.append(rdF);
    } else {
      ed.append(slider({ id: 's-g', label: 'Workflow redesign', sym: 'g', min: 0, max: 90, step: 1, get: () => s.g, set: (v) => (s.g = v), fmt: (v) => `${v}%`, hint: '0% = legacy process · 50% = major re-wire · 90% = hard cap.' }));
    }
  }

  $('add-sector').addEventListener('click', () => {
    if (state.sectors.length >= MAX_SECTORS) return;
    state.sectors.push(sec('New sector', 'flex', 20, 50, 80, 80, 1, 1, 30, 30, 5, 15, 'private'));
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
    state.preset = mode === 'dynamic' ? 'dyn-base' : null;
    rebuildAll();
  });

  function setMode(m) { state.mode = m; state.preset = null; rebuildAll(); }
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
    const m = { l: 48, r: o.directLabels ? 112 : 14, t: 10, b: 28 };
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

  /** Horizontal bar chart of sector V (bar) with clean speedup S (tick). */
  function barChart(el, rows) {
    const W = Math.max(280, el.clientWidth || 600);
    const rowH = 34, m = { l: Math.min(150, W * 0.36), r: 64, t: 6, b: 26 };
    const H = m.t + m.b + rows.length * rowH;
    const iw = W - m.l - m.r;
    const hi = Math.max(1.2, ...rows.map((r) => Math.max(r.V, r.S))) * 1.05;
    const X = (v) => m.l + (v / hi) * iw;
    const ticks = niceTicks(0, hi, Math.max(3, Math.floor(iw / 70)));
    const grid = css('--grid'), muted = css('--muted'), ink = css('--ink'), ink2 = css('--ink-2');
    let s = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Sector net value and clean speedup">`;
    ticks.forEach((v) => {
      s += `<line x1="${X(v)}" x2="${X(v)}" y1="${m.t}" y2="${H - m.b}" stroke="${grid}"/>`;
      s += `<text x="${X(v)}" y="${H - 8}" text-anchor="middle" font-size="11" fill="${muted}" font-family="var(--font-mono)">${v}×</text>`;
    });
    rows.forEach((r, i) => {
      const y = m.t + i * rowH + 7, h = rowH - 14;
      const name = r.name.length > 22 ? r.name.slice(0, 21) + '…' : r.name;
      s += `<text x="${m.l - 10}" y="${y + h / 2 + 4}" text-anchor="end" font-size="12" fill="${ink2}">${esc(name)}</text>`;
      const x0 = X(0), x1 = X(r.V), w = Math.max(4, x1 - x0);
      s += `<path d="M${x0},${y} h${w - 4} a4,4 0 0 1 4,4 v${h - 8} a4,4 0 0 1 -4,4 h${-(w - 4)} z" fill="${r.color}"><title>${esc(r.name)}: net ${f2(r.V)}×, clean speedup ${f2(r.S)}×</title></path>`;
      s += `<line x1="${X(r.S)}" x2="${X(r.S)}" y1="${y - 3}" y2="${y + h + 3}" stroke="${ink}" stroke-width="2"/>`;
      s += `<text x="${Math.max(x1, X(r.S)) + 8}" y="${y + h / 2 + 4}" font-size="11.5" fill="${ink}" font-family="var(--font-mono)">${f2(r.V)}×</text>`;
    });
    s += `<line x1="${X(1)}" x2="${X(1)}" y1="${m.t}" y2="${H - m.b}" stroke="${ink2}" stroke-dasharray="3 3"/>`;
    s += `</svg>`;
    el.innerHTML = s;
  }

  function legend(el, items) {
    el.innerHTML = items.map((it) => it.band
      ? `<span><i style="background:${it.color};opacity:.35;height:10px;width:14px"></i>${esc(it.name)}</span>`
      : `<span><i class="${it.dash ? 'dash' : ''}" style="${it.dash ? `color:${it.color}` : `background:${it.color}`}"></i>${esc(it.name)}</span>`).join('');
  }

  // ---------------- Monte Carlo (debounced, cached, computed in small batches) ----------------
  let mcCache = { key: null, data: null }, mcTimer = 0, mcJob = 0, mcProgress = null;
  function mcKey() { const s = Object.assign({}, state); delete s.sel; delete s.preset; return JSON.stringify(s); }
  function scheduleMC() {
    clearTimeout(mcTimer);
    mcJob++;
    mcProgress = null;
    if (!state.spread) return;
    const key = mcKey();
    if (mcCache.key === key) return;
    const job = mcJob;
    mcTimer = setTimeout(() => {
      const runs = Math.round(state.runs), spread = state.spread / 100, corr = state.corr / 100;
      const snap = JSON.parse(JSON.stringify(state));
      const r = M.rng(20261121);
      if (snap.mode !== 'dynamic') {
        mcCache = { key, data: M.monteCarloSnapshot(snap, snap.Tstatic, runs, spread, 20261121, corr) };
        render();
        return;
      }
      const acc = { Vmacro: [], Vexp: [], T: [] };
      let done = 0;
      const step = () => {
        if (job !== mcJob) return; // superseded by a newer change
        const t0 = performance.now();
        while (done < runs && performance.now() - t0 < 30) {
          const o = M.mcRun(snap, r, spread, corr);
          acc.Vmacro.push(o.Vmacro); acc.Vexp.push(o.Vexp); acc.T.push(o.T);
          done++;
        }
        mcProgress = { done, runs };
        if (done < runs) {
          const el = document.getElementById('mc-progress');
          if (el) el.textContent = `running uncertainty ${done}/${runs}…`;
          setTimeout(step, 0);
        } else {
          mcCache = { key, data: { Vmacro: M.summarise(acc.Vmacro), Vexp: M.summarise(acc.Vexp), T: M.summarise(acc.T) } };
          mcProgress = null;
          render();
        }
      };
      step();
    }, 200);
  }
  function currentMC() { return state.spread && mcCache.key === mcKey() ? mcCache.data : null; }
  const mcPending = () => `<span id="mc-progress">running uncertainty${mcProgress ? ` ${mcProgress.done}/${mcProgress.runs}` : ''}…</span>`;

  // ---------------- Rendering ----------------
  let lastRows = null, lastSnap = null;

  function kpi(label, value, delta, cls) {
    return `<div class="kpi"><span class="eyebrow">${label}</span><span class="v">${value}</span><span class="d ${cls || ''}">${delta}</span></div>`;
  }

  function renderDynamic() {
    const rows = M.simulate(state);
    lastRows = rows; lastSnap = null;
    const mc = currentMC();
    const xs = rows.map((r) => r.year);
    const last = rows[rows.length - 1];
    const startY = state.startYear;
    const peak = rows.reduce((a, r) => (r.Vmacro > a.Vmacro ? r : a), rows[0]);
    const yrFmt = (v) => String(Math.round(v));
    const L = rows.length - 1;
    const risk = state.hmax > 0;

    // KPIs
    const best = last.sectors.map((s, i) => ({ s, i })).sort((a, b) => b.s.V - a.s.V);
    const worst = best[best.length - 1];
    const head = mc ? mc.Vmacro.p50[L] : last.Vmacro;
    const annual = Math.pow(head, 1 / Math.max(1, last.t)) - 1;
    const econSub = mc
      ? `median of ${Math.round(state.runs)} runs · ${(annual * 100).toFixed(1)}%/yr extra growth · 80% range ${fx(mc.Vmacro.p10[L])}–${fx(mc.Vmacro.p90[L])} · central run ${fx(last.Vmacro)}`
      : state.spread ? `central run · ${(annual * 100).toFixed(1)}%/yr extra growth · ${mcPending()}` : `central run · ${(annual * 100).toFixed(1)}%/yr extra growth`;
    $('kpis').innerHTML =
      kpi(`Economy in ${last.year}`, fx(head), econSub, head >= 1 ? 'good' : 'bad') +
      kpi(`Useful AI work ${last.year}`, fx(mc ? mc.T.p50[L] : last.T), `${mc ? `median · 80% range ${fx(mc.T.p10[L])}–${fx(mc.T.p90[L])} · ` : ''}growth now ${(last.growth * 100).toFixed(1)}%/yr${last.capped ? ' (at the speed limit)' : ''}`) +
      kpi('Core infrastructure', fx(last.Vcore), !last.hasC ? 'No Core sectors' : last.Vcore < 1 ? 'Below baseline: braking AI and Flex' : 'Above baseline: no brake', !last.hasC || last.Vcore >= 1 ? 'good' : 'bad') +
      kpi('Weakest sector', fx(worst.s.V), esc(state.sectors[worst.i].name), worst.s.V >= 1 ? '' : 'bad') +
      kpi('Tasks automated', pc(last.automationFixed), `of ${startY}'s work, now done by AI (${pc(rows[0].automationFixed)} in ${startY}) · ${pc(last.automation)} weighted by today's spending`) +
      (risk
        ? kpi(`Catastrophe by ${last.year}`, pc(last.pCat, 1), `risk-adjusted economy ${fx(last.Vexp)}`, last.pCat > 0.1 ? 'bad' : '')
        : kpi('New AI-native products', pc(last.newShare), `of the economy in ${last.year}`));

    // Chart 1: macro
    const c = [css('--s1'), css('--s2'), css('--s3')];
    const ser = [
      { name: 'Total economy (central run)', label: 'Total', color: c[0], ys: rows.map((r) => r.Vmacro), width: 3 },
      { name: 'Core sectors', label: 'Core', color: c[1], ys: rows.map((r) => r.Vcore), width: 2 },
      { name: 'Flex sectors', label: 'Flex', color: c[2], ys: rows.map((r) => r.Vflex), width: 2 },
    ].filter((se) => se.ys.every(Number.isFinite));
    if (mc) ser.push({ name: 'Total, median of runs', label: 'Median', color: c[0], ys: mc.Vmacro.p50, width: 1.5, dash: '2 3' });
    if (risk) ser.push({ name: 'Risk-adjusted total', label: 'Risk-adj.', color: css('--s8'), ys: rows.map((r) => r.Vexp), width: 2, dash: '5 4' });
    const band = mc ? { lo: mc.Vmacro.p10, hi: mc.Vmacro.p90, color: c[0], name: 'Total, 80% range' } : null;
    $('c1-title').textContent = 'Economy-wide value over time';
    $('c1-sub').textContent = peak.year !== last.year ? `Peaks at ${fx(peak.Vmacro)} in ${peak.year}` : `Real output index, ${startY} = 1.0`;
    legend($('c1-legend'), ser.concat(band ? [{ name: 'Total, 80% range', color: c[0], band: true }] : []));
    lineChart($('c1'), {
      xs, series: ser, band, xFmt: yrFmt, yFmt: (v, t) => (t ? f2(v) + '×' : v.toFixed(v < 10 ? 1 : 0) + '×'), baseline: 1, baselineLabel: `${startY} level`,
      tipX: (x, i) => `${x} · T = ${fx(rows[i].T)}`, height: 300, directLabels: true, aria: 'Macro, core and flex value over time',
    });

    // Chart 2: T over time (log)
    $('c2-title').textContent = 'Useful AI work, T';
    $('c2-sub').textContent = 'Multiple of end-2026 verified work per £ (log scale). Growth slows as Core weakens, as T passes the diminishing-returns midpoint, and near the speed limit.';
    const tBand = mc ? { lo: mc.T.p10, hi: mc.T.p90, color: css('--s7'), name: '80% range' } : null;
    legend($('c2-legend'), tBand ? [{ name: 'Useful AI work', color: css('--s7') }, { name: '80% range', color: css('--s7'), band: true }] : []);
    lineChart($('c2'), {
      xs, series: [{ name: 'Useful AI work', color: css('--s7'), ys: rows.map((r) => r.T), width: 2.5 }], band: tBand,
      yLog: true, xFmt: yrFmt, yFmt: (v, t) => (t ? fx(v) : tickFmtX(v)),
      tipX: (x) => String(x), height: 240, aria: 'Tech power T over time',
      tipExtra: (i) => `<div class="r"><i></i><span>growth next yr</span><b>${(rows[i].growth * 100).toFixed(1)}%</b></div><div class="r"><i></i><span>Core brake</span><b>${f2(rows[i].brake)}</b></div><div class="r"><i></i><span>Diminishing returns</span><b>${f2(rows[i].drag)}</b></div>` + (rows[i].capped ? `<div class="r"><i></i><span>Speed limit</span><b>binding</b></div>` : ''),
    });

    // Chart 3: sector V
    const sser = state.sectors.map((s, i) => ({ name: s.name, color: seriesColor(i), ys: rows.map((r) => r.sectors[i].V), width: i === state.sel ? 3 : 2 }));
    $('c3-title').textContent = 'Sector net value, Vᵢ';
    $('c3-sub').textContent = 'Each sector after bottlenecks, Red Queen losses and slop. Below 1.0 means AI made the sector worse off.';
    legend($('c3-legend'), sser);
    lineChart($('c3'), { xs, series: sser, xFmt: yrFmt, yFmt: (v, t) => (t ? f2(v) + '×' : v.toFixed(1) + '×'), baseline: 1, tipX: (x) => String(x), height: 240, aria: 'Sector values over time' });

    // Chart 4: g adoption
    $('c4-card').hidden = false;
    const gser = state.sectors.map((s, i) => ({ name: s.name, color: seriesColor(i), ys: rows.map((r) => r.sectors[i].g * 100), width: i === state.sel ? 3 : 2 }));
    legend($('c4-legend'), gser);
    lineChart($('c4'), { xs, series: gser, xFmt: yrFmt, yFmt: (v) => Math.round(v) + '%', yFloor: 0, tipX: (x, i) => `${x} · T = ${fx(rows[i].T)}`, height: 220, aria: 'Workflow redesign over time' });

    // Chart 5: spending shares (Baumol)
    $('c5-card').hidden = false;
    const shser = state.sectors.map((s, i) => ({ name: s.name, color: seriesColor(i), ys: rows.map((r) => r.shares[i] * 100), width: i === state.sel ? 3 : 2 }));
    if (state.Nmax > 0) shser.push({ name: 'AI-native products', color: css('--s7'), ys: rows.map((r) => r.newShare * 100), width: 2, dash: '5 4' });
    $('c5-sub').textContent = 'Share of total spending. When sectors are complements, spending shifts toward the ones AI speeds up least (the Baumol effect).';
    legend($('c5-legend'), shser);
    lineChart($('c5'), { xs, series: shser, xFmt: yrFmt, yFmt: (v, t) => (t ? v.toFixed(1) + '%' : Math.round(v) + '%'), yFloor: 0, tipX: (x) => String(x), height: 240, aria: 'Spending shares over time' });

    // Chart 6: automation and risk
    $('c6-card').hidden = false;
    const aser = [
      { name: `Economy, ${startY} mix of work`, color: css('--s1'), ys: rows.map((r) => r.automationFixed * 100), width: 2.5 },
      { name: 'Economy, weighted by spending', color: css('--s1'), ys: rows.map((r) => r.automation * 100), width: 1.5, dash: '5 4' },
    ];
    state.sectors.forEach((s, i) => { if (i === state.sel) aser.push({ name: `Tasks automated: ${s.name}`, color: seriesColor(i), ys: rows.map((r) => (1 - r.sectors[i].eps) * 100), width: 2, dash: '2 3' }); });
    if (risk) aser.push({ name: 'Chance of catastrophe so far', color: css('--s8'), ys: rows.map((r) => r.pCat * 100), width: 2.5 });
    $('c6-sub').textContent = risk
      ? `Share of work time AI handles (1 − εᵢ). Solid: weighted by the ${startY} economy. Dashed: weighted by current spending, which falls when spending shifts toward less-automated sectors. Red: cumulative probability of catastrophe.`
      : `Share of work time AI handles (1 − εᵢ). Solid: weighted by the ${startY} economy. Dashed: weighted by current spending, which falls when spending shifts toward less-automated sectors. A task measure, not a forecast of jobs or wages.`;
    legend($('c6-legend'), aser);
    lineChart($('c6'), { xs, series: aser, xFmt: yrFmt, yFmt: (v, t) => (t ? v.toFixed(1) + '%' : Math.round(v) + '%'), yFloor: 0, yCeil: 100, tipX: (x) => String(x), height: 240, aria: 'Automation and catastrophe risk over time' });

    sectorStatus(last, `in ${last.year}`);
    renderTableDynamic(rows);
  }

  function renderStatic() {
    const T = state.Tstatic;
    const snap = M.snapshot(state, T, null, null, null);
    lastSnap = snap; lastRows = null;
    const mc = currentMC();
    const best = snap.sectors.map((s, i) => ({ s, i })).sort((a, b) => b.s.V - a.s.V);
    const worst = best[best.length - 1];
    const head = mc ? mc.p50 : snap.Vmacro;
    const sub = mc ? `median of ${Math.round(state.runs)} runs · 80% range ${fx(mc.p10)}–${fx(mc.p90)} · central ${fx(snap.Vmacro)}` : state.spread ? `central run · ${mcPending()}` : 'central run';
    $('kpis').innerHTML =
      kpi('Total economy', fx(head), sub, head >= 1 ? 'good' : 'bad') +
      kpi('Core sectors', fx(snap.Vcore), snap.hasC ? `weak-link average, ρ = ${(1 - state.fragility).toFixed(1)}` : 'No Core sectors', !snap.hasC || snap.Vcore >= 1 ? 'good' : 'bad') +
      kpi('Flex sectors', fx(snap.Vflex), snap.hasF ? 'weighted average' : 'No Flex sectors', !snap.hasF || snap.Vflex >= 1 ? 'good' : 'bad') +
      kpi('Weakest sector', fx(worst.s.V), esc(state.sectors[worst.i].name), worst.s.V >= 1 ? '' : 'bad') +
      kpi('Tasks automated', pc(snap.automationFixed), `share of today's work done by AI at full adoption · ${pc(snap.automation)} weighted by spending`) +
      kpi('New AI-native products', pc(snap.newShare), 'share of the economy at this T');

    const pts = M.sweep(state, 1, 100, 120);
    const xs = pts.map((p) => p.T);
    const c = [css('--s1'), css('--s2'), css('--s3')];
    const ser = [
      { name: 'Total economy', label: 'Total', color: c[0], ys: pts.map((p) => p.Vmacro), width: 3 },
      { name: 'Core sectors', label: 'Core', color: c[1], ys: pts.map((p) => p.Vcore), width: 2 },
      { name: 'Flex sectors', label: 'Flex', color: c[2], ys: pts.map((p) => p.Vflex), width: 2 },
    ].filter((se) => se.ys.every(Number.isFinite));
    const pk = pts.reduce((a, p) => (p.Vmacro > a.Vmacro ? p : a), pts[0]);
    $('c1-title').textContent = 'Economy-wide value across tech power';
    const overhang = pts[0].Vmacro > 1.005 ? ` At 1×, ${fx(pts[0].Vmacro)} is the value of fully catching up with today's AI.` : '';
    $('c1-sub').textContent = (pk.T < 99 ? `Economy peaks at ${fx(pk.Vmacro)} when T ≈ ${fx(pk.T)}.` : 'Holding these sector settings fixed, with full adoption.') + overhang;
    legend($('c1-legend'), ser);
    lineChart($('c1'), {
      xs, series: ser, xLog: true, xFmt: (v) => v + '×', yFmt: (v, t) => (t ? f2(v) + '×' : v.toFixed(1) + '×'), baseline: 1,
      marker: T, markerLabel: `now ${fx(T)}`, tipX: (x) => `T = ${fx(x)}`, height: 300, aria: 'Macro value as a function of T',
    });

    $('c2-title').textContent = 'Sector net value at ' + fx(T);
    $('c2-sub').textContent = 'Bar = net value Vᵢ. Black tick = clean speedup Sᵢ before Red Queen losses and slop. Dashed line = baseline 1.0.';
    $('c2-legend').innerHTML = '';
    barChart($('c2'), snap.sectors.map((s, i) => ({ name: state.sectors[i].name, V: s.V, S: s.S, color: seriesColor(i) })));

    const sser = state.sectors.map((s, i) => ({ name: s.name, color: seriesColor(i), ys: [], width: i === state.sel ? 3 : 2 }));
    const sx = [];
    for (let k = 0; k <= 80; k++) {
      const t = Math.pow(100, k / 80); sx.push(t);
      M.snapshot(state, t, null, null, null).sectors.forEach((o, i) => sser[i].ys.push(o.V));
    }
    $('c3-title').textContent = 'Sector value across tech power';
    $('c3-sub').textContent = 'Private sectors flatten at their Slop Peak. Commons sectors keep scaling and can fall below 1.0.';
    legend($('c3-legend'), sser);
    lineChart($('c3'), { xs: sx, series: sser, xLog: true, xFmt: (v) => v + '×', yFmt: (v, t) => (t ? f2(v) + '×' : v.toFixed(1) + '×'), baseline: 1, marker: T, tipX: (x) => `T = ${fx(x)}`, height: 240, aria: 'Sector values across T' });

    $('c4-card').hidden = true;
    $('c5-card').hidden = true;
    $('c6-card').hidden = true;
    sectorStatus(snap, `at ${fx(T)}`);
    renderTableStatic(snap);
  }

  function sectorStatus(snap, when) {
    const s = snap.sectors[state.sel];
    const cfg = state.sectors[state.sel];
    if (!s) { $('sector-status').innerHTML = ''; return; }
    const pills = [];
    const fitTxt = s.fAvail - s.f > 0.005 ? `native fit in use ${pc(s.f)} of ${pc(s.fAvail)} available` : `native fit ${pc(s.f)}`;
    pills.push(`<span class="pill info">${when}: V = ${f2(s.V)}× · clean speedup S = ${f2(s.S)}× · ${fitTxt} · bottleneck ε = ${f2(s.eps)}</span>`);
    if (s.capped) pills.push(`<span class="pill warn">Capped at Slop Peak T* ≈ ${fx(s.Tstar)}</span>`);
    else if (cfg.deploy === 'commons' && s.Tstar < snap.T - 1e-6) pills.push(`<span class="pill crit">Past its Slop Peak (T* ≈ ${fx(s.Tstar)}), no cap in commons</span>`);
    if (s.V < 1) pills.push(`<span class="pill crit">Below baseline</span>`);
    else if (s.V >= 2) pills.push(`<span class="pill good">More than doubled</span>`);
    const P = M.sectorParams(cfg);
    if (P.p < 0.5) {
      const a = s.slop;
      if (a > 0 && P.p <= a * (1 - P.p)) pills.push(`<span class="pill warn">Arms-race regime: any further speedup lowers this sector's value</span>`);
    }
    $('sector-status').innerHTML = pills.join('');
  }

  function cls(v) { return v < 1 ? 'lo' : ''; }
  function renderTableDynamic(rows) {
    const risk = state.hmax > 0;
    $('tbl-title').textContent = 'Year by year';
    const names = state.sectors.map((s) => esc(s.name));
    let h = '<thead><tr><th>Year</th><th>T</th><th>Growth</th><th>V core</th><th>V flex</th><th>New products</th><th>V macro</th>' + (risk ? '<th>P(catastrophe)</th><th>Risk-adj.</th>' : '') + '<th>Automated (' + state.startYear + ' mix)</th><th>Automated (spending)</th>' + names.map((n) => `<th>${n}</th>`).join('') + '</tr></thead><tbody>';
    rows.forEach((r) => {
      h += `<tr><td>${r.year}</td><td>${fx(r.T).replace('×', '')}</td><td>${(r.growth * 100).toFixed(1)}%</td><td class="${cls(r.Vcore)}">${f2(r.Vcore)}</td><td class="${cls(r.Vflex)}">${f2(r.Vflex)}</td>` +
        `<td>${f2(r.newGoods)}</td><td class="${cls(r.Vmacro)}"><b>${f2(r.Vmacro)}</b></td>` +
        (risk ? `<td>${pc(r.pCat, 1)}</td><td class="${cls(r.Vexp)}">${f2(r.Vexp)}</td>` : '') + `<td>${pc(r.automationFixed)}</td><td>${pc(r.automation)}</td>` +
        r.sectors.map((s) => `<td class="${cls(s.V)}">${f2(s.V)}</td>`).join('') + '</tr>';
    });
    $('tbl').innerHTML = h + '</tbody>';
  }
  function renderTableStatic(snap) {
    $('tbl-title').textContent = 'Sector detail at ' + fx(snap.T);
    let h = '<thead><tr><th>Sector</th><th>Tier</th><th>Weight</th><th>Spending share</th><th>Deploy</th><th>Native fit</th><th>ε</th><th>S (clean)</th><th>T eff</th><th>Slop Peak T*</th><th>V (net)</th></tr></thead><tbody>';
    snap.sectors.forEach((s, i) => {
      const c = state.sectors[i];
      h += `<tr><td class="txt">${esc(c.name)}</td><td class="txt">${c.tier}</td><td>${f2(snap.weights[i] || 0)}</td><td>${pc(snap.shares[i], 1)}</td><td class="txt">${c.deploy}</td><td>${pc(s.f)}</td><td>${f2(s.eps)}</td><td>${f2(s.S)}</td><td>${f2(s.Teff)}</td><td>${s.Tstar >= snap.T - 1e-6 ? '≥ ' + f2(snap.T) : f2(s.Tstar)}</td><td class="${cls(s.V)}"><b>${f2(s.V)}</b></td></tr>`;
    });
    const blank = '<td></td>'.repeat(8);
    if (snap.hasC) h += `<tr><td class="txt"><b>Core</b></td><td></td>${blank}<td class="${cls(snap.Vcore)}"><b>${f2(snap.Vcore)}</b></td></tr>`;
    if (snap.hasF) h += `<tr><td class="txt"><b>Flex</b></td><td></td>${blank}<td class="${cls(snap.Vflex)}"><b>${f2(snap.Vflex)}</b></td></tr>`;
    h += `<tr><td class="txt"><b>AI-native products</b></td><td></td><td></td><td>${pc(snap.newShare, 1)}</td>${'<td></td>'.repeat(6)}<td>+${f2(snap.newGoods)}</td></tr>`;
    h += `<tr><td class="txt"><b>Total economy</b></td><td></td>${blank}<td class="${cls(snap.Vmacro)}"><b>${f2(snap.Vmacro)}</b></td></tr>`;
    $('tbl').innerHTML = h + '</tbody>';
  }

  function toCSV() {
    const q = (s) => `"${String(s).replace(/"/g, '""')}"`;
    const n = (v) => (typeof v === 'number' ? +v.toPrecision(6) : v);
    if (lastRows) {
      const head = ['year', 'T', 'growth', 'V_core', 'V_flex', 'new_products', 'V_macro', 'P_catastrophe', 'V_risk_adjusted', 'automated_2026_mix', 'automated_spending_weighted'].concat(state.sectors.flatMap((s) => [`V ${s.name}`, `g ${s.name}`, `fit_in_use ${s.name}`, `share ${s.name}`]));
      const lines = lastRows.map((r) => [r.year, r.T, r.growth, r.Vcore, r.Vflex, r.newGoods, r.Vmacro, r.pCat, r.Vexp, r.automationFixed, r.automation].concat(r.sectors.flatMap((s, i) => [s.V, s.g, s.f, r.shares[i]])).map(n).join(','));
      return [head.map(q).join(',')].concat(lines).join('\n');
    }
    const s = lastSnap;
    const head = ['sector', 'tier', 'weight', 'spending_share', 'deploy', 'native_fit', 'eps', 'S', 'T_eff', 'T_star', 'V'];
    const lines = s.sectors.map((o, i) => [q(state.sectors[i].name), state.sectors[i].tier, n(s.weights[i] || 0), n(s.shares[i]), state.sectors[i].deploy, n(o.f), n(o.eps), n(o.S), n(o.Teff), n(o.Tstar), n(o.V)].join(','));
    lines.push(`"Core",,,,,,,,,,${n(s.Vcore)}`, `"Flex",,,,,,,,,,${n(s.Vflex)}`, `"New products",,,${n(s.newShare)},,,,,,,${n(s.newGoods)}`, `"Macro",,,,,,,,,,${n(s.Vmacro)}`);
    return [head.join(',')].concat(lines).join('\n');
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
  function render() { if (state.mode === 'dynamic') renderDynamic(); else renderStatic(); }
  function update() {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => { render(); save(); scheduleMC(); });
  }

  function rebuildAll() {
    const dyn = state.mode === 'dynamic';
    $('mode-dynamic').setAttribute('aria-pressed', String(dyn));
    $('mode-static').setAttribute('aria-pressed', String(!dyn));
    if (state.sel >= state.sectors.length) state.sel = 0;
    buildGlobalControls();
    $('lede').innerHTML = dyn
      ? 'The snapshot equation values every sector and the whole economy each quarter. Update rules feed that snapshot back into useful AI work <span class="mono">T</span>, how much of what AI can do is actually used, each sector\'s workflow redesign <span class="mono">g<sub>i</sub></span>, new products and risk. Some limits never dissolve, however capable AI gets: that is what the model is built to show.'
      : 'The snapshot equation with tech power <span class="mono">T</span> as a dial, assuming organisations have fully adopted what AI can do. Set a level of useful AI work and each sector\'s settings to see net value after Amdahl bottlenecks, Red Queen arms races, internal slop and external spam, and how a weak Core drags down the economy.';
    buildPresets();
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
