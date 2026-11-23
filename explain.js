/* Numbers and tables for the explainer (why.html), computed from model.js.
 * Runs in the browser (window.AIExplain) and in Node (module.exports), so the build can write
 * the same figures into the static page for readers and machines that don't run JavaScript. */
(function (root) {
  'use strict';

  function compute(M) {
    // two significant figures: the inputs are judgement calls, so more digits would be false precision
    const fx = (v) => (v >= 10 ? Math.round(v).toLocaleString('en-GB') : v >= 1 ? v.toFixed(1) : v.toFixed(2)) + '×';
    const pc = (v, d = 0) => (v * 100).toFixed(d) + '%';
    const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const D = () => M.defaultState();
    // experiments that change one mechanism keep the default capability pace, so the AGI year moves with them
    const DK = () => M.withBeta(M.defaultState());
    const yr = (rows, y) => rows.find((r) => r.year === y);
    const sim = (s, years) => M.simulate(Object.assign(s, { years: years || 23 }));
    const peakOf = (rows) => { let b = 0, y = 0; for (let i = 0; i + 1 < rows.length; i++) { const v = rows[i + 1].Vmacro / rows[i].Vmacro - 1; if (v > b) { b = v; y = rows[i].year; } } return [b, y]; };
    const tg = M.FIXED.trendGrowth / 100;

    const run = sim(D());
    const at = (y) => yr(run, y);
    const N = {};
    const T = {};       // table HTML by element id
    const data = {};    // the same results as plain numbers, for data.json

    // ---------- headline ----------
    const pk = peakOf(run);
    const g = (a, b, rows) => Math.pow(yr(rows || run, b).Vmacro / yr(rows || run, a).Vmacro, 1 / (b - a)) - 1;
    Object.assign(N, {
      T41: fx(at(2041).T), T50: fx(at(2050).T), V41: fx(at(2041).Vmacro), V50: fx(at(2050).Vmacro),
      U50: fx(at(2050).Vuseful), U41: fx(at(2041).Vuseful),
      GDP50: fx(at(2050).gdp), NOAI50: fx(at(2050).gdpNoAI), TG: M.FIXED.trendGrowth.toFixed(1) + '%',
      A2728: pc(g(2027, 2028), 1), G2728: pc((1 + g(2027, 2028)) * (1 + tg) - 1, 1),
      A4650: '+' + pc(g(2046, 2050), 1), A4650n: pc(g(2046, 2050), 1),
      PKV: pc(pk[0], 1), PKY: String(pk[1]),
      AU26: pc(at(2027).automationFixed), HCAP: fx(1 / (D().hLoop / 100)),
      K50: pc(at(2050).capMult - 1),
    });
    data.defaultRun = run.map((r) => ({ year: r.year, usefulAIWork: r.T, capability: r.c, gdpVsNoFurtherAI: r.Vmacro, usefulOutputVsNoFurtherAI: r.Vuseful, capitalBoost: r.capMult, essentialSectors: r.Vcore, flexibleSectors: r.Vflex, gdpIndex: r.gdp, gdpIndexWithoutFurtherAI: r.gdpNoAI, tasksDoneWithAI: r.automationFixed, sectors: r.sectors.map((s, i) => ({ name: M.defaultState().sectors[i].name, usefulOutputPerWorker: s.V, measuredOutputPerWorker: s.Vm, speedup: s.S, workDoneWithAI: s.f, rebuilt: s.g, fraudLoss: s.loss, workersShare: r.labour[i], spendingShare: r.shares[i] })) }));
    data.peak = { growthAIAdds: pk[0], year: pk[1] };

    // ---------- growth-rate table ----------
    const long = sim(D(), 47);
    const periods = [[2027, 2028], [2028, 2032], [2032, 2036], [2036, 2041], [2041, 2046], [2046, 2050], [2050, 2060], [2060, 2074]];
    let t = `<thead><tr><th scope="col">Period</th><th scope="col">Growth AI adds each year</th><th scope="col">GDP growth with AI (incl. ${(tg * 100).toFixed(1)}% trend)</th><th scope="col">GDP growth without further AI</th></tr></thead><tbody>`;
    data.growthByPeriod = [];
    periods.forEach(([a, b]) => {
      const ai = g(a, b, long);
      data.growthByPeriod.push({ from: a, to: b, growthAIAdds: ai, gdpGrowthWithAI: (1 + ai) * (1 + tg) - 1, gdpGrowthWithoutFurtherAI: tg });
      t += `<tr><th scope="row" class="txt">${a}–${b}</th><td>${pc(ai, 1)}</td><td>${pc((1 + ai) * (1 + tg) - 1, 1)}</td><td>${pc(tg, 1)}</td></tr>`;
    });
    T.tRate = t + '</tbody>';
    N.A5060 = pc(g(2050, 2060, long), 1); N.A6074 = pc(g(2060, 2074, long), 1); N.T74 = fx(yr(long, 2074).T);

    // ---------- spending shares ----------
    Object.assign(N, { H26: pc(at(2027).shares[2]), H41: pc(at(2041).shares[2]), B26: pc(at(2027).shares[1]), B41: pc(at(2041).shares[1]), SW26: pc(at(2027).shares[4]), SW50: pc(at(2050).shares[4]),
      L26: pc(at(2027).labour[2]), L50: pc(at(2050).labour[2]) });

    // ---------- arms race example (2050, default run) ----------
    const s50 = at(2050).sectors;
    Object.assign(N, { ADS: fx(s50[3].S), ADV: fx(s50[3].V), ADM: fx(s50[3].Vm), SWS: fx(s50[0].S), SWV: fx(s50[0].V) });
    N.KS50 = fx(s50[4].Vm);
    const X0 = M.globalsFor(D());
    N.CHKX = fx(1 / (0.5 * X0.checkMax * (1 - X0.dEta)));

    // ---------- cyber-attack scenario ----------
    const cy = (() => { const s = DK(); s.sectors[3].gamma = 40; return sim(s, 14); })();
    Object.assign(N, { ESS41: fx(at(2041).Vcore), CYflex: fx(yr(cy, 2041).Vflex), CYcore: fx(yr(cy, 2041).Vcore), CYV: fx(yr(cy, 2041).Vmacro), CYT: fx(yr(cy, 2041).T), CYL: pc(yr(cy, 2041).sectors[3].loss) });

    // ---------- AI research feedback ----------
    const rsi0 = yr(sim(Object.assign(DK(), { phi: 0 })), 2050), rsi1 = yr(sim(Object.assign(DK(), { phi: 1 })), 2050);
    Object.assign(N, { RSI0T: fx(rsi0.T), RSI1T: fx(rsi1.T), RSI0V: fx(rsi0.Vmacro), RSI1V: fx(rsi1.Vmacro) });

    // ---------- ceilings ----------
    const ceilFor = (mk, clean) => { const z = mk(); if (clean) z.sectors.forEach((x) => { x.eta = 0; x.gamma = 0; x.p = 100; }); return M.ceiling(z); };
    const cS = ceilFor(D, false), c0 = ceilFor(D, true);
    const cNoK = M.ceiling(D(), { capital: false });
    Object.assign(N, { CEIL: fx(cS.Vmacro), CEILU: fx(cS.Vuseful), CEIL0: fx(c0.Vmacro), CEILNK: fx(cNoK.Vmacro), EIRR: pc(cS.sectors[0].eps) });
    t = '<thead><tr><th scope="col">Sector</th><th scope="col">Work out of AI’s reach</th><th scope="col">Most it can speed up</th><th scope="col">Most useful output per worker, no checking, fraud or arms races</th><th scope="col">With them</th></tr></thead><tbody>';
    data.ceilings = { gdp: cS.Vmacro, usefulOutput: cS.Vuseful, usefulOutputWithoutCheckingFraudOrArmsRaces: c0.Vuseful, gdpWithoutCapitalBuildUp: cNoK.Vmacro, sectors: [] };
    D().sectors.forEach((s, i) => {
      data.ceilings.sectors.push({ name: s.name, workOutOfReach: c0.sectors[i].eps, maxSpeedup: c0.sectors[i].S, maxUsefulOutputClean: c0.sectors[i].V, maxUsefulOutput: cS.sectors[i].V });
      t += `<tr><th scope="row" class="txt">${esc(s.name)}</th><td>${pc(c0.sectors[i].eps)}</td><td>${fx(c0.sectors[i].S)}</td><td>${fx(c0.sectors[i].V)}</td><td>${fx(cS.sectors[i].V)}</td></tr>`;
    });
    t += `<tr class="hl"><th scope="row" class="txt"><b>Whole economy</b>, with workers and capital fully adjusted</th><td></td><td></td><td>${fx(c0.Vuseful)}</td><td>${fx(cS.Vuseful)}</td></tr></tbody>`;
    T.tCeil = t;

    // catching up with today's AI, no further progress
    const ohState = D();
    const Ps = ohState.sectors.map((s) => M.sectorParams(s));
    N.OH = fx(M.snapshot(ohState, 1, { c: 0, gs: Ps.map((P) => P.gmax), labour: 'optimal', capital: 'longrun' }).Vmacro);

    // ---------- what you'd have to believe ----------
    function ceilingWith(e) {
      const q = Object.assign(D(), { hLoop: 0 });
      q.sectors.forEach((x) => { x.eta = 0; x.gamma = 0; x.p = 100; x.f = (1 - e) * 100; x.fmax = (1 - e) * 100; });
      return M.ceiling(q).Vmacro;
    }
    t = '<thead><tr><th scope="col">Work out of AI’s reach, every sector</th><th scope="col">Output ceiling (× no further AI), unlimited AI</th><th scope="col">Growth AI adds if reached in 30 years</th></tr></thead><tbody>';
    t += `<tr class="hl"><th scope="row" class="txt">Model defaults (${pc(Math.min(...cS.sectors.map((s) => s.eps)))}–${pc(Math.max(...cS.sectors.map((s) => s.eps)))}), with checking, fraud and arms races</th><td>${fx(cS.Vmacro)}</td><td>${pc(Math.pow(cS.Vmacro, 1 / 30) - 1, 1)} a year</td></tr>`;
    data.whatYouWouldHaveToBelieve = [];
    let hund = null;
    [0.1, 0.05, 0.02, 0.01, 0.005].forEach((e) => {
      const v = ceilingWith(e);
      if (hund === null && v >= 100) hund = e;
      data.whatYouWouldHaveToBelieve.push({ workOutOfReach: e, outputCeiling: v, growthIfReachedIn30Years: Math.pow(v, 1 / 30) - 1 });
      t += `<tr><th scope="row" class="txt">${pc(e, e < 0.01 ? 1 : 0)}, no checking, fraud or arms races</th><td>${fx(v)}</td><td>${pc(Math.pow(v, 1 / 30) - 1, 1)} a year</td></tr>`;
    });
    T.tBelieve = t + '</tbody>';
    N.HUND = hund ? pc(1 - hund, hund < 0.01 ? 1 : 0) : 'more than 99.5%';

    // ---------- robotics ----------
    const R = () => M.applyRobotics(DK());
    const r1 = sim(R()), p1 = peakOf(r1);
    const n0 = ceilFor(D, true), n1 = ceilFor(R, true), s1 = ceilFor(R, false);
    Object.assign(N, { RB_E0: pc(n0.sectors[0].eps), RB_E1: pc(n1.sectors[0].eps), RB_P0: pc(pk[0], 1), RB_P1: pc(p1[0], 1), RB_C1: fx(s1.Vmacro) });
    const row = (label, a, b) => `<tr><th scope="row" class="txt">${label}</th><td>${a}</td><td>${b}</td></tr>`;
    T.tRobot = '<thead><tr><th scope="col">Measure</th><th scope="col">Default</th><th scope="col">Robotics breakthrough</th></tr></thead><tbody>' +
      row('Physical production: work out of AI’s reach', pc(n0.sectors[0].eps), pc(n1.sectors[0].eps)) +
      row('Property and hospitality: work out of AI’s reach', pc(n0.sectors[5].eps), pc(n1.sectors[5].eps)) +
      row('GDP vs no further AI, 2041', fx(at(2041).Vmacro), fx(yr(r1, 2041).Vmacro)) +
      row('GDP vs no further AI, 2050', fx(at(2050).Vmacro), fx(yr(r1, 2050).Vmacro)) +
      row('Peak growth AI adds', `${pc(pk[0], 1)} (${pk[1]})`, `${pc(p1[0], 1)} (${p1[1]})`) +
      row('Ceiling with unlimited AI', fx(cS.Vmacro), fx(s1.Vmacro)) +
      row('Ceiling with no checking, fraud or arms races', fx(n0.Vmacro), fx(n1.Vmacro)) + '</tbody>';
    data.robotics = { gdp2050: yr(r1, 2050).Vmacro, peak: p1[0], peakYear: p1[1], ceiling: s1.Vmacro };

    // ---------- timelines ----------
    const cases = [
      ['Median expert (FRI panel)', {}],
      ['Superforecasters (FRI panel)', { agiYear: 2047 }],
      ['Forecasting sites', { agiYear: 2031, r0: 45 }],
      ['AI lab leaders', { agiYear: 2028, r0: 60, phi: 0.8 }],
    ];
    t = '<thead><tr><th scope="col">Timeline</th><th scope="col">AGI year</th><th scope="col">Peak growth AI adds</th><th scope="col">Peak year</th><th scope="col">GDP vs no further AI, 2035</th><th scope="col">2050</th></tr></thead><tbody>';
    const res = cases.map(([lab, o]) => { const s = Object.assign(D(), o); const r = sim(s); const p = peakOf(r); return { lab, agi: s.agiYear, p, v35: yr(r, 2035).Vmacro, v50: yr(r, 2050).Vmacro }; });
    data.timelines = res.map((x) => ({ timeline: x.lab, agiYear: x.agi, peakGrowthAIAdds: x.p[0], peakYear: x.p[1], gdpVsNoFurtherAI2035: x.v35, gdpVsNoFurtherAI2050: x.v50 }));
    res.forEach((x) => { t += `<tr><th scope="row" class="txt">${x.lab}</th><td>${x.agi}</td><td>${pc(x.p[0], 1)} a year</td><td>${x.p[1]}</td><td>${fx(x.v35)}</td><td>${fx(x.v50)}</td></tr>`; });
    T.tPeak = t + '</tbody>';
    Object.assign(N, { PK_MP: pc(res[0].p[0], 1), PK_LP: pc(res[3].p[0], 1), PK_GAP: String(res[0].agi - res[0].p[1]), PK_LAG: String(res[3].p[1] - res[3].agi), PK_L35: fx(res[3].v35), PK_M35: fx(res[0].v35) });

    // ---------- which limits matter: remove one at a time ----------
    const brakes = [
      ['Model defaults', (s) => s],
      ['No checking of AI’s work', (s) => { s.sectors.forEach((x) => { x.eta = 0; }); return s; }],
      ['No fraud or attack losses', (s) => { s.sectors.forEach((x) => { x.gamma = 0; }); return s; }],
      ['No arms races (all activity creates wealth)', (s) => { s.sectors.forEach((x) => { x.p = 100; }); return s; }],
      ['AI can eventually do 95% of every sector’s work', (s) => { s.sectors.forEach((x) => { x.fmax = 95; x.gmax = 90; }); return s; }],
      ['AI-native products grow to half of today’s economy', (s) => Object.assign(s, { Nmax: 50 })],
      ['No diminishing returns or speed limit on AI progress', (s) => Object.assign(s, { theta: 0, growthCap: 100000 })],
      ['Sectors substitute freely for each other', (s) => Object.assign(s, { fragility: 1.05, cfx: 1.05 })],
      ['Defensive AI stops all attack losses', (s) => Object.assign(s, { defence: 100 })],
      ['Workers never move between sectors', (s) => Object.assign(s, { labourMob: 0 })],
      ['Capital never builds up', (s) => Object.assign(s, { capShare: 0 })],
      ['All the limits above the line removed together', (s) => { s.sectors.forEach((x) => { x.eta = 0; x.gamma = 0; x.p = 100; x.fmax = 95; x.gmax = 90; }); return Object.assign(s, { Nmax: 50, theta: 0, growthCap: 100000, fragility: 1.05, cfx: 1.05 }); }],
    ];
    t = '<thead><tr><th scope="col">Change to the model</th><th scope="col">GDP vs no further AI, 2050</th><th scope="col">Useful output, 2050</th><th scope="col">Peak growth AI adds</th><th scope="col">Ceiling with unlimited AI</th></tr></thead><tbody>';
    data.limits = [];
    brakes.forEach(([lab, f], i) => {
      const s = f(DK());
      const r = sim(s), p = peakOf(r), c = M.ceiling(s);
      data.limits.push({ change: lab, gdp2050: yr(r, 2050).Vmacro, usefulOutput2050: yr(r, 2050).Vuseful, peakGrowthAIAdds: p[0], peakYear: p[1], ceiling: c.Vmacro });
      const cls = i === 0 ? ' class="hl"' : i === brakes.length - 1 ? ' class="hl sep"' : i === 9 ? ' class="sep"' : '';
      t += `<tr${cls}><th scope="row" class="txt">${lab}</th><td>${fx(yr(r, 2050).Vmacro)}</td><td>${fx(yr(r, 2050).Vuseful)}</td><td>${pc(p[0], 1)} (${p[1]})</td><td>${fx(c.Vmacro)}</td></tr>`;
    });
    T.tBrakes = t + '</tbody>';
    const L = data.limits;
    Object.assign(N, { BR_ALL: fx(L[L.length - 1].gdp2050), BR_ALLC: fx(L[L.length - 1].ceiling), BR_ALLP: pc(L[L.length - 1].peakGrowthAIAdds, 1), BR_SUB: fx(L[7].gdp2050), BR_NOK: fx(L[10].gdp2050), BR_NOL: fx(L[9].gdp2050), BR_DEF: fx(L[8].gdp2050), BR_RD: fx(L[6].gdp2050), BR_FIT: fx(L[4].gdp2050), BR_FITC: fx(L[4].ceiling) });

    const CAP = {"tRate": "Growth AI adds each year, by period, default scenario", "tCeil": "Ceilings with unlimited AI, by sector", "tBelieve": "Output ceiling as the share of work out of AI’s reach shrinks", "tRobot": "Default settings compared with a robotics breakthrough", "tPeak": "Peak growth and GDP under four AGI timelines", "tBrakes": "Effect of removing each limit in the model, one at a time"};
    Object.keys(T).forEach((id) => { if (CAP[id]) T[id] = `<caption class="sr">${CAP[id]}</caption>` + T[id]; });
    return { N, T, data, run, fx, pc };
  }

  // Default settings with their evidence, as plain tables (model page; also written into the static page by the build)
  function settingsHTML(M) {
    const esc = (x) => String(x).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const src = (keys) => (keys || []).map((k) => (M.SOURCES[k] ? `<a href="${M.SOURCES[k].u}" rel="noopener">${esc(M.SOURCES[k].t.split(/[,:(]/)[0].trim())}</a>` : '')).filter(Boolean).join(', ');
    const D = M.defaultState();
    const G = M.GLOBAL_EVIDENCE;
    const dials = [['AGI year', D.agiYear, 'agiYear', ''], ['Speed of AI progress', D.r0, 'r0', '%/yr'], ['Adoption speed', D.adoptSpeed, 'adoptSpeed', '%/yr'], ['Human-in-the-loop share before rebuilding', D.hLoop, 'hLoop', '%'], ['AI-native products, mature size', D.Nmax, 'Nmax', '% of today’s economy']];
    let h = '<h3>The six dials</h3><div class="tbl-wrap"><table><caption class="sr">Economy-wide dials, defaults and evidence</caption><thead><tr><th scope="col">Dial</th><th scope="col">Default</th><th scope="col">Plausible range</th><th scope="col">Evidence</th></tr></thead><tbody>';
    dials.forEach(([lab, v, k, u]) => { const e = G[k]; h += `<tr><th scope="row" class="txt">${lab}</th><td>${v}${u}</td><td>${e ? `${e.lo}–${e.hi}${u}` : ''}</td><td class="txt">${e ? `${esc(e.note)} ${src(e.src)}` : ''}</td></tr>`; });
    h += '</tbody></table></div>';
    const cols = [['weight', 'Share of GDP', '%'], ['f', 'Work AI can speed up today', '%'], ['fmax', 'Work AI could ever speed up', '%'], ['p', 'New wealth vs arms race', '%'], ['eta', 'Checking costs', '/10'], ['gamma', 'Fraud and attack exposure', '/10'], ['gmax', 'Rebuilding ceiling', '%'], ['Tcrit', 'Rebuilding midpoint', '×'], ['alpha', 'Rebuilding speed', '%/yr']];
    h += '<h3>Sector settings</h3><div class="tbl-wrap"><table><caption class="sr">Default settings for each sector, with plausible ranges</caption><thead><tr><th scope="col">Sector</th><th scope="col">Group</th>' + cols.map((c) => `<th scope="col">${c[1]}</th>`).join('') + '</tr></thead><tbody>';
    D.sectors.forEach((x) => { h += `<tr><th scope="row" class="txt">${esc(x.name)}</th><td class="txt">${x.tier === 'core' ? 'essential' : 'flexible'}</td>` + cols.map(([k, , u]) => { const e = x.evidence && x.evidence[k]; return `<td>${x[k]}${u}${e ? `<br><small>${e.lo}–${e.hi}</small>` : ''}</td>`; }).join('') + '</tr>'; });
    h += '</tbody></table></div>';
    h += '<h3>Fixed assumptions</h3><div class="tbl-wrap"><table><caption class="sr">Fixed assumptions with evidence</caption><thead><tr><th scope="col">Assumption</th><th scope="col">Value</th><th scope="col">Evidence</th></tr></thead><tbody>';
    Object.keys(M.FIXED_INFO).forEach((k) => { const f = M.FIXED_INFO[k]; h += `<tr><th scope="row" class="txt">${esc(f.label)}</th><td>${esc(f.value)}</td><td class="txt">${esc(f.ev.note)} ${src(f.ev.src)}</td></tr>`; });
    return h + '</tbody></table></div>';
  }

  const api = { compute, settingsHTML };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.AIExplain = api;
})(typeof window !== 'undefined' ? window : this);
