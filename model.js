/*
 * AI Transformation Model — calculation engine (v3).
 *
 * Two equation sets:
 *   'original' — exactly the Gemini conversation's equation + dynamic loop
 *                (Option B soft slowdown, S-curve redesign).
 *   'extended' — the same core, plus fixes for the weaknesses found in the
 *                stress test. Every extension has a parameter whose zero
 *                (or neutral) value switches it off.
 *
 * Works in the browser (window.AIModel) and in Node (module.exports).
 */
(function (root) {
  'use strict';

  const K = 2.5;        // Hill-curve steepness used for every S-curve
  const G_CAP = 0.9;    // redesign hard cap (prevents eps = 0)
  const F_CAP = 0.95;   // native-fit hard cap (prevents runaway R&D feedback)

  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const hill = (T, mid) => 1 / (1 + Math.pow(mid / Math.max(T, 1e-9), K));
  // S-curve that is exactly 0 at T = 1 and tends to 1 as T grows (keeps baseline invariance)
  const hill0 = (T, mid) => { const a = Math.pow(T, K) - 1; return a <= 0 ? 0 : a / (a + Math.pow(mid, K)); };

  // ---------------- Globals for the active equation set ----------------
  function globalsFor(state) {
    const ext = state.model !== 'original';
    return {
      ext,
      beta: ext ? state.beta : 0,                 // capability breadth: f rises toward f_max
      dEta: ext ? state.dEta : 0,                 // verification keeps pace with capability
      dGamma: ext ? state.dGamma : 0,             // defensive AI
      psi: ext ? state.psi : 0,                   // investment feedback
      rhoM: ext ? 1 - state.cfx : null,           // Core–Flex complementarity (Baumol between tiers)
      kappa: ext ? state.kappa : 0,               // Flex dependence on Core shortfall
      Nmax: ext ? state.Nmax / 100 : 0,           // mature size of AI-native products (share of 2026 economy)
      Tnew: state.Tnew,
      newSpeed: (state.newSpeed != null ? state.newSpeed : 15) / 100,
      hmax: ext ? state.hmax / 100 : 0,           // annual catastrophe hazard at maturity
      Trisk: state.Trisk,
      loss: state.loss / 100,
      setbackYear: ext ? state.setbackYear : 0,
      setbackSize: ext ? state.setbackSize / 100 : 0,
      normaliseDrag: ext,
      fragility: state.fragility,
      Wcore: state.Wcore,
      slopLearning: state.slopLearning || 0,
    };
  }

  // ---------------- Slider (UI units) -> equation parameters ----------------
  function sectorParams(s, t, slopLearning) {
    const decay = Math.pow(1 - (slopLearning || 0) / 100, t || 0);
    const f0 = clamp(s.f / 100, 0, F_CAP);
    return {
      f0,
      fmax: Math.max(f0, clamp((s.fmax != null ? s.fmax : s.f) / 100, 0, F_CAP)),
      p: clamp(s.p / 100, 0, 1),
      eta: Math.max(0, s.eta / 20) * decay,
      gamma: Math.max(0, s.gamma / 20) * decay,
      gmax: clamp(s.gmax / 100, 0, G_CAP),
      gStatic: clamp(s.g / 100, 0, G_CAP),
      Tcrit: Math.max(1, s.Tcrit),
      alpha: clamp(s.alpha / 100, 0, 1),
      private: s.deploy !== 'commons',
    };
  }

  // ---------------- 1. Sector level ----------------
  // f_i(T)   = f_max − (f_max − f_0) T^(−β)                       [ext; β = 0 → f_0]
  // eps_i    = (1 − f_i(T)) (1 − g_i)
  // S_i      = 1 / (eps_i + (1 − eps_i) / T_eff)
  // η̂ = η T^(−δη),  γ̂ = γ T^(−δγ)                               [ext; δ = 0 → original]
  // V_i      = (1 + p_i (S_i − 1)) / (1 + (η̂ ln T_eff + γ̂ ln T) S_i)
  function fOf(P, T, X) { return X.beta > 0 ? P.fmax - (P.fmax - P.f0) * Math.pow(T, -X.beta) : P.f0; }

  function sectorValueAt(P, g, T, Teff, X) {
    X = X || { beta: 0, dEta: 0, dGamma: 0 };
    const f = fOf(P, T, X);
    const eps = (1 - f) * (1 - g);
    const S = 1 / (eps + (1 - eps) / Teff);
    const eta = P.eta * (X.dEta ? Math.pow(T, -X.dEta) : 1);
    const gamma = P.gamma * (X.dGamma ? Math.pow(T, -X.dGamma) : 1);
    const V = (1 + P.p * (S - 1)) / (1 + (eta * Math.log(Teff) + gamma * Math.log(T)) * S);
    return { f, eps, S, V };
  }

  // Private → T_eff = min(T, T*), T* = usage level that maximises V_i (the Slop Peak).
  // Commons → T_eff = T.
  function slopPeak(P, g, T, X) {
    if (T <= 1) return 1;
    const N = 48, lnT = Math.log(T);
    let bestI = 0, bestV = -Infinity;
    for (let i = 0; i <= N; i++) {
      const v = sectorValueAt(P, g, T, Math.exp((lnT * i) / N), X).V;
      if (v > bestV) { bestV = v; bestI = i; }
    }
    if (bestI === N) return T;
    let a = Math.max(0, bestI - 1) * lnT / N, b = Math.min(N, bestI + 1) * lnT / N;
    const r = (Math.sqrt(5) - 1) / 2;
    const fn = (x) => -sectorValueAt(P, g, T, Math.exp(x), X).V;
    let c = b - r * (b - a), d = a + r * (b - a), fc = fn(c), fd = fn(d);
    for (let k = 0; k < 28; k++) {
      if (fc < fd) { b = d; d = c; fd = fc; c = b - r * (b - a); fc = fn(c); }
      else { a = c; c = d; fc = fd; d = a + r * (b - a); fd = fn(d); }
    }
    return Math.exp((a + b) / 2);
  }

  function evalSector(P, g, T, X) {
    const Tstar = slopPeak(P, g, T, X);
    const Teff = P.private ? Math.min(T, Tstar) : T;
    const r = sectorValueAt(P, g, T, Teff, X);
    return { f: r.f, eps: r.eps, S: r.S, V: r.V, Teff, Tstar, capped: P.private && Tstar < T - 1e-6 };
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

  // Original:  V_macro = V_core^Wc (Wc V_core + Wf V_flex)^Wf
  // Extended:  D = min(1, V_core)^κ;  V_base = ( Wc V_core^ρm + Wf (D V_flex)^ρm )^(1/ρm)
  //            V_macro = V_base + D · n_t           (n_t = AI-native products, share of 2026 economy)
  // Empty tier: the other tier alone (in both equation sets).
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
    let Vbase, D = 1, tierShareCore;
    if (!X.ext) {
      if (hasC && hasF) Vbase = Math.pow(Vcore, Wc) * Math.pow(Wc * Vcore + Wf * Vflex, Wf);
      else Vbase = hasC ? Vcore : Vflex;
      tierShareCore = hasC && hasF ? (Wc * Vcore) / (Wc * Vcore + Wf * Vflex) : (hasC ? 1 : 0);
    } else {
      D = hasC && X.kappa > 0 ? Math.pow(Math.min(1, Vcore), X.kappa) : 1;
      if (hasC && hasF) {
        Vbase = ces([Vcore, D * Vflex], [Wc, Wf], X.rhoM);
        tierShareCore = cesShares([Vcore, D * Vflex], [Wc, Wf], X.rhoM)[0];
      } else { Vbase = hasC ? Vcore : D * Vflex; tierShareCore = hasC ? 1 : 0; }
    }
    const newGoods = D * (n || 0);
    const Vmacro = Vbase + newGoods;
    // spending shares across sectors (+ new products)
    const shares = new Array(sectors.length).fill(0);
    const baseShare = Vbase / Vmacro;
    C.idx.forEach((i, k) => { shares[i] = baseShare * tierShareCore * coreShares[k]; });
    F.idx.forEach((i, k) => { shares[i] = baseShare * (1 - tierShareCore) * flexShares[k]; });
    const weights = {};
    C.idx.forEach((i, k) => { weights[i] = C.w[k]; });
    F.idx.forEach((i, k) => { weights[i] = F.w[k]; });
    return { Vcore, Vflex, Vbase, newGoods, Vmacro, D, rho, shares, newShare: newGoods / Vmacro, weights, hasC, hasF };
  }

  // ---------------- Snapshot (one year / static) ----------------
  function snapshot(state, T, gs, t, n) {
    const X = globalsFor(state);
    const sectors = state.sectors;
    const out = sectors.map((s, i) => {
      const P = sectorParams(s, t, X.slopLearning);
      const g = gs ? gs[i] : P.gStatic;
      return Object.assign({ g }, evalSector(P, g, T, X));
    });
    const nn = n != null ? n : X.Nmax * hill0(T, X.Tnew);
    const m = macro(sectors, out.map((o) => o.V), X, nn);
    const automation = out.reduce((a, o, i) => a + m.shares[i] * (1 - o.eps), 0) / Math.max(1e-9, 1 - m.newShare);
    return Object.assign({ T, sectors: out, n: nn, automation }, m);
  }

  // ---------------- 3. Dynamic loop (t → t+1) ----------------
  // T_{t+1}   = T_t [ 1 + r0 V_RD^φ · min(1, V_core) · V_macro^ψ · drag(T_t) ]
  //   original: drag = 1 / (1 + T/T_half)
  //   extended: drag = (1 + 1/T_half) / (1 + T/T_half)   (so year-1 growth = r0 exactly)
  //   setback:  T_{Y} ← max(1, T_{Y} (1 − size))
  // g*_i(T)   = g_max / (1 + (T_crit/T)^k);  g_{t+1} = g_t + α (g* − g_t)
  // n*(T)     = N_max · hill0(T, T_new);      n_{t+1} = n_t + speed (n* − n_t)
  // h(T)      = h_max · hill0(T, T_risk);     survival_{t+1} = survival_t (1 − h)
  function simulate(state) {
    const X = globalsFor(state);
    const years = Math.max(1, Math.round(state.years));
    const r0 = state.r0 / 100, phi = state.phi, Thalf = Math.max(1, state.Thalf);
    const rdIdx = state.sectors.findIndex((s) => s.rd);
    const start = state.startYear || 2026;
    let T = 1, n = 0, surv = 1;
    let gs = state.sectors.map(() => 0);
    const rows = [];
    for (let t = 0; t <= years; t++) {
      const snap = snapshot(state, T, gs, t, n);
      const Vrd = rdIdx >= 0 ? snap.sectors[rdIdx].V : 1;
      const brake = snap.hasC ? Math.min(1, snap.Vcore) : 1;
      const invest = X.psi ? Math.pow(snap.Vmacro, X.psi) : 1;
      const drag = (X.normaliseDrag ? 1 + 1 / Thalf : 1) / (1 + T / Thalf);
      const growth = r0 * Math.pow(Math.max(Vrd, 1e-9), phi) * brake * invest * drag;
      const hazard = X.hmax * hill0(T, X.Trisk);
      const Vexp = snap.Vmacro * (1 - (1 - surv) * X.loss);
      rows.push(Object.assign({ t, year: start + t, growth, Vrd, brake, invest, drag, hazard, survival: surv, pCat: 1 - surv, Vexp }, snap));
      // update for next year
      gs = gs.map((g, i) => {
        const P = sectorParams(state.sectors[i], t, X.slopLearning);
        return g + P.alpha * (P.gmax * hill(T, P.Tcrit) - g);
      });
      n = n + X.newSpeed * (X.Nmax * hill0(T, X.Tnew) - n);
      surv = surv * (1 - hazard);
      T = T * (1 + growth);
      if (X.setbackSize > 0 && start + t + 1 === X.setbackYear) T = Math.max(1, T * (1 - X.setbackSize));
    }
    return rows;
  }

  function sweep(state, Tlo, Thi, n) {
    const pts = [];
    for (let k = 0; k <= n; k++) {
      const T = Math.exp(Math.log(Tlo) + (Math.log(Thi) - Math.log(Tlo)) * k / n);
      const s = snapshot(state, T, null, 0);
      pts.push({ T, Vmacro: s.Vmacro, Vcore: s.Vcore, Vflex: s.Vflex });
    }
    return pts;
  }

  // ---------------- 4. Uncertainty (Monte Carlo) ----------------
  // Each uncertain input is multiplied by exp(spread · z), z ~ N(0,1), then clamped to its slider range.
  const SECTOR_RANGES = { f: [0, 95], fmax: [0, 95], p: [0, 100], eta: [0, 10], gamma: [0, 10], gmax: [0, 90], g: [0, 90], Tcrit: [2, 30], alpha: [5, 30] };
  const GLOBAL_RANGES = { r0: [5, 60], phi: [0, 1], Thalf: [5, 50], beta: [0, 1], dEta: [0, 1], dGamma: [0, 1], psi: [0, 1], Nmax: [0, 100], Tnew: [2, 50], hmax: [0, 20], Trisk: [2, 100] };

  function rng(seed) {
    let s = seed >>> 0;
    return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  function gauss(r) { let u = 0; while (u === 0) u = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r()); }

  function perturb(state, r, spread) {
    const s = JSON.parse(JSON.stringify(state));
    const j = (v, [lo, hi]) => clamp(v * Math.exp(spread * gauss(r)), lo, hi);
    Object.keys(GLOBAL_RANGES).forEach((k) => { if (typeof s[k] === 'number') s[k] = j(s[k], GLOBAL_RANGES[k]); });
    s.sectors.forEach((sec) => {
      Object.keys(SECTOR_RANGES).forEach((k) => { if (typeof sec[k] === 'number') sec[k] = j(sec[k], SECTOR_RANGES[k]); });
      if (sec.fmax < sec.f) sec.fmax = sec.f;
    });
    return s;
  }

  function quantile(sorted, q) {
    const pos = (sorted.length - 1) * q, lo = Math.floor(pos), hi = Math.ceil(pos);
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
  }

  function monteCarlo(state, runs, spread, seed) {
    const r = rng(seed || 12345);
    const series = { Vmacro: [], Vexp: [], T: [] };
    for (let k = 0; k < runs; k++) {
      const rows = simulate(perturb(state, r, spread));
      series.Vmacro.push(rows.map((x) => x.Vmacro));
      series.Vexp.push(rows.map((x) => x.Vexp));
      series.T.push(rows.map((x) => x.T));
    }
    const out = {};
    Object.keys(series).forEach((key) => {
      const m = series[key], len = m[0].length;
      out[key] = { p10: [], p50: [], p90: [] };
      for (let y = 0; y < len; y++) {
        const col = m.map((row) => row[y]).sort((a, b) => a - b);
        out[key].p10.push(quantile(col, 0.1)); out[key].p50.push(quantile(col, 0.5)); out[key].p90.push(quantile(col, 0.9));
      }
    });
    return out;
  }

  function monteCarloSnapshot(state, T, runs, spread, seed) {
    const r = rng(seed || 12345);
    const vals = [];
    for (let k = 0; k < runs; k++) vals.push(snapshot(perturb(state, r, spread), T, null, 0).Vmacro);
    vals.sort((a, b) => a - b);
    return { p10: quantile(vals, 0.1), p50: quantile(vals, 0.5), p90: quantile(vals, 0.9) };
  }

  const api = { K, G_CAP, F_CAP, hill, hill0, globalsFor, sectorParams, sectorValueAt, slopPeak, evalSector, macro, snapshot, simulate, sweep, monteCarlo, monteCarloSnapshot, perturb };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.AIModel = api;
})(typeof window !== 'undefined' ? window : this);
