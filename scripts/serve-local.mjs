// Serves the static export in out/ for local and LAN testing.
// Usage: node scripts/serve-local.mjs [--port 4173] [--host 0.0.0.0] [--https]
import { execFileSync } from 'node:child_process';
import { createReadStream, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createServer as createHttpServer } from 'node:http';
import { createServer as createHttpsServer } from 'node:https';
import { networkInterfaces } from 'node:os';
import { extname, join, normalize, resolve, sep } from 'node:path';

const args = process.argv.slice(2);
const option = (name, fallback) => { const index = args.indexOf(name); return index >= 0 && args[index + 1] ? args[index + 1] : fallback; };
const port = Number(option('--port', '4173'));
const host = option('--host', '0.0.0.0');
const secure = args.includes('--https');
const root = resolve(option('--dir', 'out'));

if (!existsSync(join(root, 'index.html'))) {
  console.error(`找不到 ${join(root, 'index.html')}，請先執行 npm run build。`);
  process.exit(1);
}

const types = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json',
  '.wasm': 'application/wasm', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8',
  '.woff2': 'font/woff2', '.map': 'application/json',
};

const lanAddresses = () => Object.values(networkInterfaces()).flat()
  .filter(item => item && item.family === 'IPv4' && !item.internal).map(item => item.address);

function findOpenssl() {
  for (const candidate of ['openssl', 'C:\\Program Files\\Git\\usr\\bin\\openssl.exe', 'C:\\Program Files\\Git\\mingw64\\bin\\openssl.exe']) {
    try { execFileSync(candidate, ['version'], { stdio: 'ignore' }); return candidate; } catch { /* try next */ }
  }
  return null;
}

// Self-signed certificate for phones on the LAN: browsers only expose the camera on HTTPS or localhost.
function certificate() {
  const dir = resolve('.local-cert'), key = join(dir, 'key.pem'), cert = join(dir, 'cert.pem');
  const names = ['DNS:localhost', 'IP:127.0.0.1', ...lanAddresses().map(address => 'IP:' + address)].join(',');
  const stamp = join(dir, 'names.txt');
  if (!existsSync(cert) || !existsSync(stamp) || readFileSync(stamp, 'utf8') !== names) {
    const openssl = findOpenssl();
    if (!openssl) { console.error('需要 openssl 才能建立 HTTPS 憑證（Git for Windows 內附）。'); process.exit(1); }
    mkdirSync(dir, { recursive: true });
    execFileSync(openssl, ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '30', '-keyout', key, '-out', cert,
      '-subj', '/CN=TagScanner local test', '-addext', 'subjectAltName=' + names], { stdio: 'ignore', env: { ...process.env, MSYS_NO_PATHCONV: '1' } });
    writeFileSync(stamp, names);
  }
  return { key: readFileSync(key), cert: readFileSync(cert) };
}

function handler(request, response) {
  let pathname;
  try { pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname); } catch { response.writeHead(400).end(); return; }
  let file = normalize(join(root, pathname));
  if (file !== root && !file.startsWith(root + sep)) { response.writeHead(403).end(); return; }
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
  else if (!existsSync(file) && existsSync(file + '.html')) file += '.html';
  if (!existsSync(file)) {
    const missing = join(root, '404.html');
    response.writeHead(404, { 'Content-Type': types['.html'] });
    if (existsSync(missing)) createReadStream(missing).pipe(response); else response.end('Not found');
    return;
  }
  response.writeHead(200, { 'Content-Type': types[extname(file).toLowerCase()] ?? 'application/octet-stream', 'Cache-Control': 'no-cache' });
  if (request.method === 'HEAD') response.end(); else createReadStream(file).pipe(response);
}

const server = secure ? createHttpsServer(certificate(), handler) : createHttpServer(handler);
server.on('error', error => { console.error(error.code === 'EADDRINUSE' ? `連接埠 ${port} 已被使用，可加上 --port 指定其他連接埠。` : error.message); process.exit(1); });
server.listen(port, host, () => {
  const scheme = secure ? 'https' : 'http';
  console.log(`TagScanner 本機測試伺服器（${root}）`);
  console.log(`  本機：  ${scheme}://127.0.0.1:${port}/`);
  if (host === '0.0.0.0') for (const address of lanAddresses()) console.log(`  區網：  ${scheme}://${address}:${port}/`);
  if (!secure && host === '0.0.0.0') console.log('  提醒：區網裝置用 http 開啟時瀏覽器不允許相機（圖片辨識仍可用）；需要相機請加 --https。');
  if (secure) console.log('  提醒：自簽憑證，首次開啟需在瀏覽器手動接受安全警告。');
  console.log('  按 Ctrl+C 停止。');
});
