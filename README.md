# AI Transformation Model

An interactive simulator of how AI capability turns into economic value, sector by sector, once bottlenecks, arms races, slop and weak links are accounted for. It is built to highlight irreducibility: native fit, redesign and new products have fixed ceilings, so some limits never dissolve however capable AI becomes. It was developed from the Gemini conversation *Evaluating AI Doomer Math Predictions* (https://share.gemini.google/WyXAFP6PUBY5) and a stress test of the model it produced.

Open `index.html` in a browser, or serve the folder (`python3 -m http.server`). No build step.

## What the numbers measure

Every V (sector, Core, Flex, macro) is a multiple of what output would be without further AI: real output relative to a world where AI stays at its end-2026 level and use. 1.0× is that world. GDP paths (2026 = 1) add trend growth from everything except AI to both worlds: `GDP = V_macro × 1.02^t` with AI and `1.02^t` without further AI, using 2.0%/yr, the current advanced-economy average (IMF WEO, October 2026).

## Sector level

- Available native fit: `f*_i(T) = f_max − (f_max − f_0) T^(−β)` (`β = 0` keeps it fixed). Capped at 95%.
- Native fit in use `a_i` lags behind `f*_i` (see the dynamic loop); the snapshot mode assumes full adoption.
- Bottleneck: `ε_i = (1 − a_i)(1 − g_i)`
- Time per unit of work vs no AI: `τ_i = ε_i + (1 − ε_i)/(A T_eff)`; end-2026 baseline `τ_i,0 = ε_i,0 + (1 − ε_i,0)/A` with `ε_i,0 = 1 − a_0 f_0`
- Clean speedup vs end-2026: `S_i = τ_i,0 / τ_i`. `A` (default 2×) is how much faster today's AI already is on the work it is used for, so adoption and redesign pay off even without new capability (`A = 1` switches this off).
- Net value: `V_i = (1 + p_i (S_i − 1)) / (1 + (η_i T^(−δη) ln T_eff + γ_i T^(−δγ) ln T) S_i)`
- Deployment: Private sectors use `T_eff = min(T, T*)`, where `T*` (the Slop Peak) is the usage level that maximises `V_i`. Commons use `T_eff = T`.

## Macro level

- `V_core = (Σ w̃_i V_i^ρ)^(1/ρ)` (weak link), `V_flex = Σ w̃_j V_j`
- `D = min(1, V_core)^κ`, `V_macro = (Wc V_core^ρm + Wf (D V_flex)^ρm)^(1/ρm) + D n_t`
  - `Wc` is the true weight of Core in any change in the total.
  - `ρm < 0` makes Core and Flex complements (Baumol effect; spending shares are shown).
  - `n_t` is new AI-native products.
- A tier with no sectors is left out.

## Dynamic loop (quarterly steps, reported yearly)

- `x = r_0 V_R&D^φ min(1, V_core) (1 + 1/T_half)/(1 + T/T_half)` (year-one growth equals `r_0`)
- Speed limit: `growth = x / (1 + (x/cap)^4)^(1/4)`; `T ← T (1 + growth)^Δt`, `Δt = 1/4`
- Adoption: `a_{t+1} = a_t + λ (f*(T) − a_t)`, `a_0 = a0 · f_0` (default 30% of native fit in use at end-2026, about 15% of all tasks)
- Redesign: `g_{t+1} = g_t + α (g_max / (1 + (T_crit/T)^2.5) − g_t)`. `T_crit` below 1× means today's AI already justifies more than half the redesign (default: Software 1×, Ad-Tech 1.5×, Banking and Law 3×, Energy 10×, Healthcare 15×).
- New products: `n_{t+1} = n_t + s (N_max H(T, T_new) − n_t)`
- Catastrophic risk: `survival_{t+1} = survival_t (1 − h_max H(T, T_risk))`; risk-adjusted value `= V_macro (1 − (1 − survival) × loss)`
- Setback: in a chosen year `T ← max(1, T (1 − size))`
- `H(T, m) = (T^k − 1)/(T^k − 1 + m^k)`, `k = 2.5`
- Annual gap-closing rates (λ, α, s) are applied per quarter as `1 − (1 − rate)^(1/4)`.

## Outputs

Economy, Core and Flex over time. The headline is the median of the Monte Carlo runs, with the 80% range and the central run beside it. Every input, including the structural dials, is randomly varied by ±spread (clamped to its slider range), and sector errors are partly shared (adjustable correlation); useful AI work T; sector values; redesign; spending shares; share of tasks automated, weighted both by the 2026 economy and by current spending; cumulative catastrophe probability; year-by-year table (copy as CSV). The snapshot mode shows the sector and macro equations with T as a dial.

## Known limitations (also listed on the page)

Fixed ceilings by design (irreducibility); not calibrated; no labour market (automation is a task measure, not jobs or wages); catastrophic risk is a user-set overlay with no feedback; Red Queen sectors lose from every speedup (by design); new products, capability breadth and defensive AI are the most speculative mechanisms; strong Core–Flex complementarity makes a whole-tier collapse costly; deterministic central run with one optional shock.

## Files

- `model.js`: calculation engine (no DOM; loads in Node via `require('./model.js')`).
- `model.js` also holds the default economy (`defaultState()`), shared by both pages.
- `app.js`: controls, charts (hand-built SVG), Monte Carlo scheduling and tables.
- `index.html`: layout, styles, typeset equations (MathJax from jsDelivr) and limitations.
- `why.html`: explainer on why the model doesn't go exponential and what singularity arguments leave out. All its numbers are computed live from `model.js` defaults.
