# AI Transformation Model

An interactive simulator of how AI capability turns into economic value, sector by sector, once bottlenecks, arms races, slop and weak links are accounted for. It was developed from the Gemini conversation *Evaluating AI Doomer Math Predictions* (https://share.gemini.google/WyXAFP6PUBY5) and a stress test of the model it produced.

Open `index.html` in a browser, or serve the folder (`python3 -m http.server`). No build step.

## Sector level

- Native fit: `f_i(T) = f_max − (f_max − f_0) T^(−β)` (`β = 0` keeps `f` fixed). Capped at 95%.
- Bottleneck: `ε_i = (1 − f_i)(1 − g_i)`; clean speedup `S_i = 1 / (ε_i + (1 − ε_i) / T_eff)`
- Net value: `V_i = (1 + p_i (S_i − 1)) / (1 + (η_i T^(−δη) ln T_eff + γ_i T^(−δγ) ln T) S_i)`
- Deployment: Private sectors use `T_eff = min(T, T*)`, where `T*` (the Slop Peak) is the usage level that maximises `V_i`. Commons use `T_eff = T`.

## Macro level

- `V_core = (Σ w̃_i V_i^ρ)^(1/ρ)` (weak link), `V_flex = Σ w̃_j V_j`
- `D = min(1, V_core)^κ`, `V_macro = (Wc V_core^ρm + Wf (D V_flex)^ρm)^(1/ρm) + D n_t`
  - `Wc` is the true weight of Core in any change in the total.
  - `ρm < 0` makes Core and Flex complements (Baumol effect; spending shares are shown).
  - `n_t` is new AI-native products.
- A tier with no sectors is left out.

## Dynamic loop

- `T_{t+1} = T_t [1 + r_0 V_R&D^φ min(1, V_core) V_macro^ψ (1 + 1/T_half)/(1 + T_t/T_half)]` (year-one growth equals `r_0`)
- Redesign: `g_{t+1} = g_t + α (g_max / (1 + (T_crit/T)^2.5) − g_t)`
- New products: `n_{t+1} = n_t + s (N_max H(T, T_new) − n_t)`
- Catastrophic risk: `survival_{t+1} = survival_t (1 − h_max H(T, T_risk))`; risk-adjusted value `= V_macro (1 − (1 − survival) × loss)`
- Setback: in a chosen year `T ← max(1, T (1 − size))`
- `H(T, m) = (T^k − 1)/(T^k − 1 + m^k)`, `k = 2.5`

## Outputs

Economy, Core and Flex over time with a Monte Carlo 80% band (every input randomly varied by ±spread, clamped to its slider range); useful AI work T; sector values; redesign; spending shares; spending-weighted share of tasks automated; cumulative catastrophe probability; year-by-year table (copy as CSV). The snapshot mode shows the sector and macro equations with T as a dial.

## Known limitations (also listed on the page)

Not calibrated; no labour market (automation is a task measure, not jobs or wages); catastrophic risk is a user-set overlay with no feedback; Red Queen sectors lose from every speedup (by design); new products, capability breadth and defensive AI are the most speculative mechanisms; strong Core–Flex complementarity makes a whole-tier collapse costly; annual, deterministic runs with one optional shock.

## Files

- `model.js`: calculation engine (no DOM; loads in Node via `require('./model.js')`).
- `app.js`: controls, charts (hand-built SVG), Monte Carlo scheduling and tables.
- `index.html`: layout, styles, typeset equations (MathJax from jsDelivr) and limitations.
