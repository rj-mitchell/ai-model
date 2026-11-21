# AI Transformation Model

An interactive site for the sector/macro equation (and its dynamic, year-by-year version) developed in the Gemini conversation *Evaluating AI Doomer Math Predictions* (latest share: https://share.gemini.google/WyXAFP6PUBY5), plus extensions that fix the weaknesses found when stress-testing it.

Open `index.html` in a browser, or serve the folder (`python3 -m http.server`). No build step.

## Two equation sets

- **Gemini original**: exactly the conversation's equation and dynamic loop (Option B soft slowdown, S-curve redesign). Reproduces its worked numbers: Round 1 1.15×, Round 2 1.45×, Round 3 cyber shock 0.71×.
- **Extended** (default): the same core plus the fixes below. Every extension has a neutral value that switches it off.

## Sector level

- Native fit: `f_i(T) = f_max − (f_max − f_0) T^(−β)` (extended; `β = 0` keeps `f` fixed). Capped at 95%.
- Bottleneck: `ε_i = (1 − f_i)(1 − g_i)`; clean speedup `S_i = 1 / (ε_i + (1 − ε_i) / T_eff)`
- Net value: `V_i = (1 + p_i (S_i − 1)) / (1 + (η_i T^(−δη) ln T_eff + γ_i T^(−δγ) ln T) S_i)` (extended terms `T^(−δ)`; `δ = 0` is the original)
- Deployment: Private sectors use `T_eff = min(T, T*)`, where `T*` (the Slop Peak) is the usage level that maximises `V_i`. Commons use `T_eff = T`.

## Macro level

- `V_core = (Σ w̃_i V_i^ρ)^(1/ρ)` (weak link), `V_flex = Σ w̃_j V_j`
- Original: `V_macro = V_core^Wc (Wc V_core + Wf V_flex)^Wf`
- Extended: `D = min(1, V_core)^κ`, `V_macro = (Wc V_core^ρm + Wf (D V_flex)^ρm)^(1/ρm) + D n_t`
  - `Wc` is now the true weight (the original gives Core 84% of the influence at 60/40).
  - `ρm < 0` makes Core and Flex complements (Baumol effect; spending shares are shown).
  - `n_t` is new AI-native products.
- A tier with no sectors is left out (previously it was silently set to 1.0).

## Dynamic loop

- `T_{t+1} = T_t [1 + r_0 V_R&D^φ min(1, V_core) V_macro^ψ (1 + 1/T_half)/(1 + T_t/T_half)]`. The extended terms are `V_macro^ψ` (investment feedback) and the `1 + 1/T_half` normalisation, so year-one growth equals `r_0`.
- Redesign: `g_{t+1} = g_t + α (g_max / (1 + (T_crit/T)^2.5) − g_t)`
- New products: `n_{t+1} = n_t + s (N_max H(T, T_new) − n_t)`
- Catastrophic risk: `survival_{t+1} = survival_t (1 − h_max H(T, T_risk))`; risk-adjusted value `= V_macro (1 − (1 − survival) × loss)`
- Setback: in a chosen year `T ← max(1, T (1 − size))`
- `H(T, m) = (T^k − 1)/(T^k − 1 + m^k)`, `k = 2.5`

## Outputs

Economy, Core and Flex over time with a Monte Carlo 80% band (every input randomly varied by ±spread, clamped to its slider range); useful AI work T; sector values; redesign; spending shares; spending-weighted share of tasks automated; cumulative catastrophe probability; year-by-year table (copy as CSV). The snapshot mode shows the static equation with T as a dial.

## Known limitations (also listed on the page)

Not calibrated; no labour market (automation is a task measure, not jobs or wages); catastrophic risk is a user-set overlay with no feedback; Red Queen sectors lose from every speedup (by design); the new-products, breadth and defence extensions are the most speculative; strong Core–Flex complementarity partly reintroduces the "SEO collapse" effect for whole-tier collapses; annual, deterministic runs with one optional shock.

## Files

- `model.js`: calculation engine (no DOM; loads in Node via `require('./model.js')`).
- `app.js`: controls, charts (hand-built SVG), Monte Carlo scheduling and tables.
- `index.html`: layout, styles, typeset equations (MathJax from jsDelivr) and limitations.
