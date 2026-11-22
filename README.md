# AI Transformation Model

An interactive simulator of how AI capability turns into economic value, sector by sector, once bottlenecks, arms races, slop and weak links are accounted for. It is built to highlight irreducibility: native fit, rebuilding and new products have fixed ceilings, so some limits never dissolve however capable AI becomes. It was developed from the Gemini conversation *Evaluating AI Doomer Math Predictions* (https://share.gemini.google/WyXAFP6PUBY5) and a stress test of the model it produced.

**A simplified model of an advanced economy.** The whole economy is represented by only six broad sectors, each between 13% and 20% of GDP, sized from US data (BEA 2025 value added) as a template for advanced economies: Physical production & energy (17.5%), Trade & logistics (15.5%), Health, education & government (19.7%) and Finance & business services (13.5%) in the essential Core; Knowledge & professional services (13.7%) and Property, hospitality & personal services (19.8%) in the flexible tier. Results are scenarios, shown to two significant figures.

**Evidence-based defaults.** Sector settings come from published evidence where it exists, rounded, with judgement filling the gaps. `model.js` holds each sector's plausible range, confidence and sources (`evidence`), the economy-wide ones (`GLOBAL_EVIDENCE`) and the source list (`SOURCES`); the model page shows them under each slider.
- Sector sizes: BEA value added 2025, entered directly as shares of GDP. Core is about 66%, Flex about 34%. Legal, advertising and trading sit inside larger sectors, so their arms races lower those sectors' real-wealth shares.
- Native fit today and ceiling: Eloundou et al. occupation exposure re-weighted to each sector by ACS 2023 hours worked (β 0.24–0.54; with LLM software 0.38–0.86); McKinsey Global Institute 2025 for robotics.
- Adoption: about 6% of US work hours AI-assisted in 2026 (Real-Time Population Survey), so about a fifth of what AI could do is in use (a0 = 20%).
- Today's AI speedup: field trials and survey evidence, about 1.4×.
- Real-wealth share, review burden, fraud exposure and rebuilding speed: judgement anchored on finance, advertising, litigation and health-waste research, hallucination and breach data, and historical adoption lags. Review burden and exposure are scored 0–10 and divided by 200; that scale is calibrated so slop and fraud cost about 1% of output by 2028.

Open `index.html` in a browser, or serve the folder (`python3 -m http.server`). No build step.

## What the numbers measure

Every V (sector, Core, Flex, macro) is a multiple of what output would be without further AI: real output relative to a world where AI stays at its end-2026 level and use. 1.0× is that world. GDP paths (2027 = 1) add trend growth from everything except AI to both worlds: `GDP = V_macro × 1.02^t` with AI and `1.02^t` without further AI, using 2.0%/yr, the current advanced-economy average (IMF WEO, October 2026).

## Plain-English names on the pages

The pages avoid jargon: Core and Flex sectors are called **essential** and **flexible**; slop or review burden is **checking costs**; the real-wealth share is **new wealth vs arms race**; workflow redesign is **rebuilding around AI**; native fit is **work AI can speed up**; the Monte Carlo 80% band is the **likely range**. The equations are in a collapsible "How the model works" section, and each slider's evidence is a collapsible note.

## What you can set

**Six dials:** years to simulate; the AGI year (default 2050, the median expert); the speed of AI progress `r_0` (25%/yr); adoption speed `λ` (25%/yr); the human-in-the-loop share `h` (25%); and the mature size of AI-native products `N_max` (10% of today's economy). Presets cover superforecasters (AGI 2047), forecasting sites (~2031), AI lab leaders (~2028), a robotics breakthrough, a sustained cyber-attack on finance and slow institutions.

**Per sector (nine settings, each with evidence):** share of GDP, native fit today `f_0` and its ceiling `f_max`, real-wealth share `p`, review burden `η`, exposure to fraud and attack `γ`, rebuilding ceiling `g_max`, rebuilding midpoint `T_crit` and rebuilding speed `α`, plus the Core/Flex tier. Core's weight in the economy is the Core sectors' combined share of GDP (about two-thirds).

**Fixed assumptions** (`FIXED` and `FIXED_INFO` in `model.js`, listed with evidence on the page): today's AI speedup A = 1.4×; 20% of available fit in use at end-2026; J-curve cost 0.25; payoff response ν = 0.25; R&D feedback φ = 0.4; diminishing returns T_half = 15; growth cap 200%/yr; review burden falls by half as AI broadens; defensive AI δγ = 0.1; Core–Flex complementarity ρm = −0.5; weak links inside Core ρ = −4; new products reach half size near T = 10 and close 15% of the gap a year; trend growth 2.0%/yr. These had little effect on results or have strong evidence behind them. The uncertainty band still varies them.

**Removed in the simplification:** the single-snapshot mode, the catastrophe overlay, the one-off setback, the Private/Commons deployment toggle, the Flex-dependence term and the user-set uncertainty controls. Results are essentially unchanged.

## Sector level

- Available native fit: `f*_i(T) = f_max − (f_max − f_0) T^(−β)`, capped at 95%. β is calibrated so that by the AGI year `f*` has closed 90% of the gap to its ceiling.
- Native fit in use `a_i` lags behind `f*_i` (see the dynamic loop).
- Bottleneck: `ε_i = (1 − a_i)(1 − g_i)`. Work done with AI splits into assisted work in old processes, `a_i (1 − g_i)`, where a share `h` stays human so its speedup is capped at `1/h`, and autonomous work that has been rebuilt around AI (plant, equipment, sites, systems, rules, contracts and roles), `g_i`, which speeds up fully: `τ_i = ε_i + a_i(1 − g_i)(h + (1 − h)/(Â T_eff)) + g_i/(Â T_eff)`, with `1/A = h + (1 − h)/Â`.
- End-2026 baseline `τ_i,0 = ε_i,0 + (1 − ε_i,0)/A` with `ε_i,0 = 1 − a_0 f_0`; speedup `S_i = τ_i,0 / τ_i`, so adoption and rebuilding around today's AI pay off even without new capability.
- Net value: `V_i = (1 + p_i (S_i − 1)) / (1 + (η̂_i ln T_eff + γ_i T^(−δγ) ln T) S_i)`, with `η̂ = η (1 − 0.5 c)`, `c = 1 − T^(−β)`.
- Deployment: every sector uses `T_eff = min(T, T*)`, where `T*` (the Slop Peak) is the usage level that maximises `V_i`. Fraud and attack scale with the full `T`.

## Macro level

- `V_core = (Σ w̃_i V_i^ρ)^(1/ρ)` (weak link, ρ = −4), `V_flex = Σ w̃_j V_j`
- `V_macro = (Wc V_core^ρm + Wf V_flex^ρm)^(1/ρm) + n_t`, ρm = −0.5, so spending shifts toward the slower tier (Baumol effect; spending shares are shown). `n_t` is AI-native products.
- A tier with no sectors is left out.

## Dynamic loop (quarterly steps, reported yearly)

- `x = r_0 V_R&D^φ min(1, V_core) (1 + 1/T_half)/(1 + T/T_half)` (year-one growth equals `r_0`); `V_R&D` is Knowledge & professional services.
- Speed limit: `growth = x / (1 + (x/cap)^4)^(1/4)`; `T ← T (1 + growth)^Δt`, `Δt = 1/4`
- Adoption (S-curve): `da/dt = λ m a (1 − a / f*(T))`, `a_0 = 0.2 f_0`. Adoption, rebuilding and new-product speeds are multiplied by `m = (ln R / ln 1.4)^0.25`, where `R` is the current speedup on assisted work, so diffusion speeds up as AI's advantage grows (Griliches 1957).
- J-curve: `cost_i = 0.25 · max(0, rate_i − rate_i,0)`, where rate is the yearly rise in the automated share and rate_0 is today's pace; `V_i ← V_i (1 − cost_i)`. AI adds about 0.3% to growth in 2027, peaking at about 5% a year in the late 2030s on the median expert's timeline.
- Rebuilding around AI: `g_{t+1} = g_t + α m (g_max / (1 + (T_crit/T)^2.5) − g_t)`.
- New products: `n_{t+1} = n_t + s m (N_max H(T, 10) − n_t)`, s = 15%/yr
- `H(T, m) = (T^k − 1)/(T^k − 1 + m^k)`, `k = 2.5`
- Annual gap-closing rates are applied per quarter as `1 − (1 − rate)^(1/4)`.

## Outputs

GDP with and without further AI; useful AI work T; sector values; rebuilding around AI; spending shares; share of tasks done with AI; a year-by-year table (copy as CSV). The headline is the median of 150 Monte Carlo runs, with the 80% range. Every input, including the fixed assumptions, is varied by ±25% (clamped to its plausible range), with sector errors partly shared (correlation 0.5).

## Robotics

Robotics is only partly included. The native-fit ceilings for hands-on sectors include the robotics allowance in exposure studies and McKinsey's estimate (2025) that robots with demonstrated technology could take about 13% of US work hours. Robots are not modelled as their own technology with their own costs and build-out, and the ceilings are fixed. `applyRobotics()` in `model.js` (the "Robotics breakthrough" preset) raises the native-fit ceilings of the four hands-on sectors to at least 85% and their rebuilding ceilings by 20 points: output vs no further AI in 2050 rises from about 1.8× to 2.3×, and the peak boost from about 5% to 7% a year. The explainer compares the two.

## Known limitations (also listed on the page)

Fixed ceilings by design (irreducibility); only partly calibrated; six broad sectors; no labour market (automation is a task measure, not jobs or wages); catastrophic risk not modelled; Red Queen sectors lose from every speedup (by design); new products, capability breadth and defensive AI are the most speculative mechanisms; some assumptions fixed for simplicity; deterministic central run with no shocks.

## Files

- `model.js`: calculation engine (no DOM; loads in Node via `require('./model.js')`).
- `model.js` also holds the default economy (`defaultState()`), shared by both pages.
- `app.js`: controls, charts (hand-built SVG), Monte Carlo scheduling and tables.
- `index.html`: layout, styles, typeset equations (MathJax from jsDelivr) and limitations.
- `why.html`: explainer on why the model doesn't go exponential and what singularity arguments leave out. All its numbers are computed live from `model.js` defaults.

## Publishing

The site is deployed as the Cloudflare Worker `ai-transformation-model` (static assets, `wrangler.jsonc`), at https://ai-transformation-model.uk-rob-mitchell.workers.dev. The **Publish the site** GitHub Action (`.github/workflows/publish.yml`) deploys it whenever the site files change on `main` or the working branch, and can be run by hand from the Actions tab. It needs a repository secret, `CLOUDFLARE_API_TOKEN`: a Cloudflare token that can edit Workers (Settings → Secrets and variables → Actions). From a computer: `CLOUDFLARE_API_TOKEN=… npx wrangler@4 deploy`.
