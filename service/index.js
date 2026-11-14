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

  // ---- Autostart ohne Root (Developer Mode) ----
  // Der Dienst legt eine dauerhafte Aktivität (persist, continuous) an. Trigger und Callback sind dieser Dienst selbst,
  // denn die App darf weder bootManager noch applicationManager eintragen ("doesn't have rights to call callback/trigger").
  //  - Trigger "wakeWatch": meldet fired=true nach dem Hochfahren (kurze Systemlaufzeit) und nach dem Aufwachen
  //    aus dem Standby (Quick Start+ friert alle Prozesse ein: die Uhr springt dann zwischen zwei Takten weit nach vorn).
  //  - Callback "autostart": startet die App und meldet die Aktivität als erledigt (restart), damit sie wieder wartet.
  var APP_ID = 'com.iptvplayer.app';
  var ACTIVITY = 'com.iptvplayer.app.autostart';
  var AM = ['luna://com.webos.service.activitymanager/', 'luna://com.palm.activitymanager/'];
  var watchers = {}, bootChecked = false, lastTick = Date.now();
  var LOGS = [path.join(__dirname, 'autostart.log'), '/tmp/iptvplayer-autostart.log'], logLines = null;

  function hhmm(d) { function p(n) { return (n < 10 ? '0' : '') + n; } return p(d.getDate()) + '.' + p(d.getMonth() + 1) + '. ' + p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds()); }
  function readLog() {
    if (logLines) return logLines;
    logLines = [];
    for (var i = 0; i < LOGS.length; i++) { try { logLines = fs.readFileSync(LOGS[i], 'utf8').split('\n').filter(Boolean); break; } catch (e) {} }
    return logLines;
  }
  function log(s) {
    var l = readLog();
    l.push(hhmm(new Date()) + '  ' + s);
    while (l.length > 25) l.shift();
    for (var i = 0; i < LOGS.length; i++) { try { fs.writeFileSync(LOGS[i], l.join('\n') + '\n'); break; } catch (e) {} }
  }
  function lcall(uri, params, cb) {
    var done = false, fin = function (r) { if (!done) { done = true; cb(r || {}); } };
    try { service.call(uri, params, function (m) { fin(m && m.payload); }); } catch (e) { fin({ returnValue: false, errorText: String(e.message || e) }); }
    setTimeout(function () { fin({ returnValue: false, errorText: 'timeout' }); }, 10000);
  }
  function amCall(method, params, cb, i) {
    i = i || 0;
    lcall(AM[i] + method, params, function (r) {
      if (r.returnValue) return cb(null, r);
      if (i + 1 < AM.length && /unknown|not found|no such/i.test(String(r.errorText || ''))) return amCall(method, params, cb, i + 1);
      cb(String(r.errorText || r.errorCode || 'error'), r);
    });
  }
  function launchApp(tries, cb) {
    lcall('luna://com.webos.applicationManager/launch', { id: APP_ID }, function (r) {
      if (!r.returnValue && tries > 1 && !/denied|rights/i.test(String(r.errorText || ''))) {
        return setTimeout(function () { launchApp(tries - 1, cb); }, 5000);
      }
      cb(r);
    });
  }
  function fire(why) {
    var keys = Object.keys(watchers);
    log('Auslöser: ' + why + (keys.length ? '' : ' (keine wartende Aktivität)'));
    keys.forEach(function (k) { try { watchers[k].respond({ returnValue: true, fired: true, why: why }); } catch (e) {} });
  }
  // Takt: springt die Uhr weit nach vorn, war der Fernseher im Standby
  setInterval(function () {
    var now = Date.now(), gap = now - lastTick;
    lastTick = now;
    if (gap > 45000) fire('Aufwachen nach ' + Math.round(gap / 1000) + ' s Standby');
  }, 5000);

  service.register('wakeWatch', function (msg) {
    if (!msg.isSubscription) return msg.respond({ returnValue: true, fired: false });
    watchers[msg.uniqueToken] = msg;
    msg.respond({ returnValue: true, subscribed: true, fired: false });
    if (!bootChecked) {
      bootChecked = true;
      var up = Math.round(os.uptime());
      if (up < 600) setTimeout(function () { fire('Hochfahren (Systemlaufzeit ' + up + ' s)'); }, 100);
    }
  }, function (msg) { delete watchers[msg.uniqueToken]; });

  service.register('autostart', function (msg) {
    msg.respond({ returnValue: true });
    var act = msg.payload && msg.payload.$activity;
    setTimeout(function () {
      launchApp(4, function (r) {
        log('App-Start: ' + (r.returnValue ? 'ok' : 'Fehler ' + (r.errorText || '?')));
        if (act && act.activityId) amCall('complete', { activityId: act.activityId, restart: true }, function (err) {
          if (err) log('Aktivität neu starten: Fehler ' + err);
        });
      });
    }, os.uptime() < 180 ? 8000 : 1500);
  });

  service.register('setAutostart', function (msg) {
    var on = !!(msg.payload && msg.payload.on);
    amCall('cancel', { activityName: ACTIVITY }, function () {
      if (!on) { log('Autostart ausgeschaltet'); return msg.respond({ returnValue: true, on: false }); }
      var spec = {
        activity: {
          name: ACTIVITY,
          description: 'IPTVPlayer: start after power-on (Settings > System > Autostart)',
          type: { foreground: true, persist: true, continuous: true },
          trigger: {
            method: 'luna://' + SERVICE_ID + '/wakeWatch',
            params: { subscribe: true },
            where: { prop: 'fired', op: '=', val: true }
          },
          callback: { method: 'luna://' + SERVICE_ID + '/autostart', params: {} }
        },
        replace: true,
        start: true
      };
      amCall('create', spec, function (err, r) {
        if (err) { log('Aktivität anlegen: Fehler ' + err); return msg.respond({ returnValue: false, errorText: 'create: ' + err }); }
        // prüfen, ob dieser Dienst die App überhaupt starten darf
        launchApp(1, function (l) {
          if (!l.returnValue) {
            log('Probestart: Fehler ' + (l.errorText || '?'));
            amCall('cancel', { activityName: ACTIVITY }, function () {});
            return msg.respond({ returnValue: false, errorText: 'launch: ' + (l.errorText || '?') });
          }
          log('Autostart eingeschaltet (Aktivität ' + r.activityId + ')');
          msg.respond({ returnValue: true, on: true, activityId: r.activityId });
        });
      });
    });
  });

  service.register('autostartLog', function (msg) {
    msg.respond({ returnValue: true, log: readLog().slice(-8), waiting: Object.keys(watchers).length });
  });
} else {
  start(function (err, inf) {
    if (err) { console.error('Server-Start fehlgeschlagen:', err.message); process.exit(1); }
    console.log('IPTVPlayer Dienst läuft auf Port ' + inf.port + ', Token ' + inf.token + ', IPs ' + inf.ips.join(', '));
  });
}
