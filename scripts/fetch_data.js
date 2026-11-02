// Downloads daily prices for the Nifty 50 and writes web/data/prices.json. Keeps the old file if the download looks bad.
const fs = require('fs'), path = require('path');
const SYMBOLS = ['ADANIENT','ADANIPORTS','APOLLOHOSP','ASIANPAINT','AXISBANK','BAJAJ-AUTO','BAJFINANCE','BAJAJFINSV','BEL','BHARTIARTL','CIPLA','COALINDIA','DRREDDY','EICHERMOT','ETERNAL','GRASIM','HCLTECH','HDFCBANK','HDFCLIFE','HINDALCO','HINDUNILVR','ICICIBANK','INDIGO','INFY','ITC','JIOFIN','JSWSTEEL','KOTAKBANK','LT','M&M','MARUTI','MAXHEALTH','NESTLEIND','NTPC','ONGC','POWERGRID','RELIANCE','SBILIFE','SBIN','SHRIRAMFIN','SUNPHARMA','TATACONSUM','TMPV','TATASTEEL','TCS','TECHM','TITAN','TRENT','ULTRACEMCO','WIPRO'];
const OUT = path.join(__dirname, '../web/data/prices.json'), r2 = x => Math.round(x * 100) / 100;
// Before 15:45 IST today's bar is unfinished and must not produce a signal.
const nowIst = Date.now() / 1000 + 19800, cutoffDay = Math.floor(nowIst / 86400) - (nowIst % 86400 < 15.75 * 3600 ? 1 : 0);
async function get(sym) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=7y&interval=1d`;
  for (let a = 0; a < 3; a++) {
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (res.ok) {
      const r = (await res.json()).chart.result[0], q = r.indicators.quote[0], o = { d: [], o: [], h: [], l: [], c: [], v: [] };
      r.timestamp.forEach((t, i) => { if ([q.open[i], q.high[i], q.low[i], q.close[i]].some(x => x == null || x <= 0) || Math.floor((t + 19800) / 86400) > cutoffDay) return; o.d.push(Math.floor((t + 19800) / 86400)); o.o.push(r2(q.open[i])); o.h.push(r2(q.high[i])); o.l.push(r2(q.low[i])); o.c.push(r2(q.close[i])); o.v.push(q.volume[i] || 0); });
      return o;
    }
    await new Promise(z => setTimeout(z, 2500 * (a + 1)));
  }
  throw new Error('download failed');
}
(async () => {
  const nifty = await get('^NSEI'), stocks = {}, failed = [];
  for (const s of SYMBOLS) { try { const d = await get(s + '.NS'); if (d.d.length > 260) stocks[s] = d; else failed.push(s + ' (kam history)'); } catch { failed.push(s); } await new Promise(z => setTimeout(z, 250)); }
  const count = Object.keys(stocks).length; console.log(`${count}/${SYMBOLS.length} stocks; failed: ${failed.join(', ') || 'none'}`);
  if (count < 40 || nifty.d.length < 260) { console.error('Too little data, keeping the old file'); process.exit(1); }
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  const last = nifty.d[nifty.d.length - 1]; fs.writeFileSync(OUT, JSON.stringify({ updated: new Date().toISOString(), lastDay: last, failed, nifty, stocks }));
  console.log('last bar', new Date(last * 864e5).toISOString().slice(0, 10), (fs.statSync(OUT).size / 1e6).toFixed(1) + ' MB');
})().catch(e => { console.error(e); process.exit(1); });
