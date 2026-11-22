# AI Transformation Model

An interactive model of how AI capability turns into economic output in an advanced economy, sector by sector, once bottlenecks, checking, fraud, arms races and weakest links are accounted for. It is built to highlight irreducibility: the ceilings on what AI can do, on rebuilding work around it and on new products are fixed, so some limits never dissolve however capable AI becomes. The explainer (`why.html`) shows what each limit costs and what happens if they are all removed.

Live at https://ai-transformation-model.uk-rob-mitchell.workers.dev. Every number is also available as data: `/data.json` (results), `/model.json` (settings and evidence) and `/llms.txt` (a plain-text guide for machines).

**A simplified model.** Six broad sectors, each 13–20% of GDP, sized from US data (BEA 2025 value added) as a template for advanced economies: Physical production & energy (17.5%), Trade & logistics (15.5%), Health, education & government (19.7%) and Finance & business services (13.5%) are **essential**; Knowledge & professional services (13.7%) and Property, hospitality & personal services (19.8%) are **flexible**. Results are scenarios, shown to two significant figures.

**Default result (median expert, AGI 2050):** GDP about 2.1× what it would be without further AI by 2050 (useful output about 1.9×). AI adds about 0.3% to growth in 2027, peaks at about 5.3% a year around 2039, and fades to under 1% a year by the 2060s while useful AI work keeps compounding. The long-run ceiling is about 3.2×, or 2.2× without the extra capital that higher output pays for.

## What you can set

**Six dials:** years to simulate; the AGI year (default 2050, the median expert in the Forecasting Research Institute's 2026 LEAP panel); the speed of AI progress (25%/yr); adoption speed (25%/yr); the human-in-the-loop share (25%); and the mature size of AI-native products (10% of today's economy). Presets cover superforecasters, forecasting sites, AI lab leaders, a robotics breakthrough, a sustained cyber-attack on finance and slow institutions.

**Per sector (each with evidence, shown under its slider):** share of GDP, work AI can speed up today and ever, new wealth vs arms race, checking costs, exposure to fraud and attack, rebuilding ceiling, midpoint and speed, and whether it is essential or flexible.

**Fixed assumptions** (`FIXED` and `FIXED_INFO` in `model.js`, listed with evidence and sources on the page): today's AI speedup (1.4×); AI-ready work already using AI (20%); up-front cost of change (1.5); adoption responding to payoff (0.25); AI research feedback (φ 0.4); diminishing returns in AI progress (θ 0.22, from research productivity falling ~5% a year); output funding AI progress (λ 0.5); essential sectors speeding or slowing AI (ψ 0.5); speed limit (200%/yr); checking time (0.3 per unit of AI work at a score of 10, halving as AI broadens); fraud and attack losses (5% at a score of 10, rising with attack volume 1 − E^−0.5, half offset by defence at full breadth); elasticities of substitution (≈0.2 within essential sectors, 1.5 within flexible, ≈0.67 between them); capital share 35% and depreciation 5%; workers closing 20% of the gap to the best allocation a year; new products; trend growth 2.0%/yr. The uncertainty band varies all of them by about ±25%.

## Plain-English names

The pages avoid jargon: essential and flexible sectors (CES weak-link and substitutable groups); checking costs (verification time, once called slop); new wealth vs arms race (the real-wealth share, once Red Queen); rebuilding around AI (Gustafson-style redesign); work AI can speed up (native fit); likely range (the Monte Carlo 80% band); useful output (GDP net of arms-race activity).

## Equations

**Each sector.** Capability c ∈ [0, 1) is the share of the gap to each sector's ceiling AI has closed; it reaches 0.9 in the AGI year. E is useful AI work per dollar (end-2026 = 1).
- Work AI can do: `f* = f0 + (fmax − f0) c`; work done with AI `a ≤ f*` (S-curve adoption); share of that rebuilt to run without people directing it `g ≤ gmax`.
- Time per unit of work: `τ = (1 − a) + a(1 − g)(h + (1 − h)/(Â E)) + a g/(Â E) + κ̂ a`, with checking `κ̂ = κ (1 − 0.5 c)`; speedup `S = τ0/τ` against end-2026.
- Fraud and attack: `L = loss · (1 − E^−0.5) · (1 − 0.5 c)`, bounded.
- Measured output `Vm = S (1 − L)`; useful output `V = (1 + p (S − 1)) (1 − L)`.

**Whole economy.** `Q_i = V_i l_i / w_i` (l = share of workers, w = starting GDP share). Essential sectors CES with ρ = −4, flexible with ρ = 1/3, the two groups CES with ρm = −0.5, plus AI-native products n, times capital `k^0.35`. Workers move toward the GDP-maximising allocation at 20% of the gap a year; capital follows `k' = 0.05 (Y − k)`.

**AI progress.** Feedback `F = V_R&D^0.4 · V_ess^0.5 · Y^0.5`; growth in E `= r0 · F · E^−0.22`, smoothly capped at 200%/yr; capability advances with `F` and is calibrated to the AGI year.

**Dynamics.** Quarterly steps, yearly rows. Adoption, rebuilding and new products speed up with AI's payoff `m = (ln R / ln 1.4)^0.25`. Up-front cost of change: `V ← V (1 − 1.5 max(0, u̇ − u̇0))`, `u = a(1 + g)`.

## Changes after the November 2026 critique

A critique of the earlier version led to: capital accumulation; workers moving between sectors; GDP and useful output reported separately; checking as people's time rather than a cost that grew with speed (removing a forced peak); bounded attack losses with defence that catches up; separate capability and cost variables; rebuilding limited to work AI already does; essential sectors able to speed AI up as well as slow it; partial substitution within flexible sectors; evidence-based elasticities and diminishing returns. The explainer's "Which limits matter" table and "Objections" section show the effect of each.

## Robotics

Robotics is only partly included: the ceilings on hands-on work allow for robots using demonstrated technology (about 13% of US work hours, McKinsey 2025). `applyRobotics()` (the "Robotics breakthrough" preset) raises the four hands-on sectors' ceilings to at least 85% and their rebuilding ceilings by 20 points: 2050 GDP rises from about 2.1× to 3.0×, peak growth from about 5.3% to 7.6% a year, and the ceiling from 3.2× to 6.5×.

## Limitations

A sketch, not a forecast; sized like the US, not a world model; robotics only partly included; ceilings fixed on purpose; capital and workers treated simply; jobs, wages and catastrophic risk not modelled; no shocks, cycles or policy responses.

## Files

- `model.js`: calculation engine and default economy (no DOM; loads in Node via `require('./model.js')`).
- `explain.js`: the explainer's numbers and tables, shared by the page and the build.
- `app.js`: controls, charts (hand-built SVG), uncertainty band and tables.
- `index.html`, `why.html`: the model page and the explainer.
- `build.js`: writes `dist/` for publishing: pages with every number and table already filled in, plus `data.json`, `model.json`, `llms.txt`, `robots.txt` and `sitemap.xml`.

Open `index.html` in a browser, or serve the folder (`python3 -m http.server`); no build step is needed to use it locally.

## Publishing

The site is deployed as the Cloudflare Worker `ai-transformation-model` (static assets, `wrangler.jsonc`, which runs `node build.js`). The **Publish the site** GitHub Action deploys it whenever the site files change on `main` or the working branch, and can be run by hand from the Actions tab. It needs a repository secret, `CLOUDFLARE_API_TOKEN`, a Cloudflare token that can edit Workers.
