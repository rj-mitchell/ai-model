/*
 * AI Transformation Model — calculation engine.
 *
 * Every V is a multiple of a world where AI stays at its end-2026 level and use.
 *   GDP (Vmacro) counts all output, including arms-race activity; useful output (Vuseful) leaves it out.
 *   Both include extra capital built from higher output (capital share 35%, depreciation 5%).
 * GDP paths (2027 = 1) add trend growth to both worlds: gdpNoAI = (1 + g)^t, gdp = Vmacro · (1 + g)^t,
 * with g = 2.0%/yr, the current average for advanced economies (IMF WEO Oct 2026).
 *
 * Six broad sectors (US 2025 GDP shares as a template for advanced economies). Each sector's speedup
 * comes from the share of work AI does, how much of it is rebuilt to run without people directing it,
 * and the time people spend checking AI's work; fraud and attack take a bounded share of output that
 * defensive AI partly offsets. Essential sectors are near-perfect complements, flexible sectors partial
 * substitutes; workers move gradually toward the best allocation.
 *
 * Two AI variables: capability c (what AI can do; reaches 0.9 of each sector's ceiling in the AGI year)
 * and useful AI work per dollar E (how cheaply it does it; grows at the speed of AI progress, fed back by
 * the AI research sector, essential sectors and output, with diminishing returns and a speed limit).
 *
 * Ceilings on what AI can do, on rebuilding and on new products are fixed by design: the model is meant
 * to show which limits do not dissolve with capability. Quarterly steps, yearly rows, Monte Carlo band.
 *
 * Works in the browser (window.AIModel) and in Node (module.exports).
 */
(function (root) {
  'use strict';

  const K = 2.5;              // Hill-curve steepness used for every S-curve
  const G_CAP = 0.9;          // rebuilding hard cap (prevents eps = 0)
  const F_CAP = 0.999;        // hard cap on the share of work AI can do (sliders stop at 95%; the explainer tests higher)
  const STEPS_PER_YEAR = 4;   // internal time step: quarterly

  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const hill = (T, mid) => 1 / (1 + Math.pow(mid / Math.max(T, 1e-9), K));
  // S-curve that is exactly 0 at T = 1 and tends to 1 as T grows (keeps baseline invariance)
  const hill0 = (T, mid) => { const a = Math.pow(T, K) - 1; return a <= 0 ? 0 : a / (a + Math.pow(mid, K)); };
  // convert an annual "share of the gap closed" rate into a per-step rate
  const stepRate = (annual, dt) => 1 - Math.pow(1 - clamp(annual, 0, 1), dt);

  // ---------------- Default economy (UI units) ----------------
  // f, fmax, p, g, gmax in %; eta, gamma on 0–10 (÷20); Tcrit in ×; alpha in %/yr.
  // weight = share of GDP (%), US 2025 mix used as the template for advanced economies; f, fmax, p, gmax in %; eta, gamma on 0–10 (÷200); Tcrit in ×; alpha in %/yr
  function sec(name, tier, weight, f, fmax, p, eta, gamma, gmax, Tcrit, alpha, rd, basis) {
    return { name, tier, weight, f, fmax, p, eta, gamma, gmax, Tcrit, alpha, rd: !!rd, basis: basis || '' };
  }
  // A simplified economy of six broad sectors that together cover a whole advanced economy, sized from US data (BEA 2025
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
    ic3: { t: 'FBI Internet Crime Report 2025: $20.9B losses, $893M in AI-related complaints', u: 'https://www.ic3.gov/AnnualReport/Reports/2025_IC3Report.pdf' },
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
    leap8: { t: 'Forecasting Research Institute, LEAP expert panel wave 8 (2026): median expert AGI year 2050 (middle half 2039–2065); 8-hour software tasks at 80% reliability by about 2030', u: 'https://forecastingresearch.substack.com/p/leap-wave-8-ai-timelines' },
    leap10: { t: 'Forecasting Research Institute, LEAP wave 10 (2026): median expert expects about 5% advanced-economy growth in 2050 if AI progresses rapidly', u: 'https://forecastingresearch.substack.com/p/forecasting-ai-benefits' },
    griliches: { t: 'Griliches, Hybrid corn: an exploration in the economics of technological change (Econometrica 1957): adoption is faster where the payoff is larger', u: 'https://www.jstor.org/stable/1905380' },
    ibmai: { t: 'IBM, Cost of a Data Breach (2026): average breach $4.99M; extensive security AI and automation about $1.9M cheaper', u: 'https://www.ibm.com/reports/data-breach' },
    bjvw: { t: 'Bloom, Jones, Van Reenen & Webb, Are ideas getting harder to find? (AER 2020): research productivity falls about 5% a year', u: 'https://www.aeaweb.org/articles?id=10.1257/aer.20180338' },
    epochr: { t: 'Epoch AI, Do the returns to software R&D point towards a singularity? (2024): estimates near the threshold, wide uncertainty', u: 'https://epoch.ai/blog/do-the-returns-to-software-rnd-point-towards-a-singularity' },
    epochtrends: { t: 'Epoch AI, Trends in AI (2026): training compute about 5× a year; chip price-performance about 1.5× a year', u: 'https://epoch.ai/trends' },
    epochgdp: { t: 'Epoch AI, Computing infrastructure as a share of US GDP (2026): 0.65% (2023) to 1.5% (2026)', u: 'https://epoch.ai/data-insights/ai-datacenter-share-gdp' },
    hrv: { t: 'Herrendorf, Rogerson & Valentinyi, Two perspectives on preferences and structural transformation (AER 2013): broad sectors near-Leontief in value added', u: 'https://www.aeaweb.org/articles?id=10.1257/aer.103.7.2752' },
    atalay: { t: 'Atalay, How important are sectoral shocks? (AEJ: Macro 2017): industries\' inputs to each other are near-perfect complements', u: 'https://www.aeaweb.org/articles?id=10.1257/mac.20160353' },
    bf: { t: 'Baqaee & Farhi, The macroeconomic impact of microeconomic shocks: beyond Hulten\'s theorem (Econometrica 2019): elasticities 0.9 across consumption, 0.001 among inputs', u: 'https://www.nber.org/papers/w23145' },
    acemoglu: { t: 'Acemoglu, The simple macroeconomics of AI (2024): task elasticity 0.5, sector elasticity 0.2; TFP gain under 1% over ten years', u: 'https://economics.mit.edu/sites/default/files/2024-04/The%20Simple%20Macroeconomics%20of%20AI.pdf' },
    pwt: { t: 'Penn World Table 11.0 via FRED: US labour share of income 0.57 (2023)', u: 'https://fred.stlouisfed.org/series/LABSHPUSA156NRUG' },
    beadep: { t: 'BEA fixed assets via FRED: depreciation $4.8T on a $91T net stock (2024)', u: 'https://fred.stlouisfed.org/series/M1TTOTL1ES000' },
    csis: { t: 'CSIS & McAfee, The economic impact of cybercrime (2018): about $600B, nearly 1% of world GDP', u: 'https://www.csis.org/analysis/economic-impact-cybercrime' },
    acm: { t: 'Artuç, Chaudhuri & McLaren, Trade shocks and labor adjustment (AER 2010): sector shifts take years', u: 'https://www.nber.org/papers/w13465' },
    adh: { t: 'Autor, Dorn & Hanson, On the persistence of the China shock (BPEA 2021): losses persist a decade on', u: 'https://www.nber.org/papers/w29401' },
    anthropicprod: { t: 'Anthropic, Estimating AI productivity gains (2025): about 80% time saved on tasks done in conversation, an upper bound', u: 'https://www.anthropic.com/research/estimating-productivity-gains' },
  };

  // e(range, confidence, sources, note)
  const e = (lo, hi, c, src, note) => ({ lo, hi, c, src, note });

  function defaultSectors() {
    return [
      Object.assign(sec('Physical production & energy', 'core', 17.5, 25, 55, 90, 3, 4, 30, 5, 8, false,
        'Manufacturing, construction, utilities, mining and agriculture: 17.5% of GDP (US mix, used as the template). Mostly hands-on work; essential, regulated and slow to reorganise.'), { evidence: {
        weight: e(17, 18, 'high', ['bea'], 'US value added in 2025 (BEA), the template for advanced economies. Manufacturing-heavy economies such as Germany and Japan have a larger physical sector.'),
        f: e(24, 29, 'medium', ['eloundou'], 'Exposure score 0.24 (human raters) to 0.29 (GPT-4 raters), weighted by 2023 hours.'),
        fmax: e(40, 65, 'low', ['eloundou', 'mgi'], 'Exposure score with AI software 0.38–0.48, plus robotics for some physical tasks.'),
        p: e(80, 100, 'medium', [], 'Judgement: cheaper physical output is mostly real wealth; some rent-seeking in regulated utilities.'),
        eta: e(2, 5, 'low', ['workslop'], 'No direct study. Simulation and physics checks help, but much work is safety-critical.'),
        gamma: e(3, 6, 'medium', ['cisa'], 'Targeted state and criminal attacks on grids and plants; operational systems are partly segmented.'),
        gmax: e(15, 45, 'low', ['eia', 'david'], 'Long-lived plant, fixed sites and grid rules limit how far the work can be rebuilt around AI.'),
        Tcrit: e(2, 15, 'low', ['david'], 'Judgement anchored on slow historical reorganisation of physical industries.'),
        alpha: e(5, 14, 'low', ['eia'], 'Smart-meter rollout closed about 14% of the gap a year; rebuilding plant and sites is slower.'),
      } }),
      Object.assign(sec('Trade & logistics', 'core', 15.5, 30, 60, 80, 3, 5, 45, 3, 12, false,
        'Wholesale, retail, transport and warehousing: 15.5% of GDP (US mix, used as the template). Supply chains everything else depends on; already digitised and partly automated, but much of the work is physical.'), { evidence: {
        weight: e(15, 16, 'high', ['bea'], 'US value added in 2025 (BEA): 15.5% of GDP, used as the template for advanced economies.'),
        f: e(31, 35, 'medium', ['eloundou'], 'Exposure score 0.31–0.35, weighted by 2023 hours.'),
        fmax: e(47, 70, 'low', ['eloundou', 'mgi'], 'Exposure score with AI software 0.47–0.55, plus warehouse and vehicle automation.'),
        p: e(65, 95, 'low', [], 'Judgement: logistics efficiency is real value; some retail competition is business-stealing.'),
        eta: e(2, 4, 'low', [], 'Judgement: mostly low-stakes, checkable work (inventory, routing, orders).'),
        gamma: e(4, 7, 'medium', ['imperva'], 'Retail and e-commerce are heavy targets for bots, account takeover and fraud.'),
        gmax: e(30, 60, 'low', ['metrsurvey'], 'Judgement: logistics is digitised and has reorganised quickly before (e-commerce).'),
        Tcrit: e(1.5, 8, 'low', [], 'Judgement.'),
        alpha: e(8, 20, 'low', [], 'Judgement: competitive, lightly regulated, but with large physical networks.'),
      } }),
      Object.assign(sec('Health, education & government', 'core', 19.7, 35, 60, 70, 5, 6, 35, 5, 8, false,
        'Health care, social assistance, education and government: 19.7% of GDP (US mix, used as the template). People-facing and rule-bound; mistakes are costly, outputs need expert review, and institutions change slowly.'), { evidence: {
        weight: e(19, 20, 'high', ['bea'], 'US value added in 2025 (BEA): 19.7% of GDP, used as the template for advanced economies.'),
        f: e(34, 37, 'medium', ['eloundou'], 'Exposure score 0.34–0.37, weighted by 2023 hours.'),
        fmax: e(52, 70, 'low', ['eloundou', 'mgi'], 'Exposure score with AI software 0.52–0.61; much caregiving and teaching stays hands-on.'),
        p: e(50, 85, 'low-medium', ['shrank'], 'Clinical and educational gains are real; billing, coding and compliance contests are arms races.'),
        eta: e(4, 7, 'medium', ['scribe'], 'Clinical and administrative outputs need expert review; errors occur in a minority of AI-drafted notes.'),
        gamma: e(5, 8, 'medium', ['ibm'], 'Healthcare is the costliest sector for data breaches; public bodies are frequent ransomware targets.'),
        gmax: e(20, 55, 'low', ['onc'], 'Regulation, liability, public procurement and buildings limit rebuilding.'),
        Tcrit: e(2, 12, 'low', ['onc'], 'Judgement: rebuilding waits for more reliable AI.'),
        alpha: e(5, 15, 'medium-low', ['onc'], 'Hospital EHR adoption closed about 20% of the gap a year with subsidies; physicians and public bodies slower.'),
      } }),
      Object.assign(sec('Finance & business services', 'core', 13.5, 40, 75, 50, 4, 7, 50, 2, 10, false,
        'Finance and insurance, management of companies and administrative support: 13.5% of GDP (US mix, used as the template). Mostly information work and a prime target for fraud; part of the activity is trading and competition rather than new wealth.'), { evidence: {
        weight: e(13, 14, 'high', ['bea'], 'US value added in 2025 (BEA): 13.5% of GDP, used as the template for advanced economies.'),
        f: e(40, 44, 'medium', ['eloundou'], 'Exposure score 0.40–0.44, weighted by 2023 hours.'),
        fmax: e(61, 85, 'medium', ['eloundou'], 'Exposure score with AI software 0.61–0.72; finance alone 0.78–0.93.'),
        p: e(35, 65, 'medium', ['philippon', 'budish'], 'Unit cost of finance has not fallen despite IT; trading races absorb gains.'),
        eta: e(3, 6, 'medium-low', ['boe'], 'Regulators require human oversight: only 2% of AI uses in UK finance are fully autonomous.'),
        gamma: e(6, 9, 'medium-high', ['ic3', 'deloitte', 'ibm'], 'Main target of AI-enabled fraud and deepfakes.'),
        gmax: e(30, 70, 'low', ['bcgcloud'], 'Judgement; legacy core systems and regulation limit rebuilding.'),
        Tcrit: e(1, 5, 'low', ['bcgcloud'], 'Judgement: much of the rebuilding is justified by today\'s AI.'),
        alpha: e(5, 15, 'low', ['bcgcloud'], 'Core systems move slowly: most banks run at most 15% of core workloads in the cloud after 15 years.'),
      } }),
      Object.assign(sec('Knowledge & professional services', 'flex', 13.7, 50, 85, 70, 3, 6, 65, 1, 22, true,
        'Software, information, media, R&D, consulting, legal and advertising: 13.7% of GDP (US mix, used as the template). Digital work AI suits best, already being reorganised, and its output feeds AI progress; legal and advertising add arms races and review burden.'), { evidence: {
        weight: e(13, 14, 'high', ['bea'], 'US value added in 2025 (BEA): 13.7% of GDP, used as the template for advanced economies.'),
        f: e(47, 54, 'medium-high', ['eloundou'], 'Exposure score 0.47–0.54, weighted by 2023 hours.'),
        fmax: e(74, 90, 'medium', ['eloundou'], 'Exposure score with AI software 0.74–0.86.'),
        p: e(55, 85, 'medium', ['bsv', 'rand', 'sht'], 'Software and R&D are strongly positive-sum; legal and advertising (about a fifth of hours) are largely zero-sum.'),
        eta: e(2, 5, 'medium', ['metr', 'dora', 'hai'], 'Code is partly auto-verified; legal AI hallucinates 17–34% of the time.'),
        gamma: e(4, 8, 'medium', ['ibm', 'gptzero'], 'Supply-chain attacks on software; media and platforms flooded with synthetic content.'),
        gmax: e(45, 85, 'medium', ['metrsurvey'], 'Teams are already rebuilding their systems around agents.'),
        Tcrit: e(0.5, 3, 'medium', ['metrsurvey'], 'Today\'s AI already justifies much of the rebuilding.'),
        alpha: e(12, 30, 'medium', ['metrsurvey', 'dora'], 'Fast-moving and lightly regulated, but systems lag behind tools.'),
      } }),
      Object.assign(sec('Property, hospitality & personal services', 'flex', 19.8, 25, 50, 75, 2, 4, 30, 4, 10, false,
        'Real estate, hotels, restaurants, recreation and personal services: 19.8% of GDP (US mix, used as the template). Much of it is housing (largely rent) and hands-on service work that AI barely touches.'), { evidence: {
        weight: e(19, 20, 'high', ['bea'], 'US value added in 2025 (BEA): 19.8% of GDP, used as the template for advanced economies.'),
        f: e(27, 28, 'medium', ['eloundou'], 'Exposure score 0.27–0.28, weighted by 2023 hours.'),
        fmax: e(39, 60, 'low', ['eloundou', 'mgi'], 'Exposure score with AI software 0.39–0.47; cooking, cleaning and care stay hands-on.'),
        p: e(60, 90, 'low', [], 'Judgement: hospitality and personal services are real value; some brokerage is competition for commissions.'),
        eta: e(1, 4, 'low', [], 'Judgement: mostly low-stakes output.'),
        gamma: e(3, 6, 'low-medium', ['ic3'], 'Real-estate wire fraud and fake reviews are common, but most of the work is offline.'),
        gmax: e(15, 45, 'low', [], 'Judgement: hands-on service work and premises limit rebuilding.'),
        Tcrit: e(2, 10, 'low', [], 'Judgement.'),
        alpha: e(5, 15, 'low', [], 'Judgement: many small firms.'),
      } }),
    ];
  }

  // Robotics breakthrough scenario: robots take over most hands-on work in the four sectors where it
  // dominates (physical production, trade & logistics, health/education/government, property &
  // hospitality). Their native-fit ceilings rise to at least 85% (like information work) and rebuilding
  // ceilings rise 20 points. The defaults include only the robotics
  // allowance in exposure studies and McKinsey's 13% of US work hours robots could take with
  // demonstrated technology.
  const ROBOTIC_SECTORS = [0, 1, 2, 5];
  function applyRobotics(s) {
    ROBOTIC_SECTORS.forEach((i) => {
      const x = s.sectors[i];
      if (!x) return;
      x.fmax = Math.max(x.fmax, 85);
      x.gmax = Math.min(90, x.gmax + 20);
    });
    return s;
  }

  // ---------------- Economy-wide settings ----------------
  // Six dials are user settings (defaultState). Everything else is a fixed assumption: FIXED holds
  // its value, FIXED_INFO its evidence. Presets and the explainer can still override a fixed value
  // by setting it on the state. The uncertainty band varies all of them.
  const FIXED = {
    aiNow: 1.4,        // how much faster end-2026 AI does assisted work (×)
    adopt0: 20,        // share of AI-ready work already done with AI at end-2026 (%)
    hFall: 0.75,       // share of people's directing role in AI-assisted work gone once AI reaches its full breadth
    capRebuild: 1,     // 1: rebuilding becomes worth doing when AI is capable enough or cheap enough; 0: cost only
    jCost: 1.5,        // up-front cost of change: output diverted per unit/yr rise in AI's share of work, above today's pace
    payoffResp: 0.25,  // how strongly adoption, rebuilding and new products speed up with AI's advantage
    phi: 0.4,          // AI research feedback: progress × V_R&D^φ
    theta: 0.22,       // diminishing returns: progress × E^(−θ) (ideas get harder to find)
    invElast: 0.5,     // progress × (output)^λ: more output funds more compute and research
    psiEss: 0.5,       // progress × V_ess^ψ: essential sectors (energy, chips, construction) speed or slow the build-out
    growthCap: 200,    // physical speed limit on growth in useful AI work (%/yr)
    checkMax: 0.3,     // human checking time per unit of AI work at a checking score of 10
    dEta: 0.5,         // share of checking time gone once AI reaches its full breadth
    lossMax: 5,        // share of a sector's output lost to fraud and attack at exposure 10, full attack volume, no defence (%)
    attackVol: 0.5,    // attack volume rises as 1 − E^(−ν) with cheaper AI work
    defence: 50,       // share of attack losses defensive AI removes once AI reaches its full breadth (%)
    cfx: 1.5,          // essential vs flexible sectors: ρm = 1 − cfx (σ ≈ 0.67)
    fragility: 5,      // within essential sectors: ρ = 1 − fragility (σ ≈ 0.2)
    flexSigma: 1.5,    // within flexible sectors: elasticity of substitution σ
    capShare: 35,      // capital's share of income (%)
    depreciation: 5,   // capital depreciation (%/yr); sets how fast capital catches up with output
    labourMob: 20,     // share of the gap to the best allocation of workers closed each year (%)
    Tnew: 10,          // AI-native products reach half their mature size at E = T_new
    newSpeed: 15,      // build-out speed of AI-native products (%/yr of gap)
    trendGrowth: 2.0,  // growth from everything except AI, both worlds (%/yr)
  };
  const FIXED_INFO = {
    aiNow: { label: 'Speedup from today\'s AI', value: '1.4×', ev: e(1.1, 2, 'medium', ['fredtime', 'peng', 'blr', 'metr', 'berkeley', 'scribe'], 'Field trials range from slower (METR) to 2.3× (Copilot); workers report saving about a third of assisted time.') },
    adopt0: { label: 'Share of AI-ready work using AI, end-2026', value: '20%', ev: e(10, 35, 'medium', ['rps', 'btos'], 'About 6% of US work hours were AI-assisted in 2026, against about 33% of work AI could do: roughly a fifth.') },
    hFall: { label: 'Direction AI needs once it can do nearly everything', value: '75% less than today', ev: e(40, 90, 'low', ['leap8'], 'With AI that beats top professionals at 90% of tasks, people no longer need to direct each step of AI-assisted work, though accountability keeps some oversight. Judgement; this is what makes an earlier AGI year matter.') },
    jCost: { label: 'Up-front cost of change', value: '1.5', ev: e(0, 2, 'low', ['jcurve'], 'Training, integration and reorganising cost output before they pay off. Set so AI adds a little to growth in 2027, as current measurements suggest.') },
    payoffResp: { label: 'Adoption responds to payoff', value: '0.25', ev: e(0, 0.5, 'low', ['griliches'], 'Technologies spread faster where the payoff is bigger; the strength of the response is judgement.') },
    phi: { label: 'AI research speeding up AI', value: '0.4', ev: e(0, 1, 'low', [], 'Judgement: more productive research work speeds AI progress, with diminishing returns.') },
    theta: { label: 'Diminishing returns in AI progress', value: '0.22', ev: e(0.1, 0.5, 'medium', ['bjvw', 'epochr'], 'Research productivity falls about 5% a year while progress runs about 25% a year, so each tenfold gain in useful AI work cuts the pace of progress by about 40%. Estimates of returns to software research are near the threshold for runaway progress, with wide uncertainty.') },
    invElast: { label: 'Extra output funding AI progress', value: '0.5', ev: e(0, 1, 'low', ['epochgdp', 'epochtrends'], 'Spending on computing infrastructure rose from 0.65% of US GDP in 2023 to 1.5% in 2026, and training compute grows about 5× a year. How strongly that responds to higher output is judgement.') },
    psiEss: { label: 'Essential sectors speeding or slowing AI', value: '0.5', ev: e(0, 1, 'low', [], 'Cheaper energy, chips and construction speed the build-out of AI; shortfalls slow it. Judgement.') },
    growthCap: { label: 'Speed limit on AI progress', value: '200%/yr', ev: e(50, 500, 'low', ['epochtrends'], 'Chips, data centres and power can only be built so fast. AI chips get about 1.5× better per dollar a year and algorithms about 2.8× a year. Binds only in extreme scenarios.') },
    checkMax: { label: 'Checking time for AI work', value: '0.3 at a score of 10', ev: e(0.1, 0.5, 'low', ['workslop', 'hallu'], 'People must check AI output: errors cost desk workers about $186 a month (2025), and legal AI tools err 17–34% of the time. Checking does not get faster as AI gets cheaper, so it becomes the bottleneck.') },
    dEta: { label: 'Checking saved once AI can do nearly everything', value: '50%', ev: e(20, 80, 'low', [], 'Judgement: an AI that can do nearly all of a task can check much of it, but accountability keeps some human review.') },
    lossMax: { label: 'Fraud and attack losses at full volume', value: '5% at a score of 10', ev: e(2, 15, 'low', ['ic3', 'csis'], 'Reported US losses rose from $3.5B (2019) to $20.9B (2025), about 0.07% of GDP; global estimates put cybercrime near 1% of world GDP. Set so losses rise severalfold without exceeding a few percent of output in exposed sectors.') },
    attackVol: { label: 'Attack volume as AI gets cheaper', value: '1 − E^−0.5', ev: e(0.2, 1, 'low', [], 'Cheaper AI makes spam and fraud cheaper, but attackers run out of targets: volume rises then levels off.') },
    defence: { label: 'Losses removed by defensive AI', value: '50% at full breadth', ev: e(20, 80, 'low-medium', ['ibmai'], 'Organisations using security AI and automation extensively have breaches about 40% cheaper (about $1.9M on $4.4–5M), a correlation rather than proof. Defence catches up as AI broadens.') },
    cfx: { label: 'How much people need both essential and flexible sectors', value: 'σ ≈ 0.67', ev: e(0.2, 0.9, 'medium', ['hrv', 'bf', 'acemoglu'], 'When people need both, spending shifts toward whichever gets cheaper more slowly. Estimates across broad consumption sectors run from 0.2 (Acemoglu) to 0.8–0.9 (Herrendorf et al.; Baqaee and Farhi).') },
    fragility: { label: 'How much essential sectors depend on each other', value: 'σ ≈ 0.2', ev: e(0, 0.5, 'medium', ['atalay', 'hrv', 'bf'], 'A shortfall in one essential sector limits the rest. Industries\' inputs to each other are close to perfect complements (about 0 to 0.2), and broad sectors measured by value added are near 0. Barely changes the results.') },
    flexSigma: { label: 'How freely flexible sectors substitute', value: 'σ = 1.5', ev: e(0.8, 2, 'low', ['atalay'], 'People can swap between discretionary services, but not perfectly; estimates across industries are around 0.8–1.1, and within broad service groups probably higher. Barely changes the results.') },
    capShare: { label: 'Capital\'s share of income', value: '35%', ev: e(30, 43, 'high', ['pwt'], 'US labour\'s share is about 57–61% (Penn World Table), so capital\'s is about 40% before depreciation. More output means more investment, so AI\'s boost is amplified as capital builds up.') },
    depreciation: { label: 'Capital depreciation', value: '5%/yr', ev: e(4, 8, 'high', ['beadep'], 'US depreciation was $4.8 trillion on a $91 trillion capital stock in 2024, about 5.3%. Sets how fast capital catches up with higher output: about half the gap closes in 14 years.') },
    labourMob: { label: 'Workers moving between sectors', value: '20% of the gap a year', ev: e(5, 30, 'medium', ['acm', 'adh'], 'After a trade shock, 95% of the shift between sectors was done within about 8 years, though many displaced workers leave work rather than move. Barely changes the results.') },
    newProducts: { label: 'How fast AI-native products grow', value: 'half size at 10× today\'s AI; 15% of the gap a year', ev: e(0, 0, 'low', [], 'Judgement.') },
    trendGrowth: { label: 'Growth without further AI', value: '2.0%/yr', ev: e(1.8, 2.1, 'high', [], 'IMF World Economic Outlook, October 2026: advanced economies 2.0% (2025), 2.1% (2026), 1.8% (2027).') },
  };

  // Evidence for the six user dials
  const GLOBAL_EVIDENCE = {
    agiYear: e(2039, 2065, 'medium', ['leap8'], 'Median expert 2050, middle half 2039–2065; superforecasters 2047. Forecasting sites and AI lab leaders expect the early 2030s or sooner.'),
    r0: e(15, 60, 'medium', ['leap8', 'metr'], 'The median expert expects reliable 8-hour software tasks by about 2030, up from about 3.4 hours at end-2026: roughly 25% a year.'),
    hLoop: e(20, 35, 'medium', ['metrsurvey', 'anthropicprod', 'fredtime'], 'Assisted work tops out at about 3–5× faster: a median self-reported 3× (METR survey) and about 5× for tasks done in conversation.'),
    adoptSpeed: e(15, 40, 'low-medium', ['onc', 'eia', 'rps'], 'Recent technologies closed roughly 8–20% of the adoption gap a year; AI use in work hours grew from 4% to 6% in a year.'),
    Nmax: e(0, 30, 'low', [], 'Judgement: value from goods and services that do not exist today. No data.'),
  };

  function defaultState() {
    return {
      years: 15, startYear: 2027,
      agiYear: 2050, r0: 25, adoptSpeed: 25, hLoop: 25, Nmax: 10,
      sectors: defaultSectors(), sel: 4, preset: 'dyn-base',
    };
  }

  // ---------------- Global parameters ----------------
  const val = (state, k) => (state[k] != null ? state[k] : FIXED[k]);
  function globalsFor(state) {
    return {
      kc: state._kc != null ? state._kc : (state.agiYear ? calibratedKc(state) : 0.1),   // capability pace (per baseline year)
      hLoop: clamp((state.hLoop != null ? state.hLoop : 25) / 100, 0, 0.9),
      hFall: clamp(val(state, 'hFall'), 0, 1),
      capRebuild: clamp(val(state, 'capRebuild'), 0, 1),
      adoptSpeed: (state.adoptSpeed != null ? state.adoptSpeed : 25) / 100,
      Nmax: (state.Nmax != null ? state.Nmax : 10) / 100,
      aiNow: Math.max(1, val(state, 'aiNow')),
      adopt0: clamp(val(state, 'adopt0') / 100, 0, 1),
      jCost: val(state, 'jCost'),
      payoffResp: val(state, 'payoffResp'),
      phi: val(state, 'phi'),
      theta: Math.max(0, val(state, 'theta')),
      invElast: Math.max(0, val(state, 'invElast')),
      psiEss: Math.max(0, val(state, 'psiEss')),
      growthCap: Math.max(0.05, val(state, 'growthCap') / 100),
      checkMax: Math.max(0, val(state, 'checkMax')),
      dEta: clamp(val(state, 'dEta'), 0, 1),
      lossMax: Math.max(0, val(state, 'lossMax') / 100),
      attackVol: Math.max(0.01, val(state, 'attackVol')),
      defence: clamp(val(state, 'defence') / 100, 0, 1),
      rhoM: Math.min(0.99, 1 - val(state, 'cfx')),
      rho: Math.min(0.99, 1 - val(state, 'fragility')),
      rhoF: Math.min(0.99, 1 - 1 / Math.max(0.05, val(state, 'flexSigma'))),
      alphaK: clamp(val(state, 'capShare') / 100, 0, 0.8),
      delta: Math.max(0, val(state, 'depreciation') / 100),
      labourMob: clamp(val(state, 'labourMob') / 100, 0, 1),
      Tnew: val(state, 'Tnew'),
      newSpeed: val(state, 'newSpeed') / 100,
      trendGrowth: val(state, 'trendGrowth') / 100,
    };
  }

  // ---------------- Slider (UI units) -> equation parameters ----------------
  function sectorParams(s, X) {
    X = X || { checkMax: FIXED.checkMax, lossMax: FIXED.lossMax / 100 };
    const f0 = clamp(s.f / 100, 0, F_CAP);
    return {
      f0,
      fmax: Math.max(f0, clamp((s.fmax != null ? s.fmax : s.f) / 100, 0, F_CAP)),
      p: clamp(s.p / 100, 0, 1),
      check: Math.max(0, s.eta / 10) * X.checkMax,      // checking time per unit of AI work
      loss: Math.max(0, s.gamma / 10) * X.lossMax,      // fraud and attack loss share at full volume, no defence
      gmax: clamp(s.gmax / 100, 0, G_CAP),
      Tcrit: Math.max(0.1, s.Tcrit),
      alpha: clamp(s.alpha / 100, 0, 1),
    };
  }

  // ---------------- 1. Sector level ----------------
  // c      capability closure in [0, 1): share of the gap to the ceiling AI has closed (set by the AGI year)
  // E      useful AI work per dollar, end-2026 = 1 (set by the speed of AI progress)
  // f*_i   = f_0 + (f_max − f_0) c                 work AI can do
  // a_i    ≤ f*_i                                  work done with AI (adoption lags)
  // g_i    ≤ g_max                                 share of that work rebuilt to run without people directing it
  // τ_i    = (1 − a) + a(1 − g)(h + (1 − h)/(Â E)) + a g/(Â E) + κ̂ a      time per unit of work
  //          κ̂ = κ (1 − dEta·c): human checking time per unit of AI work, falling as AI broadens
  // S_i    = τ_i,0 / τ_i                           speedup against how work was done at end-2026
  // L_i    = loss · (1 − E^(−ν)) · (1 − D c)       share of output lost to fraud and attack (bounded)
  // measured output  Vm_i = S_i (1 − L_i)          GDP counts arms-race activity at face value
  // useful output    V_i  = (1 + p_i (S_i − 1)) (1 − L_i)
  function fAvail(P, c) { return P.fmax - (P.fmax - P.f0) * (1 - clamp(c, 0, 1)); }
  function rawSpeed(X) {
    const A = X.aiNow || 1, h = X.hLoop || 0, inv = 1 / A - h;
    return h > 0 ? (inv > 0.01 ? (1 - h) / inv : 100) : A;     // AI's own speed implied by today's measured speedup
  }
  // people's share of AI-assisted work (directing and checking it) falls as AI becomes more capable
  const hEff = (X, c) => (X.hLoop || 0) * (1 - (X.hFall || 0) * clamp(c, 0, 1));
  function sectorValueAt(P, g, E, c, X, aUsed) {
    const A = X.aiNow || 1, h = hEff(X, c), Ar = rawSpeed(X);
    const a = aUsed != null ? aUsed : fAvail(P, c);
    const assisted = a * (1 - g), autonomous = a * g;
    const check = P.check * (1 - X.dEta * clamp(c, 0, 1));
    const a0 = (X.adopt0 != null ? X.adopt0 : 1) * P.f0;
    const tau0 = (1 - a0) + a0 / A + P.check * a0;
    const tau = (1 - a) + assisted * (h + (1 - h) / (Ar * E)) + autonomous / (Ar * E) + check * a;
    const S = tau0 / tau;
    const L = clamp(P.loss * (1 - Math.pow(Math.max(E, 1), -X.attackVol)) * (1 - X.defence * clamp(c, 0, 1)), 0, 0.9);
    return { f: a, eps: 1 - a, S, Vm: S * (1 - L), V: (1 + P.p * (S - 1)) * (1 - L), loss: L, checkShare: (check * a) / tau, assisted, autonomous };
  }
  function evalSector(P, g, E, c, X, aUsed) {
    return Object.assign({ fAvail: fAvail(P, c) }, sectorValueAt(P, g, E, c, X, aUsed));
  }

  // ---------------- 2. Macro level ----------------
  // Sector output index Q_i = V_i · l_i / w_i (w_i = starting GDP share, l_i = share of workers now).
  // Essential: CES with ρ;  flexible: CES with ρ_f;  whole economy: CES of the two with ρ_m, plus new products.
  // Capital: Y = (that) · k^α, with k' = δ (Y_measured − k): capital catches up with output.
  function ces(vals, ws, rho) {
    if (!vals.length) return NaN;
    if (Math.abs(rho) < 1e-9) { let s = 0; vals.forEach((v, i) => { s += ws[i] * Math.log(Math.max(v, 1e-12)); }); return Math.exp(s); }
    let s = 0; vals.forEach((v, i) => { s += ws[i] * Math.pow(Math.max(v, 1e-12), rho); });
    return Math.pow(s, 1 / rho);
  }
  function cesShares(vals, ws, rho) {
    const raw = vals.map((v, i) => ws[i] * Math.pow(Math.max(v, 1e-12), rho));
    const tot = raw.reduce((a, b) => a + b, 0) || 1;
    return raw.map((x) => x / tot);
  }
  function groups(sectors) {
    const tot = sectors.reduce((a, s) => a + Math.max(0, s.weight), 0) || 1;
    const w = sectors.map((s) => Math.max(0, s.weight) / tot);
    const mk = (tier) => { const idx = []; sectors.forEach((s, i) => { if (s.tier === tier) idx.push(i); }); const W = idx.reduce((a, i) => a + w[i], 0); return { idx, W, wt: idx.map((i) => (W > 0 ? w[i] / W : 1 / idx.length)) }; };
    return { w, C: mk('core'), F: mk('flex') };
  }
  // Best allocation of workers for given sector productivities (closed form for nested CES).
  function optimalLabour(sectors, Vs, X) {
    const G = groups(sectors), l = new Array(sectors.length).fill(0);
    const grp = (I, rho) => {
      const e = I.idx.map((i) => Math.pow(Math.max(Vs[i], 1e-9), rho / (1 - rho)));
      const sum = I.wt.reduce((a, wt, k) => a + wt * e[k], 0);
      return { within: I.wt.map((wt, k) => (wt * e[k]) / sum), eff: Math.pow(sum, (1 - rho) / rho) };
    };
    const parts = [];
    if (G.C.idx.length) parts.push([G.C, grp(G.C, X.rho)]);
    if (G.F.idx.length) parts.push([G.F, grp(G.F, X.rhoF)]);
    const top = parts.map(([I, r]) => I.W * Math.pow(r.eff, X.rhoM / (1 - X.rhoM)));
    const tt = top.reduce((a, b) => a + b, 0);
    parts.forEach(([I, r], k) => { const L = top[k] / tt; I.idx.forEach((i, j) => { l[i] = L * r.within[j]; }); });
    return l;
  }
  function macro(sectors, Vs, Vms, X, n, labour, capMult) {
    const G = groups(sectors);
    const l = labour || G.w;
    const Q = Vs.map((v, i) => (G.w[i] > 0 ? (v * l[i]) / G.w[i] : 0));
    const Qm = Vms.map((v, i) => (G.w[i] > 0 ? (v * l[i]) / G.w[i] : 0));
    const hasC = G.C.idx.length > 0, hasF = G.F.idx.length > 0;
    const agg = (q) => {
      const core = hasC ? ces(G.C.idx.map((i) => q[i]), G.C.wt, X.rho) : NaN;
      const flex = hasF ? ces(G.F.idx.map((i) => q[i]), G.F.wt, X.rhoF) : NaN;
      const base = hasC && hasF ? ces([core, flex], [G.C.W, G.F.W], X.rhoM) : hasC ? core : flex;
      return { core, flex, base };
    };
    const u = agg(Q), m = agg(Qm);
    const k = capMult != null ? capMult : 1;
    const nn = n || 0;
    const Vuseful = (u.base + nn) * k, Vmacro = (m.base + nn) * k;
    // spending shares from measured output
    const shares = new Array(sectors.length).fill(0), shares0 = G.w.slice();
    const tierCore = hasC && hasF ? cesShares([m.core, m.flex], [G.C.W, G.F.W], X.rhoM)[0] : hasC ? 1 : 0;
    const baseShare = m.base / (m.base + nn);
    if (hasC) cesShares(G.C.idx.map((i) => Qm[i]), G.C.wt, X.rho).forEach((s, j) => { shares[G.C.idx[j]] = baseShare * tierCore * s; });
    if (hasF) cesShares(G.F.idx.map((i) => Qm[i]), G.F.wt, X.rhoF).forEach((s, j) => { shares[G.F.idx[j]] = baseShare * (1 - tierCore) * s; });
    return { Vcore: m.core, Vflex: m.flex, VcoreUseful: u.core, VflexUseful: u.flex, Vbase: m.base, VbaseUseful: u.base, newGoods: nn, Vmacro, Vuseful, capMult: k, labour: l, Wc: G.C.W, rho: X.rho, shares, shares0, newShare: nn / (m.base + nn), hasC, hasF };
  }

  // ---------------- Snapshot (one moment) ----------------
  // o: { gs, fs, n, costs, c, labour ('optimal' | array | null = starting shares), capital (number | 'longrun') }
  function snapshot(state, E, o) {
    o = o || {};
    const X = globalsFor(state);
    const c = o.c != null ? o.c : 0;
    const out = state.sectors.map((s, i) => {
      const P = sectorParams(s, X);
      const g = o.gs ? o.gs[i] : P.gmax;
      const r = Object.assign({ g }, evalSector(P, g, E, c, X, o.fs ? o.fs[i] : null));
      r.cost = o.costs ? o.costs[i] : 0;
      r.V *= 1 - r.cost; r.Vm *= 1 - r.cost;
      return r;
    });
    const nn = o.n != null ? o.n : X.Nmax * hill0(E, X.Tnew);
    const Vs = out.map((r) => r.V), Vms = out.map((r) => r.Vm);
    const labour = o.labour === 'optimal' ? optimalLabour(state.sectors, Vms, X) : o.labour || null;
    let m = macro(state.sectors, Vs, Vms, X, nn, labour, 1);
    if (o.capital === 'longrun') m = macro(state.sectors, Vs, Vms, X, nn, labour, Math.pow(m.Vmacro, X.alphaK / (1 - X.alphaK)));
    else if (typeof o.capital === 'number') m = macro(state.sectors, Vs, Vms, X, nn, labour, Math.pow(o.capital, X.alphaK));
    const automationFixed = out.reduce((a, r, i) => a + m.shares0[i] * r.f, 0);
    return Object.assign({ T: E, c, sectors: out, n: nn, automationFixed }, m);
  }
  // The most the economy could ever produce: unlimited AI, everything rebuilt, workers and capital fully adjusted.
  function ceiling(state, opts) {
    opts = opts || {};
    const X = globalsFor(state);
    const Ps = state.sectors.map((s) => sectorParams(s, X));
    return snapshot(state, 1e6, { c: 1, gs: Ps.map((P) => P.gmax), fs: Ps.map((P) => P.fmax), n: X.Nmax, labour: opts.labour === false ? null : 'optimal', capital: opts.capital === false ? null : 'longrun' });
  }

  // ---------------- 3. Dynamic loop (quarterly steps, yearly rows) ----------------
  // F      = V_R&D^φ · clamp(V_ess^ψ) · Y^λ            feedback from the economy to AI progress
  // growth = r0 · F · E^(−θ), smoothly capped            E ← E (1 + growth)^dt
  // ℓ     += F dt;  c = 1 − exp(−k_c ℓ)                 capability: k_c set so c = 0.9 in the AGI year
  // a_i   += λ m dt a (1 − a/f*_i)                      adoption (S-curve), m = payoff multiplier
  // g_i   += α_i m (g_max hill(E, T_crit) − g_i)        rebuilding
  // n     += s m (N_max hill0(E, T_new) − n)            AI-native products
  // l     += μ (l* − l)                                 workers move toward the best allocation
  // k     += δ (Y − k)                                  capital catches up with output
  // cost_i = J max(0, u̇_i − u̇_i,0), u = a(1 + g)       up-front cost of change
  const kcCache = new Map();
  function calibratedKc(state) {
    const start = state.startYear || 2027;
    const Y = Math.max(start + 1, Math.round(state.agiYear));
    const key = JSON.stringify(state, (k, v) => (['sel', 'preset', '_kc', 'years', 'basis', 'evidence'].includes(k) ? undefined : v));
    if (kcCache.has(key)) return kcCache.get(key);
    // ℓ counts years of progress at today's pace; c reaches 0.9 when ℓ reaches its value in the AGI year
    let kc = Math.log(10) / Math.max(1, Y - (start - 1));
    for (let it = 0; it < 4; it++) {
      const rows = simulate(Object.assign({}, state, { _kc: kc, years: Y - start }));
      const ell = rows[rows.length - 1].ell;
      kc = Math.log(10) / Math.max(0.5, ell);
    }
    if (kcCache.size > 200) kcCache.clear();
    kcCache.set(key, kc);
    return kc;
  }

  function simulate(state) {
    if (state.agiYear && state._kc == null) state = Object.assign({}, state, { _kc: calibratedKc(state) });
    const X = globalsFor(state);
    const years = Math.max(1, Math.round(state.years));
    const steps = STEPS_PER_YEAR, dt = 1 / steps;
    const r0 = state.r0 / 100;
    const rdIdx = state.sectors.findIndex((s) => s.rd);
    const start = state.startYear || 2027;
    const Ps = state.sectors.map((s) => sectorParams(s, X));
    const hh = X.hLoop || 0, Ar = rawSpeed(X);
    const R_REF = 1.4;
    const payoff = (E, c) => {
      if (!X.payoffResp) return 1;
      const he = hEff(X, c);
      const R = 1 / (he + (1 - he) / (Ar * Math.max(E, 1)));
      return Math.pow(clamp(Math.log(Math.max(R, 1.0001)) / Math.log(R_REF), 0.3, 20), X.payoffResp);
    };
    // ℓ starts at one year of progress (end-2026 capability relative to the c = 0 reference)
    let E = 1, n = 0, ell = 0, kcap = 1;
    let gs = Ps.map(() => 0);
    let fs = Ps.map((P) => X.adopt0 * P.f0);
    let labour = groups(state.sectors).w.slice();
    const usage = () => fs.map((a, i) => a * (1 + gs[i]));
    let prev = usage(), rate0 = null;
    const rows = [];
    const total = years * steps;
    for (let k = 0; k <= total; k++) {
      const c = 1 - Math.exp(-X.kc * ell);
      const u = usage();
      const rate = u.map((x, i) => Math.max(0, x - prev[i]) / dt);
      if (rate0 === null && k > 0) rate0 = rate.slice();
      const costs = rate.map((x, i) => clamp(X.jCost * Math.max(0, x - (rate0 ? rate0[i] : x)), 0, 0.5));
      prev = u;
      const snap = snapshot(state, E, { c, gs, fs, n, costs, labour, capital: kcap });
      const Vrd = rdIdx >= 0 ? snap.sectors[rdIdx].Vm : 1;
      const ess = snap.hasC ? clamp(Math.pow(Math.max(snap.Vcore, 1e-9), X.psiEss), 0.25, 3) : 1;
      const F = Math.pow(Math.max(Vrd, 1e-9), X.phi) * ess * Math.pow(Math.max(snap.Vmacro, 1e-9), X.invElast);
      const raw = r0 * F * Math.pow(E, -X.theta);
      const growth = raw / Math.pow(1 + Math.pow(raw / X.growthCap, 4), 0.25);
      if (k % steps === 0) {
        const trend = Math.pow(1 + X.trendGrowth, k / steps);
        rows.push(Object.assign({ t: k / steps, year: start + k / steps, trend, gdp: snap.Vmacro * trend, gdpUseful: snap.Vuseful * trend, gdpNoAI: trend, growth, rawGrowth: raw, capped: raw > growth * 1.02, feedback: F, ell }, snap));
      }
      if (k === total) break;
      const m = payoff(E, c);
      fs = fs.map((a, i) => { const fA = fAvail(Ps[i], c); return fA <= 0 ? 0 : clamp(a + Math.min(3, X.adoptSpeed * m) * dt * a * (1 - a / fA), 0, fA > a ? fA : a); });
      gs = gs.map((g, i) => g + stepRate(Math.min(0.9, Ps[i].alpha * m), dt) * (Ps[i].gmax * (1 - (1 - hill(E, Ps[i].Tcrit)) * (1 - X.capRebuild * c)) - g));
      n = n + stepRate(Math.min(0.9, X.newSpeed * m), dt) * (X.Nmax * hill0(E, X.Tnew) - n);
      if (X.labourMob > 0) { const target = optimalLabour(state.sectors, snap.sectors.map((r) => r.Vm), X); const sr = stepRate(X.labourMob, dt); labour = labour.map((l, i) => l + sr * (target[i] - l)); }
      kcap = kcap + X.delta * dt * (snap.Vmacro - kcap);
      ell += F * dt;
      E = E * Math.pow(1 + growth, dt);
    }
    return rows;
  }

  // ---------------- 4. Uncertainty (Monte Carlo) ----------------
  // Each uncertain input is multiplied by exp(spread · z), then clamped to its slider range.
  // Sector inputs share a common error component: z = √c · z_common + √(1−c) · z_own.
  // Settings used by every run: ±25% (1σ), 150 runs, errors half shared across sectors.
  const MC = { spread: 0.25, runs: 150, corr: 0.5 };
  const SECTOR_RANGES = { f: [0, 95], fmax: [0, 95], p: [0, 100], eta: [0, 10], gamma: [0, 40], gmax: [0, 90], Tcrit: [0.5, 30], alpha: [5, 30] };
  // the dials and the fixed assumptions are all varied
  const GLOBAL_RANGES = {
    r0: [5, 60], hLoop: [5, 60], adoptSpeed: [5, 60], Nmax: [0, 100],
    aiNow: [1, 5], adopt0: [0, 100], jCost: [0, 5], payoffResp: [0, 1], phi: [0, 1], theta: [0, 1], invElast: [0, 1], psiEss: [0, 1],
    checkMax: [0, 1], dEta: [0, 100], lossMax: [0, 50], attackVol: [0.05, 2], defence: [0, 100],
    hFall: [0, 1], cfx: [1.05, 3], fragility: [1.05, 10], flexSigma: [0.5, 10], capShare: [20, 50], depreciation: [2, 12], labourMob: [0, 50], Tnew: [2, 50],
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
    Object.keys(GLOBAL_RANGES).forEach((k) => { const v0 = s[k] != null ? s[k] : FIXED[k]; if (typeof v0 === 'number' && v0 !== 0) s[k] = j(v0, GLOBAL_RANGES[k], gauss(r)); });
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
    return { Vmacro: rows.map((x) => x.Vmacro), Vuseful: rows.map((x) => x.Vuseful), T: rows.map((x) => x.T) };
  }

  // fix the calibrated capability pace once for the base state, so uncertainty in AI progress shifts the AGI year
  function withBeta(state) { return state.agiYear && state._kc == null ? Object.assign({}, state, { _kc: calibratedKc(state) }) : state; }

  function monteCarlo(state, runs, spread, seed, corr) {
    state = withBeta(state);
    const r = rng(seed || 12345);
    const m = { Vmacro: [], Vuseful: [], T: [] };
    for (let k = 0; k < (runs || MC.runs); k++) { const o = mcRun(state, r, spread != null ? spread : MC.spread, corr != null ? corr : MC.corr); m.Vmacro.push(o.Vmacro); m.Vuseful.push(o.Vuseful); m.T.push(o.T); }
    return { Vmacro: summarise(m.Vmacro), Vuseful: summarise(m.Vuseful), T: summarise(m.T) };
  }

  const api = { defaultState, defaultSectors, applyRobotics, FIXED, FIXED_INFO, SOURCES, GLOBAL_EVIDENCE, MC, K, G_CAP, F_CAP, STEPS_PER_YEAR, hill, hill0, globalsFor, sectorParams, fAvail, sectorValueAt, evalSector, macro, optimalLabour, snapshot, ceiling, simulate, rng, perturb, summarise, quantile, mcRun, monteCarlo, calibratedKc, withBeta };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.AIModel = api;
})(typeof window !== 'undefined' ? window : this);
