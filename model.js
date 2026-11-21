/*
 * AI Transformation Model — calculation engine.
 *
 * Every V is a multiple of what output would be without further AI: real output
 * relative to a world where AI stays at its end-2026 level and use.
 * GDP paths (2027 = 1) add trend growth to both worlds:
 *   gdpNoAI = (1 + g)^t,  gdp = V_macro · (1 + g)^t,
 * with g = 2.0%/yr, the current average for advanced economies
 * (IMF WEO Oct 2026: 2.0% in 2025, 2.1% in 2026, 1.8% in 2027).
 *
 * Sector bottleneck / slop / weak-link equation with a dynamic loop
 * (quarterly steps, reported yearly), adoption lag, capability breadth,
 * Baumol spending shares, new products, catastrophe risk and Monte Carlo
 * uncertainty. Amdahl ceilings (f_max, g_max, N_max) are fixed by design:
 * the model is meant to show which limits do not dissolve with capability.
 *
 * Works in the browser (window.AIModel) and in Node (module.exports).
 */
(function (root) {
  'use strict';

  const K = 2.5;              // Hill-curve steepness used for every S-curve
  const G_CAP = 0.9;          // redesign hard cap (prevents eps = 0)
  const F_CAP = 0.95;         // native-fit hard cap (prevents runaway R&D feedback)
  const STEPS_PER_YEAR = 4;   // internal time step: quarterly

  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const hill = (T, mid) => 1 / (1 + Math.pow(mid / Math.max(T, 1e-9), K));
  // S-curve that is exactly 0 at T = 1 and tends to 1 as T grows (keeps baseline invariance)
  const hill0 = (T, mid) => { const a = Math.pow(T, K) - 1; return a <= 0 ? 0 : a / (a + Math.pow(mid, K)); };
  // convert an annual "share of the gap closed" rate into a per-step rate
  const stepRate = (annual, dt) => 1 - Math.pow(1 - clamp(annual, 0, 1), dt);

  // ---------------- Default economy (UI units) ----------------
  // f, fmax, p, g, gmax in %; eta, gamma on 0–10 (÷20); Tcrit in ×; alpha in %/yr.
  function sec(name, tier, weight, f, fmax, p, eta, gamma, g, gmax, Tcrit, alpha, deploy, rd, basis) {
    return { name, tier, weight, f, fmax, p, eta, gamma, g, gmax, Tcrit, alpha, deploy, rd: !!rd, basis: basis || '' };
  }
  // A simplified economy of six illustrative sectors. Each stands in for a broad part of the
  // economy, and every setting is a rounded judgement call for illustration, not a measurement.
  function defaultSectors() {
    return [
      sec('Energy & Grid', 'core', 35, 20, 45, 100, 0.2, 0.2, 20, 20, 10, 15, 'private', false,
        'Stands in for physical infrastructure: mostly hands-on work, so low native fit; essential and heavily regulated, so redesign comes late; output is real wealth, not an arms race.'),
      sec('Healthcare', 'core', 35, 25, 55, 95, 1.0, 0.4, 35, 35, 15, 10, 'private', false,
        'Stands in for care and other people-facing services: much of the work is physical or relational; mistakes are costly, so review burden is high and redesign is slow.'),
      sec('Banking & Payments', 'core', 30, 60, 90, 70, 0.8, 1.0, 50, 50, 3, 15, 'private', false,
        'Stands in for essential digital services: mostly information work, so high native fit; a real target for fraud and cyber-attack; part of the activity is competitive trading rather than new wealth.'),
      sec('Software & R&D', 'flex', 40, 70, 95, 90, 0.4, 0.2, 60, 60, 1, 30, 'private', true,
        'Stands in for knowledge work AI suits best: work is digital and checkable (code compiles, tests pass), redesign is already under way, and its output feeds back into AI progress.'),
      sec('Corporate Law', 'flex', 30, 60, 85, 15, 2.0, 2.0, 40, 40, 3, 15, 'commons', false,
        'Stands in for adversarial professional services: lots of text work AI can do, but much of it is an arms race between sides, and both generate review burden for the other.'),
      sec('Ad-Tech & Media', 'flex', 30, 80, 95, 10, 3.0, 3.0, 50, 50, 1.5, 25, 'commons', false,
        'Stands in for attention markets: almost all digital, so very high native fit, but mostly zero-sum competition for attention, with heavy exposure to spam and synthetic content.'),
    ];
  }

  function defaultState() {
    return {
      mode: 'dynamic', years: 15, startYear: 2027,
      r0: 25, phi: 0.4, Thalf: 15, growthCap: 200, trendGrowth: 2.0,
      Tstatic: 20, Wcore: 60, fragility: 5,
      beta: 0.1, dEta: 0.1, dGamma: 0.1, cfx: 1.5, kappa: 1,
      adopt0: 30, adoptSpeed: 25, jCost: 2, aiNow: 2,
      Nmax: 10, Tnew: 10, newSpeed: 15,
      hmax: 0, Trisk: 30, loss: 100,
      setbackYear: 0, setbackSize: 0,
      spread: 25, runs: 150, corr: 50,
      sectors: defaultSectors(), sel: 3, preset: 'dyn-base',
    };
  }

  // ---------------- Global parameters ----------------
  function globalsFor(state) {
    return {
      beta: state.beta,                          // capability breadth: f rises toward f_max
      dEta: state.dEta,                          // verification keeps pace with capability
      dGamma: state.dGamma,                      // defensive AI
      rhoM: 1 - state.cfx,                       // Core–Flex complementarity (Baumol between tiers)
      kappa: state.kappa,                        // Flex dependence on Core shortfall
      Nmax: state.Nmax / 100,                    // mature size of AI-native products (share of 2026 economy)
      Tnew: state.Tnew,
      newSpeed: (state.newSpeed != null ? state.newSpeed : 15) / 100,
      adopt0: clamp((state.adopt0 != null ? state.adopt0 : 30) / 100, 0, 1),   // share of native fit in use at end-2026
      aiNow: Math.max(1, state.aiNow != null ? state.aiNow : 2),                // how much faster end-2026 AI does the work it is used for
      adoptSpeed: (state.adoptSpeed != null ? state.adoptSpeed : 25) / 100,     // logistic adoption rate per year
      jCost: state.jCost != null ? state.jCost : 2,                              // output diverted per unit/yr rise in automated share (J-curve)
      growthCap: Math.max(0.05, (state.growthCap != null ? state.growthCap : 200) / 100), // max yearly growth in T
      hmax: state.hmax / 100,                    // annual catastrophe hazard at maturity
      Trisk: state.Trisk,
      loss: state.loss / 100,
      setbackYear: state.setbackYear,
      setbackSize: state.setbackSize / 100,
      fragility: state.fragility,
      Wcore: state.Wcore,
    };
  }

  // ---------------- Slider (UI units) -> equation parameters ----------------
  function sectorParams(s) {
    const f0 = clamp(s.f / 100, 0, F_CAP);
    return {
      f0,
      fmax: Math.max(f0, clamp((s.fmax != null ? s.fmax : s.f) / 100, 0, F_CAP)),
      p: clamp(s.p / 100, 0, 1),
      eta: Math.max(0, s.eta / 20),
      gamma: Math.max(0, s.gamma / 20),
      gmax: clamp(s.gmax / 100, 0, G_CAP),
      gStatic: clamp(s.g / 100, 0, G_CAP),
      Tcrit: Math.max(0.1, s.Tcrit),
      alpha: clamp(s.alpha / 100, 0, 1),
      private: s.deploy !== 'commons',
    };
  }

  // ---------------- 1. Sector level ----------------
  // f*_i(T)  = f_max − (f_max − f_0) T^(−β)          available native fit (β = 0 → fixed f_0)
  // a_i      = native fit actually in use (dynamic: chases f*_i; snapshot: = f*_i)
  // eps_i    = (1 − a_i) (1 − g_i)
  // τ_i      = eps_i + (1 − eps_i) / (A · T_eff)        time per unit of work vs no AI (A = today's AI speedup)
  // τ_i,0    = eps_i,0 + (1 − eps_i,0) / A,  eps_i,0 = 1 − a_0 f_0   (how work was done at end-2026)
  // S_i      = τ_i,0 / τ_i                              speedup vs end-2026 (A = 1 → 1 / (eps + (1 − eps)/T_eff))
  // η̂ = η T^(−δη),  γ̂ = γ T^(−δγ)
  // V_i      = (1 + p_i (S_i − 1)) / (1 + (η̂ ln T_eff + γ̂ ln T) S_i)
  function fAvail(P, T, X) { return X.beta > 0 ? P.fmax - (P.fmax - P.f0) * Math.pow(T, -X.beta) : P.f0; }

  function sectorValueAt(P, g, T, Teff, X, fUsed) {
    X = X || { beta: 0, dEta: 0, dGamma: 0 };
    const A = X.aiNow || 1;
    const f = fUsed != null ? fUsed : fAvail(P, T, X);
    const eps = (1 - f) * (1 - g);
    const eps0 = 1 - (X.adopt0 != null ? X.adopt0 : 1) * P.f0;
    const tau0 = eps0 + (1 - eps0) / A;
    const S = tau0 / (eps + (1 - eps) / (A * Teff));
    const eta = P.eta * (X.dEta ? Math.pow(T, -X.dEta) : 1);
    const gamma = P.gamma * (X.dGamma ? Math.pow(T, -X.dGamma) : 1);
    const a = eta * Math.log(Teff) + gamma * Math.log(T);
    const V = (1 + P.p * (S - 1)) / (1 + a * S);
    return { f, eps, S, V, slop: a };
  }

  // Private → T_eff = min(T, T*), T* = usage level that maximises V_i (the Slop Peak).
  // Commons → T_eff = T.
  function slopPeak(P, g, T, X, fUsed) {
    if (T <= 1) return 1;
    const N = 40, lnT = Math.log(T);
    let bestI = 0, bestV = -Infinity;
    for (let i = 0; i <= N; i++) {
      const v = sectorValueAt(P, g, T, Math.exp((lnT * i) / N), X, fUsed).V;
      if (v > bestV) { bestV = v; bestI = i; }
    }
    if (bestI === N) return T;
    let a = Math.max(0, bestI - 1) * lnT / N, b = Math.min(N, bestI + 1) * lnT / N;
    const r = (Math.sqrt(5) - 1) / 2;
    const fn = (x) => -sectorValueAt(P, g, T, Math.exp(x), X, fUsed).V;
    let c = b - r * (b - a), d = a + r * (b - a), fc = fn(c), fd = fn(d);
    for (let k = 0; k < 24; k++) {
      if (fc < fd) { b = d; d = c; fd = fc; c = b - r * (b - a); fc = fn(c); }
      else { a = c; c = d; fc = fd; d = a + r * (b - a); fd = fn(d); }
    }
    return Math.exp((a + b) / 2);
  }

  function evalSector(P, g, T, X, fUsed) {
    const Tstar = slopPeak(P, g, T, X, fUsed);
    const Teff = P.private ? Math.min(T, Tstar) : T;
    const r = sectorValueAt(P, g, T, Teff, X, fUsed);
    return { f: r.f, fAvail: fAvail(P, T, X), eps: r.eps, S: r.S, V: r.V, slop: r.slop, Teff, Tstar, capped: P.private && Tstar < T - 1e-6 };
  }

  // ---------------- 2. Macro level ----------------
  function ces(vals, ws, rho) {
    if (!vals.length) return NaN;
    if (Math.abs(rho) < 1e-9) { let s = 0; vals.forEach((v, i) => { s += ws[i] * Math.log(Math.max(v, 1e-12)); }); return Math.exp(s); }
    let s = 0; vals.forEach((v, i) => { s += ws[i] * Math.pow(Math.max(v, 1e-12), rho); });
    return Math.pow(s, 1 / rho);
  }
  // CES spending shares: s_i ∝ w_i V_i^rho
  function cesShares(vals, ws, rho) {
    const raw = vals.map((v, i) => ws[i] * Math.pow(Math.max(v, 1e-12), rho));
    const tot = raw.reduce((a, b) => a + b, 0) || 1;
    return raw.map((x) => x / tot);
  }

  function tierIdx(sectors, tier) {
    const idx = [];
    let tot = 0;
    sectors.forEach((s, i) => { if (s.tier === tier) { idx.push(i); tot += Math.max(0, s.weight); } });
    const w = idx.map((i) => (tot > 0 ? Math.max(0, sectors[i].weight) / tot : 1 / idx.length));
    return { idx, w };
  }

  // D = min(1, V_core)^κ;  V_base = ( Wc V_core^ρm + Wf (D V_flex)^ρm )^(1/ρm)
  // V_macro = V_base + D · n_t     (n_t = AI-native products, share of 2026 economy)
  // Empty tier: the other tier alone.
  function macro(sectors, Vs, X, n) {
    const rho = 1 - X.fragility;
    const Wc0 = clamp(X.Wcore / 100, 0, 1);
    const C = tierIdx(sectors, 'core'), F = tierIdx(sectors, 'flex');
    const hasC = C.idx.length > 0, hasF = F.idx.length > 0;
    const Vcore = hasC ? ces(C.idx.map((i) => Vs[i]), C.w, rho) : NaN;
    const Vflex = hasF ? F.idx.reduce((a, i, k) => a + F.w[k] * Vs[i], 0) : NaN;
    const Wc = hasC && hasF ? Wc0 : hasC ? 1 : 0, Wf = 1 - Wc;
    const coreShares = hasC ? cesShares(C.idx.map((i) => Vs[i]), C.w, rho) : [];
    const flexShares = hasF ? (() => { const raw = F.idx.map((i, k) => F.w[k] * Vs[i]); const t = raw.reduce((a, b) => a + b, 0) || 1; return raw.map((x) => x / t); })() : [];
    const D = hasC && X.kappa > 0 ? Math.pow(Math.min(1, Vcore), X.kappa) : 1;
    let Vbase, tierShareCore;
    if (hasC && hasF) {
      Vbase = ces([Vcore, D * Vflex], [Wc, Wf], X.rhoM);
      tierShareCore = cesShares([Vcore, D * Vflex], [Wc, Wf], X.rhoM)[0];
    } else { Vbase = hasC ? Vcore : D * Vflex; tierShareCore = hasC ? 1 : 0; }
    const newGoods = D * (n || 0);
    const Vmacro = Vbase + newGoods;
    // spending shares across sectors (+ new products), and fixed 2026 shares
    const shares = new Array(sectors.length).fill(0);
    const shares0 = new Array(sectors.length).fill(0);
    const baseShare = Vbase / Vmacro;
    C.idx.forEach((i, k) => { shares[i] = baseShare * tierShareCore * coreShares[k]; shares0[i] = Wc * C.w[k]; });
    F.idx.forEach((i, k) => { shares[i] = baseShare * (1 - tierShareCore) * flexShares[k]; shares0[i] = Wf * F.w[k]; });
    const weights = {};
    C.idx.forEach((i, k) => { weights[i] = C.w[k]; });
    F.idx.forEach((i, k) => { weights[i] = F.w[k]; });
    return { Vcore, Vflex, Vbase, newGoods, Vmacro, D, rho, shares, shares0, newShare: newGoods / Vmacro, weights, hasC, hasF };
  }

  // ---------------- Snapshot (one moment / static) ----------------
  // gs: redesign per sector (null → static g); fs: native fit in use (null → full available fit); n: new products (null → steady state)
  // costs: share of each sector's output diverted into adoption and redesign (J-curve), null → none
  function snapshot(state, T, gs, n, fs, costs) {
    const X = globalsFor(state);
    const sectors = state.sectors;
    const out = sectors.map((s, i) => {
      const P = sectorParams(s);
      const g = gs ? gs[i] : P.gStatic;
      const r = Object.assign({ g }, evalSector(P, g, T, X, fs ? fs[i] : null));
      r.cost = costs ? costs[i] : 0;
      r.Vgross = r.V;
      r.V = r.V * (1 - r.cost);
      return r;
    });
    const nn = n != null ? n : X.Nmax * hill0(T, X.Tnew);
    const m = macro(sectors, out.map((o) => o.V), X, nn);
    const nonNew = Math.max(1e-9, 1 - m.newShare);
    const automation = out.reduce((a, o, i) => a + m.shares[i] * (1 - o.eps), 0) / nonNew;      // spending-weighted
    const automationFixed = out.reduce((a, o, i) => a + m.shares0[i] * (1 - o.eps), 0);        // fixed 2026 weights
    return Object.assign({ T, sectors: out, n: nn, automation, automationFixed }, m);
  }

  // ---------------- 3. Dynamic loop (quarterly steps, yearly rows) ----------------
  // raw     = r0 · V_RD^φ · min(1, V_core) · (1 + 1/T_half) / (1 + T/T_half)
  // growth  = raw / (1 + (raw/cap)^4)^(1/4)                   (smooth speed limit; ≈ raw well below the cap)
  // T      ← T (1 + growth)^dt                                 (so a constant rate r gives exactly r per year)
  // setback: at the start of the chosen year, T ← max(1, T (1 − size))
  // a_i    ← a_i + λ dt · a_i (1 − a_i / f*_i(T)),  a_i,0 = adopt0 · f_0   (S-shaped adoption of native fit)
  // cost_i = J · max(0, rate_i − rate_i,0), rate = yearly rise in automated share 1 − ε   (J-curve: output
  //          diverted into adoption and redesign beyond today's pace; V_i ← V_i (1 − cost_i))
  // g_i    ← g_i + α_dt (g_max / (1 + (T_crit/T)^k) − g_i)
  // n      ← n + s_dt (N_max · hill0(T, T_new) − n)
  // survival ← survival (1 − h_max · hill0(T, T_risk))^dt
  // where x_dt = 1 − (1 − x)^dt converts annual gap-closing rates to per-step rates.
  function simulate(state) {
    const X = globalsFor(state);
    const years = Math.max(1, Math.round(state.years));
    const steps = STEPS_PER_YEAR, dt = 1 / steps;
    const r0 = state.r0 / 100, phi = state.phi, Thalf = Math.max(1, state.Thalf);
    const rdIdx = state.sectors.findIndex((s) => s.rd);
    const start = state.startYear || 2027;
    const Ps = state.sectors.map((s) => sectorParams(s));
    const newDt = stepRate(X.newSpeed, dt);
    const alphaDt = Ps.map((P) => stepRate(P.alpha, dt));
    let T = 1, n = 0, surv = 1;
    let gs = Ps.map(() => 0);
    let fs = Ps.map((P) => X.adopt0 * P.f0);
    const autoOf = () => fs.map((a, i) => 1 - (1 - a) * (1 - gs[i]));
    let prevAuto = autoOf();
    let rate0 = null; // today's pace of adoption, already paid for in the no-further-AI world
    const rows = [];
    const total = years * steps;
    for (let k = 0; k <= total; k++) {
      // J-curve: output diverted in proportion to how fast the automated share rose over the last quarter
      const auto = autoOf();
      const rate = auto.map((x, i) => Math.max(0, x - prevAuto[i]) / dt);
      if (rate0 === null && k > 0) rate0 = rate.slice();
      const costs = rate.map((x, i) => clamp(X.jCost * Math.max(0, x - (rate0 ? rate0[i] : x)), 0, 0.5));
      prevAuto = auto;
      const snap = snapshot(state, T, gs, n, fs, costs);
      const Vrd = rdIdx >= 0 ? snap.sectors[rdIdx].V : 1;
      const brake = snap.hasC ? Math.min(1, snap.Vcore) : 1;
      const drag = (1 + 1 / Thalf) / (1 + T / Thalf);
      const raw = r0 * Math.pow(Math.max(Vrd, 1e-9), phi) * brake * drag;
      const growth = raw / Math.pow(1 + Math.pow(raw / X.growthCap, 4), 0.25);
      const hazard = X.hmax * hill0(T, X.Trisk);
      if (k % steps === 0) {
        const Vexp = snap.Vmacro * (1 - (1 - surv) * X.loss);
        const trend = Math.pow(1 + (state.trendGrowth != null ? state.trendGrowth : 2) / 100, k / steps);
        rows.push(Object.assign({ t: k / steps, year: start + k / steps, trend, gdp: snap.Vmacro * trend, gdpNoAI: trend, growth, rawGrowth: raw, capped: raw > growth * 1.02, Vrd, brake, drag, hazard, survival: surv, pCat: 1 - surv, Vexp }, snap));
      }
      if (k === total) break;
      // update to the next quarter (all from current-step values)
      // S-shaped (logistic) adoption: slow while few use it, fastest in the middle, slowing near the available fit
      fs = fs.map((a, i) => { const fA = fAvail(Ps[i], T, X); return fA <= 0 ? 0 : clamp(a + X.adoptSpeed * dt * a * (1 - a / fA), 0, fA > a ? fA : a); });
      gs = gs.map((g, i) => g + alphaDt[i] * (Ps[i].gmax * hill(T, Ps[i].Tcrit) - g));
      n = n + newDt * (X.Nmax * hill0(T, X.Tnew) - n);
      surv = surv * Math.pow(1 - hazard, dt);
      T = T * Math.pow(1 + growth, dt);
      if (X.setbackSize > 0 && (k + 1) % steps === 0 && start + (k + 1) / steps === X.setbackYear) T = Math.max(1, T * (1 - X.setbackSize));
    }
    return rows;
  }

  function sweep(state, Tlo, Thi, n) {
    const pts = [];
    for (let k = 0; k <= n; k++) {
      const T = Math.exp(Math.log(Tlo) + (Math.log(Thi) - Math.log(Tlo)) * k / n);
      const s = snapshot(state, T, null, null, null);
      pts.push({ T, Vmacro: s.Vmacro, Vcore: s.Vcore, Vflex: s.Vflex });
    }
    return pts;
  }

  // ---------------- 4. Uncertainty (Monte Carlo) ----------------
  // Each uncertain input is multiplied by exp(spread · z), then clamped to its slider range.
  // Sector inputs share a common error component: z = √c · z_common + √(1−c) · z_own.
  const SECTOR_RANGES = { f: [0, 95], fmax: [0, 95], p: [0, 100], eta: [0, 10], gamma: [0, 10], gmax: [0, 90], g: [0, 90], Tcrit: [0.5, 30], alpha: [5, 30] };
  const GLOBAL_RANGES = {
    r0: [5, 60], phi: [0, 1], Thalf: [5, 50], beta: [0, 1], dEta: [0, 1], dGamma: [0, 1], Nmax: [0, 100], Tnew: [2, 50],
    hmax: [0, 20], Trisk: [2, 100], adopt0: [0, 100], adoptSpeed: [5, 60], jCost: [0, 5], aiNow: [1, 5],
    // structural dials
    Wcore: [20, 80], fragility: [0, 10], cfx: [0, 3], kappa: [0, 2],
  };

  function rng(seed) {
    let s = seed >>> 0;
    return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  function gauss(r) { let u = 0; while (u === 0) u = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r()); }

  function perturb(state, r, spread, corr) {
    const c = clamp(corr != null ? corr : 0.5, 0, 1), a = Math.sqrt(c), b = Math.sqrt(1 - c);
    const s = JSON.parse(JSON.stringify(state));
    const j = (v, [lo, hi], z) => clamp(v * Math.exp(spread * z), lo, hi);
    Object.keys(GLOBAL_RANGES).forEach((k) => { if (typeof s[k] === 'number' && s[k] !== 0) s[k] = j(s[k], GLOBAL_RANGES[k], gauss(r)); });
    const common = {};
    Object.keys(SECTOR_RANGES).forEach((k) => { common[k] = gauss(r); });
    s.sectors.forEach((sec) => {
      Object.keys(SECTOR_RANGES).forEach((k) => { if (typeof sec[k] === 'number') sec[k] = j(sec[k], SECTOR_RANGES[k], a * common[k] + b * gauss(r)); });
      if (sec.fmax < sec.f) sec.fmax = sec.f;
    });
    return s;
  }

  function quantile(sorted, q) {
    const pos = (sorted.length - 1) * q, lo = Math.floor(pos), hi = Math.ceil(pos);
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
  }
  // matrix: runs × years → {p10, p50, p90} per year
  function summarise(matrix) {
    const len = matrix[0].length, out = { p10: [], p50: [], p90: [] };
    for (let y = 0; y < len; y++) {
      const col = matrix.map((row) => row[y]).sort((a, b) => a - b);
      out.p10.push(quantile(col, 0.1)); out.p50.push(quantile(col, 0.5)); out.p90.push(quantile(col, 0.9));
    }
    return out;
  }

  // One Monte Carlo run → the series the UI summarises
  function mcRun(state, r, spread, corr) {
    const rows = simulate(perturb(state, r, spread, corr));
    return { Vmacro: rows.map((x) => x.Vmacro), Vexp: rows.map((x) => x.Vexp), T: rows.map((x) => x.T) };
  }

  function monteCarlo(state, runs, spread, seed, corr) {
    const r = rng(seed || 12345);
    const m = { Vmacro: [], Vexp: [], T: [] };
    for (let k = 0; k < runs; k++) { const o = mcRun(state, r, spread, corr); m.Vmacro.push(o.Vmacro); m.Vexp.push(o.Vexp); m.T.push(o.T); }
    return { Vmacro: summarise(m.Vmacro), Vexp: summarise(m.Vexp), T: summarise(m.T) };
  }

  function monteCarloSnapshot(state, T, runs, spread, seed, corr) {
    const r = rng(seed || 12345);
    const vals = [];
    for (let k = 0; k < runs; k++) vals.push(snapshot(perturb(state, r, spread, corr), T, null, null, null).Vmacro);
    vals.sort((a, b) => a - b);
    return { p10: quantile(vals, 0.1), p50: quantile(vals, 0.5), p90: quantile(vals, 0.9) };
  }

  const api = { defaultState, defaultSectors, K, G_CAP, F_CAP, STEPS_PER_YEAR, hill, hill0, globalsFor, sectorParams, fAvail, sectorValueAt, slopPeak, evalSector, macro, snapshot, simulate, sweep, rng, perturb, summarise, quantile, mcRun, monteCarlo, monteCarloSnapshot };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.AIModel = api;
})(typeof window !== 'undefined' ? window : this);
