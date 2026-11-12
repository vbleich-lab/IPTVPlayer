/* XMLTV-EPG-Loader: liest chunkweise (auch .gz), behält nur benötigte Kanäle/Zeiträume,
   speichert das Ergebnis in IndexedDB, damit der TV nicht bei jedem Start 50 MB parsen muss. */
var EPG = (function () {
  'use strict';

  var data = {};        // epgKey -> [{s, e, t, d?}]
  var nameToId = {};    // normalisierter Anzeigename -> channel id
  var loaded = false;
  var loading = false;

  function norm(s) { return (s || '').toLowerCase().replace(/[\s\-_.]+/g, '').replace(/hd$|fhd$|uhd$|4k$/, ''); }

  function parseTime(s) {
    // "20261112140000 +0300"
    var m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})\s*([+-])?(\d{2})?(\d{2})?/.exec(s || '');
    if (!m) return 0;
    var t = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]) / 1000;
    if (m[7]) t -= (m[7] === '-' ? -1 : 1) * ((+m[8]) * 3600 + (+m[9] || 0) * 60);
    return t;
  }

  function unescape(s) {
    return s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, function (_, n) { return String.fromCharCode(+n); })
      .replace(/&amp;/g, '&').trim();
  }

  var BLOCK_RE = /<channel\s+id="([^"]*)"[^>]*>([\s\S]*?)<\/channel>|<programme\s([^>]*)>([\s\S]*?)<\/programme>/g;
  var NAME_RE = /<display-name[^>]*>([\s\S]*?)<\/display-name>/g;

  /**
   * wanted: null (alles behalten, Standard 1 Tag zurück) oder {id: archivTage}
   */
  function makeParser(wanted) {
    var buf = '', now = Date.now() / 1000;
    var maxT = now + 2 * 86400, descFrom = now - 6 * 3600, descTo = now + 24 * 3600;
    function processText(text) {
      var m;
      BLOCK_RE.lastIndex = 0;
      while ((m = BLOCK_RE.exec(text))) {
        if (m[3] === undefined) {
          var nm;
          NAME_RE.lastIndex = 0;
          while ((nm = NAME_RE.exec(m[2]))) {
            var k = norm(unescape(nm[1]));
            if (k && !nameToId[k]) nameToId[k] = m[1];
          }
        } else {
          var attrs = m[3], body = m[4];
          var chm = /channel="([^"]*)"/.exec(attrs);
          if (!chm) continue;
          var id = chm[1], days;
          if (wanted) { days = wanted[id]; if (days === undefined) continue; } else days = 1;
          var e = parseTime((/stop="([^"]*)"/.exec(attrs) || [])[1]);
          if (e < now - days * 86400 - 3 * 3600) continue;
          var s = parseTime((/start="([^"]*)"/.exec(attrs) || [])[1]);
          if (s > maxT) continue;
          var t = /<title[^>]*>([\s\S]*?)<\/title>/.exec(body);
          var p = { s: s, e: e, t: t ? unescape(t[1]) : '' };
          // Beschreibungen nur rund um "jetzt" behalten (spart viel Speicher)
          if (e > descFrom && s < descTo) {
            var d = /<desc[^>]*>([\s\S]*?)<\/desc>/.exec(body);
            if (d) p.d = unescape(d[1]).substring(0, 400);
          }
          (data[id] || (data[id] = [])).push(p);
        }
      }
    }
    return {
      bytes: 0,
      push: function (chunk) {
        this.bytes += chunk.length;
        buf += chunk;
        var cut = Math.max(buf.lastIndexOf('</programme>') + 12, buf.lastIndexOf('</channel>') + 10);
        if (cut > 12) { processText(buf.substring(0, cut)); buf = buf.substring(cut); }
      },
      end: function () { processText(buf); buf = ''; }
    };
  }

  function finish() {
    for (var id in data) {
      var arr = data[id];
      arr.sort(function (a, b) { return a.s - b.s; });
      var out = [];
      for (var i = 0; i < arr.length; i++) if (!out.length || out[out.length - 1].s !== arr[i].s) out.push(arr[i]);
      data[id] = out;
    }
    loaded = true;
  }

  // ---------- Laden ----------
  function loadStream(url, parser, gz, progress, cb) {
    fetch(url).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      var stream = r.body;
      if (gz) stream = stream.pipeThrough(new DecompressionStream('gzip'));
      var reader = stream.pipeThrough(new TextDecoderStream()).getReader();
      function pump() {
        return reader.read().then(function (res) {
          if (res.done) { parser.end(); return; }
          parser.push(res.value);
          progress(parser.bytes);
          return pump();
        });
      }
      return pump();
    }).then(function () { cb(null); }, function (err) { cb(err || new Error('EPG-Fehler')); });
  }

  /** Ältere TVs: Datei als ArrayBuffer laden, mit pako in Häppchen entpacken */
  function loadXhrBinary(url, parser, progress, cb) {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', url, true);
    xhr.responseType = 'arraybuffer';
    xhr.timeout = 300000;
    xhr.onprogress = function (ev) { progress(ev.loaded, true); };
    xhr.onerror = function () { cb(new Error('Netzwerkfehler')); };
    xhr.ontimeout = function () { cb(new Error('Zeitüberschreitung')); };
    xhr.onload = function () {
      if (xhr.status && (xhr.status < 200 || xhr.status >= 300)) return cb(new Error('HTTP ' + xhr.status));
      var bytes = new Uint8Array(xhr.response), isGz = bytes[0] === 0x1f && bytes[1] === 0x8b;
      var dec = new TextDecoder('utf-8'), pos = 0, CH = 512 * 1024;
      var inflator = null;
      if (isGz) {
        if (!window.pako) return cb(new Error('gzip wird nicht unterstützt'));
        inflator = new window.pako.Inflate();
        inflator.onData = function (chunk) { parser.push(dec.decode(chunk, { stream: true })); };
      }
      (function step() {
        try {
          var end = Math.min(bytes.length, pos + CH), last = end >= bytes.length;
          if (inflator) { inflator.push(bytes.subarray(pos, end), last); if (inflator.err) throw new Error(inflator.msg); }
          else parser.push(dec.decode(bytes.subarray(pos, end), { stream: !last }));
          pos = end;
          progress(parser.bytes);
          if (!last) { setTimeout(step, 0); return; }
          bytes = null; parser.end(); cb(null);
        } catch (e) { cb(e); }
      })();
    };
    xhr.send();
  }

  function buildWanted(channels) {
    var wanted = {}, n = 0;
    for (var i = 0; i < channels.length; i++) {
      var c = channels[i];
      if (!c.tvgId) return null; // ohne tvg-id: Zuordnung über Namen, also alles behalten
      var d = Math.max(1, c.catchupDays || 0);
      if (!(wanted[c.tvgId] >= d)) { wanted[c.tvgId] = d; n++; }
    }
    return n ? wanted : null;
  }

  /** opts: {progress(text)} */
  function load(url, channels, opts, cb) {
    if (loading) return cb(new Error('läuft bereits'));
    loading = true;
    var old = { data: data, names: nameToId, loaded: loaded };
    data = {}; nameToId = {};
    var parser = makeParser(buildWanted(channels));
    var isGz = /\.gz(\?|$)/i.test(url);
    var lastReport = 0;
    var progress = function (bytes, download) {
      if (bytes - lastReport < 4 * 1024 * 1024 && bytes > 0) return;
      lastReport = bytes;
      if (opts.progress) opts.progress(Math.round(bytes / 1048576), !!download);
    };
    var done = function (err) {
      loading = false;
      if (err) { data = old.data; nameToId = old.names; loaded = old.loaded; cb(err); return; }
      finish();
      saveCache(opts.cacheKey || url);
      cb(null);
    };
    var canStream = typeof fetch === 'function' && typeof TextDecoderStream === 'function' && window.ReadableStream;
    if (canStream && (!isGz || typeof DecompressionStream === 'function')) {
      loadStream(url, parser, isGz, progress, function (err) {
        // Server hat evtl. schon entpackt (Content-Encoding) → ohne Entpacken erneut
        if (err && isGz) { data = {}; parser = makeParser(buildWanted(channels)); lastReport = 0; loadStream(url, parser, false, progress, done); }
        else done(err);
      });
    } else {
      loadXhrBinary(url, parser, progress, done);
    }
  }

  // ---------- Cache (IndexedDB) ----------
  var DB_NAME = 'edemtv', STORE = 'epg';
  function openDb(cb) {
    if (!window.indexedDB) return cb(null);
    try {
      var req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = function () { req.result.createObjectStore(STORE); };
      req.onsuccess = function () { cb(req.result); };
      req.onerror = function () { cb(null); };
    } catch (e) { cb(null); }
  }
  function saveCache(url) {
    openDb(function (db) {
      if (!db) return;
      try {
        var tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put({ url: url, time: Date.now(), data: data, names: nameToId }, 'last');
      } catch (e) {}
    });
  }
  /** cb(alterInMs | -1) */
  function loadCache(url, cb) {
    openDb(function (db) {
      if (!db) return cb(-1);
      try {
        var req = db.transaction(STORE, 'readonly').objectStore(STORE).get('last');
        req.onsuccess = function () {
          var v = req.result;
          if (!v || v.url !== url || !v.data) return cb(-1);
          data = v.data; nameToId = v.names || {}; loaded = true;
          cb(Date.now() - v.time);
        };
        req.onerror = function () { cb(-1); };
      } catch (e) { cb(-1); }
    });
  }

  function clearCache(cb) {
    data = {}; nameToId = {}; loaded = false;
    openDb(function (db) {
      if (!db) return cb && cb();
      try {
        var tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).delete('last');
        tx.oncomplete = tx.onerror = function () { cb && cb(); };
      } catch (err) { cb && cb(); }
    });
  }

  // ---------- Abfragen ----------
  function keyFor(ch) {
    if (ch._epgKey !== undefined) return ch._epgKey;
    var k = '';
    if (ch.tvgId && data[ch.tvgId]) k = ch.tvgId;
    else {
      var id = nameToId[norm(ch.tvgName)] || nameToId[norm(ch.name)];
      if (id && data[id]) k = id;
      else if (data[ch.name]) k = ch.name;
    }
    if (loaded) ch._epgKey = k;
    return k;
  }

  function list(ch) { var k = keyFor(ch); return k ? data[k] : []; }

  function indexAt(arr, t) {
    var lo = 0, hi = arr.length - 1;
    while (lo <= hi) {
      var mid = (lo + hi) >> 1;
      if (arr[mid].e <= t) lo = mid + 1;
      else if (arr[mid].s > t) hi = mid - 1;
      else return mid;
    }
    return -1;
  }

  function at(ch, t) {
    var arr = list(ch), shift = (ch.shift || 0) * 3600;
    var i = indexAt(arr, t - shift);
    if (i < 0) return { now: null, next: null };
    return { now: arr[i], next: arr[i + 1] || null };
  }

  return {
    load: load, loadCache: loadCache, clearCache: clearCache, list: list, at: at, indexAt: indexAt,
    isLoaded: function () { return loaded; }, isLoading: function () { return loading; },
    resetKeys: function (chs) { for (var i = 0; i < chs.length; i++) delete chs[i]._epgKey; }
  };
})();
