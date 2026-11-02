// Paper Scanner app. Signals are worked out on the phone; paper trades stay on the phone. It cannot place real orders.
(function () {
  const S = Strategy, R = S.RULES, $ = s => document.querySelector(s), KEY = 'paper_trades_v1';
  let data = null, tab = 'today', bt = null, loadErr = null;
  const h = (t, a = {}, ...k) => { const e = document.createElement(t); for (const [n, v] of Object.entries(a)) { if (n === 'class') e.className = v; else if (n.startsWith('on')) e.addEventListener(n.slice(2), v); else if (n in e) e[n] = v; else e.setAttribute(n, v); } k.flat().forEach(c => c != null && e.append(c)); return e; };
  const inr = (v, d = 0) => (v < 0 ? '-' : '') + '₹' + Math.abs(v).toLocaleString('en-IN', { minimumFractionDigits: d, maximumFractionDigits: d });
  const pct = (v, d = 1) => (v * 100).toFixed(d) + '%';
  const date = d => new Date(d * 864e5).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  const kv = rows => h('div', { class: 'kv' }, rows.flatMap(([a, b, c]) => [h('span', {}, a), h('span', { class: c || '' }, b)]));
  const cls = v => v > 0 ? 'g' : v < 0 ? 'r' : '';

  // Browser storage can be cleared by iOS, so the Trades tab also offers a backup file.
  function loadT() { try { const v = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; } }
  function saveT(list) { try { localStorage.setItem(KEY, JSON.stringify(list)); return true; } catch { alert('Trade save nahi hua. Private mode band karke dekho.'); return false; } }
  const trackOf = p => { const st = data.stocks[p.sym]; if (!st) return { status: 'missing' }; const i = st.d.indexOf(p.sigDay); if (i < 0) return { status: 'missing' }; return S.simulate(st, i, p.manualDay); };
  function bookStats(list) {
    let realized = 0, openVal = 0; const rows = list.map(p => { const t = trackOf(p); let qty = p.qty; if (t.status !== 'missing' && t.status !== 'pending') qty = S.sizeFor(t); if (t.status === 'closed') realized += qty * t.pnlPerShare; if (t.status === 'open') openVal += qty * (t.last - t.entry); return { p, t, qty }; });
    return { rows, realized, openVal, closed: rows.filter(r => r.t.status === 'closed'), open: rows.filter(r => r.t.status === 'open' || r.t.status === 'pending') };
  }

  function viewToday() {
    const s = S.todayScan(data), list = loadT(), out = [];
    const age = (Date.now() / 864e5) - s.day; if (age > 4.5) out.push(h('div', { class: 'card warn' }, h('b', {}, 'Data purana hai'), h('div', { class: 'mut' }, `Aakhri data ${date(s.day)} ka hai. Isse aaj ka signal mat samjho.`)));
    if (!s.market) out.push(h('div', { class: 'card warn' }, h('div', { class: 'big y' }, 'NO TRADE'), h('div', {}, 'Nifty apni 200-din average ke neeche hai, isliye yeh rule abhi nayi buying nahi karta.'), h('div', { class: 'mut' }, 'Trade na lena bhi ek sahi faisla hota hai.')));
    else if (!s.buys.length) out.push(h('div', { class: 'card' }, h('div', { class: 'big' }, 'NO TRADE'), h('div', {}, 'Aaj koi share chaaron rules par pura nahi utra.')));
    s.buys.forEach(b => {
      const dup = list.some(p => p.sym === b.sym && p.sigDay === b.sigDay);
      out.push(h('div', { class: 'card' }, h('div', { class: 'big g' }, 'PAPER BUY: ' + b.sym), kv([['Entry (andaza)', inr(b.entry, 2) + ' ke paas'], ['Stop-loss', inr(b.stop, 2), 'r'], ['Target', inr(b.target, 2), 'g'], ['Nakli quantity', String(b.qty)], ['Agar stop lage to loss', inr(b.qty * (b.entry - b.stop)), 'r'], ['Volume', b.vr.toFixed(1) + 'x']]), h('div', { class: 'mut' }, 'Asli entry agle din ke open par hogi, isliye stop aur target thode badal sakte hain.'),
        h('button', { class: 'act', disabled: dup, textContent: dup ? 'Trades mein add ho gaya' : 'Nakli trade lo', onclick: () => { const l = loadT(); if (l.some(p => p.sym === b.sym && p.sigDay === b.sigDay)) return; l.push({ sym: b.sym, sigDay: b.sigDay, qty: b.qty, added: Date.now() }); if (saveT(l)) render(); } })));
    });
    if (s.near.length) out.push(h('h2', {}, 'Nazar mein rakho (ek rule baaki)'), h('div', { class: 'card' }, s.near.slice(0, 10).map(n => h('div', { style: 'padding:3px 0' }, h('b', {}, n.sym), h('span', { class: 'mut' }, ' ' + (!n.tests.breakout ? `₹${n.high20.toFixed(2)} ke upar close chahiye` : `volume ${n.vr.toFixed(1)}x hai, 1.5x chahiye`))))));
    out.push(h('p', { class: 'mut' }, `Scan: ${date(s.day)}, ${Object.keys(data.stocks).length} shares. Yeh sirf practice ke liye hai, asli order nahi lagta aur yeh investment advice nahi hai.`));
    return out;
  }
  function viewTrades() {
    const list = loadT(), b = bookStats(list), out = [];
    out.push(h('div', { class: 'card' }, h('div', { class: 'mut' }, 'Nakli account (shuru ' + inr(R.capital) + ')'), h('div', { class: 'big' }, inr(R.capital + b.realized + b.openVal)), kv([['Band trades ka P&L', inr(b.realized), cls(b.realized)], ['Khule trades ka P&L', inr(b.openVal), cls(b.openVal)], ['Band trades', String(b.closed.length)]]), h('div', { class: 'mut' }, 'Costs band trades mein jude hain.')));
    if (b.closed.length < 50) out.push(h('p', { class: 'mut' }, `Asli paise ki baat tak pahunchne ke liye kam se kam 50 band trades chahiye. Abhi ${b.closed.length} hain.`));
    if (!list.length) out.push(h('div', { class: 'card mut' }, 'Abhi koi nakli trade nahi hai. Signal aane par Aaj tab se trade lo.'));
    if (b.open.length) out.push(h('h2', {}, 'Khule'));
    b.open.forEach(({ p, t, qty }) => {
      if (t.status === 'pending') out.push(h('div', { class: 'card' }, h('h3', {}, p.sym), h('div', { class: 'mut' }, 'Agle din ke open par entry hogi. Naya data aane par yahan dikhegi.'), h('button', { class: 'act sec', textContent: 'Hatao', onclick: () => remove(p) })));
      else { const pl = qty * (t.last - t.entry); out.push(h('div', { class: 'card' }, h('h3', {}, p.sym), kv([['Entry ' + date(t.entryDay), inr(t.entry, 2)], ['Abhi', inr(t.last, 2)], ['Stop / Target', `${t.stop.toFixed(0)} / ${t.target.toFixed(0)}`], ['Quantity', String(qty)], ['P&L', inr(pl), cls(pl)], ['Din', `${t.days} / ${R.maxDays}`]]), h('button', { class: 'act sec', textContent: 'Agle open par bahar niklo', disabled: p.manualDay !== undefined, onclick: () => { const l = loadT(), x = l.find(q => q.sym === p.sym && q.sigDay === p.sigDay); x.manualDay = t.lastDay; if (saveT(l)) render(); } }))); }
    });
    if (b.closed.length) out.push(h('h2', {}, 'Band'));
    b.closed.slice().reverse().forEach(({ p, t, qty }) => { const pl = qty * t.pnlPerShare; out.push(h('div', { class: 'card' }, h('h3', {}, p.sym + ' ', h('span', { class: 'tag' }, { stop: 'Stop lag gaya', target: 'Target aaya', time: '20 din poore', manual: 'Khud nikle' }[t.why])), kv([[date(t.entryDay) + ' se ' + date(t.exitDay), ''], ['Entry / Exit', `${t.entry.toFixed(2)} / ${t.exit.toFixed(2)}`], ['P&L (costs ke baad)', inr(pl), cls(pl)]]))); });
    b.rows.filter(r => r.t.status === 'missing').forEach(({ p }) => out.push(h('div', { class: 'card warn' }, h('h3', {}, p.sym), 'Is trade ka data nahi mil raha.', h('button', { class: 'act sec', textContent: 'Hatao', onclick: () => remove(p) }))));
    const input = h('input', { type: 'file', accept: 'application/json,.json', onchange: async e => { try { const v = JSON.parse(await e.target.files[0].text()); if (!Array.isArray(v) || v.some(x => !x.sym || typeof x.sigDay !== 'number')) throw 0; if (confirm(`${v.length} trades wapas lao? Abhi wale trades badal jayenge.`) && saveT(v)) render(); } catch { alert('Yeh backup file sahi nahi hai.'); } } });
    out.push(h('h2', {}, 'Backup'), h('p', { class: 'mut' }, 'Trades sirf isi iPhone par hain. iOS kabhi storage saaf kar sakta hai, isliye hafte mein ek baar backup Files mein rakh lo.'), h('div', { class: 'row2' }, h('button', { class: 'act sec', textContent: 'Backup lo', onclick: backup }), h('button', { class: 'act sec', textContent: 'Wapas lao', onclick: () => input.click() })), input);
    return out;
  }
  function remove(p) { if (confirm(p.sym + ' ka nakli trade hatana hai?')) { saveT(loadT().filter(q => !(q.sym === p.sym && q.sigDay === p.sigDay))); render(); } }
  async function backup() { const f = new File([JSON.stringify(loadT(), null, 1)], 'paper-trades-backup.json', { type: 'application/json' }); try { if (navigator.canShare && navigator.canShare({ files: [f] })) return await navigator.share({ files: [f] }); } catch (e) { if (e.name === 'AbortError') return; } const a = h('a', { href: URL.createObjectURL(f), download: f.name }); a.click(); }
  function statCard(title, r, note) {
    const beat = r.cagr > r.niftyCagr;
    return h('div', { class: 'card' }, h('h3', {}, title), h('div', { class: 'mut' }, `${date(r.from)} se ${date(r.to)}${note ? ' · ' + note : ''}`), kv([['Trades', String(r.trades)], ['Jeet', pct(r.winRate)], ['Har trade ka average', r.avgR.toFixed(2) + 'R', cls(r.avgR)], ['Net (₹1 lakh par)', inr(r.net), cls(r.net)], ['Saalana return', pct(r.cagr), cls(r.cagr)], ['Nifty ka saalana (price)', pct(r.niftyCagr)], ['Sabse badi girawat', '-' + pct(r.maxDD), 'r'], ['Lagatar loss, sabse zyada', String(r.worstStreak)]]), h('div', { class: beat ? 'g' : 'r' }, beat ? 'Is daur mein rule Nifty se aage raha.' : 'Is daur mein rule Nifty se peeche raha.'));
  }
  function curve(c) {
    if (c.length < 2) return null; const W = 600, H = 170, ys = c.map(p => p[1]).concat(R.capital), lo = Math.min(...ys), hi = Math.max(...ys), x = d => (d - c[0][0]) / Math.max(1, c[c.length - 1][0] - c[0][0]) * W, y = v => H - 8 - (v - lo) / Math.max(1, hi - lo) * (H - 16), ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg'); svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', `Equity ${inr(c[0][1])} se ${inr(c[c.length - 1][1])} tak`);
    const base = document.createElementNS(ns, 'line'); for (const [k, v] of [['x1', 0], ['x2', W], ['y1', y(R.capital)], ['y2', y(R.capital)], ['stroke', '#5a616a'], ['stroke-dasharray', '4 4']]) base.setAttribute(k, v); svg.append(base);
    const pl = document.createElementNS(ns, 'polyline'); pl.setAttribute('points', c.map(p => `${x(p[0]).toFixed(1)},${y(p[1]).toFixed(1)}`).join(' ')); pl.setAttribute('fill', 'none'); pl.setAttribute('stroke', '#6ab0ff'); pl.setAttribute('stroke-width', '2'); svg.append(pl); return svg;
  }
  function viewResults() {
    if (!bt) { const split = data.lastDay - 730; bt = { all: S.backtest(data), old: S.backtest(data, -Infinity, split - 1), recent: S.backtest(data, split) }; }
    const weak = bt.all.cagr <= bt.all.niftyCagr || bt.recent.net < 0;
    return [h('div', { class: 'card ' + (weak ? 'bad' : 'warn') }, h('b', {}, weak ? 'Is rule se asli paisa mat lagao' : 'Past result aage ki guarantee nahi'), h('div', {}, weak ? 'Backtest mein yeh rule Nifty se kaafi peeche raha, ya haal ke saalon mein loss mein gaya. Yeh app seekhne ke liye hai, kamai ke liye nahi.' : 'Pehle paper trading ka result dekho.')),
      statCard('Poora backtest', bt.all), h('div', { class: 'card' }, h('h3', {}, 'Nakli account ka graph'), curve(bt.all.curve), h('div', { class: 'mut' }, 'Dotted line = shuruaat ka ₹1 lakh')), statCard('Purana hissa', bt.old), statCard('Pichhle 2 saal', bt.recent),
      h('div', { class: 'card' }, h('h3', {}, 'Yeh numbers asli se behtar ho sakte hain'), h('ul', {}, h('li', {}, 'Sirf aaj ke Nifty 50 shares test hue hain. Jo pehle Nifty se bahar ho gaye, woh isme nahi hain, isliye result zyada achha dikh sakta hai.'), h('li', {}, 'Nifty ka number sirf price hai, dividend nahi. Dividend ke saath Nifty aur aage hota.'), h('li', {}, 'Har round trip par 0.4% cost joda hai, par short-term tax nahi joda.'), h('li', {}, 'Free data mein galti ho sakti hai.'), h('li', {}, `Signal chhoot jate hain: ek saath ${R.maxOpen} trades ki limit se ${bt.all.skipped} signal skip hue.`)))];
  }
  function viewLearn() {
    return [h('div', { class: 'card' }, h('h3', {}, 'Rule kya hai'), h('p', { class: 'mut' }, 'Paper BUY tab aata hai jab chaaron baatein sach hon:'), h('ul', {}, h('li', {}, 'Share ka close pichhle 20 din ke sabse upar wale price se upar ho'), h('li', {}, 'Close > 50-din average > 200-din average'), h('li', {}, 'Volume, 20-din average ka kam se kam 1.5 guna ho'), h('li', {}, 'Nifty apni 200-din average ke upar ho'))),
      h('div', { class: 'card' }, h('h3', {}, 'Trade kaise chalta hai'), h('ul', {}, h('li', {}, 'Entry: agle din ke open par'), h('li', {}, 'Stop-loss: entry se 2 ATR neeche'), h('li', {}, 'Target: entry se 4 ATR upar'), h('li', {}, '20 trading din ke baad bahar, chahe kuch bhi ho'), h('li', {}, 'Har trade mein account ka zyada se zyada 1% risk'))),
      h('div', { class: 'card' }, h('h3', {}, 'Shabd'), h('ul', {}, h('li', {}, h('b', {}, 'ATR: '), 'share roz average kitna hilta hai'), h('li', {}, h('b', {}, 'Stop-loss: '), 'pehle se tay price jahan loss maan kar nikal jate ho'), h('li', {}, h('b', {}, '1R: '), 'ek trade mein jitna risk liya. +2R ka matlab risk ka do guna kamaya'), h('li', {}, h('b', {}, 'Drawdown: '), 'peak se kitna gira'))),
      h('div', { class: 'card' }, h('h3', {}, 'Asli paise se pehle'), h('ul', {}, h('li', {}, 'Kam se kam 50 band paper trades'), h('li', {}, 'Costs ke baad result plus mein, aur Nifty se behtar'), h('li', {}, 'Har stop-loss follow kiya ho'), h('li', {}, 'Emergency fund aur SIP pehle se chal rahe hon'))),
      h('p', { class: 'mut' }, 'Yeh ek learning tool hai, SEBI-registered advice nahi. Iske signals kisi aur ko mat bhejna. Market mein paisa doob sakta hai.')];
  }
  function render() {
    document.querySelectorAll('nav button').forEach(b => b.classList.toggle('on', b.dataset.t === tab)); const m = $('#m'); m.innerHTML = '';
    if (!data) { m.append(h('div', { class: 'card ' + (loadErr ? 'warn' : '') }, loadErr ? [h('b', {}, 'Data load nahi hua'), h('div', { class: 'mut' }, 'Internet check karke dobara kholo.'), h('button', { class: 'act', textContent: 'Dobara try karo', onclick: load })] : 'Data load ho raha hai…')); return; }
    try { m.append(...{ today: viewToday, trades: viewTrades, results: viewResults, learn: viewLearn }[tab]().filter(Boolean)); } catch (e) { console.error(e); m.append(h('div', { class: 'card warn' }, 'Kuch galat ho gaya: ' + e.message)); }
    scrollTo(0, 0);
  }
  async function load() {
    loadErr = null; render();
    try { const r = await fetch('data/prices.json', { cache: 'no-cache' }); if (!r.ok) throw new Error('HTTP ' + r.status); const d = await r.json(); if (!d.nifty || !d.stocks) throw new Error('data file sahi nahi'); data = d; bt = null; $('#upd').textContent = 'Data: ' + date(d.lastDay) + ' tak'; }
    catch (e) { loadErr = e; $('#upd').textContent = 'Data load nahi hua'; }
    render();
  }
  document.querySelectorAll('nav button').forEach(b => b.onclick = () => { tab = b.dataset.t; render(); });
  window.PS = { get data() { return data; }, render, loadT, saveT, setTab: t => { tab = t; render(); } };
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => { });
  load();
})();
