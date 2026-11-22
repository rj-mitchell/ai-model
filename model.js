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
  // A simplified economy of six broad sectors that together cover the whole US economy (BEA 2025
  // value added), each between 13.5% and 20% of GDP. Defaults are drawn from published evidence where it exists (see SOURCES and each
  // sector's `evidence`), rounded, and otherwise anchored judgement. They are not measurements.
  //
  // Review burden (eta) and external exposure (gamma) are scored 0–10 from sector evidence; the
  // scale (÷200) is calibrated so slop and fraud together cost about 1% of output by 2028, the high
  // end of survey and fraud-loss estimates, and AI's net contribution in 2027 is small and positive.
  const SOURCES = {
    eloundou: { t: 'Eloundou, Manning, Mishkin & Rock, GPTs are GPTs (2023; Science 2024): occupation exposure, re-weighted to sectors with ACS 2023 hours', u: 'https://arxiv.org/abs/2303.10130' },
    mgi: { t: 'McKinsey Global Institute, Agents, robots, and us (2025): 57% of US work hours automatable with demonstrated technology', u: 'https://www.mckinsey.com/mgi/our-research/agents-robots-and-us-skill-partnerships-in-the-age-of-ai' },
    rps: { t: 'Bick, Blandin & Deming, Real-Time Population Survey (FRED): share of work hours using generative AI, by industry', u: 'https://fred.stlouisfed.org/series/RPSGENAIASSISTWRKHRSALL' },
    btos: { t: 'US Census Bureau, Business Trends and Outlook Survey: AI use by businesses (2026)', u: 'https://census.gov/library/stories/2026/05/ai-use-businesses.html' },
    fredtime: { t: 'St. Louis Fed, Does generative AI save time at work? (2026): hours saved vs hours assisted', u: 'https://fred.stlouisfed.org/blog/2026/08/does-generative-ai-save-time-at-work/' },
    peng: { t: 'Peng et al., GitHub Copilot experiment (2023): 55.8% faster', u: 'https://arxiv.org/abs/2302.06590' },
    blr: { t: 'Brynjolfsson, Li & Raymond, Generative AI at work (2023): +14% issues resolved per hour', u: 'https://www.nber.org/papers/w31161' },
    metr: { t: 'METR developer productivity studies (2025–2026): from 19% slower to modest speedups', u: 'https://metr.org/blog/2026-02-24-uplift-update/' },
    berkeley: { t: 'Schwarcz et al., AI-powered lawyering RCT (2025): 12–37% less time', u: 'https://www.law.berkeley.edu/wp-content/uploads/archive/2025/12/AI-Powered-Lawyering.pdf' },
    scribe: { t: 'UCLA Health / NEJM AI ambient-scribe trial (2025): about 10% less note time for one of two tools', u: 'https://www.uclahealth.org/news/release/ucla-study-finds-ai-scribes-may-reduce-documentation-time' },
    bea: { t: 'BEA, GDP by Industry, value added 2025 (published September 2026)', u: 'https://apps.bea.gov/industry/Release/XLS/GDPxInd/ValueAdded.xlsx' },
    philippon: { t: 'Philippon, Has the US finance industry become less efficient? (AER 2015): unit cost of intermediation has not fallen', u: 'https://www.nber.org/papers/w18077' },
    budish: { t: 'Aquilina, Budish & O\'Neill, Quantifying the high-frequency trading arms race (QJE 2022)', u: 'https://www.nber.org/papers/w29011' },
    shrank: { t: 'Shrank et al., Waste in the US health care system (JAMA 2019): about a quarter of spending, administrative complexity largest', u: 'https://www.cfo.com/corporate-finance/2019/10/annual-waste-in-u-s-healthcare-system-nears-1-trillion/' },
    bsv: { t: 'Bloom, Schankerman & Van Reenen, Technology spillovers and product market rivalry (Econometrica 2013): social returns to R&D at least twice private', u: 'https://www.econometricsociety.org/publications/econometrica/2013/07/01/identifying-technology-spillovers-and-product-market-rivalry' },
    rand: { t: 'Kakalik & Pace, Costs and compensation paid in tort litigation (RAND 1986): litigation costs about half of tort spending', u: 'https://www.rand.org/pubs/papers/P7243.html' },
    msv: { t: 'Murphy, Shleifer & Vishny, The allocation of talent (1991): more lawyers, slower growth', u: 'https://www.nber.org/papers/w3530' },
    sht: { t: 'Shapiro, Hitsch & Tuchman, TV advertising effectiveness (Econometrica 2021): negative marginal ROI for over 80% of brands', u: 'https://econometricsociety.org/publications/econometrica/2021/07/01/tv-advertising-effectiveness-and-profitability-generalizable' },
    workslop: { t: 'BetterUp & Stanford Social Media Lab, The hidden costs of workslop (2025): about $186 per desk worker per month', u: 'https://www.betterup.com/blog/hidden-costs-workslop' },
    hai: { t: 'Stanford HAI, legal AI hallucination benchmark (2024): 17–34% for legal tools', u: 'https://hai.stanford.edu/news/ai-trial-legal-models-hallucinate-1-out-6-or-more-benchmarking-queries' },
    charlotin: { t: 'Charlotin, AI Hallucination Cases database: over 2,300 court cases by November 2026', u: 'https://www.damiencharlotin.com/hallucinations/' },
    dora: { t: 'Google DORA, State of AI-assisted software development (2025): throughput up, delivery stability down', u: 'https://www.infoq.com/news/2025/09/dora-state-of-ai-in-dev-2025' },
    boe: { t: 'Bank of England & FCA, AI in UK financial services (2024): 2% of use cases fully autonomous', u: 'https://www.bankofengland.co.uk/report/2024/artificial-intelligence-in-uk-financial-services-2024' },
    ibm: { t: 'IBM, Cost of a Data Breach 2025: healthcare costliest ($7.4M), finance second', u: 'https://www.techtarget.com/healthtechsecurity/news/366628031/Healthcare-remains-costliest-industry-for-breaches-at-742M' },
    ic3: { t: 'FBI Internet Crime Report 2025: $20.9B losses, $893M in AI-related complaints', u: 'https://helpnetsecurity.com/2026/04/07/online-crime-financial-losses-fbi-report' },
    deloitte: { t: 'Deloitte, generative-AI fraud in US banking: $12.3B (2023) to $40B (2027)', u: 'https://www.deloitte.com/us/en/insights/industry/financial-services/deepfake-banking-fraud-risk-on-the-rise.html' },
    imperva: { t: 'Imperva Bad Bot Report 2025: automated traffic 51% of the web', u: 'https://www.imperva.com/blog/2025-imperva-bad-bot-report-how-ai-is-supercharging-the-bot-threat/' },
    gptzero: { t: 'GPTZero / Graphite: about half of new web articles mainly AI-generated', u: 'https://gptzero.me/news/ai-written-web/' },
    cisa: { t: 'CISA advisory AA24-038A: state actors pre-positioned in energy networks', u: 'https://www.cisa.gov/news-events/cybersecurity-advisories/aa24-038a' },
    onc: { t: 'ONC: hospital EHR adoption 9% (2008) to 76% (2014)', u: 'https://www.healthit.gov/data/quickstats/national-trends-hospital-and-physician-adoption-electronic-health-records' },
    eia: { t: 'EIA: smart-meter share 47% (2016) to 84% (2024)', u: 'https://www.eia.gov/electricity/annual/html/epa_10_05.html' },
    bcgcloud: { t: 'BCG (2021): most financial institutions run at most 15% of core workloads in public cloud', u: 'https://www.bcg.com/publications/2021/strategies-for-financial-institutions-transitioning-to-the-cloud' },
    metrsurvey: { t: 'METR AI usage survey (2026): median self-reported speedup 3×, value gain 1.4–2×', u: 'https://metr.org/blog/2026-05-11-ai-usage-survey/' },
    david: { t: 'David & Wright, general purpose technologies and productivity surges: decades-long reorganisation lags', u: 'https://www.nuffield.ox.ac.uk/economics/history/paper31/davidwright.html' },
    jcurve: { t: 'Brynjolfsson, Rock & Syverson, The productivity J-curve (AEJ: Macro 2021)', u: 'https://www.aeaweb.org/doi/10.1257/mac.20180386' },
  };

  // e(range, confidence, sources, note)
  const e = (lo, hi, c, src, note) => ({ lo, hi, c, src, note });

  function defaultSectors() {
    return [
      Object.assign(sec('Physical production & energy', 'core', 25, 25, 55, 90, 3, 4, 30, 30, 5, 8, 'private', false,
        'Manufacturing, construction, utilities, mining and agriculture: 17.5% of US GDP. Mostly hands-on work; essential, regulated and slow to reorganise.'), { evidence: {
        weight: e(25, 28, 'high', ['bea'], 'Value added 17.5% of GDP, 26% of the four Core sectors.'),
        f: e(24, 29, 'medium', ['eloundou'], 'Exposure β 0.24 (human raters) to 0.29 (GPT-4 raters), weighted by 2023 hours.'),
        fmax: e(40, 65, 'low', ['eloundou', 'mgi'], 'Exposure with LLM software 0.38–0.48, plus robotics for some physical tasks.'),
        p: e(80, 100, 'medium', [], 'Judgement: cheaper physical output is mostly real wealth; some rent-seeking in regulated utilities.'),
        eta: e(2, 5, 'low', ['workslop'], 'No direct study. Simulation and physics checks help, but much work is safety-critical.'),
        gamma: e(3, 6, 'medium', ['cisa'], 'Targeted state and criminal attacks on grids and plants; operational systems are partly segmented.'),
        gmax: e(15, 45, 'low', ['eia', 'david'], 'Physical assets limit how far workflows can be redesigned.'),
        Tcrit: e(2, 15, 'low', ['david'], 'Judgement anchored on slow historical reorganisation of physical industries.'),
        alpha: e(5, 14, 'low', ['eia'], 'Smart-meter rollout closed about 14% of the gap a year; full redesign is slower.'),
      } }),
      Object.assign(sec('Trade & logistics', 'core', 25, 30, 60, 80, 3, 5, 45, 45, 3, 12, 'private', false,
        'Wholesale, retail, transport and warehousing: 15.5% of US GDP. Supply chains everything else depends on; already digitised and partly automated, but much of the work is physical.'), { evidence: {
        weight: e(20, 25, 'high', ['bea'], 'Value added 15.5% of GDP, 23% of the four Core sectors.'),
        f: e(31, 35, 'medium', ['eloundou'], 'Exposure β 0.31–0.35, weighted by 2023 hours.'),
        fmax: e(47, 70, 'low', ['eloundou', 'mgi'], 'Exposure with LLM software 0.47–0.55, plus warehouse and vehicle automation.'),
        p: e(65, 95, 'low', [], 'Judgement: logistics efficiency is real value; some retail competition is business-stealing.'),
        eta: e(2, 4, 'low', [], 'Judgement: mostly low-stakes, checkable work (inventory, routing, orders).'),
        gamma: e(4, 7, 'medium', ['imperva'], 'Retail and e-commerce are heavy targets for bots, account takeover and fraud.'),
        gmax: e(30, 60, 'low', ['metrsurvey'], 'Judgement: logistics is digitised and has reorganised quickly before (e-commerce).'),
        Tcrit: e(1.5, 8, 'low', [], 'Judgement.'),
        alpha: e(8, 20, 'low', [], 'Judgement: competitive, lightly regulated, but with large physical networks.'),
      } }),
      Object.assign(sec('Health, education & government', 'core', 30, 35, 60, 70, 5, 6, 35, 35, 5, 8, 'private', false,
        'Health care, social assistance, education and government: 19.7% of US GDP. People-facing and rule-bound; mistakes are costly, outputs need expert review, and institutions change slowly.'), { evidence: {
        weight: e(28, 32, 'high', ['bea'], 'Value added 19.7% of GDP, 30% of the four Core sectors.'),
        f: e(34, 37, 'medium', ['eloundou'], 'Exposure β 0.34–0.37, weighted by 2023 hours.'),
        fmax: e(52, 70, 'low', ['eloundou', 'mgi'], 'Exposure with LLM software 0.52–0.61; much caregiving and teaching stays hands-on.'),
        p: e(50, 85, 'low-medium', ['shrank'], 'Clinical and educational gains are real; billing, coding and compliance contests are arms races.'),
        eta: e(4, 7, 'medium', ['scribe'], 'Clinical and administrative outputs need expert review; errors occur in a minority of AI-drafted notes.'),
        gamma: e(5, 8, 'medium', ['ibm'], 'Healthcare is the costliest sector for data breaches; public bodies are frequent ransomware targets.'),
        gmax: e(20, 55, 'low', ['onc'], 'Regulation, liability and public procurement limit redesign.'),
        Tcrit: e(2, 12, 'low', ['onc'], 'Judgement: redesign waits for more reliable AI.'),
        alpha: e(5, 15, 'medium-low', ['onc'], 'Hospital EHR adoption closed about 20% of the gap a year with subsidies; physicians and public bodies slower.'),
      } }),
      Object.assign(sec('Finance & business services', 'core', 20, 40, 75, 50, 4, 7, 50, 50, 2, 10, 'private', false,
        'Finance and insurance, management of companies and administrative support: 13.5% of US GDP. Mostly information work and a prime target for fraud; part of the activity is trading and competition rather than new wealth.'), { evidence: {
        weight: e(18, 22, 'high', ['bea'], 'Value added 13.5% of GDP, 20% of the four Core sectors.'),
        f: e(40, 44, 'medium', ['eloundou'], 'Exposure β 0.40–0.44, weighted by 2023 hours.'),
        fmax: e(61, 85, 'medium', ['eloundou'], 'Exposure with LLM software 0.61–0.72; finance alone 0.78–0.93.'),
        p: e(35, 65, 'medium', ['philippon', 'budish'], 'Unit cost of finance has not fallen despite IT; trading races absorb gains.'),
        eta: e(3, 6, 'medium-low', ['boe'], 'Regulators require human oversight: only 2% of AI uses in UK finance are fully autonomous.'),
        gamma: e(6, 9, 'medium-high', ['ic3', 'deloitte', 'ibm'], 'Main target of AI-enabled fraud and deepfakes.'),
        gmax: e(30, 70, 'low', ['bcgcloud'], 'Judgement; legacy core systems limit redesign.'),
        Tcrit: e(1, 5, 'low', ['bcgcloud'], 'Judgement: much of the redesign is justified by today\'s AI.'),
        alpha: e(5, 15, 'low', ['bcgcloud'], 'Core systems move slowly: most banks run at most 15% of core workloads in the cloud after 15 years.'),
      } }),
      Object.assign(sec('Knowledge & professional services', 'flex', 40, 50, 85, 70, 3, 6, 65, 65, 1, 22, 'private', true,
        'Software, information, media, R&D, consulting, legal and advertising: 13.7% of US GDP. Digital work AI suits best, already being reorganised, and its output feeds AI progress; legal and advertising add arms races and review burden.'), { evidence: {
        weight: e(35, 45, 'high', ['bea'], 'Value added 13.7% of GDP, 41% of the two Flex sectors.'),
        f: e(47, 54, 'medium-high', ['eloundou'], 'Exposure β 0.47–0.54, weighted by 2023 hours.'),
        fmax: e(74, 90, 'medium', ['eloundou'], 'Exposure with LLM software 0.74–0.86.'),
        p: e(55, 85, 'medium', ['bsv', 'rand', 'sht'], 'Software and R&D are strongly positive-sum; legal and advertising (about a fifth of hours) are largely zero-sum.'),
        eta: e(2, 5, 'medium', ['metr', 'dora', 'hai'], 'Code is partly auto-verified; legal AI hallucinates 17–34% of the time.'),
        gamma: e(4, 8, 'medium', ['ibm', 'gptzero'], 'Supply-chain attacks on software; media and platforms flooded with synthetic content.'),
        gmax: e(45, 85, 'medium', ['metrsurvey'], 'Teams are already re-architecting around agents.'),
        Tcrit: e(0.5, 3, 'medium', ['metrsurvey'], 'Today\'s AI already justifies much of the redesign.'),
        alpha: e(12, 30, 'medium', ['metrsurvey', 'dora'], 'Fast-moving and lightly regulated, but systems lag behind tools.'),
      } }),
      Object.assign(sec('Property, hospitality & personal services', 'flex', 60, 25, 50, 75, 2, 4, 30, 30, 4, 10, 'private', false,
        'Real estate, hotels, restaurants, recreation and personal services: 19.8% of US GDP. Much of it is housing (largely rent) and hands-on service work that AI barely touches.'), { evidence: {
        weight: e(55, 65, 'high', ['bea'], 'Value added 19.8% of GDP, 59% of the two Flex sectors.'),
        f: e(27, 28, 'medium', ['eloundou'], 'Exposure β 0.27–0.28, weighted by 2023 hours.'),
        fmax: e(39, 60, 'low', ['eloundou', 'mgi'], 'Exposure with LLM software 0.39–0.47; cooking, cleaning and care stay hands-on.'),
        p: e(60, 90, 'low', [], 'Judgement: hospitality and personal services are real value; some brokerage is competition for commissions.'),
        eta: e(1, 4, 'low', [], 'Judgement: mostly low-stakes output.'),
        gamma: e(3, 6, 'low-medium', ['ic3'], 'Real-estate wire fraud and fake reviews are common, but most of the work is offline.'),
        gmax: e(15, 45, 'low', [], 'Judgement: hands-on service work limits redesign.'),
        Tcrit: e(2, 10, 'low', [], 'Judgement.'),
        alpha: e(5, 15, 'low', [], 'Judgement: many small firms.'),
      } }),
    ];
  }

  // Robotics breakthrough scenario: robots take over most hands-on work in the four sectors where it
  // dominates (physical production, trade & logistics, health/education/government, property &
  // hospitality). Their native-fit ceilings rise to at least 85% (like information work), redesign
  // ceilings rise 20 points, and capability broadens faster. The defaults include only the robotics
  // allowance in exposure studies and McKinsey's 13% of US work hours robots could take with
  // demonstrated technology.
  const ROBOTIC_SECTORS = [0, 1, 2, 5];
  function applyRobotics(s) {
    ROBOTIC_SECTORS.forEach((i) => {
      const x = s.sectors[i];
      if (!x) return;
      x.fmax = Math.max(x.fmax, 85);
      x.gmax = Math.min(90, x.gmax + 20);
      x.g = Math.min(90, x.g + 20);
    });
    s.beta = Math.max(s.beta, 0.3);
    return s;
  }

  // Evidence for the economy-wide defaults
  const GLOBAL_EVIDENCE = {
    Wcore: e(60, 70, 'high', ['bea'], 'The four Core sectors are 66% of 2025 value added; the six sectors together cover the whole economy.'),
    adopt0: e(10, 35, 'medium', ['rps', 'btos'], 'About 6% of US work hours were AI-assisted in 2026, against about 33% of work AI could do: roughly a fifth.'),
    aiNow: e(1.1, 2, 'medium', ['fredtime', 'peng', 'blr', 'metr', 'berkeley', 'scribe'], 'Field trials range from slower (METR) to 2.3× (Copilot); workers report saving about a third of assisted time.'),
    jCost: e(0, 5, 'low', ['jcurve'], 'Intangible investment around general-purpose technologies is large and delays measured gains.'),
  };

  function defaultState() {
    return {
      mode: 'dynamic', years: 15, startYear: 2027,
      r0: 25, phi: 0.4, Thalf: 15, growthCap: 200, trendGrowth: 2.0,
      Tstatic: 20, Wcore: 65, fragility: 5,
      beta: 0.1, dEta: 0.1, dGamma: 0.1, cfx: 1.5, kappa: 1,
      adopt0: 20, adoptSpeed: 25, jCost: 2, aiNow: 1.4,
      Nmax: 10, Tnew: 10, newSpeed: 15,
      hmax: 0, Trisk: 30, loss: 100,
      setbackYear: 0, setbackSize: 0,
      spread: 25, runs: 150, corr: 50,
      sectors: defaultSectors(), sel: 4, preset: 'dyn-base',
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
      adopt0: clamp((state.adopt0 != null ? state.adopt0 : 20) / 100, 0, 1),   // share of native fit in use at end-2026
      aiNow: Math.max(1, state.aiNow != null ? state.aiNow : 1.4),                // how much faster end-2026 AI does the work it is used for
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
      eta: Math.max(0, s.eta / 200),
      gamma: Math.max(0, s.gamma / 200),
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
  const SECTOR_RANGES = { f: [0, 95], fmax: [0, 95], p: [0, 100], eta: [0, 10], gamma: [0, 40], gmax: [0, 90], g: [0, 90], Tcrit: [0.5, 30], alpha: [5, 30] };
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

  const api = { defaultState, defaultSectors, applyRobotics, SOURCES, GLOBAL_EVIDENCE, K, G_CAP, F_CAP, STEPS_PER_YEAR, hill, hill0, globalsFor, sectorParams, fAvail, sectorValueAt, slopPeak, evalSector, macro, snapshot, simulate, sweep, rng, perturb, summarise, quantile, mcRun, monteCarlo, monteCarloSnapshot };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.AIModel = api;
})(typeof window !== 'undefined' ? window : this);
