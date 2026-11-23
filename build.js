/* Build the publishable site into dist/.
 * The pages work without a build; this step makes them machine readable: every number and table on
 * both pages is written into the static HTML (so readers and crawlers that don't run JavaScript see the
 * results), structured data (JSON-LD) goes into each page, and the results, settings and evidence are
 * published as data.json, data.csv, model.json and llms.txt, with robots.txt and sitemap.xml.
 * Run: node build.js   (no dependencies) */
'use strict';
const fs = require('fs');
const path = require('path');
const M = require('./model.js');
const X = require('./explain.js');

const SITE = 'https://ai-transformation-model.uk-rob-mitchell.workers.dev';
const OUT = path.join(__dirname, 'dist');
const today = new Date().toISOString().slice(0, 10);

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
const read = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');
const write = (f, s) => fs.writeFileSync(path.join(OUT, f), s);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ---------- results ----------
const ex = X.compute(M);
const N = ex.N;
const D = M.defaultState();
const fx = ex.fx, pc = ex.pc;
const f2 = (v) => (Number.isFinite(v) ? v.toFixed(2) : '–');
const main = M.simulate(M.defaultState());          // the model page's default view (15 years)
const last = main[main.length - 1];
const round = (v) => (typeof v === 'number' ? +v.toPrecision(5) : v);
const clean = (o) => JSON.parse(JSON.stringify(o, (k, v) => round(v)));

// ---------- structured data ----------
const datasetLD = {
  '@type': 'Dataset',
  '@id': `${SITE}/#dataset`,
  name: 'AI Transformation Model: default scenario results',
  description: `Year-by-year results of a six-sector model of AI's effect on an advanced economy, 2027–2074: GDP and useful output relative to a world with no further AI, useful AI work, sector productivity, workers, spending shares, ceilings and sensitivity to each limit. Default scenario: GDP ${N.V50} by 2050, peak growth AI adds ${N.PKV} a year (${N.PKY}), long-run ceiling ${N.CEIL}.`,
  url: `${SITE}/data.json`,
  isAccessibleForFree: true,
  temporalCoverage: '2027/2074',
  spatialCoverage: 'Advanced economies (sector sizes from US 2025 data)',
  dateModified: today,
  variableMeasured: ['GDP relative to no further AI', 'Useful output relative to no further AI', 'Useful AI work per dollar', 'AI capability', 'Capital boost', 'Sector output per worker', 'Share of work done with AI', 'Share of workers by sector', 'Spending share by sector'],
  distribution: [
    { '@type': 'DataDownload', encodingFormat: 'application/json', contentUrl: `${SITE}/data.json` },
    { '@type': 'DataDownload', encodingFormat: 'text/csv', contentUrl: `${SITE}/data.csv` },
    { '@type': 'DataDownload', encodingFormat: 'application/json', contentUrl: `${SITE}/model.json` },
  ],
};
const siteLD = { '@type': 'WebSite', '@id': `${SITE}/#site`, name: 'AI Transformation Model', url: `${SITE}/`, inLanguage: 'en-GB' };
const ldIndex = {
  '@context': 'https://schema.org',
  '@graph': [
    siteLD,
    { '@type': 'WebApplication', '@id': `${SITE}/#app`, name: 'AI Transformation Model', url: `${SITE}/`, applicationCategory: 'EducationalApplication', operatingSystem: 'Any (web browser)', isAccessibleForFree: true, inLanguage: 'en-GB', dateModified: today, isPartOf: { '@id': `${SITE}/#site` },
      description: 'An interactive model of how AI capability turns into economic output in an advanced economy, sector by sector, after bottlenecks, checking, fraud, arms races and weakest links. Six dials, evidence for every setting, and an uncertainty band.' },
    datasetLD,
  ],
};
const citations = [
  ['Artificial Intelligence and Economic Growth', 'https://www.nber.org/papers/w23928'],
  ['Are We Approaching an Economic Singularity?', 'https://www.aeaweb.org/articles?id=10.1257/mac.20170105'],
  ['Are Ideas Getting Harder to Find?', 'https://www.aeaweb.org/articles?id=10.1257/aer.20180338'],
  ['The Simple Macroeconomics of AI', 'https://economics.mit.edu/sites/default/files/2024-04/The%20Simple%20Macroeconomics%20of%20AI.pdf'],
  ['How Important Are Sectoral Shocks?', 'https://www.aeaweb.org/articles?id=10.1257/mac.20160353'],
  ['Explosive Growth from AI Automation: A Review of the Arguments', 'https://arxiv.org/abs/2309.11690'],
  ['GPTs are GPTs', 'https://arxiv.org/abs/2303.10130'],
  ['Macroeconomics of Unbalanced Growth', 'https://www.jstor.org/stable/1812111'],
];
const ldWhy = {
  '@context': 'https://schema.org',
  '@graph': [
    siteLD,
    { '@type': 'Article', '@id': `${SITE}/why#article`, headline: 'Capability compounds. Value doesn’t.', alternativeHeadline: 'Why no singularity', url: `${SITE}/why`, inLanguage: 'en-GB', dateModified: today, isPartOf: { '@id': `${SITE}/#site` },
      description: `Why the AI Transformation Model never goes exponential, even when AI improves itself, and what the case for an economic singularity leaves out. Default scenario: GDP ${N.V50} what it would be without further AI by 2050; AI adds ${N.PKV} a year at the peak (${N.PKY}) and under 1% a year by the 2060s; ceiling ${N.CEIL}.`,
      about: ['Artificial intelligence', 'Economic growth', 'Technological singularity', 'Baumol cost disease', 'Productivity'],
      citation: citations.map(([name, url]) => ({ '@type': 'CreativeWork', name, url })),
      mainEntityOfPage: `${SITE}/why` },
    datasetLD,
  ],
};
const ld = (o) => JSON.stringify(o, null, 2).replace(/</g, '\\u003c');
const tokens = (s) => s.replace(/\{\{(\w+)\}\}/g, (m, k) => (k === 'JSONLD_INDEX' ? ld(ldIndex) : k === 'JSONLD_WHY' ? ld(ldWhy) : N[k] != null ? N[k] : m));

// ---------- why.html: numbers and tables written into the page ----------
let why = tokens(read('why.html'));
why = why.replace(/(<span\b[^>]*\bdata-k="(\w+)"[^>]*>)–(<\/span>)/g, (m, open, k, close) => (N[k] != null ? open + esc(N[k]) + close : m));
why = why.replace(/<table id="(\w+)"><\/table>/g, (m, id) => (ex.T[id] ? `<table id="${id}">${ex.T[id]}</table>` : m));
const leftover = (why.match(/data-k="\w+"[^>]*>–</g) || []).length;
if (leftover) throw new Error(`why.html: ${leftover} numbers not filled`);
write('why.html', why);

// ---------- index.html: headline results, year-by-year table, settings and sources ----------
const kpi = (label, value, delta, cls) => `<div class="kpi"><span class="eyebrow">${label}</span><span class="v">${value}</span><span class="d ${cls || ''}">${delta}</span></div>`;
const worst = last.sectors.map((s, i) => ({ s, i })).sort((a, b) => a.s.V - b.s.V)[0];
const annual = Math.pow(last.Vmacro, 1 / last.t) - 1;
const kpis =
  kpi(`GDP vs no further AI, ${last.year}`, fx(last.Vmacro), `adds ${(annual * 100).toFixed(1)}% a year · central run`, 'good') +
  kpi('Useful output vs no further AI', fx(last.Vuseful), 'GDP minus arms-race activity', 'good') +
  kpi(`Useful AI work, ${last.year}`, fx(last.T), `times end-2026 · growing ${(last.growth * 100).toFixed(0)}% a year`) +
  kpi('Essential sectors', fx(last.Vcore), last.Vcore < 1 ? 'Worse off: slowing AI progress' : 'Better off: speeding AI progress', last.Vcore >= 1 ? 'good' : 'bad') +
  kpi('Weakest sector', fx(worst.s.V), esc(D.sectors[worst.i].name)) +
  kpi('Tasks done with AI', pc(last.automationFixed), `up from ${pc(main[0].automationFixed)} in ${D.startYear}`);
let tbl = `<caption class="sr">Default scenario, year by year</caption><thead><tr><th scope="col">Year</th><th scope="col">Useful AI work</th><th scope="col">GDP (× no further AI)</th><th scope="col">Useful output (× no further AI)</th><th scope="col">Capital boost</th><th scope="col">Essential sectors</th><th scope="col">Flexible sectors</th><th scope="col">AI-native products</th><th scope="col">GDP with AI (${D.startYear} = 1)</th><th scope="col">GDP without further AI</th><th scope="col">Tasks done with AI</th>` + D.sectors.map((s) => `<th scope="col">${esc(s.name)}</th>`).join('') + '</tr></thead><tbody>';
main.forEach((r) => {
  tbl += `<tr><th scope="row">${r.year}</th><td>${fx(r.T).replace('×', '')}</td><td><b>${f2(r.Vmacro)}</b></td><td>${f2(r.Vuseful)}</td><td>${f2(r.capMult)}</td><td>${f2(r.Vcore)}</td><td>${f2(r.Vflex)}</td><td>${f2(r.newGoods)}</td><td>${f2(r.gdp)}</td><td>${f2(r.gdpNoAI)}</td><td>${pc(r.automationFixed)}</td>` + r.sectors.map((s) => `<td>${f2(s.V)}</td>`).join('') + '</tr>';
});
tbl += '</tbody>';
const sources = Object.keys(M.SOURCES).map((k) => `<li><a href="${M.SOURCES[k].u}" target="_blank" rel="noopener">${esc(M.SOURCES[k].t)}</a></li>`).join('');
let index = tokens(read('index.html'));
const fill = (id, html, tag) => {
  const re = new RegExp(`(<${tag}[^>]*\\bid="${id}"[^>]*>)(</${tag}>)`);
  if (!re.test(index)) throw new Error(`index.html: no empty #${id}`);
  index = index.replace(re, `$1${html}$2`);
};
fill('kpis', kpis, 'div');
fill('tbl', tbl, 'table');
fill('sources-list', sources, 'ul');
fill('settings-tables', X.settingsHTML(M), 'div');
write('index.html', index);

// ---------- data files ----------
const data = clean({
  name: 'AI Transformation Model: default scenario results',
  url: `${SITE}/`, generated: today,
  units: 'Multiples (×) are relative to a world where AI stays at its end-2026 level and use (1 = no change). Shares are fractions (0.05 = 5%). GDP index: 2027 = 1, including 2% a year trend growth in both worlds.',
  definitions: {
    gdpVsNoFurtherAI: 'GDP, counting all output including arms-race activity, as a multiple of GDP with no further AI; includes extra capital built from higher output.',
    usefulOutputVsNoFurtherAI: 'Like GDP but leaving out activity that is only an arms race (rival advertising, litigation, trading).',
    usefulAIWork: 'Verified work AI does per dollar, end-2026 = 1.',
    capability: 'Share of the gap to each sector’s ceiling AI has closed (0–1); 0.9 in the AGI year.',
    capitalBoost: 'Multiplier on output from extra capital built because output is higher.',
  },
  headline: { gdpVsNoFurtherAI2050: ex.run.find((r) => r.year === 2050).Vmacro, usefulOutputVsNoFurtherAI2050: ex.run.find((r) => r.year === 2050).Vuseful, peakGrowthAIAdds: ex.data.peak.growthAIAdds, peakYear: ex.data.peak.year, ceilingGDP: ex.data.ceilings.gdp, ceilingWithoutCapital: ex.data.ceilings.gdpWithoutCapitalBuildUp },
  settings: { agiYear: D.agiYear, speedOfAIProgressPctPerYear: D.r0, adoptionSpeedPctPerYear: D.adoptSpeed, humanInTheLoopPct: D.hLoop, aiNativeProductsPct: D.Nmax },
  growthByPeriod: ex.data.growthByPeriod,
  limits: ex.data.limits,
  ceilings: ex.data.ceilings,
  timelines: ex.data.timelines,
  robotics: ex.data.robotics,
  whatYouWouldHaveToBelieve: ex.data.whatYouWouldHaveToBelieve,
  defaultRun: ex.data.defaultRun,
});
write('data.json', JSON.stringify(data, null, 1));

const names = D.sectors.map((s) => s.name);
const csvHead = ['year', 'useful_ai_work', 'ai_capability', 'gdp_vs_no_further_ai', 'useful_output_vs_no_further_ai', 'capital_boost', 'essential_sectors', 'flexible_sectors', 'gdp_index', 'gdp_index_without_further_ai', 'tasks_done_with_ai'].concat(names.flatMap((n) => [`${n}: useful output per worker`, `${n}: share of workers`, `${n}: spending share`]));
const q = (s) => `"${String(s).replace(/"/g, '""')}"`;
const csv = [csvHead.map(q).join(',')].concat(ex.data.defaultRun.map((r) => [r.year, r.usefulAIWork, r.capability, r.gdpVsNoFurtherAI, r.usefulOutputVsNoFurtherAI, r.capitalBoost, r.essentialSectors, r.flexibleSectors, r.gdpIndex, r.gdpIndexWithoutFurtherAI, r.tasksDoneWithAI].concat(r.sectors.flatMap((s) => [s.usefulOutputPerWorker, s.workersShare, s.spendingShare])).map((v) => round(v)).join(','))).join('\n');
write('data.csv', csv + '\n');

const model = clean({
  name: 'AI Transformation Model: settings, evidence and sources', url: `${SITE}/`, generated: today,
  dials: Object.fromEntries(['agiYear', 'r0', 'adoptSpeed', 'hLoop', 'Nmax'].map((k) => [k, { default: D[k], evidence: M.GLOBAL_EVIDENCE[k] }])),
  sectors: D.sectors.map((s) => ({ name: s.name, group: s.tier === 'core' ? 'essential' : 'flexible', covers: s.basis, settings: { shareOfGDPPct: s.weight, workAICanSpeedUpTodayPct: s.f, workAICouldEverSpeedUpPct: s.fmax, newWealthVsArmsRacePct: s.p, checkingCostsOutOf10: s.eta, fraudAndAttackExposureOutOf10: s.gamma, rebuildingCeilingPct: s.gmax, rebuildingMidpointTimesTodaysAI: s.Tcrit, rebuildingSpeedPctOfGapPerYear: s.alpha }, evidence: s.evidence })),
  fixedAssumptions: Object.fromEntries(Object.keys(M.FIXED_INFO).map((k) => [k, M.FIXED_INFO[k]])),
  sources: M.SOURCES,
  equations: 'See llms.txt and the "How the model works" section of the model page.',
});
write('model.json', JSON.stringify(model, null, 1));

const g = ex.data.growthByPeriod.map((p) => `- ${p.from}–${p.to}: AI adds ${pc(p.growthAIAdds, 1)} a year`).join('\n');
const lim = ex.data.limits.map((l) => `- ${l.change}: GDP ${fx(l.gdp2050)} in 2050, peak ${pc(l.peakGrowthAIAdds, 1)} a year, ceiling ${fx(l.ceiling)}`).join('\n');
const tl = ex.data.timelines.map((t) => `- ${t.timeline} (AGI ${t.agiYear}): peak ${pc(t.peakGrowthAIAdds, 1)} a year in ${t.peakYear}; GDP ${fx(t.gdpVsNoFurtherAI2035)} in 2035, ${fx(t.gdpVsNoFurtherAI2050)} in 2050`).join('\n');
const llms = `# AI Transformation Model

> An interactive, evidence-based model of how much AI could add to an advanced economy, sector by sector, and why the boost fades rather than exploding. Six broad sectors sized from US 2025 GDP data; every setting has a plausible range and sources.

All figures are multiples of a world where AI stays at its end-2026 level and use (1× = no change), for the default scenario (median expert: AGI in 2050). GDP counts all output; useful output leaves out activity that is only an arms race. Both include the extra capital that higher output pays for.

## Key results (default scenario)

- GDP vs no further AI: ${N.V41} in 2041, ${N.V50} in 2050 (useful output ${N.U50}).
- Growth AI adds: ${N.A2728} in 2027, peaking at ${N.PKV} a year around ${N.PKY}, ${N.A4650n} in 2046–50, ${N.A6074} by the 2060s.
- Useful AI work (verified work per dollar): ${N.T50} by 2050 and ${N.T74} by 2074; capability compounds while output levels off.
- Long-run ceiling with unlimited AI: ${N.CEIL} (${N.CEILNK} without extra capital).
- Physical production and energy keeps ${N.EIRR} of its work out of AI's reach even with unlimited capability.

## Growth AI adds, by period

${g}

## Which limits matter (2050, one removed at a time)

${lim}

## AGI timelines

${tl}

## Pages

- [Model](${SITE}/): six dials, sector settings with evidence, charts, uncertainty band, year-by-year table.
- [Explainer: Capability compounds. Value doesn't.](${SITE}/why): why the model never goes exponential, the limits that matter, objections and responses, robotics, and AI risk.

## Data

- [data.json](${SITE}/data.json): all results (default run 2027–2074, growth by period, ceilings, limits, timelines, robotics).
- [data.csv](${SITE}/data.csv): the default run, year by year.
- [model.json](${SITE}/model.json): every setting with its plausible range, confidence, note and sources.
- [model.js](${SITE}/model.js): the calculation engine (runs in Node: require('./model.js').simulate(defaultState())).

## How the model works

- Each sector: work AI can do f* = f0 + (fmax − f0)·c, where capability c reaches 0.9 in the AGI year. Work done with AI a ≤ f* (S-curve adoption); a share g of it is rebuilt to run without people directing it.
- Time per unit of work τ = (1 − a) + a(1 − g)(ĥ + (1 − ĥ)/(Â·E)) + a·g/(Â·E) + κ̂·a, where E is useful AI work per dollar, ĥ = h·(1 − 0.75·c) people's share of AI-assisted work (h = 25% today, falling as capability c rises), and κ̂ people's time checking AI's work. Rebuilding becomes worth doing once AI is cheap enough or capable enough. Speedup S = τ0/τ.
- Fraud and attack take a bounded share L of output, rising as AI gets cheaper and partly offset by defensive AI. GDP per worker = S(1 − L); useful output per worker = (1 + p(S − 1))(1 − L), where p is the share of the speedup that creates real wealth rather than feeding an arms race.
- Economy: essential sectors are near-perfect complements (σ ≈ 0.2), flexible sectors partial substitutes (σ = 1.5), the two groups complements (σ ≈ 0.67); plus AI-native products; times capital k^0.35, with k catching up with output at 5% a year. Workers move toward the best allocation at 20% of the gap a year.
- AI progress: E grows at r0·F·E^−0.22 (capped at 200% a year), where F = V_R&D^0.4 · V_ess^0.5 · Y^0.5 feeds back the AI research sector, essential sectors (in both directions) and output. Capability c advances with F and reaches 0.9 in the AGI year.
- Ceilings on what AI can do, rebuilding and new products are fixed by design, to show which limits capability alone does not remove.

## Limitations

A sketch, not a forecast; sized like the US, not a world model; robotics only partly included; ceilings fixed on purpose; capital and workers treated simply; jobs, wages and catastrophic risk not modelled.
`;
write('llms.txt', llms);
write('robots.txt', `User-agent: *\nAllow: /\n\nSitemap: ${SITE}/sitemap.xml\n`);
write('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` + ['/', '/why', '/llms.txt', '/data.json', '/model.json', '/data.csv'].map((p) => `  <url><loc>${SITE}${p}</loc><lastmod>${today}</lastmod></url>`).join('\n') + '\n</urlset>\n');

['model.js', 'explain.js', 'app.js'].forEach((f) => fs.copyFileSync(path.join(__dirname, f), path.join(OUT, f)));
console.log('built', fs.readdirSync(OUT).join(' '));
