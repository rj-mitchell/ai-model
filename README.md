# AI Transformation Model

An interactive simulator of how AI capability turns into economic value, sector by sector, once bottlenecks, arms races, slop and weak links are accounted for. It is built to highlight irreducibility: native fit, redesign and new products have fixed ceilings, so some limits never dissolve however capable AI becomes. It was developed from the Gemini conversation *Evaluating AI Doomer Math Predictions* (https://share.gemini.google/WyXAFP6PUBY5) and a stress test of the model it produced.

**A simplified model.** The whole economy is represented by only six broad sectors, each between 13% and 20% of US GDP (BEA 2025 value added): Physical production & energy (17.5%), Trade & logistics (15.5%), Health, education & government (19.7%) and Finance & business services (13.5%) in the essential Core; Knowledge & professional services (13.7%) and Property, hospitality & personal services (19.8%) in the flexible tier. Results are scenarios, shown to two significant figures.

**Evidence-based defaults.** Sector settings come from published evidence where it exists, rounded, with judgement filling the gaps. `model.js` holds each sector's plausible range, confidence and sources (`evidence`), the economy-wide ones (`GLOBAL_EVIDENCE`) and the source list (`SOURCES`); the model page shows them under each slider.
- Sector sizes: BEA value added 2025. Core is 65% (Physical 25 / Trade 25 / Health, education & government 30 / Finance & business 20 within Core); Flex is 35% (Knowledge 40 / Property & hospitality 60). Legal, advertising and trading sit inside larger sectors, so their arms races lower those sectors' real-wealth shares.
- Native fit today and ceiling: Eloundou et al. occupation exposure re-weighted to each sector by ACS 2023 hours worked (β 0.24–0.54; with LLM software 0.38–0.86); McKinsey Global Institute 2025 for robotics.
- Adoption: about 6% of US work hours AI-assisted in 2026 (Real-Time Population Survey), so about a fifth of what AI could do is in use (a0 = 20%).
- Today's AI speedup: field trials and survey evidence, about 1.4×.
- Real-wealth share, review burden, fraud exposure and redesign speed: judgement anchored on finance, advertising, litigation and health-waste research, hallucination and breach data, and historical adoption lags. Review burden and exposure are scored 0–10 and divided by 200; that scale is calibrated so slop and fraud cost about 1% of output by 2028.

Open `index.html` in a browser, or serve the folder (`python3 -m http.server`). No build step.

## What the numbers measure

Every V (sector, Core, Flex, macro) is a multiple of what output would be without further AI: real output relative to a world where AI stays at its end-2026 level and use. 1.0× is that world. GDP paths (2027 = 1) add trend growth from everything except AI to both worlds: `GDP = V_macro × 1.02^t` with AI and `1.02^t` without further AI, using 2.0%/yr, the current advanced-economy average (IMF WEO, October 2026).

## Sector level

- Available native fit: `f*_i(T) = f_max − (f_max − f_0) T^(−β)`. Capped at 95%.
- Native fit in use `a_i` lags behind `f*_i` (see the dynamic loop); the snapshot mode assumes full adoption.
- Bottleneck: `ε_i = (1 − a_i)(1 − g_i)`. Work done with AI splits into assisted work in old processes, `a_i (1 − g_i)`, where a human-in-the-loop share `h` (default 25%) stays human so its speedup is capped at `1/h`, and autonomous work in redesigned processes, `g_i`, which speeds up fully: `τ_i = ε_i + a_i(1 − g_i)(h + (1 − h)/(Â T_eff)) + g_i/(Â T_eff)`, with `1/A = h + (1 − h)/Â`.
- Capability breadth β is calibrated to an AGI year (default 2050, the median expert in the Forecasting Research Institute's 2026 LEAP panel): by then available native fit has closed 90% of the gap to its ceiling. Presets cover superforecasters (2047), forecasting sites (~2031) and AI lab leaders (~2028).
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
- Adoption (S-curve): `da/dt = λ a (1 − a / f*(T))`, `a_0 = a0 · f_0` (default 30% of native fit in use at end-2026, about 15% of all tasks; λ = 25%/yr)
- J-curve: `cost_i = J · max(0, rate_i − rate_i,0)`, where rate is the yearly rise in the automated share and rate_0 is today's pace; `V_i ← V_i (1 − cost_i)` (J = 2). AI adds about 0.4% to growth in 2027, peaking at about 4% a year in the mid-2030s.
- Redesign: `g_{t+1} = g_t + α (g_max / (1 + (T_crit/T)^2.5) − g_t)`. `T_crit` below 1× means today's AI already justifies more than half the redesign (default: Software 1×, Ad-Tech 1.5×, Banking and Law 3×, Energy 10×, Healthcare 15×).
- New products: `n_{t+1} = n_t + s (N_max H(T, T_new) − n_t)`
- Catastrophic risk: `survival_{t+1} = survival_t (1 − h_max H(T, T_risk))`; risk-adjusted value `= V_macro (1 − (1 − survival) × loss)`
- Setback: in a chosen year `T ← max(1, T (1 − size))`
- `H(T, m) = (T^k − 1)/(T^k − 1 + m^k)`, `k = 2.5`
- Annual gap-closing rates (λ, α, s) are applied per quarter as `1 − (1 − rate)^(1/4)`.

## Outputs

Economy, Core and Flex over time. The headline is the median of the Monte Carlo runs, with the 80% range and the central run beside it. Every input, including the structural dials, is randomly varied by ±spread (clamped to its slider range), and sector errors are partly shared (adjustable correlation); useful AI work T; sector values; redesign; spending shares; share of tasks automated, weighted both by the 2026 economy and by current spending; cumulative catastrophe probability; year-by-year table (copy as CSV). The snapshot mode shows the sector and macro equations with T as a dial.

## Robotics

Robotics is only partly included. The native-fit ceilings for hands-on sectors include the robotics allowance in exposure studies and McKinsey's estimate (2025) that robots with demonstrated technology could take about 13% of US work hours, and capability breadth lets AI reach more of each ceiling. Robots are not modelled as their own technology with their own costs and build-out, and the ceilings are fixed. `applyRobotics()` in `model.js` (the "Robotics breakthrough" preset) raises the ceilings of the four hands-on sectors to at least 85%, redesign ceilings by 20 points and breadth to 0.3: output vs no further AI in 2050 rises from about 1.7× to 2.4×, the peak boost from about 4% to 6.5% a year, and the ceiling with slop and arms races from 2.2× to 3.4×. The explainer compares the two.

## Known limitations (also listed on the page)

Fixed ceilings by design (irreducibility); not calibrated; no labour market (automation is a task measure, not jobs or wages); catastrophic risk is a user-set overlay with no feedback; Red Queen sectors lose from every speedup (by design); new products, capability breadth and defensive AI are the most speculative mechanisms; strong Core–Flex complementarity makes a whole-tier collapse costly; deterministic central run with one optional shock.

## Files

- `model.js`: calculation engine (no DOM; loads in Node via `require('./model.js')`).
- `model.js` also holds the default economy (`defaultState()`), shared by both pages.
- `app.js`: controls, charts (hand-built SVG), Monte Carlo scheduling and tables.
- `index.html`: layout, styles, typeset equations (MathJax from jsDelivr) and limitations.
- `why.html`: explainer on why the model doesn't go exponential and what singularity arguments leave out. All its numbers are computed live from `model.js` defaults.
