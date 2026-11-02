// Trading rules and backtest. Runs the same code on the iPhone and in the tests.
// The rules are fixed in advance and were not tuned to make the backtest look better.
(function (root) {
  const RULES = { breakout: 20, fast: 50, slow: 200, volRatio: 1.5, atr: 14, stopAtr: 2, targetAtr: 4, maxDays: 20, costRoundTrip: .004, capital: 100000, riskPct: .01, maxPosPct: .2, maxOpen: 5 };

  function sma(a, n) { const o = new Array(a.length).fill(null); let s = 0; for (let i = 0; i < a.length; i++) { s += a[i]; if (i >= n) s -= a[i - n]; if (i >= n - 1) o[i] = s / n; } return o; }
  function atr(st, n) {
    const o = new Array(st.c.length).fill(null); let v = null;
    for (let i = 1; i < st.c.length; i++) {
      const tr = Math.max(st.h[i] - st.l[i], Math.abs(st.h[i] - st.c[i - 1]), Math.abs(st.l[i] - st.c[i - 1]));
      if (i < n) { v = (v || 0) + tr; if (i === n - 1) v = v; continue; }
      if (i === n) v = (v + tr) / n; else v = (v * (n - 1) + tr) / n;
      o[i] = v;
    }
    return o;
  }
  // Indicators at bar i use only bars up to i. The trade is entered at the next bar's open.
  function prepare(st) {
    if (st._p) return st._p;
    const p = { s50: sma(st.c, RULES.fast), s200: sma(st.c, RULES.slow), vol: sma(st.v, 20), atr: atr(st, RULES.atr), idx: new Map(st.d.map((d, i) => [d, i])) };
    Object.defineProperty(st, '_p', { value: p, enumerable: false }); return p;
  }
  function marketOk(nifty, day) { const p = prepare(nifty), i = p.idx.get(day); return i !== undefined && p.s200[i] !== null && nifty.c[i] > p.s200[i]; }
  function checkAt(st, i, nifty) {
    const p = prepare(st); if (i < RULES.slow || p.s200[i] === null || p.atr[i] === null || i < RULES.breakout) return null;
    let hh = -Infinity; for (let j = i - RULES.breakout; j < i; j++) hh = Math.max(hh, st.h[j]);
    const vr = p.vol[i - 1] ? st.v[i] / p.vol[i - 1] : 0, c = st.c[i];
    const tests = { breakout: c > hh, trend: c > p.s50[i] && p.s50[i] > p.s200[i], volume: vr >= RULES.volRatio, market: marketOk(nifty, st.d[i]) };
    return { tests, pass: Object.values(tests).every(Boolean), vr, atr: p.atr[i], close: c, high20: hh };
  }
  // Follows one trade forward. If stop and target fall on the same day, assume the stop came first (the cautious choice).
  function simulate(st, sigI, manualExit) {
    const p = prepare(st), a = p.atr[sigI], eI = sigI + 1;
    if (eI >= st.c.length) return { status: 'pending', sigI, estEntry: st.c[sigI], estStop: st.c[sigI] - RULES.stopAtr * a, estTarget: st.c[sigI] + RULES.targetAtr * a };
    const entry = st.o[eI], stop = entry - RULES.stopAtr * a, target = entry + RULES.targetAtr * a; let exit = null, why = null, xI = null;
    for (let j = eI; j < st.c.length; j++) {
      if (manualExit !== undefined && st.d[j] > manualExit) { exit = st.o[j]; why = 'manual'; xI = j; break; }
      if (j > eI && st.o[j] <= stop) { exit = st.o[j]; why = 'stop'; xI = j; break; }
      if (j > eI && st.o[j] >= target) { exit = st.o[j]; why = 'target'; xI = j; break; }
      if (st.l[j] <= stop) { exit = stop; why = 'stop'; xI = j; break; }
      if (st.h[j] >= target) { exit = target; why = 'target'; xI = j; break; }
      if (j - eI + 1 >= RULES.maxDays) { exit = st.c[j]; why = 'time'; xI = j; break; }
    }
    const base = { sigI, eI, entry, stop, target, risk: entry - stop, entryDay: st.d[eI] };
    if (exit === null) { const last = st.c.length - 1; return { ...base, status: 'open', last: st.c[last], lastDay: st.d[last], days: last - eI + 1 }; }
    const cost = (entry + exit) / 2 * RULES.costRoundTrip;
    return { ...base, status: 'closed', exit, why, xI, exitDay: st.d[xI], days: xI - eI + 1, pnlPerShare: exit - entry - cost, r: (exit - entry - cost) / (entry - stop) };
  }
  function sizeFor(trade, capital = RULES.capital) { return Math.max(0, Math.floor(Math.min(capital * RULES.riskPct / trade.risk, capital * RULES.maxPosPct / trade.entry))); }

  function allSignals(data) {
    const out = [];
    for (const [sym, st] of Object.entries(data.stocks)) {
      let blockUntil = -1;
      for (let i = RULES.slow; i < st.c.length - 1; i++) {
        if (i <= blockUntil) continue;
        const ck = checkAt(st, i, data.nifty); if (!ck || !ck.pass) continue;
        const t = simulate(st, i); out.push({ sym, vr: ck.vr, ...t }); blockUntil = t.status === 'closed' ? t.xI : st.c.length;
      }
    }
    return out.sort((a, b) => a.entryDay - b.entryDay || b.vr - a.vr);
  }
  // Portfolio backtest with real limits: fixed starting money, at most 5 positions, no compounding of position size.
  function backtest(data, fromDay = -Infinity, toDay = Infinity) {
    const sigs = allSignals(data).filter(t => t.entryDay >= fromDay && t.entryDay <= toDay); let cash = RULES.capital, equity = RULES.capital, peak = equity, maxDD = 0; const open = [], done = [], curve = []; let skipped = 0;
    const settle = t => { const part = open.splice(open.indexOf(t), 1)[0]; cash += part.qty * part.entry; if (part.status === 'closed') { const pnl = part.qty * part.pnlPerShare; cash += pnl; equity += pnl; peak = Math.max(peak, equity); maxDD = Math.max(maxDD, (peak - equity) / peak); done.push({ ...part, pnl }); curve.push([part.exitDay, Math.round(equity)]); } };
    for (const s of sigs) {
      open.filter(t => t.status === 'closed' && t.exitDay < s.entryDay).sort((a, b) => a.exitDay - b.exitDay).forEach(settle);
      if (open.length >= RULES.maxOpen) { skipped++; continue; }
      const qty = sizeFor(s), value = qty * s.entry; if (!qty || value > cash) { skipped++; continue; }
      cash -= value; open.push({ ...s, qty });
    }
    open.filter(t => t.status === 'closed').sort((a, b) => a.exitDay - b.exitDay).forEach(settle);
    const wins = done.filter(t => t.pnl > 0), gross = wins.reduce((a, t) => a + t.pnl, 0), loss = done.filter(t => t.pnl <= 0).reduce((a, t) => a - t.pnl, 0);
    let streak = 0, worst = 0; for (const t of done) { streak = t.pnl > 0 ? 0 : streak + 1; worst = Math.max(worst, streak); }
    const n = data.nifty, days = n.d.filter(d => d >= fromDay && d <= toDay), first = days[0] !== undefined ? days[0] : n.d[0], last = days[days.length - 1] !== undefined ? days[days.length - 1] : n.d[n.d.length - 1], years = Math.max((last - first) / 365.25, .01);
    const nf0 = n.c[n.d.indexOf(first)], nf1 = n.c[n.d.indexOf(last)];
    return { trades: done.length, skipped, stillOpen: open.length, winRate: done.length ? wins.length / done.length : 0, avgR: done.length ? done.reduce((a, t) => a + t.r, 0) / done.length : 0, profitFactor: loss ? gross / loss : null, net: equity - RULES.capital, returnPct: (equity / RULES.capital - 1), cagr: Math.pow(equity / RULES.capital, 1 / years) - 1, maxDD, worstStreak: worst, niftyCagr: Math.pow(nf1 / nf0, 1 / years) - 1, from: first, to: last, years, curve, why: done.reduce((a, t) => (a[t.why] = (a[t.why] || 0) + 1, a), {}) };
  }
  function todayScan(data) {
    const res = { day: data.lastDay, market: marketOk(data.nifty, data.lastDay), buys: [], near: [] };
    for (const [sym, st] of Object.entries(data.stocks)) {
      const i = st.c.length - 1; if (st.d[i] !== data.lastDay) continue; const ck = checkAt(st, i, data.nifty); if (!ck) continue;
      if (ck.pass) { const t = simulate(st, i), entry = st.c[i], fake = { entry, risk: entry - t.estStop }; res.buys.push({ sym, sigDay: st.d[i], vr: ck.vr, entry, stop: t.estStop, target: t.estTarget, qty: sizeFor(fake) }); }
      else { const passed = Object.values(ck.tests).filter(Boolean).length; if (passed === 3 && ck.tests.trend && ck.tests.market) res.near.push({ sym, tests: ck.tests, close: ck.close, high20: ck.high20, vr: ck.vr }); }
    }
    res.buys.sort((a, b) => b.vr - a.vr); return res;
  }
  const api = { RULES, sma, atr, checkAt, simulate, sizeFor, allSignals, backtest, todayScan, marketOk };
  if (typeof module !== 'undefined') module.exports = api; else root.Strategy = api;
})(typeof window !== 'undefined' ? window : globalThis);
