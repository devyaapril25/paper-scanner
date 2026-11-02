// Hand-built price series with known answers, then the backtest on the real data file.
const S = require('../web/strategy.js'), fs = require('fs'), path = require('path'), assert = require('assert');
let fail = 0; const t = (n, f) => { try { f(); console.log('PASS ' + n); } catch (e) { fail++; console.log('FAIL ' + n + ' -- ' + e.message); } };
function series(n, f = i => 100 + i * .1) { const o = { d: [], o: [], h: [], l: [], c: [], v: [] }; for (let i = 0; i < n; i++) { const c = f(i); o.d.push(1000 + i); o.o.push(c); o.h.push(c + 1); o.l.push(c - 1); o.c.push(c); o.v.push(1000); } return o; }
const up = () => series(300);

t('SMA is correct', () => assert.deepStrictEqual(S.sma([1, 2, 3, 4], 2), [null, 1.5, 2.5, 3.5]));
t('ATR is 2 on a steady 2-wide bar series', () => { const a = S.atr(series(40, () => 100), 14); assert.ok(Math.abs(a[39] - 2) < 1e-9); assert.strictEqual(a[5], null); });
t('breakout with volume, trend and market passes', () => { const st = up(), n = up(); st.c[299] = st.o[299] = 200; st.h[299] = 201; st.v[299] = 5000; assert.strictEqual(S.checkAt(st, 299, n).pass, true); });
t('low volume fails', () => { const st = up(), n = up(); st.c[299] = 200; st.v[299] = 1000; assert.strictEqual(S.checkAt(st, 299, n).tests.volume, false); });
t('weak market blocks signal', () => { const st = up(), n = series(300, i => 400 - i); st.c[299] = 200; st.v[299] = 5000; const c = S.checkAt(st, 299, n); assert.strictEqual(c.tests.market, false); assert.strictEqual(c.pass, false); });
t('no lookahead: future bars do not change a past signal', () => { const a = up(), n = up(); a.c[250] = 180; a.h[250] = 181; a.v[250] = 5000; const before = S.checkAt(a, 250, n); const b = JSON.parse(JSON.stringify({ ...a })); for (let i = 251; i < 300; i++) { b.c[i] = 1; b.h[i] = 2; b.l[i] = .5; b.o[i] = 1; b.v[i] = 9e6; } const after = S.checkAt(b, 250, n); assert.strictEqual(before.pass, after.pass); assert.strictEqual(before.vr, after.vr); assert.strictEqual(before.atr, after.atr); });
t('entry uses the next day open, not the signal close', () => { const st = series(60, () => 100); st.o[41] = 105; st.h[41] = 106; st.l[41] = 104; const r = S.simulate(st, 40); assert.strictEqual(r.entry, 105); assert.strictEqual(r.eI, 41); });
t('stop comes first when both are hit the same day', () => { const st = series(60, () => 100); st.h[43] = 500; st.l[43] = 1; const r = S.simulate(st, 40); assert.strictEqual(r.why, 'stop'); assert.strictEqual(r.xI, 43); assert.ok(r.r < -1); });
t('gap below the stop exits at the worse open price', () => { const st = series(60, () => 100); st.o[43] = 50; st.h[43] = 51; st.l[43] = 49; const r = S.simulate(st, 40); assert.strictEqual(r.exit, 50); assert.ok(r.r < -2); });
t('target hit gives about +2R before costs', () => { const st = series(60, () => 100); st.h[43] = 500; st.l[43] = 99.9; const r = S.simulate(st, 40); assert.strictEqual(r.why, 'target'); assert.ok(r.r > 1.5 && r.r < 2); });
t('time exit after 20 days', () => { const st = series(80, () => 100); st.h = st.h.map(() => 100.5); st.l = st.l.map(() => 99.5); const r = S.simulate(st, 40); if (r.why !== 'time') { const a = S.atr(st, 14)[40]; throw new Error('why=' + r.why + ' atr=' + a); } assert.strictEqual(r.days, 20); });
t('costs reduce a flat trade below zero', () => { const st = series(80, () => 100); st.h = st.h.map(() => 100.5); st.l = st.l.map(() => 99.5); assert.ok(S.simulate(st, 40).pnlPerShare < 0); });
t('signal on the last bar is pending', () => { const st = series(60, () => 100); assert.strictEqual(S.simulate(st, 59).status, 'pending'); });
t('manual exit happens at the next open', () => { const st = series(80, () => 100); st.h = st.h.map(() => 100.5); st.l = st.l.map(() => 99.5); st.o[46] = 101; const r = S.simulate(st, 40, st.d[45]); assert.strictEqual(r.why, 'manual'); assert.strictEqual(r.exit, 101); });
t('position size respects both 1% risk and 20% value', () => { assert.strictEqual(S.sizeFor({ entry: 100, risk: 10 }), 100); assert.strictEqual(S.sizeFor({ entry: 1000, risk: 1 }), 20); });

const file = path.join(__dirname, '../web/data/prices.json');
if (fs.existsSync(file)) {
  const data = JSON.parse(fs.readFileSync(file)), Y2 = data.lastDay - 730, fmt = r => ({ period: new Date(r.from * 864e5).toISOString().slice(0, 10) + ' to ' + new Date(r.to * 864e5).toISOString().slice(0, 10), trades: r.trades, win: (r.winRate * 100).toFixed(1) + '%', avgR: r.avgR.toFixed(2), PF: r.profitFactor && r.profitFactor.toFixed(2), net: Math.round(r.net), cagr: (r.cagr * 100).toFixed(1) + '%', niftyCagr: (r.niftyCagr * 100).toFixed(1) + '%', maxDD: (r.maxDD * 100).toFixed(1) + '%', worstLossStreak: r.worstStreak, skipped: r.skipped, stillOpen: r.stillOpen, why: r.why });
  const all = S.backtest(data), recent = S.backtest(data, Y2), old = S.backtest(data, -Infinity, Y2 - 1);
  console.log('ALL   ', JSON.stringify(fmt(all))); console.log('OLDER ', JSON.stringify(fmt(old))); console.log('LAST2Y', JSON.stringify(fmt(recent)));
  const today = S.todayScan(data); console.log('TODAY ', new Date(today.day * 864e5).toISOString().slice(0, 10), 'market ok:', today.market, 'buys:', today.buys.map(b => b.sym).join(',') || 'none', 'near:', today.near.length);
  t('backtest uses only money it has', () => assert.ok(all.trades > 0 && all.stillOpen <= 5));
}
console.log(fail ? `\n${fail} FAILED` : '\nall passed'); process.exit(fail ? 1 : 0);
