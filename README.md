# AI Transformation Model

An interactive site for the sector/macro equation (and its dynamic, year-by-year version) developed in the Gemini conversation *Evaluating AI Doomer Math Predictions*.

Open `index.html` in a browser, or serve the folder (`python3 -m http.server`). No build step.

## What it models

**Sector level.** For each sector *i*, with useful AI work *T* (a multiple of end-2026):

- Bottleneck: `ε_i = (1 − f_i)(1 − g_i)`
- Clean speedup: `S_i = 1 / (ε_i + (1 − ε_i) / T_eff)`
- Net value: `V_i = (1 + p_i (S_i − 1)) / (1 + (η_i ln T_eff + γ_i ln T) S_i)`
- Deployment: Private sectors use `T_eff = min(T, T*)`, where `T*` is the Slop Peak (computed numerically as the usage level that maximises `V_i`). Commons sectors use `T_eff = T`.

**Macro level.**

- `V_core = (Σ w̃_i V_i^ρ)^(1/ρ)` (weak link, ρ < 0)
- `V_flex = Σ w̃_j V_j`
- `V_macro = V_core^W_core · (W_core V_core + W_flex V_flex)^W_flex`

**Dynamic loop** (t → t+1, starting at `T_0 = 1`, `g_i,0 = 0` in 2026):

- `T_{t+1} = T_t [1 + r_0 · V_R&D,t^φ · min(1, V_core,t) · (1 − T_t / T_max)]`
- `g_{i,t+1} = g_{i,t} + α_i (g_i,max − g_{i,t})` once `T_t ≥ T_crit,i`, else unchanged
- Optional: η and γ decay by a fixed %/yr ("slop learning").

## Slider conversions (bounded slider spec)

| Slider | Range | Maps to |
|---|---|---|
| Useful AI work | 1×–100× (log) | `T = x` |
| Native fit | 0–100% | `f = x/100` |
| Workflow redesign / ceiling | 0–90% | `g = x/100` |
| Real wealth vs arms race | 0–100% | `p = x/100` |
| Internal slop, external spam | 0–10 | `η, γ = x/20` |
| Core fragility | 0–10 | `ρ = 1 − x` |
| Core share | 20–80% | `W_core = x/100` |
| Sector weight | 1–100 | normalised within tier |

## Files

- `model.js`: the calculation engine (no DOM; also loads in Node via `require('./model.js')`).
- `app.js`: controls, charts (hand-built SVG) and tables.
- `index.html`: layout, styles and the typeset equations (MathJax from jsDelivr).

The default economy and the three "Round" presets are the conversation's six-sector example. With Healthcare deployed privately, the engine reproduces its worked numbers (Round 1: 1.15×, Round 2: 1.45×, Round 3 cyber-slop shock: 0.70×).
