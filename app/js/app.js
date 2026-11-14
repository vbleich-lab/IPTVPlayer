/* IPTVPlayer – webOS IPTV-App: Steuerung, Oberfläche, Einstellungen, Fernbedienung (ES5) */
(function () {
  'use strict';

  var VERSION = '2.9.3';
  var KEY = {
    LEFT: 37, UP: 38, RIGHT: 39, DOWN: 40, ENTER: 13, BACK: 461, ESC: 27, BACKSPACE: 8,
    CH_UP: 33, CH_DOWN: 34, RED: 403, GREEN: 404, YELLOW: 405, BLUE: 406,
    PLAY: 415, PAUSE: 19, PLAYPAUSE: 10252, STOP: 413, FF: 417, RW: 412, INFO: 457
  };
  // Vorlage der Edem-Playlist (alle Kanäle) von epg.it999.ru: localhost = Domain, 0000… = Schlüssel
  var EDEM_TEMPLATE = 'http://epg.one/edem_epg_ico.m3u8';
  var EPG_FULL = ['http://cdn.epg.one/epg.xml.gz', 'http://epg.one/epg.xml.gz'];
  var EPG_COMPACT = ['http://cdn.epg.one/epg.xml', 'http://epg.one/epg.xml'];
  var ACCENTS = { blue: '#3d8bff', green: '#22b07d', purple: '#8b5cf6', orange: '#f08a24', red: '#e5484d', teal: '#14b8c4' };
  var ADULT_RE = /взросл|дорос|adult|xxx|18\+|erot|эрот/i;

  var DEFAULTS = {
    source: 'edem', key: '', domain: '', playlist: '', vod: '',
    lang: '', accent: 'blue', scale: 100, clock: 'menus', timeFmt: '24', infoTimeout: 5,
    showLogos: 1, showNumbers: 1, showEpgList: 1, preview: 'live', sort: 'order', start: 'last', zapDir: 'normal', okAction: 'list', zapScope: 'group',
    engine: 'native', aspect: 'fit', buffer: 30, retries: 3,
    epgMode: 'full', epg: '', epgShift: 0, epgRefresh: 12, catchup: 'auto', seekStep: 5,
    adult: 'show', pin: '0000',
    panelBg: 'solid', anim: 1, infoOnZap: 1, groupOpen: 'playing', groupArchive: 0, groupCounts: 1, listOk: 'close',
    startScreen: 'play', timeout: 15, audioLang: 'auto', protectSettings: 0, plRefresh: 0,
    infoPos: 'bottom', groupHistory: 1, showHidden: 0, listAutoClose: 0, numDelay: 1.5, subtitles: 0, archiveOffset: 0
  };

  var $ = function (id) { return document.getElementById(id); };

  var S = {
    mode: 'player', modal: null,
    channels: [], visible: [], groups: [], gi: 0, ci: 0, focus: 'channels',
    current: null, prev: null, archive: null, unlocked: false,
    favs: {}, settings: {},
    epg: { ch: null, day: 0, items: [], sel: 0 },
    set: { ci: 0, ri: 0, focus: 'cats', editing: null, confirm: null },
    numBuf: '', numTimer: null, infoTimer: null, toastTimer: null, sleepMin: 0, sleepTimer: null, refreshTimer: null
  };

  // ---------- Speicher & Einstellungen ----------
  function load(key, def) { try { var v = localStorage.getItem(key); return v ? JSON.parse(v) : def; } catch (e) { return def; } }
  function save(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch (e) {} }
  function get(k) { return S.settings[k] !== undefined && S.settings[k] !== null ? S.settings[k] : DEFAULTS[k]; }
  function setVal(k, v) { S.settings[k] = v; save('settings', S.settings); applySetting(k); remotePush(); }

  // ---------- Helfer ----------
  function esc(s) { return String(s === undefined || s === null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function hm(sec) {
    var d = new Date(sec * 1000), h = d.getHours(), m = pad(d.getMinutes());
    if (get('timeFmt') === '12') return (h % 12 || 12) + ':' + m + (h < 12 ? 'a' : 'p');
    return pad(h) + ':' + m;
  }
  function dayName(d) { return t('days').split(',')[d.getDay()]; }
  function dateStr(d) { return dayName(d) + ' ' + pad(d.getDate()) + '.' + pad(d.getMonth() + 1) + '.'; }
  /** stabiler Kanal-Schlüssel (ohne Domain/Zugangsschlüssel) für Favoriten & letzten Kanal */
  function chKey(c) { return c.url.replace(/^\w+:\/\/[^\/]+/, '').replace(/\/iptv\/[^\/]+\//, '/iptv/*/'); }
  function nowSec() { return Math.floor(Date.now() / 1000); }
  function show(id, on) { $(id).classList[on ? 'remove' : 'add']('hidden'); }
  function visible(id) { return !$(id).classList.contains('hidden'); }
  function shiftOf(ch) { return ((ch.shift || 0) + (+get('epgShift') || 0)) * 3600; }
  function epgAt(ch, t) { var arr = EPG.list(ch), i = EPG.indexAt(arr, t - shiftOf(ch)); return { arr: arr, i: i, now: i >= 0 ? arr[i] : null, next: i >= 0 ? arr[i + 1] || null : null }; }
  function isAdult(c) { return ADULT_RE.test(c.group || ''); }
  function isFav(c) { return !!S.favs[chKey(c)]; }

  function toast(msg, ms) {
    $('toast').textContent = msg; show('toast', true);
    clearTimeout(S.toastTimer);
    S.toastTimer = setTimeout(function () { show('toast', false); }, ms || 3500);
  }

  function remPx() { return parseFloat(getComputedStyle(document.documentElement).fontSize); }

  /** Rendert nur die sichtbaren Zeilen (wichtig bei 4000+ Kanälen). Zeilenhöhe aus data-rh (rem). */
  function renderRows(el, count, sel, rowFn) {
    var rh = parseFloat(el.getAttribute('data-rh')) || 3.4;
    var visibleRows = Math.max(1, Math.floor(el.clientHeight / ((rh + 0.2) * remPx())));
    var start = Math.max(0, Math.min(sel - Math.floor(visibleRows / 2), count - visibleRows));
    var html = '', style = '<div style="height:' + rh + 'rem" class="row';
    for (var i = start; i < Math.min(count, start + visibleRows); i++) html += rowFn(i, i === sel).replace('<div class="row', '<div data-i="' + i + '" ' + style.substring(5));
    el.innerHTML = html;
  }
  function pageSize(el) {
    var rh = parseFloat(el.getAttribute('data-rh')) || 3.4;
    return Math.max(1, Math.floor(el.clientHeight / ((rh + 0.2) * remPx())) - 1);
  }

  function translateStatic() {
    var els = document.querySelectorAll('[data-t]');
    for (var i = 0; i < els.length; i++) els[i].textContent = t(els[i].getAttribute('data-t'));
  }

  // ---------- Netzwerk / Playlist ----------
  function xhrText(url, cb) {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', url, true);
    xhr.timeout = 30000;
    xhr.onload = function () {
      if (xhr.status && (xhr.status < 200 || xhr.status >= 300)) return cb(new Error('HTTP ' + xhr.status));
      cb(null, xhr.responseText);
    };
    xhr.onerror = function () { cb(new Error(t('netError'))); };
    xhr.ontimeout = function () { cb(new Error(t('timeout'))); };
    xhr.send();
  }

  function normDomain(d) {
    d = (d || '').trim().replace(/^https?:\/\//i, '').replace(/\/.*$/, '');
    if (d && d.indexOf('.') < 0) d += '.iptvspy.net'; // Kurzform aus älteren Edem-Anleitungen
    return d;
  }

  function isConfigured() {
    return get('source') === 'edem' ? !!(get('key') && get('domain')) : !!get('playlist');
  }

  /** Edem: Vorlage holen (bei Ausfall die zuletzt gespeicherte nehmen), Schlüssel + Domain einsetzen */
  function fetchEdemPlaylist(cb) {
    var key = String(get('key')).trim(), domain = normDomain(get('domain'));
    function apply(text) {
      return text.replace(/\/\/localhost(:\d+)?\//g, '//' + domain + '/').replace(/00000000000000/g, key);
    }
    xhrText(EDEM_TEMPLATE, function (err, text) {
      if (!err && text.indexOf('#EXTINF') >= 0) {
        try { localStorage.setItem('edemTpl', text); } catch (e) {}
        return cb(null, apply(text));
      }
      var cached = null;
      try { cached = localStorage.getItem('edemTpl'); } catch (e) {}
      if (cached) { toast(t('offlineList')); return cb(null, apply(cached)); }
      cb(err || new Error(t('edemUnreachable')));
    });
  }

  function loadPlaylist(cb) {
    if (!isConfigured()) { cb(new Error(t('missingCreds'))); return; }
    show('spinner', true);
    var fetcher = get('source') === 'edem' ? fetchEdemPlaylist : function (c) { xhrText(get('playlist'), c); };
    fetcher(function (err, text) {
      show('spinner', false);
      if (err) { cb(err); return; }
      var pl = M3U.parse(text);
      if (!pl.channels.length) { cb(new Error(t('noChannels'))); return; }
      S.channels = pl.channels;
      S.playlistEpg = pl.epgUrl;
      buildGroups();
      cb(null);
      loadEpg();
    });
  }

  function buildGroups() {
    var hide = get('adult') === 'hide', alpha = get('sort') === 'alpha';
    var showHid = +get('showHidden'), hg = S.hiddenGroups || {};
    var chans = S.channels.filter(function (c) { return !(hide && isAdult(c)) && (showHid || !hg[c.group]); });
    var sortFn = function (a, b) { return a.name.localeCompare(b.name); };
    var map = {}, order = [];
    for (var i = 0; i < chans.length; i++) {
      var g = chans[i].group;
      if (!map[g]) { map[g] = []; order.push(g); }
      map[g].push(chans[i]);
    }
    var all = alpha ? chans.slice().sort(sortFn) : chans;
    var favs = sortFavs(all.filter(isFav));
    S.visible = chans;
    S.groups = [{ id: 'all', items: all, icon: '▦' }, { id: 'fav', items: favs, icon: '★' }];
    if (hasVod()) S.groups.push({ id: 'vod', items: [], icon: '▶' });
    if (+get('groupHistory')) S.groups.push({ id: 'hist', items: histItems(chans), icon: '◷' });
    if (+get('groupArchive')) S.groups.push({ id: 'arc', items: all.filter(function (c) { return c.catchupDays > 0; }), icon: '⟲' });
    for (i = 0; i < order.length; i++) {
      S.groups.push({ id: 'g', name: order[i], items: alpha ? map[order[i]].sort(sortFn) : map[order[i]], adult: ADULT_RE.test(order[i]), hidden: !!hg[order[i]] });
    }
    if (S.gi >= S.groups.length) S.gi = 0;
  }
  /** Favoriten in der eigenen Reihenfolge (Wert = Position; gleiche Werte behalten die Listenreihenfolge) */
  function sortFavs(list) {
    var idx = list.map(function (c, i) { return { c: c, o: +S.favs[chKey(c)] || 1, i: i }; });
    idx.sort(function (a, b) { return a.o - b.o || a.i - b.i; });
    return idx.map(function (x) { return x.c; });
  }
  function favMax() { var m = 0; for (var k in S.favs) if (+S.favs[k] > m) m = +S.favs[k]; return m; }
  /** Positionen nach der angezeigten Reihenfolge neu durchnummerieren */
  function saveFavOrder(items) {
    var n = 0, seen = {};
    items.forEach(function (c) { var k = chKey(c); seen[k] = 1; S.favs[k] = ++n; });
    // ausgeblendete Favoriten (z. B. Erwachsenen-Gruppen) hinten anhängen
    Object.keys(S.favs).filter(function (k) { return !seen[k]; }).sort(function (a, b) { return S.favs[a] - S.favs[b]; })
      .forEach(function (k) { S.favs[k] = ++n; });
    save('favs', S.favs);
    remotePush();
  }
  function groupName(g) { return g.id === 'vod' ? t('vod') : g.id === 'all' ? t('allChannels') : g.id === 'fav' ? t('favorites') : g.id === 'arc' ? t('withArchive') : g.id === 'hist' ? t('history') : g.name; }

  /** zuletzt gesehene Sender (neueste zuerst) */
  function histItems(chans) {
    var m = {}, out = [];
    for (var i = 0; i < chans.length; i++) m[chKey(chans[i])] = chans[i];
    for (i = 0; i < S.history.length && out.length < 20; i++) if (m[S.history[i]]) out.push(m[S.history[i]]);
    return out;
  }
  function addHistory(ch) {
    var k = chKey(ch), h = S.history.filter(function (x) { return x !== k; });
    h.unshift(k); if (h.length > 30) h.length = 30;
    S.history = h; save('history', h);
    for (var i = 0; i < S.groups.length; i++) {
      var g = S.groups[i];
      // nicht umsortieren, während man gerade in dieser Gruppe blättert
      if (g.id === 'hist' && !(S.mode === 'list' && S.gi === i)) g.items = histItems(S.visible);
    }
  }
  function toggleHideGroup(g) {
    if (!g || g.id !== 'g') return;
    var n = g.name, hidden = !S.hiddenGroups[n];
    if (hidden) S.hiddenGroups[n] = 1; else delete S.hiddenGroups[n];
    save('hiddenGroups', S.hiddenGroups);
    buildGroups();
    if (S.gi >= S.groups.length) S.gi = S.groups.length - 1;
    toast(t(hidden ? 'groupHidden' : 'groupShown', n), 2500);
  }
  function actUnhideAll() {
    S.hiddenGroups = {}; save('hiddenGroups', S.hiddenGroups);
    if (S.channels.length) buildGroups();
    toast(t('groupShown', t('allChannels')), 2000); renderSettings();
  }

  /** Kanalliste regelmäßig neu laden (z. B. wenn der Anbieter Sender ändert) */
  function armPlRefresh() {
    clearInterval(S.plTimer);
    var h = +get('plRefresh');
    if (!h) return;
    S.plTimer = setInterval(function () {
      if (!S.channels.length || S.mode === 'settings') return;
      var curKey = S.current ? chKey(S.current) : null;
      loadPlaylist(function (err) {
        if (err) return;
        if (curKey) for (var i = 0; i < S.channels.length; i++) if (chKey(S.channels[i]) === curKey) { S.current = S.channels[i]; break; }
        S.previewing = null;
        if (S.mode === 'list') renderList();
      });
    }, h * 3600 * 1000);
  }

  // ---------- Programmführer laden ----------
  function epgSources() {
    var m = get('epgMode');
    if (m === 'off') return null;
    if (m === 'compact') return { key: 'edem-compact', urls: EPG_COMPACT };
    if (m === 'custom') return get('epg') ? { key: get('epg'), urls: [get('epg')] } : null;
    if (m === 'playlist') return S.playlistEpg ? { key: S.playlistEpg, urls: [S.playlistEpg] } : null;
    return { key: 'edem-full', urls: EPG_FULL, fallback: { key: 'edem-compact', urls: EPG_COMPACT } };
  }

  function epgRefreshed() {
    EPG.resetKeys(S.channels);
    rerender();
  }

  /** Erst Cache (sofort), dann bei Bedarf im Hintergrund neu laden */
  function loadEpg(force) {
    var src = epgSources();
    if (!src || !S.channels.length || EPG.isLoading()) return;
    var maxAge = (+get('epgRefresh') || 12) * 3600 * 1000;
    var fetchSrc = function (src, i) {
      S.epgStatus = t('epgLoading');
      EPG.load(src.urls[i], S.channels, {
        cacheKey: src.key,
        progress: function (mb, download) {
          S.epgStatus = t('epgProgress', t(download ? 'mbLoad' : 'mbRead', mb));
          if (visible('infobar')) renderInfo();
        }
      }, function (err) {
        S.epgStatus = '';
        if (!err) { epgRefreshed(); return; }
        if (i + 1 < src.urls.length) { fetchSrc(src, i + 1); return; }
        if (src.fallback && !EPG.isLoaded()) { toast(t('epgFallback')); fetchSrc(src.fallback, 0); return; }
        if (!EPG.isLoaded()) toast(t('epgFailed', err.message));
      });
    };
    if (force) { fetchSrc(src, 0); return; }
    EPG.loadCache(src.key, function (age) {
      if (age >= 0) epgRefreshed();
      if (age < 0 || age > maxAge) fetchSrc(src, 0);
    });
  }

  function armEpgRefresh() {
    clearInterval(S.refreshTimer);
    S.refreshTimer = setInterval(function () { if (S.channels.length) loadEpg(true); }, (+get('epgRefresh') || 12) * 3600 * 1000);
  }

  // ---------- Kindersicherung ----------
  function needsPin(ch) { return get('adult') === 'lock' && !S.unlocked && ch && isAdult(ch); }

  function askPin(cb) {
    S.modal = 'pin';
    S.pin = { val: '', pos: 0, digits: ['', '', '', ''], cb: cb };
    $('pin-msg').textContent = t('pinHelp'); $('pin-msg').className = 'modal-help';
    renderPin(); show('pin', true);
  }
  function renderPin() {
    var h = '';
    for (var i = 0; i < 4; i++) h += '<span class="' + (i === S.pin.pos ? 'cur' : '') + '">' + (S.pin.digits[i] === '' ? '' : '•') + '</span>';
    $('pin-digits').innerHTML = h;
  }
  function pinKey(k) {
    var p = S.pin;
    var d = k >= 48 && k <= 57 ? k - 48 : k >= 96 && k <= 105 ? k - 96 : -1;
    if (d >= 0) { p.digits[p.pos] = String(d); if (p.pos < 3) p.pos++; else return pinCheck(); }
    else if (k === KEY.UP || k === KEY.DOWN) {
      var v = p.digits[p.pos] === '' ? 0 : (+p.digits[p.pos] + (k === KEY.UP ? 1 : 9)) % 10;
      p.digits[p.pos] = String(v);
    } else if (k === KEY.LEFT) p.pos = Math.max(0, p.pos - 1);
    else if (k === KEY.RIGHT) p.pos = Math.min(3, p.pos + 1);
    else if (k === KEY.ENTER) return pinCheck();
    else if (k === KEY.BACK || k === KEY.ESC || k === KEY.BACKSPACE) { show('pin', false); S.modal = null; p.cb(false); return; }
    renderPin();
  }
  function pinCheck() {
    var p = S.pin;
    if (p.digits.join('') === String(get('pin'))) { show('pin', false); S.modal = null; S.unlocked = true; p.cb(true); return; }
    p.digits = ['', '', '', '']; p.pos = 0;
    $('pin-msg').textContent = t('pinWrong'); $('pin-msg').className = 'modal-help err';
    renderPin();
  }
  function guarded(ch, fn) { if (needsPin(ch)) askPin(function (ok) { if (ok) fn(); }); else fn(); }

  // ---------- Wiedergabe ----------
  function play(ch) {
    if (!ch) return;
    guarded(ch, function () {
      if (S.vod) { vodSavePos(); S.vod = null; }
      V.resumeLive = false;
      if (S.current && S.current !== ch) S.prev = S.current;
      S.current = ch;
      S.archive = null;
      if (S.previewing !== ch) Player.start(ch.url);
      S.previewing = null;
      save('last', chKey(ch));
      addHistory(ch);
      if (+get('infoOnZap')) showInfo();
    });
  }

  function playArchive(ch, prog, from) {
    var start = from || (prog.s - (+get('archiveOffset') || 0) * 60);
    var end = Math.min(Math.max(prog.e, start + 60), nowSec());
    var sh = shiftOf(ch);
    S.current = ch;
    S.previewing = null;
    S.archive = { prog: prog, base: start };
    Player.start(M3U.catchupUrl(ch, start - sh, end - sh, get('catchup')));
    showInfo();
  }

  function archivePos() { return S.archive ? S.archive.base + Math.floor(Player.video().currentTime || 0) : nowSec(); }

  function archiveSeek(delta) {
    var a = S.archive; if (!a) return;
    var t0 = Math.max(a.prog.s, archivePos() + delta);
    if (t0 >= nowSec() - 30) { play(S.current); toast(t('backLive'), 1500); return; }
    if (t0 >= a.prog.e) {
      var e = epgAt(S.current, t0);
      if (e.now) { var sh = shiftOf(S.current); playArchive(S.current, { s: e.now.s + sh, e: e.now.e + sh, t: e.now.t, d: e.now.d }, t0); return; }
    }
    playArchive(S.current, a.prog, t0);
  }

  function zap(dir) {
    if (get('zapDir') === 'inverted') dir = -dir;
    var g = S.groups[S.gi];
    var items = (get('zapScope') === 'group' && g && g.items.indexOf(S.current) >= 0) ? g.items : (S.groups[0] ? S.groups[0].items : []);
    if (!items.length) return;
    var i = items.indexOf(S.current);
    play(items[(i + dir + items.length) % items.length]);
  }

  function applyAspect() {
    var v = $('video'), a = get('aspect');
    v.style.objectFit = a === 'fill' ? 'cover' : a === 'stretch' ? 'fill' : 'contain';
    v.style.transform = a === 'zoom' ? 'scale(1.18)' : '';
  }

  // ---------- Uhr ----------
  function updateClock() {
    var c = get('clock'), on = c === 'always' ? !visible('infobar') : c === 'menus' ? (S.mode !== 'player') : false;
    if (S.mode === 'settings' && c !== 'off') on = true;
    $('clock').textContent = hm(nowSec());
    show('clock', on);
    document.body.classList[S.mode === 'player' ? 'remove' : 'add']('in-panel');
    if (S.mode !== 'list') endPreview();
    placeVideo();
  }

  // ---------- Vorschau-Video in der Kanalliste ----------
  // webOS hat meist nur einen Hardware-Decoder: das Hauptvideo wird verkleinert in die Karte gelegt.
  function previewOn() { return S.mode === 'list' && get('preview') !== 'off'; }

  function placeVideo() {
    var v = $('video'), on = previewOn();
    document.body.classList[get('preview') === 'off' ? 'add' : 'remove']('no-preview');
    document.body.classList[get('preview') === 'off' ? 'remove' : 'add']('has-preview');
    if (!on) {
      if (v.classList.contains('mini')) { v.classList.remove('mini'); v.style.left = v.style.top = v.style.width = v.style.height = ''; applyAspect(); }
      return;
    }
    var r = $('pv-video').getBoundingClientRect();
    if (!r.width) return;
    v.classList.add('mini');
    v.style.left = r.left + 'px'; v.style.top = r.top + 'px';
    v.style.width = r.width + 'px'; v.style.height = r.height + 'px';
    v.style.transform = ''; v.style.objectFit = 'contain';
    previewLabel();
  }

  function previewLabel() {
    var ch = S.previewing || S.current;
    $('pv-video-label').textContent = ch ? (S.archive && !S.previewing ? t('archive') : t('live')) + ' · ' + ch.name : '';
  }

  function schedulePreview(c) {
    clearTimeout(S.previewTimer);
    if (!previewOn() || get('preview') !== 'live' || S.focus !== 'channels' || !c || S.archive) return;
    var playing = S.previewing || S.current;
    if (c === playing || needsPin(c)) return;
    S.previewTimer = setTimeout(function () {
      if (!previewOn() || S.archive) return;
      if (c === S.current) { S.previewing = null; Player.start(c.url); }
      else { S.previewing = c; Player.start(c.url); }
      previewLabel();
      if (S.mode === 'list') renderList();
    }, 900);
  }

  // Vorschau verlassen ohne OK: zurück zum eigentlich laufenden Sender
  function endPreview() {
    clearTimeout(S.previewTimer);
    if (!S.previewing) return;
    S.previewing = null;
    if (S.current && !S.archive) Player.start(S.current.url); else if (!S.current) Player.stop();
  }

  // ---------- Info-Leiste ----------
  function showInfo() {
    renderInfo();
    show('infobar', true);
    updateClock();
    clearTimeout(S.infoTimer);
    var secs = +get('infoTimeout');
    if (secs > 0) S.infoTimer = setTimeout(hideInfo, secs * 1000);
  }
  function hideInfo() { show('infobar', false); updateClock(); }

  function renderInfo() {
    if (S.vod) return renderVodInfo();
    var ch = S.current; if (!ch) return;
    var tile = $('ib-logo').parentNode;
    $('ib-num').textContent = ch.num;
    if (ch.logo && get('showLogos')) { $('ib-logo').src = ch.logo; $('ib-logo').style.display = ''; tile.classList.remove('nologo'); }
    else { $('ib-logo').style.display = 'none'; tile.classList.add('nologo'); }
    $('ib-name').textContent = ch.name;
    var badge = $('ib-badge');
    badge.textContent = S.archive ? t('archive') : t('live');
    badge.className = 'chip ' + (S.archive ? 'archive' : 'live');
    $('ib-arc').textContent = '⟲ ' + ch.catchupDays; show('ib-arc', ch.catchupDays > 0);
    show('ib-fav', isFav(ch));
    var d = new Date();
    $('ib-clock').textContent = hm(nowSec());
    $('ib-date').textContent = dateStr(d);

    var tpos = archivePos(), e = epgAt(ch, tpos), sh = shiftOf(ch);
    if (e.now) {
      $('ib-time').textContent = hm(e.now.s + sh) + ' – ' + hm(e.now.e + sh);
      $('ib-title').textContent = e.now.t;
      $('ib-progress').style.width = Math.min(100, Math.max(0, (tpos - e.now.s - sh) / (e.now.e - e.now.s) * 100)) + '%';
      $('ib-left').textContent = S.archive ? '' : t('minLeft', Math.max(0, Math.round((e.now.e + sh - tpos) / 60)));
    } else {
      $('ib-time').textContent = '';
      $('ib-title').textContent = S.epgStatus || (EPG.isLoaded() ? t('noInfo') : '');
      $('ib-progress').style.width = '0';
      $('ib-left').textContent = '';
    }
    $('ib-next').textContent = S.archive ? t('archiveHelp', get('seekStep')) :
      (e.next ? t('next') + ': ' + hm(e.next.s + sh) + '  ' + e.next.t : '');
  }

  // ---------- Kanalliste ----------
  function openList() {
    S.mode = 'list';
    var lp = S.listPos;
    if (get('groupOpen') === 'last' && lp && S.groups[lp.gi] && lp.ci < S.groups[lp.gi].items.length) { S.gi = lp.gi; S.ci = lp.ci; }
    else {
      var g = S.groups[S.gi];
      var idx = g ? g.items.indexOf(S.current) : -1;
      if (idx < 0) { S.gi = 0; idx = Math.max(0, S.groups[0] ? S.groups[0].items.indexOf(S.current) : 0); }
      S.ci = idx;
    }
    S.focus = 'channels';
    hideInfo(); show('list', true);
    renderList(); updateClock();
  }

  /** Kanalliste nach X Sekunden ohne Tastendruck schließen */
  function armListClose() {
    clearTimeout(S.listCloseT);
    var sec = +get('listAutoClose');
    if (sec > 0) S.listCloseT = setTimeout(function () { if (S.mode === 'list' && !S.modal) closePanels(); }, sec * 1000);
  }

  function closePanels() {
    if (S.moving) { S.moving = false; if (S.groups[S.gi] && S.groups[S.gi].id === 'fav') saveFavOrder(S.groups[S.gi].items); }
    if (S.mode === 'list') S.listPos = { gi: S.gi, ci: S.ci };
    S.mode = 'player';
    S.set.editing = null;
    show('list', false); show('epg', false); show('settings', false); show('vod', false);
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    if (V.resumeLive && !S.vod) { V.resumeLive = false; if (S.current) Player.start(S.current.url); }
    updateClock();
  }

  function logoHtml(c, cls) {
    if (!get('showLogos')) return '';
    return '<span class="' + cls + '">' + (c.logo ? '<img src="' + esc(c.logo) + '" onerror="this.style.display=\'none\'">' : '') + '</span>';
  }

  function renderList() {
    var groups = S.groups, g = groups[S.gi] || { items: [] };
    $('groups').parentNode.classList[S.focus === 'groups' ? 'add' : 'remove']('active');
    $('channels').parentNode.classList[S.focus === 'channels' ? 'add' : 'remove']('active');
    document.body.classList[get('showLogos') ? 'remove' : 'add']('no-logos');
    document.body.classList[get('showNumbers') ? 'remove' : 'add']('no-numbers');
    $('gear').classList[S.focus === 'gear' ? 'add' : 'remove']('sel');
    // Sender gewählt: Kategorien ausblenden, Kanalliste und Vorschau teilen sich den Bildschirm
    $('list').classList[S.focus === 'channels' ? 'add' : 'remove']('compact');
    var locking = get('adult') === 'lock' && !S.unlocked;
    renderRows($('groups'), groups.length, S.gi, function (i, sel) {
      var gr = groups[i];
      return '<div class="row' + (sel ? ' sel' : '') + (gr.hidden ? ' hid' : '') + '"><span class="gi">' + (gr.icon || '') + '</span><span class="t">' + esc(groupName(gr)) + '</span>' +
        (gr.hidden ? '<span class="hidmark">⊘</span>' : '') +
        (gr.adult && locking ? '<span class="lock">🔒</span>' : '') + '<span class="pill">' + gr.items.length + '</span></div>';
    });
    $('group-title').textContent = groupName(g);
    $('group-count').textContent = g.items.length;
    var now = nowSec(), showEpg = get('showEpgList');
    if (!g.items.length) {
      $('channels').innerHTML = '<div class="row dim" style="height:4rem">' + esc(g.id === 'vod' ? t('vodOpen') : g.id === 'fav' ? t('favHint') : t('empty')) + '</div>';
    } else {
      if (S.ci >= g.items.length) S.ci = g.items.length - 1;
      renderRows($('channels'), g.items.length, S.ci, function (i, sel) {
        var c = g.items[i], hid = locking && isAdult(c), e = showEpg && !hid ? epgAt(c, now) : {}, sh = shiftOf(c);
        var pct = e.now ? Math.min(100, Math.max(0, (now - e.now.s - sh) / (e.now.e - e.now.s) * 100)) : 0;
        return '<div class="row ch' + (sel ? ' sel' : '') + (sel && S.moving ? ' moving' : '') + (c === S.current ? ' playing' : '') + (S.previewing && c === S.previewing ? ' previewing' : '') + '">' +
          '<span class="n">' + c.num + '</span><span class="arc' + (c.catchupDays > 0 ? ' on' : '') + '"></span>' + (hid ? (get('showLogos') ? '<span class="lg"></span>' : '') : logoHtml(c, 'lg')) +
          '<span class="txt"><span class="name">' + esc(c.name) + '</span>' +
          (e.now ? '<span class="sub">' + esc(e.now.t) + '</span><span class="mini"><div style="width:' + pct + '%"></div></span>' : '') +
          '</span><span class="icons">' + (sel && S.moving ? '<span class="mv">⇅</span>' : isFav(c) ? '<span class="fav">★</span>' : '') +
          (locking && isAdult(c) ? '<span class="lock">🔒</span>' : '') + '</span></div>';
      });
    }
    renderPreview(g.items[S.ci]);
    schedulePreview(g.items[S.ci]);
    placeVideo();
    $('hint-yellow').textContent = t(S.focus === 'groups' ? 'hHideGroup' : 'hFav');
    var mv = S.focus === 'channels' && g.id === 'fav' && g.items.length > 1;
    $('hint-ok').textContent = t(S.moving ? 'hMoveDone' : 'hPlay') + (mv && !S.moving ? '  ·  ' + t('hMove') : '');
    armListClose();
  }

  function renderPreview(c) {
    if (!c) { $('pv-name').textContent = ''; $('pv-meta').textContent = ''; $('pv-now').textContent = ''; $('pv-desc').textContent = ''; $('pv-next').innerHTML = ''; $('pv-progress').style.width = '0'; $('pv-logo').style.display = 'none'; return; }
    $('pv-name').textContent = c.name;
    $('pv-meta').textContent = '№ ' + c.num + '  ·  ' + c.group + (c.catchupDays ? '  ·  ' + t('archiveDays', c.catchupDays) : '');
    if (c.logo && get('showLogos')) { $('pv-logo').src = c.logo; $('pv-logo').style.display = ''; } else $('pv-logo').style.display = 'none';
    var now = nowSec(), e = epgAt(c, now), sh = shiftOf(c);
    if (needsPin(c)) { $('pv-logo').style.display = 'none'; $('pv-now').textContent = '🔒 ' + t('locked'); $('pv-desc').textContent = ''; $('pv-next').innerHTML = ''; $('pv-progress').style.width = '0'; return; }
    if (e.now) {
      $('pv-now').textContent = hm(e.now.s + sh) + ' – ' + hm(e.now.e + sh) + '   ' + e.now.t;
      $('pv-progress').style.width = Math.min(100, Math.max(0, (now - e.now.s - sh) / (e.now.e - e.now.s) * 100)) + '%';
      $('pv-desc').textContent = e.now.d || '';
      var nx = '';
      for (var k = e.i + 1; k < Math.min(e.arr.length, e.i + 5); k++) nx += '<div><b>' + hm(e.arr[k].s + sh) + '</b>' + esc(e.arr[k].t) + '</div>';
      $('pv-next').innerHTML = nx;
    } else {
      $('pv-now').textContent = S.epgStatus || ''; $('pv-desc').textContent = ''; $('pv-next').innerHTML = ''; $('pv-progress').style.width = '0';
    }
  }

  /** Favoriten verschieben: ▲▼ bewegt den Sender, OK/Zurück beendet */
  function moveKey(k) {
    var g = S.groups[S.gi], items = g ? g.items : [], i = S.ci;
    if (!g || g.id !== 'fav' || !items[i]) { S.moving = false; renderList(); return; }
    var j = -1;
    if (k === KEY.UP) j = i - 1;
    else if (k === KEY.DOWN) j = i + 1;
    else if (k === KEY.CH_UP) j = 0;
    else if (k === KEY.CH_DOWN) j = items.length - 1;
    else if (k === KEY.ENTER || k === KEY.BACK || k === KEY.ESC || k === KEY.BACKSPACE || k === KEY.YELLOW) {
      S.moving = false; saveFavOrder(items); toast(t('orderSaved'), 1500); renderList(); return;
    } else return;
    if (j < 0 || j >= items.length || j === i) return;
    var c = items.splice(i, 1)[0];
    items.splice(j, 0, c);
    S.ci = j;
    renderList();
  }
  function startMove() {
    var g = S.groups[S.gi];
    if (S.mode !== 'list' || S.focus !== 'channels' || !g || g.id !== 'fav' || !g.items[S.ci]) return;
    S.moving = true;
    toast(t('moveHelp'), 4000);
    renderList();
  }

  function listKey(k) {
    if (S.moving) return moveKey(k);
    var g = S.groups[S.gi], items = g ? g.items : [];
    if (k === KEY.BLUE) { openSettings(); return; }
    if (k === KEY.BACK || k === KEY.ESC || k === KEY.BACKSPACE) { closePanels(); return; }
    if (S.focus === 'gear') {
      if (k === KEY.ENTER) { openSettings(); return; }
      if (k === KEY.UP) { S.focus = 'groups'; S.gi = S.groups.length - 1; }
      else if (k === KEY.RIGHT) S.focus = 'channels';
      else return;
    } else if (S.focus === 'groups') {
      if (k === KEY.UP) { S.gi = (S.gi - 1 + S.groups.length) % S.groups.length; S.ci = 0; }
      else if (k === KEY.DOWN) { if (S.gi >= S.groups.length - 1) S.focus = 'gear'; else { S.gi++; S.ci = 0; } }
      else if (k === KEY.CH_UP) { S.gi = Math.max(0, S.gi - pageSize($('groups'))); S.ci = 0; }
      else if (k === KEY.CH_DOWN) { S.gi = Math.min(S.groups.length - 1, S.gi + pageSize($('groups'))); S.ci = 0; }
      else if (k === KEY.YELLOW) toggleHideGroup(S.groups[S.gi]);
      else if (k === KEY.RIGHT || k === KEY.ENTER) { if (S.groups[S.gi] && S.groups[S.gi].id === 'vod') { openVod(); return; } S.focus = 'channels'; }
      else return;
    } else {
      if (g && g.id === 'vod') { if (k === KEY.ENTER || k === KEY.RIGHT) openVod(); else if (k === KEY.LEFT || k === KEY.UP || k === KEY.DOWN) { S.focus = 'groups'; renderList(); } return; }
      var page = pageSize($('channels'));
      if (k === KEY.UP) S.ci = items.length ? (S.ci - 1 + items.length) % items.length : 0;
      else if (k === KEY.DOWN) S.ci = items.length ? (S.ci + 1) % items.length : 0;
      else if (k === KEY.CH_UP) S.ci = Math.max(0, S.ci - page);
      else if (k === KEY.CH_DOWN) S.ci = Math.min(items.length - 1, S.ci + page);
      else if (k === KEY.LEFT) S.focus = 'groups';
      else if (k === KEY.ENTER) {
        var c = items[S.ci];
        if (c) guarded(c, function () {
          if (c !== S.current || S.archive || S.previewing) play(c);
          if (get('listOk') === 'stay') renderList(); else closePanels();
        });
        return;
      } else if (k === KEY.RIGHT || k === KEY.GREEN) { if (items[S.ci]) guarded(items[S.ci], function () { openEpg(items[S.ci]); }); return; }
      else if (k === KEY.YELLOW) toggleFav(items[S.ci]);
      else if (k >= 48 && k <= 57) { numKey(String(k - 48)); return; }
      else return;
    }
    renderList();
  }

  function toggleFav(c) {
    if (!c) return;
    var key = chKey(c);
    if (S.favs[key]) delete S.favs[key]; else S.favs[key] = favMax() + 1;
    save('favs', S.favs);
    remotePush();
    buildGroups();
    if (S.groups[S.gi] && S.groups[S.gi].id === 'fav') S.ci = Math.max(0, Math.min(S.ci, S.groups[S.gi].items.length - 1));
    toast(S.favs[key] ? t('favAdded', c.name) : t('favRemoved', c.name), 2000);
    if (S.mode === 'player' && visible('infobar')) renderInfo();
  }

  // ---------- Mediathek (Filme & Serien als eigene M3U-Playlist, z. B. Edem „Медиатека“) ----------
  var V = { url: '', items: [], cats: [], ci: 0, ii: 0, focus: 'cats', loading: false, at: 0, resumeLive: false };
  function hasVod() { return !!String(get('vod') || '').trim(); }
  function vodKey(it) { return (it.group || '') + '|' + it.name; }
  function vodPos() { return load('vodPos', {}); }
  function fmtDur(sec) {
    sec = Math.max(0, Math.floor(sec || 0));
    var h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60);
    return (h ? h + ':' + pad(m) : m) + ':' + pad(sec % 60);
  }
  /** Stelle im Film merken (für „Weiter ansehen“); fast zu Ende gesehene Filme werden entfernt */
  function vodSavePos(done) {
    var v = S.vod; if (!v) return;
    var p = Player.position(), all = vodPos(), k = vodKey(v.item);
    if (done || (p.dur && p.pos > p.dur - 120)) delete all[k];
    else if (p.pos > 30) all[k] = { p: Math.floor(p.pos), d: Math.floor(p.dur), t: Date.now() };
    else return;
    var keys = Object.keys(all).sort(function (a, b) { return all[b].t - all[a].t; });
    for (var i = 60; i < keys.length; i++) delete all[keys[i]];
    save('vodPos', all);
  }

  function vodBuild() {
    // Auswahl merken (Kategorie + Titel), damit sie nach dem Neuaufbau an derselben Stelle steht
    var oc = V.cats[V.ci], oi = oc && oc.items[V.ii], ocId = oc ? oc.id + '|' + (oc.name || '') : '', oiKey = oi ? vodKey(oi) : '';
    var hide = get('adult') === 'hide', map = {}, order = [], byKey = {}, pos = vodPos();
    var items = V.items.filter(function (it) { return !(hide && isAdult(it)); });
    items.forEach(function (it) {
      if (!map[it.group]) { map[it.group] = []; order.push(it.group); }
      map[it.group].push(it); byKey[vodKey(it)] = it;
    });
    var cont = Object.keys(pos).sort(function (a, b) { return pos[b].t - pos[a].t; })
      .map(function (k) { return byKey[k]; }).filter(function (x) { return !!x; });
    V.cats = [];
    if (cont.length) V.cats.push({ id: 'cont', items: cont, icon: '◷' });
    if (order.length > 1) V.cats.push({ id: 'all', items: items, icon: '▦' });
    order.forEach(function (g) { V.cats.push({ id: 'g', name: g, items: map[g], adult: ADULT_RE.test(g) }); });
    V.ci = 0; V.ii = 0;
    for (var i = 0; i < V.cats.length; i++) if (V.cats[i].id + '|' + (V.cats[i].name || '') === ocId) { V.ci = i; break; }
    if (oiKey && V.cats[V.ci]) for (var j = 0; j < V.cats[V.ci].items.length; j++) if (vodKey(V.cats[V.ci].items[j]) === oiKey) { V.ii = j; break; }
  }
  function vodCatName(c) { return c.id === 'cont' ? t('vodContinue') : c.id === 'all' ? t('vodAll') : c.name; }

  function vodLoad(cb) {
    var url = String(get('vod')).trim();
    if (V.url === url && V.items.length && Date.now() - V.at < 6 * 3600000) return cb(null);
    V.loading = true; show('spinner', true);
    xhrText(url, function (err, text) {
      V.loading = false; show('spinner', false);
      if (err) return cb(err);
      var pl = M3U.parse(text || '');
      if (!pl.channels.length) return cb(new Error(t('vodEmpty')));
      V.url = url; V.items = pl.channels; V.at = Date.now(); V.ci = 0; V.ii = 0; V.focus = 'cats';
      cb(null);
    });
  }

  function openVod() {
    if (!hasVod()) { toast(t('vodMissing'), 5000); return; }
    if (V.loading) return;
    vodLoad(function (err) {
      if (err) { toast(t('errorX', err.message), 6000); if (S.mode !== 'settings') closePanels(); return; }
      vodBuild();
      S.mode = 'vod';
      show('list', false); show('epg', false); show('settings', false); hideInfo(); show('vod', true);
      renderVod(); updateClock();
    });
  }

  function vodThumb(it, hid) {
    return '<span class="lg">' + (it.logo && !hid ? '<img src="' + esc(it.logo) + '" onerror="this.style.display=\'none\'">' : '') + '</span>';
  }

  function renderVod() {
    var cats = V.cats, c = cats[V.ci] || { items: [] }, pos = vodPos();
    var locking = get('adult') === 'lock' && !S.unlocked;
    $('vod-cats').parentNode.classList[V.focus === 'cats' ? 'add' : 'remove']('active');
    $('vod-items').parentNode.classList[V.focus === 'items' ? 'add' : 'remove']('active');
    renderRows($('vod-cats'), cats.length, V.ci, function (i, sel) {
      var g = cats[i];
      return '<div class="row' + (sel ? ' sel' : '') + '"><span class="gi">' + (g.icon || '') + '</span><span class="t">' + esc(vodCatName(g)) + '</span>' +
        (g.adult && locking ? '<span class="lock">🔒</span>' : '') + '<span class="pill">' + g.items.length + '</span></div>';
    });
    $('vod-title').textContent = vodCatName(c);
    $('vod-count').textContent = c.items.length;
    if (V.ii >= c.items.length) V.ii = Math.max(0, c.items.length - 1);
    if (!c.items.length) $('vod-items').innerHTML = '<div class="row dim" style="height:4rem">' + esc(t('empty')) + '</div>';
    else renderRows($('vod-items'), c.items.length, V.ii, function (i, sel) {
      var it = c.items[i], hid = locking && isAdult(it), pp = pos[vodKey(it)];
      var pct = pp && pp.d ? Math.min(100, pp.p / pp.d * 100) : 0;
      return '<div class="row ch vi' + (sel ? ' sel' : '') + '">' + vodThumb(it, hid) +
        '<span class="txt"><span class="name">' + esc(it.name) + '</span>' +
        (c.id !== 'g' ? '<span class="sub">' + esc(it.group) + '</span>' : '') +
        (pct ? '<span class="mini"><div style="width:' + pct + '%"></div></span>' : '') + '</span>' +
        (hid ? '<span class="icons"><span class="lock">🔒</span></span>' : '') + '</div>';
    });
    renderVodCard(c.items[V.ii], pos);
  }

  function renderVodCard(it, pos) {
    var img = $('vod-poster');
    if (!it) { img.style.display = 'none'; $('vod-name').textContent = ''; $('vod-meta').textContent = ''; $('vod-resume').textContent = ''; return; }
    var hid = needsPin(it);
    if (it.logo && !hid) { if (img.getAttribute('src') !== it.logo) img.src = it.logo; img.style.display = ''; } else img.style.display = 'none';
    $('vod-name').textContent = it.name;
    $('vod-meta').textContent = it.group;
    var pp = pos[vodKey(it)];
    $('vod-resume').textContent = hid ? '🔒 ' + t('locked') : pp ? t('vodResumeAt', fmtDur(pp.p) + (pp.d ? ' / ' + fmtDur(pp.d) : '')) : '';
  }

  function vodKeyDown(k) {
    var c = V.cats[V.ci], items = c ? c.items : [];
    if (k === KEY.BACK || k === KEY.ESC || k === KEY.BACKSPACE) {
      if (V.focus === 'items') { V.focus = 'cats'; renderVod(); } else closePanels();
      return;
    }
    if (k === KEY.BLUE) { openSettings(); return; }
    if (V.focus === 'cats') {
      var n = V.cats.length;
      if (!n) return;
      if (k === KEY.UP) { V.ci = (V.ci - 1 + n) % n; V.ii = 0; }
      else if (k === KEY.DOWN) { V.ci = (V.ci + 1) % n; V.ii = 0; }
      else if (k === KEY.CH_UP) { V.ci = Math.max(0, V.ci - pageSize($('vod-cats'))); V.ii = 0; }
      else if (k === KEY.CH_DOWN) { V.ci = Math.min(n - 1, V.ci + pageSize($('vod-cats'))); V.ii = 0; }
      else if (k === KEY.RIGHT || k === KEY.ENTER) {
        if (!items.length) return;
        var go = function () { V.focus = 'items'; renderVod(); };
        if (c.adult && get('adult') === 'lock' && !S.unlocked) askPin(function (ok) { if (ok) go(); }); else go();
        return;
      } else return;
    } else {
      var page = pageSize($('vod-items'));
      if (!items.length) { V.focus = 'cats'; renderVod(); return; }
      if (k === KEY.UP) V.ii = (V.ii - 1 + items.length) % items.length;
      else if (k === KEY.DOWN) V.ii = (V.ii + 1) % items.length;
      else if (k === KEY.CH_UP) V.ii = Math.max(0, V.ii - page);
      else if (k === KEY.CH_DOWN) V.ii = Math.min(items.length - 1, V.ii + page);
      else if (k === KEY.LEFT) V.focus = 'cats';
      else if (k === KEY.ENTER || k === KEY.PLAY || k === KEY.PLAYPAUSE) { playVod(items[V.ii]); return; }
      else if (k === KEY.RED) { playVod(items[V.ii], true); return; }
      else return;
    }
    renderVod();
  }

  function playVod(it, fromStart) {
    if (!it) return;
    guarded(it, function () {
      var pp = vodPos()[vodKey(it)], at = !fromStart && pp ? Math.max(0, pp.p - 5) : 0;
      clearTimeout(S.previewTimer);
      S.previewing = null; S.archive = null;
      S.vod = { item: it };
      S.mode = 'player'; show('vod', false);
      Player.start(it.url, false, at);
      if (at) toast(t('vodResumed', fmtDur(at)), 2500);
      showInfo();
    });
  }
  /** Film beenden und zurück in die Mediathek */
  function exitVod(done) {
    vodSavePos(done);
    S.vod = null;
    Player.stop(); hideInfo();
    V.resumeLive = true;
    openVod();
  }

  function vodPlayerKey(k) {
    switch (k) {
      case KEY.LEFT: Player.seek(-30); showInfo(); break;
      case KEY.RIGHT: Player.seek(30); showInfo(); break;
      case KEY.RW: Player.seek(-300); showInfo(); break;
      case KEY.FF: Player.seek(300); showInfo(); break;
      case KEY.ENTER: case KEY.PLAY: case KEY.PAUSE: case KEY.PLAYPAUSE:
        toast(Player.togglePause() ? t('paused') : t('resumed'), 1200); showInfo(); break;
      case KEY.UP: case KEY.DOWN: case KEY.INFO: if (visible('infobar')) hideInfo(); else showInfo(); break;
      case KEY.BLUE: openSettings(); break;
      case KEY.STOP: exitVod(); break;
      case KEY.BACK: case KEY.ESC: case KEY.BACKSPACE: if (visible('infobar')) hideInfo(); else exitVod(); break;
    }
  }

  function renderVodInfo() {
    var it = S.vod.item, p = Player.position(), tile = $('ib-logo').parentNode;
    $('ib-num').textContent = '';
    if (it.logo) { if ($('ib-logo').getAttribute('src') !== it.logo) $('ib-logo').src = it.logo; $('ib-logo').style.display = ''; tile.classList.remove('nologo'); }
    else { $('ib-logo').style.display = 'none'; tile.classList.add('nologo'); }
    $('ib-name').textContent = it.name;
    $('ib-badge').textContent = t('vod').toUpperCase(); $('ib-badge').className = 'chip';
    show('ib-arc', false); show('ib-fav', false);
    $('ib-clock').textContent = hm(nowSec()); $('ib-date').textContent = dateStr(new Date());
    $('ib-time').textContent = fmtDur(p.pos) + (p.dur ? ' / ' + fmtDur(p.dur) : '');
    $('ib-title').textContent = (p.paused ? '❚❚  ' : '') + it.group;
    $('ib-progress').style.width = p.dur ? Math.min(100, p.pos / p.dur * 100) + '%' : '0';
    $('ib-left').textContent = p.dur ? t('minLeft', Math.max(0, Math.round((p.dur - p.pos) / 60))) : '';
    $('ib-next').textContent = t('vodHelp');
  }

  // ---------- Programmführer / Archiv ----------
  function openEpg(ch) {
    S.mode = 'epg';
    S.epg.ch = ch;
    S.epg.day = 0;
    show('list', false); hideInfo(); show('epg', true);
    if (ch.logo && get('showLogos')) { $('epg-logo').src = ch.logo; $('epg-logo').parentNode.style.display = ''; }
    else $('epg-logo').parentNode.style.display = 'none';
    $('epg-title').textContent = ch.num + '  ' + ch.name;
    buildEpgDay(true); updateClock();
  }

  function minDay(ch) { return -Math.max(1, ch.catchupDays || 1); }

  function buildEpgDay(selectNow) {
    var ch = S.epg.ch, all = EPG.list(ch), sh = shiftOf(ch);
    var d0 = new Date(); d0.setHours(0, 0, 0, 0); d0.setDate(d0.getDate() + S.epg.day);
    var from = d0.getTime() / 1000, to = from + 86400;
    S.epg.items = all.filter(function (p) { return p.s + sh >= from && p.s + sh < to; });
    var now = nowSec();
    if (selectNow) {
      S.epg.sel = 0;
      if (S.epg.day === 0) { for (var i = 0; i < S.epg.items.length; i++) if (S.epg.items[i].s + sh <= now) S.epg.sel = i; }
      else if (S.epg.day < 0) S.epg.sel = S.epg.items.length - 1;
    }
    S.epg.sel = Math.max(0, Math.min(S.epg.sel, S.epg.items.length - 1));
    // Tages-Reiter
    var h = '', lo = Math.max(minDay(ch), S.epg.day - 4), hi = Math.min(2, lo + 6);
    for (var d = lo; d <= hi; d++) {
      var dd = new Date(); dd.setDate(dd.getDate() + d);
      var lbl = d === 0 ? t('today') : d === -1 ? t('yesterday') : d === 1 ? t('tomorrow') : dateStr(dd);
      h += '<span class="' + (d === S.epg.day ? 'cur' : '') + (d === 0 ? ' today' : '') + '">' + esc(lbl) + '</span>';
    }
    $('epg-days').innerHTML = h;
    renderEpg();
  }

  function canArchive(ch, p) {
    var now = nowSec(), sh = shiftOf(ch);
    return ch.catchupDays > 0 && p.s + sh < now && p.s + sh > now - ch.catchupDays * 86400;
  }

  function renderEpg() {
    var ch = S.epg.ch, items = S.epg.items, now = nowSec(), sh = shiftOf(ch);
    $('epg-rows').parentNode.classList.add('active');
    if (!items.length) {
      $('epg-rows').innerHTML = '<div class="row dim" style="height:3.6rem">' + esc(S.epgStatus || (EPG.isLoaded() ? t('noEpgDay') : t('noEpg'))) + '</div>';
      $('epg-pname').textContent = ''; $('epg-ptime').textContent = ''; $('epg-pstate').textContent = ''; $('epg-pdesc').textContent = '';
      return;
    }
    renderRows($('epg-rows'), items.length, S.epg.sel, function (i, sel) {
      var p = items[i], isNow = p.s + sh <= now && p.e + sh > now, past = p.e + sh <= now;
      return '<div class="row ep' + (sel ? ' sel' : '') + (isNow ? ' now' : past ? ' past' : '') + '">' +
        '<span class="tm">' + hm(p.s + sh) + '</span>' +
        '<span class="mk">' + (isNow ? '●' : canArchive(ch, p) ? '⟲' : '') + '</span>' +
        '<span class="t">' + esc(p.t) + '</span><span class="dur">' + t('minutes', Math.round((p.e - p.s) / 60)) + '</span></div>';
    });
    var p = items[S.epg.sel], isNow = p.s + sh <= now && p.e + sh > now;
    $('epg-pname').textContent = p.t;
    $('epg-ptime').textContent = dateStr(new Date((p.s + sh) * 1000)) + '  ' + hm(p.s + sh) + ' – ' + hm(p.e + sh);
    $('epg-pstate').textContent = isNow ? '● ' + t('live') + ' · ' + t('minLeft', Math.round((p.e + sh - now) / 60)) :
      canArchive(ch, p) ? '⟲ ' + t('archive') : p.s + sh > now ? t('notStarted') : t('noArchive');
    $('epg-pdesc').textContent = p.d || '';
  }

  function epgKey(k) {
    var items = S.epg.items, ch = S.epg.ch, page = pageSize($('epg-rows'));
    if (k === KEY.UP) S.epg.sel = Math.max(0, S.epg.sel - 1);
    else if (k === KEY.DOWN) S.epg.sel = Math.min(items.length - 1, S.epg.sel + 1);
    else if (k === KEY.CH_UP) S.epg.sel = Math.max(0, S.epg.sel - page);
    else if (k === KEY.CH_DOWN) S.epg.sel = Math.min(items.length - 1, S.epg.sel + page);
    else if (k === KEY.LEFT) { if (S.epg.day > minDay(ch)) { S.epg.day--; buildEpgDay(true); } return; }
    else if (k === KEY.RIGHT) { if (S.epg.day < 2) { S.epg.day++; buildEpgDay(true); } return; }
    else if (k === KEY.ENTER) {
      var p = items[S.epg.sel]; if (!p) return;
      var now = nowSec(), sh = shiftOf(ch);
      if (p.s + sh <= now && p.e + sh > now) { play(ch); closePanels(); }
      else if (canArchive(ch, p)) { closePanels(); playArchive(ch, { s: p.s + sh, e: p.e + sh, t: p.t, d: p.d }); }
      else toast(p.s + sh > now ? t('notStarted') : t('noArchive'));
      return;
    } else if (k === KEY.BACK || k === KEY.ESC || k === KEY.BACKSPACE || k === KEY.GREEN) { show('epg', false); openList(); return; }
    else return;
    renderEpg();
  }

  // ---------- Einstellungen: Definition ----------
  function yn() { return [[1, t('yes')], [0, t('no')]]; }
  function tr(list) { return list.map(function (o) { return [o[0], t(o[1])]; }); }
  function isEdem() { return get('source') === 'edem'; }
  var ICON = {
    source: '<path d="M14 10a4 4 0 1 1-1.2-2.8L21 15v3h-3v-2h-2v-2h-2"/><circle cx="8" cy="10" r="1"/>',
    iface: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>',
    list: '<path d="M8 6h13M8 12h13M8 18h13"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/>',
    play: '<circle cx="12" cy="12" r="9"/><path d="M10 8.5v7l6-3.5z"/>',
    epg: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    parental: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
    remote: '<rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/>',
    sys: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>'
  };

  var CATS = [
    { id: 'source', label: 'catSource', items: [
      { k: 'source', label: 'sSource', opts: function () { return tr([['edem', 'vEdem'], ['url', 'vUrl']]); } },
      { k: 'key', type: 'text', label: 'sKey', help: 'hKey', when: isEdem, mask: true, dep: ['source', 'edem'] },
      { k: 'domain', type: 'text', label: 'sDomain', help: 'hDomain', when: isEdem, dep: ['source', 'edem'] },
      { k: 'plRefresh', label: 'sPlRefresh', help: 'hPlRefresh', opts: function () { return [[0, t('vOff')]].concat([6, 12, 24].map(function (v) { return [v, t('hours', v)]; })); } },
      { k: 'playlist', type: 'text', label: 'sPlaylist', help: 'hPlaylist', when: function () { return !isEdem(); }, dep: ['source', 'url'] },
      { k: 'vod', type: 'text', label: 'sVod', help: 'hVod' },
      { id: 'openVod', type: 'act', label: 'sOpenVod', help: 'hVod', run: openVod, when: hasVod },
      { id: 'qrSource', type: 'act', label: 'sRemoteQr', help: 'hRemoteQr', run: openQr, when: function () { return Platform.phoneSetup; } },
      { id: 'loadList', type: 'act', label: 'sLoadList', help: 'hLoadList', primary: true, run: actLoadList }
    ] },
    { id: 'iface', label: 'catInterface', items: [
      { k: 'lang', label: 'sLang', opts: function () { return I18N.langs; } },
      { k: 'accent', label: 'sAccent', swatch: true, opts: function () { return tr([['blue', 'cBlue'], ['green', 'cGreen'], ['purple', 'cPurple'], ['orange', 'cOrange'], ['red', 'cRed'], ['teal', 'cTeal']]); } },
      { k: 'scale', label: 'sScale', opts: function () { return [80, 90, 100, 110, 120, 130].map(function (v) { return [v, v + ' %']; }); } },
      { k: 'clock', label: 'sClock', opts: function () { return tr([['off', 'vOff'], ['menus', 'vMenus'], ['always', 'vAlways']]); } },
      { k: 'timeFmt', label: 'sTimeFmt', opts: function () { return [['24', '24 h  (20:15)'], ['12', '12 h  (8:15p)']]; } },
      { k: 'infoTimeout', label: 'sInfoTimeout', opts: function () { return [3, 5, 8, 12].map(function (v) { return [v, t('seconds', v)]; }).concat([[0, t('vUntilClosed')]]); } },
      { k: 'infoOnZap', label: 'sInfoOnZap', opts: yn },
      { k: 'infoPos', label: 'sInfoPos', opts: function () { return tr([['bottom', 'vBottom'], ['top', 'vTop']]); } },
      { k: 'panelBg', label: 'sPanelBg', opts: function () { return tr([['solid', 'vSolid'], ['glass', 'vGlass']]); } },
      { k: 'anim', label: 'sAnim', opts: yn }
    ] },
    { id: 'list', label: 'catList', items: [
      { k: 'showLogos', label: 'sShowLogos', opts: yn },
      { k: 'showNumbers', label: 'sShowNumbers', opts: yn },
      { k: 'showEpgList', label: 'sShowEpgList', opts: yn },
      { k: 'preview', label: 'sPreview', opts: function () { return tr([['live', 'vPreviewLive'], ['current', 'vPreviewCurrent'], ['off', 'vOff']]); } },
      { k: 'sort', label: 'sSort', opts: function () { return tr([['order', 'vOrder'], ['alpha', 'vAlpha']]); } },
      { k: 'start', label: 'sStart', opts: function () { return tr([['last', 'vLast'], ['first', 'vFirst'], ['fav', 'vFirstFav']]); } },
      { k: 'zapDir', label: 'sZapDir', opts: function () { return tr([['normal', 'vNormal'], ['inverted', 'vInverted']]); } },
      { k: 'okAction', label: 'sOk', opts: function () { return tr([['list', 'vList'], ['info', 'vInfo']]); } },
      { k: 'zapScope', label: 'sZapScope', opts: function () { return tr([['group', 'vGroup'], ['all', 'vAll']]); } },
      { k: 'listOk', label: 'sListOk', opts: function () { return tr([['close', 'vPlayClose'], ['stay', 'vPlayStay']]); } },
      { k: 'groupOpen', label: 'sGroupOpen', opts: function () { return tr([['playing', 'vGroupPlaying'], ['last', 'vGroupLast']]); } },
      { k: 'groupArchive', label: 'sGroupArchive', opts: yn },
      { k: 'groupCounts', label: 'sGroupCounts', opts: yn },
      { k: 'groupHistory', label: 'sGroupHistory', opts: yn },
      { k: 'showHidden', label: 'sShowHidden', help: 'hShowHidden', opts: yn },
      { id: 'unhideAll', type: 'act', label: 'sUnhideAll', help: 'hShowHidden', run: actUnhideAll, when: function () { return Object.keys(S.hiddenGroups).length > 0; } },
      { k: 'listAutoClose', label: 'sListAutoClose', help: 'hListAutoClose', opts: function () { return [[0, t('vOff')]].concat([10, 20, 30, 60].map(function (v) { return [v, t('seconds', v)]; })); } },
      { k: 'numDelay', label: 'sNumDelay', opts: function () { return [1, 1.5, 2, 3].map(function (v) { return [v, t('seconds', v)]; }); } }
    ] },
    { id: 'play', label: 'catPlayback', items: [
      { k: 'engine', label: 'sEngine', help: 'hEngine', opts: function () { return tr([['native', 'vNative'], ['hlsjs', 'vHlsjs']]); } },
      { k: 'aspect', label: 'sAspect', opts: function () { return tr([['fit', 'vFit'], ['fill', 'vFill'], ['stretch', 'vStretch'], ['zoom', 'vZoom']]); } },
      { k: 'buffer', label: 'sBuffer', help: 'hBuffer', opts: function () { return [10, 20, 30, 60].map(function (v) { return [v, t('seconds', v)]; }); } },
      { k: 'retries', label: 'sRetries', opts: function () { return [[0, '0'], [3, '3'], [10, '10'], [-1, t('vUnlimited')]]; } },
      { k: 'timeout', label: 'sTimeout', help: 'hTimeout', opts: function () { return [10, 15, 30, 60].map(function (v) { return [v, t('seconds', v)]; }).concat([[0, t('vOff')]]); } },
      { k: 'audioLang', label: 'sAudioLang', help: 'hAudioLang', opts: function () { return [['auto', t('vAuto')], ['ru', 'Русский'], ['uk', 'Українська'], ['de', 'Deutsch'], ['en', 'English'], ['pl', 'Polski'], ['tr', 'Türkçe'], ['es', 'Español'], ['fr', 'Français'], ['it', 'Italiano'], ['ro', 'Română'], ['pt', 'Português'], ['nl', 'Nederlands'], ['cs', 'Čeština'], ['sk', 'Slovenčina'], ['hu', 'Magyar'], ['bg', 'Български'], ['el', 'Ελληνικά'], ['lt', 'Lietuvių'], ['lv', 'Latviešu'], ['et', 'Eesti'], ['kk', 'Қазақша'], ['be', 'Беларуская']]; } },
      { k: 'subtitles', label: 'sSubtitles', opts: yn },
      { k: 'startScreen', label: 'sStartScreen', opts: function () { return tr([['play', 'vStartPlay'], ['list', 'vStartList']]); } },
      { id: 'sleep', label: 'sSleep', getv: function () { return S.sleepMin; }, setv: setSleep,
        opts: function () { return [[0, t('vOff')]].concat([15, 30, 60, 90, 120, 180].map(function (v) { return [v, t('minutes', v)]; })); } }
    ] },
    { id: 'epg', label: 'catEpg', items: [
      { k: 'epgMode', label: 'sEpgMode', opts: function () { return tr([['full', 'vEpgFull'], ['compact', 'vEpgCompact'], ['playlist', 'vEpgPlaylist'], ['custom', 'vEpgCustom'], ['off', 'vOff']]); } },
      { k: 'epg', type: 'text', label: 'sEpgUrl', when: function () { return get('epgMode') === 'custom'; }, dep: ['epgMode', 'custom'] },
      { k: 'epgShift', label: 'sEpgShift', opts: function () { var o = []; for (var h = -12; h <= 12; h++) o.push([h, t('hours', (h > 0 ? '+' : '') + h)]); return o; } },
      { k: 'epgRefresh', label: 'sEpgRefresh', opts: function () { return [6, 12, 24].map(function (v) { return [v, t('hours', v)]; }); } },
      { k: 'catchup', label: 'sCatchup', help: 'hCatchup', opts: function () { return [['auto', t('vAuto')], ['shift', 'Shift (utc/lutc)'], ['flussonic', 'Flussonic']]; } },
      { k: 'seekStep', label: 'sSeek', opts: function () { return [1, 2, 5, 10].map(function (v) { return [v, t('minutes', v)]; }); } },
      { k: 'archiveOffset', label: 'sArchiveOffset', help: 'hArchiveOffset', opts: function () { return [[0, t('vOff')]].concat([1, 2, 5, 10].map(function (v) { return [v, t('minutes', v)]; })); } },
      { id: 'clearEpg', type: 'act', label: 'sClearEpg', help: 'hClearEpg', run: actClearEpg }
    ] },
    { id: 'parental', label: 'catParental', items: [
      { k: 'adult', label: 'sAdult', help: 'hAdult', opts: function () { return tr([['show', 'vShow'], ['lock', 'vLock'], ['hide', 'vHide']]); } },
      { k: 'pin', type: 'text', label: 'sPin', help: 'hPin', digits: true },
      { k: 'protectSettings', label: 'sProtect', help: 'hProtect', opts: yn }
    ] },
    { id: 'remote', label: 'catRemote', items: [
      { id: 'qr', type: 'act', label: 'sRemoteQr', help: 'hRemoteQr', primary: true, run: openQr, when: function () { return Platform.phoneSetup; } },
      { id: 'backupTv', type: 'act', label: 'sBackupTv', help: 'hBackupTv', run: actBackupTv, value: backupInfo },
      { id: 'restoreTv', type: 'act', label: 'sRestoreTv', help: 'hRestoreTv', confirm: true, run: actRestoreTv, when: function () { return !!load('backup', null); } },
      { id: 'backupPhone', type: 'act', label: 'sBackupPhone', help: 'hBackupPhone', run: openQr, when: function () { return Platform.phoneSetup; } }
    ] },
    { id: 'sys', label: 'catSystem', items: [
      { id: 'autostart', label: 'sAutostart', help: Platform.name === 'android' ? 'hAutostartA' : 'hAutostart', when: function () { return Platform.autostart; }, opts: yn, getv: function () { return S.autostart ? 1 : 0; }, setv: setAutostart },
      { id: 'reload', type: 'act', label: 'sReload', run: actLoadList, when: isConfigured },
      { id: 'resetFavs', type: 'act', label: 'sResetFavs', confirm: true, run: actResetFavs },
      { id: 'resetAll', type: 'act', label: 'sResetAll', confirm: true, run: actResetAll },
      { id: 'version', type: 'info', label: 'sVersion', value: function () { return VERSION + '  ·  ' + Platform.label; } }
    ] }
  ];

  function catItems(ci) {
    return CATS[ci].items.filter(function (it) { return !it.when || it.when(); });
  }
  function itemValue(it) { return it.getv ? it.getv() : get(it.k); }
  function optIndex(opts, v) { for (var i = 0; i < opts.length; i++) if (String(opts[i][0]) === String(v)) return i; return 0; }

  function displayValue(it) {
    if (it.type === 'act') return '';
    if (it.type === 'info') return it.value();
    if (it.type === 'text') {
      var v = String(get(it.k) || '');
      if (it.mask && v.length > 8) return v.substring(0, 4) + '••••••' + v.substring(v.length - 4);
      if (it.digits) return v ? '••••' : '';
      return v || '—';
    }
    var o = it.opts(); return o[optIndex(o, itemValue(it))][1];
  }

  // ---------- Einstellungen: Anzeige & Steuerung ----------
  // ---------- Autostart beim Einschalten (gerooteter TV mit Homebrew Channel) ----------
  var AUTOSTART_FILE = '/var/lib/webosbrew/init.d/50-iptvplayer-autostart';
  var AUTOSTART_SCRIPT = "#!/bin/sh\n# IPTVPlayer: App beim Einschalten des Fernsehers starten. Angelegt von der App (Einstellungen > System > Autostart).\nAPP=com.iptvplayer.app\nPIDF=/tmp/iptvplayer-autostart.pid\n# Dienstpfad geteilt, damit \"pkill -f\" nur luna-send trifft und nicht die Shell, die dieses Skript enthält\nPWR=tvpower/power\nlaunch() { luna-send -n 1 luna://com.webos.applicationManager/launch \"{\\\"id\\\":\\\"$APP\\\"}\" >/dev/null 2>&1; }\nwatch_power() {\n  if [ \"$1\" != now ]; then sleep 20; launch; fi\n  prev=Active\n  luna-send -i \"luna://com.webos.service.$PWR/getPowerState\" '{\"subscribe\":true}' 2>/dev/null | while read -r line; do\n    if echo \"$line\" | grep -qE '\"state\" ?: ?\"Active\"'; then st=Active\n    elif echo \"$line\" | grep -q '\"state\"'; then st=Other\n    else continue; fi\n    if [ \"$st\" = Active ] && [ \"$prev\" != Active ]; then sleep 3; launch; fi\n    prev=$st\n  done\n}\n[ -f \"$PIDF\" ] && kill \"$(cat \"$PIDF\")\" 2>/dev/null\npkill -f '[t]vpower/power/getPowerState' 2>/dev/null\nwatch_power \"$1\" </dev/null >/dev/null 2>&1 &\necho $! > \"$PIDF\"\n";
  S.bridges = [];
  /** einzelner Luna-Aufruf über die webOS-Brücke */
  function luna(uri, params, cb) {
    if (!window.PalmServiceBridge) { cb({ returnValue: false, errorText: 'no webOS' }); return; }
    var b = new window.PalmServiceBridge(), done = false;
    S.bridges.push(b);
    var fin = function (r) { if (done) return; done = true; S.bridges.splice(S.bridges.indexOf(b), 1); cb(r); };
    b.onservicecallback = function (m) { var r; try { r = JSON.parse(m); } catch (e) { r = { returnValue: false, errorText: String(m) }; } fin(r); };
    try { b.call(uri, JSON.stringify(params || {})); } catch (e) { fin({ returnValue: false, errorText: e.message }); }
    setTimeout(function () { fin({ returnValue: false, errorText: 'timeout' }); }, 15000);
  }
  /** Befehl als root über den Dienst des Homebrew Channels */
  function rootExec(cmd, cb) {
    luna('luna://org.webosbrew.hbchannel.service/exec', { command: cmd }, function (r) {
      cb(r && r.returnValue ? null : new Error((r && (r.errorText || r.stderrString)) || 'exec'), r ? String(r.stdoutString || '') : '');
    });
  }
  function checkAutostart() {
    if (Platform.name === 'android') {
      var a = Platform.androidAutostart() === 'on';
      if (a !== !!S.autostart) { S.autostart = a; save('autostart', a); if (S.mode === 'settings') renderSettings(); }
      return;
    }
    rootExec('test -f ' + AUTOSTART_FILE + ' && echo on || echo off', function (err, out) {
      if (err) return;
      var on = out.indexOf('on') >= 0;
      if (on !== !!S.autostart) { S.autostart = on; save('autostart', on); if (S.mode === 'settings') renderSettings(); }
    });
  }
  function setAutostart(v) {
    var on = !!+v;
    if (Platform.name === 'android') {
      var r = Platform.androidAutostart(on);
      if (r === 'perm') { toast(t('autostartPerm'), 10000); Platform.openAutostartPermission(); return; }
      if (r !== (on ? 'on' : 'off')) { toast(t('autostartFail') + ' [' + r + ']', 8000); return; }
      S.autostart = on; save('autostart', on);
      toast(t(on ? 'autostartOn' : 'autostartOff'), 4000);
      if (S.mode === 'settings') renderSettings();
      return;
    }
    var cmd = on
      ? "mkdir -p /var/lib/webosbrew/init.d && cat > " + AUTOSTART_FILE + " <<'IPTVEOF'\n" + AUTOSTART_SCRIPT + "IPTVEOF\n" +
        'chmod 755 ' + AUTOSTART_FILE + ' && sh ' + AUTOSTART_FILE + ' now </dev/null >/dev/null 2>&1; test -f ' + AUTOSTART_FILE + ' && echo on'
      : '[ -f /tmp/iptvplayer-autostart.pid ] && kill $(cat /tmp/iptvplayer-autostart.pid) 2>/dev/null; pkill -f \'[t]vpower/power/getPowerState\' 2>/dev/null; ' +
        'rm -f ' + AUTOSTART_FILE + ' /tmp/iptvplayer-autostart.pid; test -f ' + AUTOSTART_FILE + ' || echo off';
    toast('…', 8000);
    var ok = function () {
      S.autostart = on; save('autostart', on);
      toast(t(on ? 'autostartOn' : 'autostartOff'), 4000);
      if (S.mode === 'settings') renderSettings();
    };
    rootExec(cmd, function (err, out) {
      if (!err && out.indexOf(on ? 'on' : 'off') >= 0) {
        // mit Root: eine evtl. früher angelegte Developer-Mode-Aktivität entfernen, damit nichts doppelt startet
        devAutostart(false, function () {}); ok(); return;
      }
      // ohne Root (Developer Mode): dauerhafte Aktivität im Activity Manager
      devAutostart(on, function (err2) {
        if (!err2) { ok(); return; }
        var why = (err ? err.message : (out || '').trim()) + ' / ' + err2;
        toast(t('autostartFail') + ' [' + why.slice(0, 160) + ']', 10000);
      });
    });
  }

  // ---------- Autostart ohne Root (Developer Mode) ----------
  // Der eigene JS-Dienst legt eine dauerhafte Aktivität (persist) im Activity Manager an, die beim Hochfahren
  // wieder den Dienst aufruft; der Dienst startet dann die App. Die App selbst darf bootManager/applicationManager
  // nicht als Trigger/Callback eintragen ("doesn't have rights to call callback/trigger").
  function devAutostart(on, cb) {
    if (!window.PalmServiceBridge) { cb('no webOS'); return; }
    luna('luna://com.iptvplayer.app.service/setAutostart', { on: !!on }, function (r) {
      cb(r && r.returnValue ? null : String((r && (r.errorText || r.errorCode)) || 'error'));
    });
  }

  function openSettings(cat) {
    if (+get('protectSettings') && !S.unlocked && isConfigured()) { askPin(function (ok) { if (ok) openSettings(cat); }); return; }
    S.mode = 'settings';
    S.set.focus = isConfigured() ? 'cats' : 'rows';
    S.set.ci = cat !== undefined ? cat : (isConfigured() ? S.set.ci : 0);
    S.set.ri = isConfigured() ? 0 : 1;
    S.set.editing = null; S.set.confirm = null;
    show('list', false); show('epg', false); show('vod', false); hideInfo(); show('settings', true);
    renderSettings(); updateClock();
  }

  function renderSettings() {
    if (S.set.editing) return; // Eingabe läuft, nicht neu zeichnen
    var st = S.set;
    show('set-welcome', !isConfigured());
    $('set-welcome').textContent = t('welcome');
    $('set-cats').parentNode.classList[st.focus === 'cats' ? 'add' : 'remove']('active');
    $('set-rows').parentNode.classList[st.focus === 'rows' ? 'add' : 'remove']('active');
    renderRows($('set-cats'), CATS.length, st.ci, function (i, sel) {
      return '<div class="row cat' + (sel ? ' sel' : '') + (i === st.ci ? ' cur' : '') + '"><span class="ico"><svg viewBox="0 0 24 24">' +
        ICON[CATS[i].id] + '</svg></span><span class="t">' + esc(t(CATS[i].label)) + '</span></div>';
    });
    var items = catItems(st.ci);
    if (st.ri >= items.length) st.ri = items.length - 1;
    var selRow = st.focus === 'rows' ? st.ri : -1;
    renderRows($('set-rows'), items.length, Math.max(0, selRow), function (i) {
      var it = items[i], sel = i === selRow;
      var cls = 'row opt' + (sel ? ' sel' : '') + (it.type === 'act' ? ' action' + (it.primary ? ' primary' : '') : '');
      var val = '';
      if (it.type === 'act') val = sel && st.confirm === it.id ? '<span>' + esc(t('confirm')) + '</span>' : (it.value ? '<span>' + esc(it.value()) + '</span>' : '') + '<span class="arr">›</span>';
      else if (it.type === 'text') val = '<span>' + esc(displayValue(it)) + '</span><span class="arr">✎</span>';
      else if (it.type === 'info') val = '<span>' + esc(displayValue(it)) + '</span>';
      else val = (it.swatch ? '<span class="swatch" style="background:' + ACCENTS[itemValue(it)] + '"></span>' : '') +
        '<span class="arr">‹</span><span>' + esc(displayValue(it)) + '</span><span class="arr">›</span>';
      return '<div class="' + cls + '"><span class="lbl">' + esc(t(it.label)) + '</span><span class="val">' + val + '</span></div>';
    });
    var cur = items[st.ri];
    $('set-help').textContent = st.focus === 'rows' && cur && cur.help ? t(cur.help) : '';
  }

  function startEdit(it) {
    S.set.editing = it.k;
    var rows = $('set-rows').querySelectorAll('.opt.sel .val');
    if (!rows.length) return;
    rows[0].innerHTML = '<input id="set-input" type="' + (it.digits ? 'tel' : 'text') + '" spellcheck="false" autocomplete="off" maxlength="' + (it.digits ? 4 : 2000) + '">';
    var inp = $('set-input');
    inp.value = get(it.k) || '';
    inp.focus();
  }

  function finishEdit(commit) {
    var k = S.set.editing, inp = $('set-input');
    S.set.editing = null;
    if (commit && inp) {
      var v = inp.value.trim();
      if (k === 'key') v = v.replace(/\s+/g, '');
      if (k === 'domain') v = normDomain(v);
      if (k === 'pin') v = /^\d{4}$/.test(v) ? v : get('pin');
      if (v !== get(k)) setVal(k, v);
    }
    if (inp) inp.blur();
    renderSettings();
  }

  function changeOpt(it, dir) {
    var o = it.opts(), i = optIndex(o, itemValue(it));
    var v = o[(i + dir + o.length) % o.length][0];
    if (it.setv) it.setv(v); else setVal(it.k, v);
  }

  function enterCat() {
    if (CATS[S.set.ci].id === 'sys') checkAutostart();
    var c = CATS[S.set.ci];
    var go = function () { S.set.focus = 'rows'; S.set.ri = 0; renderSettings(); };
    if (c.id === 'parental' && get('adult') !== 'show' && !S.unlocked) askPin(function (ok) { if (ok) go(); });
    else go();
  }

  function settingsKey(k, ev) {
    var st = S.set;
    if (st.editing) {
      // Eingabe läuft über die Bildschirmtastatur; nur OK/Zurück/Hoch/Runter abfangen
      if (k === KEY.ENTER || k === KEY.UP || k === KEY.DOWN) { ev.preventDefault(); finishEdit(true); }
      else if (k === KEY.BACK || k === KEY.ESC) { ev.preventDefault(); finishEdit(false); }
      return;
    }
    ev.preventDefault();
    var back = k === KEY.BACK || k === KEY.ESC || k === KEY.BACKSPACE;
    if (st.focus === 'cats') {
      if (k === KEY.UP) st.ci = (st.ci - 1 + CATS.length) % CATS.length;
      else if (k === KEY.DOWN) st.ci = (st.ci + 1) % CATS.length;
      else if (k === KEY.RIGHT || k === KEY.ENTER) return enterCat();
      else if (back) { if (S.channels.length) closePanels(); return; }
      else return;
      renderSettings(); return;
    }
    var items = catItems(st.ci), it = items[st.ri];
    if (k !== KEY.ENTER) st.confirm = null;
    if (k === KEY.UP) st.ri = Math.max(0, st.ri - 1);
    else if (k === KEY.DOWN) st.ri = Math.min(items.length - 1, st.ri + 1);
    else if (back) st.focus = 'cats';
    else if ((k === KEY.LEFT || k === KEY.RIGHT) && it && it.opts) changeOpt(it, k === KEY.LEFT ? -1 : 1);
    else if (k === KEY.LEFT) st.focus = 'cats';
    else if (k === KEY.ENTER && it) {
      if (it.type === 'text') return startEdit(it);
      if (it.type === 'act') {
        if (it.confirm && st.confirm !== it.id) { st.confirm = it.id; renderSettings(); return; }
        st.confirm = null; it.run(); return;
      }
      if (it.opts) changeOpt(it, 1);
    } else return;
    renderSettings();
  }

  // ---------- Einstellungen: Wirkung ----------
  function applySetting(k) {
    switch (k) {
      case 'lang': I18N.set(get('lang') || I18N.detect()); translateStatic(); rerender(); break;
      case 'vod': V.url = ''; V.items = []; if (S.channels.length) buildGroups(); break;
      case 'accent':
        var hex = ACCENTS[get('accent')] || ACCENTS.blue, n = parseInt(hex.substring(1), 16);
        document.documentElement.style.setProperty('--accent', hex);
        document.documentElement.style.setProperty('--accent-rgb', (n >> 16) + ',' + ((n >> 8) & 255) + ',' + (n & 255));
        break;
      case 'scale': document.documentElement.style.setProperty('--scale', (+get('scale') || 100) / 100); break;
      case 'clock': case 'timeFmt': updateClock(); break;
      case 'sort': case 'adult': if (S.channels.length) buildGroups(); break;
      case 'panelBg': document.body.classList[get('panelBg') === 'glass' ? 'add' : 'remove']('glass'); break;
      case 'anim': document.body.classList[+get('anim') ? 'remove' : 'add']('no-anim'); break;
      case 'groupCounts': document.body.classList[+get('groupCounts') ? 'remove' : 'add']('no-counts'); break;
      case 'groupArchive': case 'groupHistory': case 'showHidden': if (S.channels.length) { buildGroups(); S.ci = 0; } break;
      case 'infoPos': document.body.classList[get('infoPos') === 'top' ? 'add' : 'remove']('info-top'); break;
      case 'plRefresh': armPlRefresh(); break;
      case 'engine': case 'buffer': case 'retries': case 'timeout': case 'audioLang': case 'subtitles':
        Player.configure({ engine: get('engine'), buffer: +get('buffer'), retries: +get('retries'), timeout: +get('timeout'), audioLang: get('audioLang'), subtitles: +get('subtitles') });
        if (k === 'timeout' || k === 'audioLang' || k === 'subtitles') break;
        if (k === 'engine' && S.current) { if (S.archive) archiveSeek(0); else Player.start(S.current.url); }
        break;
      case 'aspect': applyAspect(); break;
      case 'epgMode': case 'epg': loadEpg(); break;
      case 'epgRefresh': armEpgRefresh(); break;
    }
  }
  function applyAll() {
    ['lang', 'accent', 'scale', 'engine', 'aspect', 'panelBg', 'anim', 'groupCounts', 'infoPos'].forEach(applySetting);
    armEpgRefresh(); armPlRefresh();
  }
  function rerender() {
    if (S.mode === 'list') renderList();
    else if (S.mode === 'epg') buildEpgDay(false);
    else if (S.mode === 'settings') renderSettings();
    else if (S.mode === 'vod') renderVod();
    if (visible('infobar')) renderInfo();
    updateClock();
  }

  function setSleep(min) {
    S.sleepMin = min;
    clearTimeout(S.sleepTimer);
    if (min > 0) {
      toast(t('sleepSet', min), 2000);
      S.sleepTimer = setTimeout(function () {
        Player.stop(); S.sleepMin = 0; closePanels(); hideInfo();
        $('sleep-msg').textContent = t('sleepEnd'); show('sleep', true); S.modal = 'sleep';
      }, min * 60000);
    }
  }

  // ---------- Aktionen ----------
  function startChannel() {
    var list = S.groups[0] ? S.groups[0].items : S.channels, ch = null, i;
    var mode = get('start');
    if (mode === 'last') { var last = load('last', ''); for (i = 0; i < S.channels.length; i++) if (chKey(S.channels[i]) === last) ch = S.channels[i]; }
    if (mode === 'fav' && S.groups[1] && S.groups[1].items.length) ch = S.groups[1].items[0];
    if (ch && get('adult') !== 'show' && isAdult(ch)) ch = null;
    return ch || list[0];
  }

  function actLoadList() {
    if (get('source') === 'edem' && (!get('key') || !get('domain'))) { toast(t('needKey')); return; }
    if (get('source') === 'url' && !get('playlist')) { toast(t('needUrl')); return; }
    toast(t('loadingList'), 20000);
    loadPlaylist(function (err) {
      if (err) { toast(t('errorX', err.message), 6000); return; }
      closePanels();
      toast(t('chLoaded', S.channels.length));
      play(startChannel());
    });
  }
  function actClearEpg() {
    EPG.clearCache(function () { toast(t('cacheCleared')); loadEpg(true); });
  }
  function actResetFavs() {
    S.favs = {}; save('favs', S.favs); if (S.channels.length) buildGroups(); toast(t('favsCleared')); renderSettings();
  }
  function actResetAll() {
    try { ['settings', 'favs', 'last', 'hiddenGroups', 'history'].forEach(function (k) { localStorage.removeItem(k); }); } catch (e) {}
    EPG.clearCache(function () { toast(t('resetDone')); setTimeout(function () { location.reload(); }, 800); });
  }

  // ---------- Sicherung auf dem Fernseher ----------
  function backupData() { return { app: 'iptvplayer', v: 1, date: new Date().toISOString(), settings: S.settings, favs: S.favs }; }
  function backupInfo() {
    var b = load('backup', null); if (!b || !b.date) return t('noBackup');
    var d = new Date(b.date);
    return pad(d.getDate()) + '.' + pad(d.getMonth() + 1) + '.' + d.getFullYear() + '  ' + hm(Math.floor(d.getTime() / 1000));
  }
  function actBackupTv() { save('backup', backupData()); toast(t('backupSaved')); renderSettings(); }
  function actRestoreTv() {
    var b = load('backup', null);
    if (!b) { toast(t('noBackup')); return; }
    restoreBackup(b);
  }
  /** Sicherung übernehmen (vom TV oder vom Handy) und App neu starten */
  function restoreBackup(b) {
    if (!b || (b.app !== 'iptvplayer' && b.app !== 'edemtv') || !b.settings || typeof b.settings !== 'object') { toast(t('errorX', 'backup')); return false; }
    var st = {}, fv = {};
    Object.keys(DEFAULTS).forEach(function (k) {
      var v = b.settings[k];
      if (v !== undefined && v !== null && typeof v !== 'object') st[k] = v;
    });
    if (b.favs && typeof b.favs === 'object') Object.keys(b.favs).forEach(function (k) { if (b.favs[k]) fv[k] = +b.favs[k] > 0 ? +b.favs[k] : 1; });
    save('settings', st); save('favs', fv);
    toast(t('remoteRestored'), 3000);
    setTimeout(function () { location.reload(); }, 1500);
    return true;
  }

  // ---------- Einrichtung per Smartphone (QR-Code) ----------
  // Ein webOS-Hintergrunddienst (service/) öffnet einen kleinen Web-Server im WLAN.
  // Die App spricht ihn über 127.0.0.1 an; das Handy über die TV-IP + Token aus dem QR-Code.
  var SERVICE = 'com.iptvplayer.app.service', SERVICE_PORTS = [8765, 8766, 8767, 8768];
  var R = { port: 0, info: null, since: 0, polling: false, pushTimer: null, bridge: null };

  function xhr(method, url, body, cb, timeout) {
    var x = new XMLHttpRequest();
    x.open(method, url);
    x.timeout = timeout || 6000;
    x.onload = function () { var r = null; try { r = JSON.parse(x.responseText); } catch (e) {} cb(x.status === 200 ? null : (x.status || 'err'), r); };
    x.onerror = x.ontimeout = function () { cb('network'); };
    // text/plain vermeidet den CORS-Preflight
    if (body) { x.setRequestHeader('Content-Type', 'text/plain'); x.send(JSON.stringify(body)); } else x.send();
  }

  /** Dienst über Luna starten und per Abo am Leben halten (nur auf dem Fernseher) */
  function lunaStart(cb) {
    if (Platform.name === 'android') { Platform.startPhoneServer(); return setTimeout(cb, 300); }
    if (!window.PalmServiceBridge) return cb();
    var done = false, fin = function () { if (!done) { done = true; cb(); } };
    try {
      if (!R.bridge) {
        R.bridge = new window.PalmServiceBridge();
        R.bridge.onservicecallback = function () { fin(); };
        R.bridge.call('luna://' + SERVICE + '/start', JSON.stringify({ subscribe: true }));
      } else fin();
    } catch (e) { fin(); }
    setTimeout(fin, 8000);
  }

  function findPort(i, cb) {
    if (i >= SERVICE_PORTS.length) return cb('no service');
    xhr('GET', 'http://127.0.0.1:' + SERVICE_PORTS[i] + '/api/hello', null, function (err, r) {
      if (!err && r && r.token) { R.port = SERVICE_PORTS[i]; R.info = r; R.since = r.last || 0; return cb(null); }
      findPort(i + 1, cb);
    }, 2500);
  }

  function remoteEnsure(cb) {
    if (R.port) return remoteSendState(cb);
    lunaStart(function () {
      var tries = 0;
      (function attempt() {
        findPort(0, function (err) {
          if (err) { if (++tries < 4) return setTimeout(attempt, 1200); return cb(err); }
          remoteSendState(cb);
          if (!R.polling) remotePoll();
        });
      })();
    });
  }

  /** Formular-Beschreibung fürs Handy, direkt aus den TV-Einstellungen abgeleitet */
  function remoteSchema() {
    var out = [];
    CATS.forEach(function (cat) {
      if (cat.id === 'sys' || cat.id === 'remote') return;
      var items = [];
      cat.items.forEach(function (it) {
        if (!it.k || it.type === 'act' || it.type === 'info' || it.getv) return;
        items.push({
          k: it.k, label: t(it.label), help: it.help ? t(it.help) : '',
          type: it.type === 'text' ? 'text' : 'sel', digits: !!it.digits, secret: !!it.mask,
          parental: cat.id === 'parental', dep: it.dep || null,
          opts: it.opts ? it.opts().map(function (o) { return [String(o[0]), String(o[1])]; }) : null
        });
      });
      if (items.length) out.push({ id: cat.id, label: t(cat.label), parental: cat.id === 'parental', items: items });
    });
    return out;
  }

  function remoteState() {
    var ui = { lang: I18N.get(), accent: ACCENTS[get('accent')] || ACCENTS.blue, pinAll: !!+get('protectSettings') };
    ['wTitle', 'wSave', 'wSaved', 'wDownload', 'wUpload', 'wBackup', 'wBackupHelp', 'wPin', 'wErr', 'wRestored', 'wFavs'].forEach(function (k) { ui[k] = t(k); });
    var schema = remoteSchema(), vals = {};
    schema.forEach(function (c) { c.items.forEach(function (it) { var v = get(it.k); vals[it.k] = v === undefined || v === null ? '' : String(v); }); });
    vals.pin = ''; // PIN wird im Formular nie angezeigt
    return { ui: ui, schema: schema, settings: vals, favs: S.favs, title: 'IPTVPlayer ' + VERSION, backup: backupData() };
  }

  function remoteSendState(cb) {
    if (!R.port) { if (cb) cb('no service'); return; }
    xhr('POST', 'http://127.0.0.1:' + R.port + '/api/state', remoteState(), function (err, r) {
      if (!err && r) R.info = r;
      if (cb) cb(err);
    });
  }

  function remotePush() {
    if (!R.port) return;
    clearTimeout(R.pushTimer);
    R.pushTimer = setTimeout(function () { remoteSendState(); }, 600);
  }

  function remotePoll() {
    if (!R.port) { R.polling = false; return; }
    R.polling = true;
    xhr('GET', 'http://127.0.0.1:' + R.port + '/api/wait?since=' + R.since, null, function (err, r) {
      if (err || !r) { setTimeout(remotePoll, 8000); return; }
      (r.events || []).forEach(function (e) { if (e.id > R.since) { R.since = e.id; remoteEvent(e); } });
      if (r.last > R.since) R.since = r.last;
      remotePoll();
    }, 35000);
  }

  function normText(k, v) {
    v = String(v === undefined || v === null ? '' : v).trim();
    if (k === 'key') v = v.replace(/\s+/g, '');
    if (k === 'domain') v = normDomain(v);
    if (k === 'pin' && !/^\d{4}$/.test(v)) return null;
    return v;
  }

  /** Änderungen vom Handy prüfen und übernehmen */
  function remoteEvent(e) {
    if (e.type === 'restore') { restoreBackup(e.data); return; }
    if (e.type !== 'apply' || !e.data || typeof e.data.settings !== 'object') return;
    var defs = {}, changed = [], pinFail = false;
    CATS.forEach(function (c) { c.items.forEach(function (it) { if (it.k && !it.getv && it.type !== 'act' && it.type !== 'info') defs[it.k] = { it: it, parental: c.id === 'parental' }; }); });
    Object.keys(e.data.settings).forEach(function (k) {
      var d = defs[k]; if (!d) return;
      var v = e.data.settings[k];
      if ((d.parental || +get('protectSettings')) && String(e.data.pin || '') !== String(get('pin'))) { pinFail = true; return; }
      if (d.it.type === 'text') { v = normText(k, v); if (v === null) return; }
      else {
        var hit = null; d.it.opts().forEach(function (o) { if (String(o[0]) === String(v)) hit = o; });
        if (!hit) return; v = hit[0];
      }
      if (String(v) !== String(get(k))) { setVal(k, v); changed.push(k); }
    });
    var msg = pinFail ? t('pinRemote') : t('remoteApplied');
    toast(msg, pinFail ? 5000 : 3000);
    if (visible('qr')) $('qr-status').textContent = (pinFail ? '⚠ ' : '✓ ') + msg;
    rerender();
    var reload = changed.some(function (k) { return ['source', 'key', 'domain', 'playlist'].indexOf(k) >= 0; });
    if (reload && isConfigured()) {
      loadPlaylist(function (err) {
        if (err) { toast(t('errorX', err.message), 6000); return; }
        toast(t('chLoaded', S.channels.length));
        if (S.mode === 'settings' && !visible('qr')) closePanels();
        play(startChannel());
      });
    }
  }

  function openQr() {
    S.modal = 'qr';
    $('qr-img').innerHTML = '<div class="ring"></div>';
    $('qr-url').textContent = '';
    $('qr-status').textContent = t('qrStarting');
    show('qr', true);
    remoteEnsure(function (err) {
      if (S.modal !== 'qr') return;
      var ip = R.info && R.info.ips && R.info.ips[0];
      if (err || !ip) { $('qr-img').innerHTML = '<div class="qr-fail">!</div>'; $('qr-status').textContent = t('qrNoService'); return; }
      var url = 'http://' + ip + ':' + R.info.port + '/?t=' + R.info.token;
      var q = qrcode(0, 'M'); q.addData(url); q.make();
      $('qr-img').innerHTML = q.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
      $('qr-url').textContent = 'http://' + ip + ':' + R.info.port;
      $('qr-status').textContent = '';
    });
  }
  function closeQr() { S.modal = null; show('qr', false); }

  // ---------- Zifferneingabe ----------
  function numKey(d) {
    if (S.numBuf.length >= 4) return;
    S.numBuf += d;
    $('numinput').textContent = S.numBuf; show('numinput', true);
    clearTimeout(S.numTimer);
    S.numTimer = setTimeout(function () {
      var n = parseInt(S.numBuf, 10); S.numBuf = ''; show('numinput', false);
      var ch = null;
      for (var i = 0; i < S.visible.length; i++) if (S.visible[i].num === n) { ch = S.visible[i]; break; }
      if (ch) { if (S.mode !== 'player') closePanels(); play(ch); }
      else toast(t('chNotFound', n), 1500);
    }, (+get('numDelay') || 1.5) * 1000);
  }

  // ---------- Player-Tasten ----------
  function playerKey(k) {
    if (S.vod) return vodPlayerKey(k);
    if (!S.channels.length) { openSettings(); return; }
    if (k >= 48 && k <= 57) return numKey(String(k - 48));
    if (k >= 96 && k <= 105) return numKey(String(k - 96));
    var step = (+get('seekStep') || 5) * 60;
    switch (k) {
      case KEY.ENTER:
        if (get('okAction') === 'info') { if (visible('infobar')) hideInfo(); else showInfo(); } else openList();
        break;
      case KEY.UP: zap(-1); break;
      case KEY.DOWN: zap(1); break;
      case KEY.CH_UP: zap(-1); break;
      case KEY.CH_DOWN: zap(1); break;
      case KEY.LEFT: if (S.archive) archiveSeek(-step); else showInfo(); break;
      case KEY.RIGHT: if (S.archive) archiveSeek(step); else showInfo(); break;
      case KEY.RW: if (S.archive) archiveSeek(-1800); else if (S.current && S.current.catchupDays) openEpg(S.current); break;
      case KEY.FF: if (S.archive) archiveSeek(1800); break;
      case KEY.GREEN: if (S.current) openEpg(S.current); break;
      case KEY.YELLOW: toggleFav(S.current); break;
      case KEY.BLUE: openSettings(); break;
      case KEY.RED: if (S.prev) play(S.prev); break;
      case KEY.INFO: if (visible('infobar')) hideInfo(); else showInfo(); break;
      case KEY.PLAY: case KEY.PAUSE: case KEY.PLAYPAUSE:
        if (S.archive) toast(Player.togglePause() ? t('paused') : t('resumed'), 1200);
        break;
      case KEY.STOP: if (S.archive) play(S.current); break;
      case KEY.BACK: case KEY.ESC: case KEY.BACKSPACE:
        if (visible('infobar')) hideInfo();
        else if (S.archive) { play(S.current); toast(t('backLive'), 1500); }
        else if (Platform.canExit && k === KEY.BACK) {
          if (Date.now() - (S.backArmed || 0) < 2500) Platform.exit();
          else { S.backArmed = Date.now(); toast(t('exitHint'), 2500); }
        }
        else openList();
        break;
    }
  }

  window.addEventListener('resize', function () { placeVideo(); });
  /** Langes Drücken von OK in den Favoriten startet das Verschieben; kurzes Drücken wirkt beim Loslassen */
  function favLongPress() {
    var g = S.groups[S.gi];
    return S.mode === 'list' && !S.modal && !S.moving && S.focus === 'channels' && g && g.id === 'fav' && g.items.length > 1;
  }
  function onKeyDown(ev) {
    var k = Platform.mapKey(ev.keyCode);
    if (k === KEY.ENTER && (S.okDown || favLongPress())) {
      ev.preventDefault();
      if (S.okDown) return; // Wiederholung beim Gedrückthalten
      S.okDown = Date.now();
      S.okTimer = setTimeout(function () { S.okTimer = null; startMove(); }, 700);
      return;
    }
    if (S.modal === 'pin') { ev.preventDefault(); return pinKey(k); }
    if (S.modal === 'qr') { ev.preventDefault(); if (k === KEY.BACK || k === KEY.ESC || k === KEY.BACKSPACE || k === KEY.ENTER) closeQr(); return; }
    if (S.modal === 'sleep') { ev.preventDefault(); show('sleep', false); S.modal = null; if (S.current) play(S.current); return; }
    if (S.mode === 'settings') return settingsKey(k, ev);
    if (k === KEY.BACK || k === KEY.BACKSPACE || (k >= 33 && k <= 40)) ev.preventDefault();
    if (S.mode === 'list') listKey(k);
    else if (S.mode === 'epg') epgKey(k);
    else if (S.mode === 'vod') vodKeyDown(k);
    else playerKey(k);
  }
  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('keyup', function (ev) {
    if (Platform.mapKey(ev.keyCode) !== KEY.ENTER || !S.okDown) return;
    S.okDown = 0;
    if (S.okTimer) { clearTimeout(S.okTimer); S.okTimer = null; if (S.mode === 'list') listKey(KEY.ENTER); }
  });
  window.IPTVKey = function (code) { onKeyDown({ keyCode: code, preventDefault: function () {} }); };

  // App im Hintergrund (Android: Home-Taste, Samsung: Multitasking): Stream anhalten, beim Zurückkehren neu laden
  window.IPTVSuspend = function () { if (S.vod) vodSavePos(); S.suspended = true; Player.stop(); };
  window.IPTVResume = function () {
    if (!S.suspended) return;
    S.suspended = false;
    if (S.vod) { var pp = vodPos()[vodKey(S.vod.item)]; Player.start(S.vod.item.url, false, pp ? pp.p : 0); return; }
    if (S.current && !V.resumeLive) { S.archive = null; S.previewing = null; Player.start(S.current.url); }
  };
  if (Platform.name === 'tizen') {
    document.addEventListener('visibilitychange', function () { if (document.hidden) window.IPTVSuspend(); else window.IPTVResume(); });
  }

  // Magic-Remote: Zeiger-Klick öffnet Liste
  function closestEl(el, sel) {
    while (el && el.nodeType === 1) {
      if ((el.matches || el.webkitMatchesSelector).call(el, sel)) return el;
      el = el.parentNode;
    }
    return null;
  }
  var NOEV = { preventDefault: function () {} };
  document.addEventListener('click', function (ev) {
    if (S.modal === 'qr') { closeQr(); return; }
    if (S.modal) return;
    var act = closestEl(ev.target, '[data-act]');
    if (act) {
      var a = act.getAttribute('data-act');
      if (a === 'settings' && S.mode !== 'settings') openSettings();
      else if (a === 'close' && (S.mode !== 'settings' || S.channels.length)) closePanels();
      else if (a === 'groups' && S.mode === 'list') { S.focus = 'groups'; renderList(); }
      else if (a === 'vodcats' && S.mode === 'vod') { V.focus = 'cats'; renderVod(); }
      return;
    }
    var row = closestEl(ev.target, '[data-i]');
    if (row && row.parentNode) {
      var i = +row.getAttribute('data-i'), box = row.parentNode.id, st = S.set;
      if (box === 'groups') { S.gi = i; S.ci = 0; if (S.groups[i] && S.groups[i].id === 'vod') { openVod(); return; } S.focus = 'channels'; renderList(); }
      else if (box === 'vod-cats') { V.ci = i; V.ii = 0; V.focus = 'cats'; vodKeyDown(KEY.ENTER); }
      else if (box === 'vod-items') { if (V.focus === 'items' && V.ii === i) vodKeyDown(KEY.ENTER); else { V.focus = 'items'; V.ii = i; renderVod(); } }
      else if (box === 'channels') { if (S.focus === 'channels' && S.ci === i) listKey(KEY.ENTER); else { S.focus = 'channels'; S.ci = i; renderList(); } }
      else if (box === 'set-cats' && !st.editing) { st.ci = i; st.focus = 'cats'; renderSettings(); enterCat(); }
      else if (box === 'set-rows' && !st.editing) {
        if (st.focus === 'rows' && st.ri === i) settingsKey(KEY.ENTER, NOEV);
        else { st.focus = 'rows'; st.ri = i; st.confirm = null; renderSettings(); }
      }
      return;
    }
    if (S.mode === 'player' && S.vod) { if (visible('infobar')) hideInfo(); else showInfo(); return; }
    if (S.mode === 'player' && S.channels.length) openList();
  });

  // Scrollrad der Magic Remote: bewegt die Auswahl in der Liste unter dem Zeiger
  document.addEventListener('wheel', function (ev) {
    if (S.modal) return;
    var box = closestEl(ev.target, '#groups, #channels, #set-cats, #set-rows, #epg-rows, #vod-cats, #vod-items');
    if (!box) return;
    if (ev.preventDefault) ev.preventDefault();
    var now = Date.now();
    if (now - (S.wheelT || 0) < 80) return;
    S.wheelT = now;
    var k = (ev.deltaY || 0) > 0 ? KEY.DOWN : KEY.UP;
    if (box.id === 'groups' || box.id === 'channels') {
      if (box.id === 'groups' && k === KEY.DOWN && S.gi >= S.groups.length - 1) return; // nicht auf den Knopf springen
      S.focus = box.id; listKey(k);
    } else if (box.id === 'vod-cats' || box.id === 'vod-items') {
      V.focus = box.id === 'vod-cats' ? 'cats' : 'items'; vodKeyDown(k);
    } else if (box.id === 'set-cats' || box.id === 'set-rows') {
      if (S.set.editing) return;
      S.set.focus = box.id === 'set-cats' ? 'cats' : 'rows'; settingsKey(k, NOEV);
    } else epgKey(k);
  });

  // ---------- Start ----------
  Platform.init();
  Player.init($('video'));
  Player.on('loading', function (on) { show('spinner', on); });
  Player.on('error', function () { toast(t('streamError')); });
  Player.on('ended', function () {
    if (S.vod) { exitVod(true); return true; }
    if (!S.archive) return false;
    var e = epgAt(S.current, S.archive.prog.e + 1), sh = shiftOf(S.current);
    if (e.now && e.now.s + sh < nowSec()) playArchive(S.current, { s: e.now.s + sh, e: e.now.e + sh, t: e.now.t, d: e.now.d });
    else play(S.current);
    return true;
  });

  setInterval(function () {
    if (visible('infobar')) renderInfo();
    if (S.vod) vodSavePos();
    updateClock();
  }, 15000);
  // Laufzeit im Film sekundengenau
  setInterval(function () { if (S.vod && visible('infobar')) renderVodInfo(); }, 1000);

  S.favs = load('favs', {});
  S.hiddenGroups = load('hiddenGroups', {});
  S.history = load('history', []);
  S.autostart = !!load('autostart', false);
  S.settings = load('settings', {});
  // Testmodus im Browser: index.html?playlist=URL
  var qm = /[?&]playlist=([^&]+)/.exec(location.search);
  if (qm && !isConfigured()) { S.settings.source = 'url'; S.settings.playlist = decodeURIComponent(qm[1]); }
  applyAll();
  translateStatic();

  if (!isConfigured()) {
    openSettings(0);
  } else {
    loadPlaylist(function (err) {
      if (err) { openSettings(0); toast(t('errorX', err.message), 6000); return; }
      play(startChannel());
      if (get('startScreen') === 'list') openList();
    });
  }

  // für Tests im Browser
  window.EdemApp = { state: S, get: get, set: setVal };
})();
