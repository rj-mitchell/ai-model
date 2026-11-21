/*
 * AI Transformation Model — calculation engine.
 *
 * Implements the "final final equation" (static snapshot engine) and the
 * 2-line dynamic loop (t -> t+1) exactly as specified, with the bounded
 * slider conversions from the "Bounded Slider Spec".
 *
 * Works in the browser (window.AIModel) and in Node (module.exports).
 */
(function (root) {
  'use strict';

  // ---------- Slider (UI units) -> equation parameters ----------
  // UI units:
  //   f, g, gmax, p   : 0–100 (%)       -> x / 100
  //   eta, gamma      : 0–10 severity   -> x / 20
  //   fragility       : 0–10            -> rho = 1 - x
  //   Wcore           : 20–80 (%)       -> x / 100
  //   weight          : 1–100           -> normalised within tier
  //   r0, alpha, slopLearning : %       -> x / 100
  const G_CAP = 0.9; // redesign hard cap from the slider spec (prevents eps = 0)

  function sectorParams(s, t, slopLearning) {
    const decay = Math.pow(1 - (slopLearning || 0) / 100, t || 0);
    return {
      f: clamp(s.f / 100, 0, 1),
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

  function clamp(x, a, b) { return Math.min(b, Math.max(a, x)); }

  // ---------- 1. Sector level ----------
  // eps_i(T) = (1 - f_i)(1 - g_i(T))
  // S_i(T)   = 1 / (eps_i + (1 - eps_i) / T_eff)
  // V_i(T)   = (1 + p_i (S_i - 1)) / (1 + (eta_i ln T_eff + gamma_i ln T) S_i)
  function sectorValueAt(P, g, T, Teff) {
    const eps = (1 - P.f) * (1 - g);
    const S = 1 / (eps + (1 - eps) / Teff);
    const V = (1 + P.p * (S - 1)) / (1 + (P.eta * Math.log(Teff) + P.gamma * Math.log(T)) * S);
    return { eps, S, V };
  }

  // Deployment rule:
  //   Private  -> T_eff = min(T, T*), T* = the usage level that maximises V_i
  //               (the sector's Slop Peak; external gamma*ln(T) is not theirs to cap)
  //   Commons  -> T_eff = T
  function slopPeak(P, g, T) {
    if (T <= 1) return 1;
    // Coarse log-grid search, then golden-section refinement.
    const N = 120;
    const lnT = Math.log(T);
    let bestI = 0, bestV = -Infinity;
    for (let i = 0; i <= N; i++) {
      const t = Math.exp((lnT * i) / N);
      const v = sectorValueAt(P, g, T, t).V;
      if (v > bestV) { bestV = v; bestI = i; }
    }
    let a = Math.max(0, bestI - 1) * lnT / N;
    let b = Math.min(N, bestI + 1) * lnT / N;
    const phi = (Math.sqrt(5) - 1) / 2;
    const f = (x) => -sectorValueAt(P, g, T, Math.exp(x)).V;
    let c = b - phi * (b - a), d = a + phi * (b - a);
    for (let k = 0; k < 40; k++) {
      if (f(c) < f(d)) b = d; else a = c;
      c = b - phi * (b - a); d = a + phi * (b - a);
    }
    return Math.exp((a + b) / 2);
  }

  function evalSector(P, g, T) {
    const Tstar = slopPeak(P, g, T);
    const Teff = P.private ? Math.min(T, Tstar) : T;
    const r = sectorValueAt(P, g, T, Teff);
    return { eps: r.eps, S: r.S, V: r.V, Teff, Tstar, capped: P.private && Tstar < T - 1e-6 };
  }

  // ---------- 2. Macro level ----------
  // V_core  = ( sum w_i V_i^rho )^(1/rho)       (rho < 0: weak link; rho -> 0: geometric)
  // V_flex  = sum w_j V_j
  // V_macro = V_core^Wcore * (Wcore V_core + Wflex V_flex)^Wflex
  function cesMean(vals, ws, rho) {
    if (!vals.length) return 1;
    if (Math.abs(rho) < 1e-9) {
      let s = 0; for (let i = 0; i < vals.length; i++) s += ws[i] * Math.log(vals[i]);
      return Math.exp(s);
    }
    let s = 0; for (let i = 0; i < vals.length; i++) s += ws[i] * Math.pow(vals[i], rho);
    return Math.pow(s, 1 / rho);
  }

  function tierWeights(sectors, tier) {
    const idx = [];
    let tot = 0;
    sectors.forEach((s, i) => { if (s.tier === tier) { idx.push(i); tot += Math.max(0, s.weight); } });
    const w = {};
    idx.forEach((i) => { w[i] = tot > 0 ? Math.max(0, sectors[i].weight) / tot : 1 / idx.length; });
    return w;
  }

  function macro(sectors, Vs, globals) {
    const rho = 1 - globals.fragility;
    const Wc = clamp(globals.Wcore / 100, 0, 1), Wf = 1 - Wc;
    const wc = tierWeights(sectors, 'core'), wf = tierWeights(sectors, 'flex');
    const ci = Object.keys(wc).map(Number), fi = Object.keys(wf).map(Number);
    const Vcore = cesMean(ci.map((i) => Vs[i]), ci.map((i) => wc[i]), rho);
    const Vflex = fi.length ? fi.reduce((a, i) => a + wf[i] * Vs[i], 0) : 1;
    const Vmacro = Math.pow(Vcore, Wc) * Math.pow(Wc * Vcore + Wf * Vflex, Wf);
    return { Vcore, Vflex, Vmacro, rho, weights: Object.assign({}, wc, wf) };
  }

  // ---------- Static snapshot (T is a scenario dial) ----------
  function snapshot(state, T, gs, t) {
    const sectors = state.sectors;
    const out = sectors.map((s, i) => {
      const P = sectorParams(s, t, state.slopLearning);
      const g = gs ? gs[i] : P.gStatic;
      return Object.assign({ g }, evalSector(P, g, T));
    });
    const m = macro(sectors, out.map((o) => o.V), state);
    return Object.assign({ T, sectors: out }, m);
  }

  // ---------- Dynamic loop (t -> t+1) ----------
  // Option B soft slowdown + smooth S-curve redesign:
  // T_{t+1}   = T_t [ 1 + r0 (V_RD,t)^phi * min(1, V_core,t) / (1 + T_t / T_half) ]
  // g*_i(T_t) = g_i,max / (1 + (T_crit,i / T_t)^k),  k = 2.5
  // g_{i,t+1} = g_{i,t} + alpha_i (g*_i(T_t) - g_{i,t})
  const K_STEEPNESS = 2.5;
  function redesignTarget(P, T) { return P.gmax / (1 + Math.pow(P.Tcrit / T, K_STEEPNESS)); }

  function simulate(state) {
    const years = Math.max(1, Math.round(state.years));
    const r0 = state.r0 / 100, phi = state.phi, Thalf = Math.max(1, state.Thalf);
    const rdIdx = state.sectors.findIndex((s) => s.rd);
    let T = 1;
    let gs = state.sectors.map(() => 0);
    const rows = [];
    for (let t = 0; t <= years; t++) {
      const snap = snapshot(state, T, gs, t);
      const Vrd = rdIdx >= 0 ? snap.sectors[rdIdx].V : 1;
      const brake = Math.min(1, snap.Vcore);
      const drag = 1 / (1 + T / Thalf);
      const growth = r0 * Math.pow(Math.max(Vrd, 1e-9), phi) * brake * drag;
      rows.push(Object.assign({ t, year: (state.startYear || 2026) + t, growth, Vrd, brake, drag }, snap));
      // update for next year
      const nextG = gs.map((g, i) => {
        const P = sectorParams(state.sectors[i], t, state.slopLearning);
        return g + P.alpha * (redesignTarget(P, T) - g);
      });
      T = T * (1 + growth);
      gs = nextG;
    }
    return rows;
  }

  // V_macro as a function of T for the static sweep chart
  function sweep(state, Tlo, Thi, n) {
    const pts = [];
    for (let k = 0; k <= n; k++) {
      const T = Math.exp(Math.log(Tlo) + (Math.log(Thi) - Math.log(Tlo)) * k / n);
      const s = snapshot(state, T, null, 0);
      pts.push({ T, Vmacro: s.Vmacro, Vcore: s.Vcore, Vflex: s.Vflex });
    }
    return pts;
  }

  const api = { K_STEEPNESS, redesignTarget, simulate, snapshot, sweep, sectorParams, evalSector, sectorValueAt, macro, slopPeak, G_CAP };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.AIModel = api;
})(typeof window !== 'undefined' ? window : this);
