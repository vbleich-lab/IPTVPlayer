/*
 * IPTVPlayer – Hintergrunddienst für die Einrichtung per Smartphone.
 *
 * Startet einen kleinen Web-Server im Heimnetz. Das Handy öffnet über den QR-Code
 * http://<TV-IP>:<Port>/?t=<Token> und kann dort Einstellungen ändern sowie eine
 * Sicherung herunterladen oder hochladen.
 *
 * Die TV-App spricht den Server über 127.0.0.1 an (nur von dort erlaubt):
 *   POST /api/state  – aktuellen Stand + Formular-Beschreibung hinterlegen
 *   GET  /api/wait   – Long-Poll auf Änderungen vom Handy
 * Das Handy (nur mit Token):
 *   GET  /api/state, POST /api/apply, GET /api/backup, POST /api/restore
 *
 * Bewusst ES5 / alte Node-API: ältere webOS-Fernseher haben Node 0.12.
 */
var http = require('http');
var os = require('os');
var fs = require('fs');
var path = require('path');
var crypto = require('crypto');

var SERVICE_ID = 'com.iptvplayer.app.service';
var PORTS = [8765, 8766, 8767, 8768];
var MAX_BODY = 512 * 1024;

var token = crypto.randomBytes(6).toString('hex');
var state = null;          // vom TV gesendet: { ui, schema, settings, favs, title }
var events = [];           // Änderungen vom Handy: { id, type, data }
var nextId = 1;
var waiters = [];          // offene Long-Polls der TV-App
var server = null, port = 0, starting = false, startCbs = [];

function ips() {
  var out = [], ifs = os.networkInterfaces();
  Object.keys(ifs).forEach(function (n) {
    (ifs[n] || []).forEach(function (a) {
      if ((a.family === 'IPv4' || a.family === 4) && !a.internal) out.push(a.address);
    });
  });
  // WLAN/LAN-Adressen zuerst (192.168 / 10. / 172.16-31)
  out.sort(function (a, b) { return score(b) - score(a); });
  return out;
  function score(ip) { return /^192\.168\./.test(ip) ? 3 : /^10\./.test(ip) ? 2 : /^172\.(1[6-9]|2\d|3[01])\./.test(ip) ? 1 : 0; }
}

function isLocal(req) {
  var a = (req.socket && req.socket.remoteAddress) || '';
  return a === '127.0.0.1' || a === '::1' || a === '::ffff:127.0.0.1';
}

function send(res, code, body, type, extra) {
  var h = {
    'Content-Type': type || 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
  };
  if (extra) Object.keys(extra).forEach(function (k) { h[k] = extra[k]; });
  res.writeHead(code, h);
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
}

function readBody(req, cb) {
  var data = '', size = 0, done = false;
  req.setEncoding('utf8');
  req.on('data', function (c) {
    size += c.length;
    if (size > MAX_BODY) { done = true; cb(new Error('too large')); req.destroy(); return; }
    data += c;
  });
  req.on('end', function () {
    if (done) return;
    try { cb(null, data ? JSON.parse(data) : {}); } catch (e) { cb(e); }
  });
}

function pushEvent(type, data) {
  events.push({ id: nextId++, type: type, data: data });
  if (events.length > 20) events.shift();
  var w = waiters; waiters = [];
  w.forEach(function (x) { clearTimeout(x.timer); flushWait(x.res, x.since); });
}

function flushWait(res, since) {
  send(res, 200, { last: nextId - 1, events: events.filter(function (e) { return e.id > since; }) });
}

function serveFile(res, name, type) {
  fs.readFile(path.join(__dirname, 'www', name), 'utf8', function (err, txt) {
    if (err) return send(res, 404, 'not found', 'text/plain');
    send(res, 200, txt, type);
  });
}

function info() {
  // last: neueste Ereignis-ID – eine neu gestartete App überspringt damit alte Ereignisse
  return { port: port, token: token, ips: ips(), last: nextId - 1 };
}

function handle(req, res) {
  var u = req.url || '/', q = {}, p = u.split('?')[0];
  (u.split('?')[1] || '').split('&').forEach(function (kv) {
    if (!kv) return; var i = kv.indexOf('=');
    q[decodeURIComponent(i < 0 ? kv : kv.substring(0, i))] = i < 0 ? '' : decodeURIComponent(kv.substring(i + 1).replace(/\+/g, ' '));
  });
  if (req.method === 'OPTIONS') return send(res, 204, '');

  // ---- Seite fürs Handy ----
  if (p === '/' || p === '/index.html') return serveFile(res, 'phone.html', 'text/html; charset=utf-8');

  // ---- nur für die TV-App (127.0.0.1) ----
  if (p === '/api/hello') return isLocal(req) ? send(res, 200, info()) : send(res, 403, { error: 'forbidden' });
  if (p === '/api/state' && req.method === 'POST') {
    if (!isLocal(req)) return send(res, 403, { error: 'forbidden' });
    return readBody(req, function (err, body) {
      if (err) return send(res, 400, { error: 'bad json' });
      state = body;
      send(res, 200, info());
    });
  }
  if (p === '/api/wait') {
    if (!isLocal(req)) return send(res, 403, { error: 'forbidden' });
    var since = parseInt(q.since, 10) || 0;
    if (events.some(function (e) { return e.id > since; })) return flushWait(res, since);
    var w = { res: res, since: since };
    w.timer = setTimeout(function () {
      waiters = waiters.filter(function (x) { return x !== w; });
      flushWait(res, since);
    }, 25000);
    waiters.push(w);
    req.on('close', function () { clearTimeout(w.timer); waiters = waiters.filter(function (x) { return x !== w; }); });
    return;
  }

  // ---- Handy: Token nötig ----
  if (p.indexOf('/api/') === 0) {
    if (!q.t || q.t !== token) return send(res, 403, { error: 'token' });
    if (!state) return send(res, 503, { error: 'tv not ready' });
    if (p === '/api/state') {
      return send(res, 200, { ui: state.ui, schema: state.schema, settings: state.settings, favCount: Object.keys(state.favs || {}).length, title: state.title });
    }
    if (p === '/api/backup') {
      var d = new Date(), stamp = d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + '-' + pad(d.getHours()) + pad(d.getMinutes());
      var src = state.backup || {};
      var backup = { app: 'iptvplayer', v: 1, date: d.toISOString(), settings: src.settings || {}, favs: src.favs || {} };
      return send(res, 200, JSON.stringify(backup, null, 2), 'application/json; charset=utf-8',
        { 'Content-Disposition': 'attachment; filename="iptvplayer-backup-' + stamp + '.json"' });
    }
    if ((p === '/api/apply' || p === '/api/restore') && req.method === 'POST') {
      return readBody(req, function (err, body) {
        if (err || !body || typeof body !== 'object') return send(res, 400, { error: 'bad json' });
        if (p === '/api/restore' && ((body.app !== 'iptvplayer' && body.app !== 'edemtv') || typeof body.settings !== 'object')) return send(res, 400, { error: 'not an IPTVPlayer backup' });
        pushEvent(p === '/api/apply' ? 'apply' : 'restore', body);
        send(res, 200, { ok: true });
      });
    }
  }
  send(res, 404, { error: 'not found' });
}

function pad(n) { return (n < 10 ? '0' : '') + n; }

function start(cb) {
  if (server && port) return cb(null, info());
  startCbs.push(cb);
  if (starting) return;
  starting = true;
  var i = 0;
  (function tryPort() {
    var s = http.createServer(handle);
    s.once('error', function (e) {
      i++;
      if (i < PORTS.length) return tryPort();
      starting = false; flush(e);
    });
    s.listen(PORTS[i], '0.0.0.0', function () {
      server = s; port = PORTS[i]; starting = false; flush(null);
    });
  })();
  function flush(err) { var c = startCbs; startCbs = []; c.forEach(function (f) { f(err, err ? null : info()); }); }
}

// ---- webOS Luna-Dienst; außerhalb des Fernsehers (Test am PC) einfach direkt starten ----
var Service = null;
try { Service = require('webos-service'); } catch (e) { Service = null; }

if (Service) {
  var service = new Service(SERVICE_ID);
  var keepers = {};
  // Solange die App dieses Abo hält, bleibt der Dienst (und damit der Web-Server) aktiv.
  service.register('start', function (msg) {
    start(function (err, inf) {
      if (err) return msg.respond({ returnValue: false, errorText: String(err.message || err) });
      var r = { returnValue: true, port: inf.port, token: inf.token, ips: inf.ips };
      if (msg.isSubscription) { keepers[msg.uniqueToken] = msg; r.subscribed = true; }
      msg.respond(r);
    });
  }, function (msg) {
    delete keepers[msg.uniqueToken];
  });
} else {
  start(function (err, inf) {
    if (err) { console.error('Server-Start fehlgeschlagen:', err.message); process.exit(1); }
    console.log('IPTVPlayer Dienst läuft auf Port ' + inf.port + ', Token ' + inf.token + ', IPs ' + inf.ips.join(', '));
  });
}
