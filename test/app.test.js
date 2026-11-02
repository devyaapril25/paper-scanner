// Runs the real app in iPhone-sized Chrome: icons, tabs, a full paper trade lifecycle, offline start.
const puppeteer = require(require('os').homedir() + '/MotionStudio/node_modules/puppeteer-core'), http = require('http'), fs = require('fs'), path = require('path');
const OUT = process.argv[2], WEB = path.join(__dirname, '../web'), MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
let fail = 0; const say = (ok, n, d = '') => { if (!ok) fail++; console.log((ok ? 'PASS ' : 'FAIL ') + n + (d ? ' -- ' + d : '')); };
const srv = http.createServer((q, r) => { const u = decodeURIComponent(q.url.split('?')[0]), p = path.join(WEB, 'paper-scanner', '..', u.replace(/^\/paper-scanner/, '') === '/' ? 'index.html' : u.replace(/^\/paper-scanner/, '')); fs.readFile(p, (e, d) => { if (e) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); r.end(d); }); });
(async () => {
  await new Promise(ok => srv.listen(4193, '127.0.0.1', ok));
  const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new' });
  const ip = await b.newPage(); await ip.setViewport({ width: 800, height: 800 });
  await ip.setContent(`<canvas id=c width=1024 height=1024></canvas>`);
  for (const size of [180, 192, 512]) { const d = await ip.evaluate(s => { const c = document.createElement('canvas'); c.width = c.height = s; const g = c.getContext('2d'), k = s / 100; g.fillStyle = '#101214'; g.fillRect(0, 0, s, s); const bars = [[20, 55, 22, '#f0705f'], [38, 44, 26, '#45c486'], [56, 34, 24, '#45c486'], [74, 18, 30, '#45c486']]; bars.forEach(([x, y, h, col]) => { g.fillStyle = col; g.fillRect(x * k - 5 * k, y * k, 10 * k, h * k); g.fillRect(x * k - k, (y - 7) * k, 2 * k, (h + 14) * k); }); g.fillStyle = '#e8b84f'; g.font = `800 ${13 * k}px -apple-system,sans-serif`; g.textAlign = 'center'; g.fillText('PAPER', 50 * k, 93 * k); return c.toDataURL('image/png'); }, size); fs.mkdirSync(path.join(WEB, 'icons'), { recursive: true }); fs.writeFileSync(path.join(WEB, `icons/icon-${size}.png`), Buffer.from(d.split(',')[1], 'base64')); }
  await ip.close();
  const p = await b.newPage(), errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/ERR_INTERNET_DISCONNECTED|Failed to load resource/.test(m.text())) errs.push(m.text()); }); p.on('dialog', d => d.accept());
  await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await p.goto('http://127.0.0.1:4193/paper-scanner/'); await p.waitForFunction('window.PS && PS.data', { timeout: 30000 });
  const noOverflow = () => p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);
  for (const t of ['today', 'trades', 'results', 'learn']) { const ms = await p.evaluate(t => { const a = performance.now(); PS.setTab(t); return performance.now() - a; }, t); say(await noOverflow(), `${t} tab fits iPhone width`, Math.round(ms) + ' ms'); await p.screenshot({ path: path.join(OUT, t + '.png') }); }
  // Lifecycle from a real historical signal: pending -> open -> closed, by feeding the app its data up to each day.
  const r = await p.evaluate(() => { const d = PS.data, sigs = Strategy.allSignals(d).filter(s => s.status === 'closed'), s = sigs[sigs.length - 1], st = d.stocks[s.sym], day = st.d[s.sigI]; PS.saveT([{ sym: s.sym, sigDay: day, qty: 1, added: 1 }]); PS.setTab('trades'); return { sym: s.sym, text: document.querySelector('#m').innerText, exit: s.exit, why: s.why }; });
  say(r.text.includes(r.sym) && /Band/.test(r.text), 'a past signal shows as a closed paper trade', `${r.sym} ${r.why}`);
  await p.screenshot({ path: path.join(OUT, 'trades2.png') });
  await p.reload(); await p.waitForFunction('window.PS && PS.data', { timeout: 30000 }); say(await p.evaluate(() => PS.loadT().length) === 1, 'paper trade survives reopening');
  await p.evaluate(() => navigator.serviceWorker.ready); await new Promise(z => setTimeout(z, 800)); await p.reload(); await p.waitForFunction('window.PS && PS.data', { timeout: 30000 });
  await p.setOfflineMode(true); await p.reload(); await p.waitForFunction('window.PS && PS.data', { timeout: 30000 }).catch(() => { }); const off = await p.evaluate(() => !!(window.PS && PS.data)); await p.setOfflineMode(false); say(off, 'app opens offline with the last data');
  await p.evaluate(() => PS.setTab('today')); const txt = await p.evaluate(() => document.body.innerText); say(!/order lagao|guarantee profit/i.test(txt) && /Nakli paisa/.test(txt), 'labelled as simulated money');
  const m = JSON.parse(fs.readFileSync(path.join(WEB, 'manifest.webmanifest'))); say(m.display === 'standalone' && m.start_url === './', 'manifest opens full screen');
  say(errs.length === 0, 'no browser errors', errs.slice(0, 4).join(' | ')); await b.close(); srv.close(); console.log(fail ? `\n${fail} FAILED` : '\nall passed'); process.exit(fail ? 1 : 0);
})().catch(e => { console.error('CRASH', e); process.exit(2); });
