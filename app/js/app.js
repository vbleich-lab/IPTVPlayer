/* IPTVPlayer – webOS IPTV-App: Steuerung, Oberfläche, Einstellungen, Fernbedienung (ES5) */
(function () {
  'use strict';

  var VERSION = '2.12.0';
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
  var LANG_NAMES = [['ru', 'Русский'], ['uk', 'Українська'], ['de', 'Deutsch'], ['en', 'English'], ['pl', 'Polski'], ['tr', 'Türkçe'], ['es', 'Español'], ['fr', 'Français'], ['it', 'Italiano'], ['ro', 'Română'], ['pt', 'Português'], ['nl', 'Nederlands'], ['cs', 'Čeština'], ['sk', 'Slovenčina'], ['hu', 'Magyar'], ['bg', 'Български'], ['el', 'Ελληνικά'], ['lt', 'Lietuvių'], ['lv', 'Latviešu'], ['et', 'Eesti'], ['kk', 'Қазақша'], ['be', 'Беларуская']];
  // Schriftfarben (Einstellung „Schriftfarbe“); auto = Farbe des gewählten Designs
  var TEXTS = { white: '#ffffff', cream: '#f3e9d2', yellow: '#ffd75e', cyan: '#8fe3ff', green: '#9cf0a8', pink: '#ffb3d1', black: '#10141c' };
  var ADULT_RE = /взросл|дорос|adult|xxx|18\+|erot|эрот/i;

  var DEFAULTS = {
    source: 'edem', key: '', domain: '', playlist: '', vod: '',
    lang: '', theme: 'night', logoShape: 'rect', textColor: 'auto', groupIcons: 'tile', updateCheck: 1, splash: 1, accent: 'blue', scale: 100, clock: 'menus', timeFmt: '24', infoTimeout: 5,
    showLogos: 1, showNumbers: 1, showEpgList: 1, preview: 'live', sort: 'order', start: 'last', zapDir: 'normal', okAction: 'list', zapScope: 'group',
    engine: 'native', aspect: 'fit', buffer: 30, retries: 3,
    epgMode: 'full', epg: '', epgShift: 0, epgRefresh: 12, catchup: 'auto', seekStep: 5,
    adult: 'show', pin: '0000',
    panelBg: 'solid', anim: 1, infoOnZap: 1, groupOpen: 'playing', groupArchive: 0, groupCounts: 1, listOk: 'close',
    startScreen: 'play', timeout: 15, audioLang: 'auto', protectSettings: 0, plRefresh: 0,
    infoPos: 'bottom', groupHistory: 1, streamInfo: 1, groupNow: 1, saver: 5, profileAsk: 0,
    wake: 0, wakeH: 7, wakeM: 0, wakeDays: 'daily', wakeCh: 'last',
    remindLead: 1, remindAct: 'ask', subSize: 'm', subColor: 'white', subBg: 'shadow', logoTpl: '', showHidden: 0, listAutoClose: 0, numDelay: 1.5, subtitles: 0, archiveOffset: 0, watchWords: ''
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
  // Profile: Favoriten, Verlauf, letzter Sender, Ausblendungen und Sendersperren je Profil (Einstellungen gelten für alle)
  var PROFILE_KEYS = ['favs', 'history', 'last', 'lastGroup', 'hiddenGroups', 'audioPref', 'aspectCh', 'chLock', 'chHide', 'reminders', 'series', 'remindDone'];
  function pkey(k) { return S.prof && PROFILE_KEYS.indexOf(k) >= 0 ? k + '@' + S.prof : k; }
  function pload(k, def) { return load(pkey(k), def); }
  function psave(k, v) { save(pkey(k), v); }
  function setVal(k, v) { S.settings[k] = v; save('settings', S.settings); if (SRC_KEYS.indexOf(k) >= 0) syncSource(); applySetting(k); remotePush(); }

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
  function urlKey(u) { return String(u || '').replace(/^\w+:\/\/[^\/]+/, '').replace(/\/iptv\/[^\/]+\//, '/iptv/*/'); }
  function chKey(c) { return urlKey(c.url); }
  /** Nummer eines Senders: in den Favoriten die eigene Position (1, 2, 3 …), sonst die Nummer aus der Playlist */
  function chNum(c) {
    var g = S.groups[S.gi], i = g && g.id === 'fav' ? g.items.indexOf(c) : -1;
    return i >= 0 ? i + 1 : c.num;
  }
  function groupKey(g) { return g.id === 'g' ? 'g:' + g.name : g.id; }
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
      applyLogos();
      buildGroups();
      cb(null);
      loadEpg();
    });
  }

  function buildGroups() {
    var hide = get('adult') === 'hide', alpha = get('sort') === 'alpha';
    var showHid = +get('showHidden'), hg = S.hiddenGroups || {};
    var ch = S.chHide || {};
    var chans = S.channels.filter(function (c) { return !(hide && isAdult(c)) && (showHid || (!hg[c.group] && !ch[chKey(c)])); });
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
    if (+get('groupNow')) S.groups.push({ id: 'now', items: [], icon: '◉' });
    S.groups.push({ id: 'search', items: searchItems(chans), icon: '⌕' });
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
    psave('favs', S.favs);
    remotePush();
  }
  // ---------- Suche nach Sendernamen über alle Kategorien ----------
  function normName(s) { return String(s || '').toLowerCase().replace(/ё/g, 'е').replace(/[\s\-_.,:;!?'"()\[\]|\/+&*]+/g, ' ').trim(); }
  function searchItems(chans) {
    var q = normName(S.q);
    if (!q) return [];
    var words = q.split(' '), qc = q.replace(/ /g, ''), out = [];
    for (var i = 0; i < chans.length; i++) {
      var c = chans[i], n = normName(c.name), nc = n.replace(/ /g, ''), ok = String(c.num) === qc;
      if (!ok) { ok = true; for (var j = 0; j < words.length && ok; j++) ok = n.indexOf(words[j]) >= 0 || nc.indexOf(words[j]) >= 0; }
      if (!ok && qc.length > 1) ok = nc.indexOf(qc) >= 0;
      if (ok) out.push({ c: c, r: (n.indexOf(q) === 0 || nc.indexOf(qc) === 0 ? 0 : 1), i: i });
    }
    out.sort(function (a, b) { return a.r - b.r || a.i - b.i; });
    return out.map(function (x) { return x.c; });
  }
  /** Sendungen im Programmführer: laufend, kommend, vergangene nur mit Archiv (ab 3 Zeichen) */
  function normT(s) { return String(s || '').toLowerCase().replace(/ё/g, 'е'); }
  function progSearch(q) {
    q = normT(q).trim();
    if (q.length < 3 || !EPG.isLoaded()) return [];
    var now = nowSec(), out = [], chans = S.visible;
    for (var i = 0; i < chans.length && out.length < 2000; i++) {
      var c = chans[i], arr = EPG.list(c);
      if (!arr || !arr.length || isLocked(c)) continue;
      var sh = shiftOf(c), from = now - (c.catchupDays > 0 ? c.catchupDays * 86400 : 0);
      for (var j = 0; j < arr.length; j++) {
        var x = arr[j];
        if (x.e + sh <= now && x.s + sh <= from) continue;
        var n = x._n || (x._n = normT(x.t));
        if (n.indexOf(q) >= 0) out.push({ c: c, p: x, sh: sh, r: x.s + sh <= now && x.e + sh > now ? 0 : x.s + sh > now ? 1 : 2 });
      }
    }
    out.sort(function (a, b) { return a.r - b.r || (a.r === 2 ? (b.p.s + b.sh) - (a.p.s + a.sh) : (a.p.s + a.sh) - (b.p.s + b.sh)); });
    // laufend, dann die nächsten kommenden, dann die zuletzt gelaufenen (Archiv)
    var by = [[], [], []];
    out.forEach(function (h) { by[h.r].push(h); });
    return by[0].slice(0, 30).concat(by[1].slice(0, 30), by[2].slice(0, 30));
  }
  /** Einträge einer Gruppe; in der Suche folgen nach den Sendern die gefundenen Sendungen */
  function listCount(g) { return g.items.length + (g.id === 'search' ? S.progHits.length : 0); }
  function listItem(g, i) {
    if (i < g.items.length) return { c: g.items[i] };
    var h = g.id === 'search' ? S.progHits[i - g.items.length] : null;
    return h ? { c: h.c, p: h.p, sh: h.sh } : {};
  }
  function progRow(it, sel, now) {
    var x = it.p, sh = it.sh, live = x.s + sh <= now && x.e + sh > now, past = x.e + sh <= now;
    var d = new Date((x.s + sh) * 1000), when = (d.toDateString() === new Date().toDateString() ? '' : dateStr(d) + '  ') + hm(x.s + sh);
    var pct = live ? Math.min(100, Math.max(0, (now - x.s - sh) / (x.e - x.s) * 100)) : 0;
    return '<div class="row ch prog' + (sel ? ' sel' : '') + '"><span class="n">' + (live ? '●' : past ? '⟲' : '◷') + '</span><span class="arc"></span>' + logoHtml(it.c, 'lg') +
      '<span class="txt"><span class="name">' + esc(x.t) + '</span><span class="sub">' + esc(when + '  ·  ' + it.c.name) + '</span>' +
      (live ? '<span class="mini"><div style="width:' + pct + '%"></div></span>' : '') + '</span><span class="icons"></span></div>';
  }
  /** Sendung aus der Suche: laufend = live, vorbei = Archiv, kommend = Programmführer an dieser Stelle */
  function playHit(it) {
    var c = it.c, x = it.p, sh = it.sh, now = nowSec();
    guarded(c, function () {
      if (x.s + sh <= now && x.e + sh > now) { play(c); closePanels(); }
      else if (x.e + sh <= now && canArchive(c, x)) { closePanels(); playArchive(c, { s: x.s + sh, e: x.e + sh, t: x.t, d: x.d }); }
      else if (x.s + sh > now) openEpg(c, x);
      else toast(t('noArchive'));
    });
  }
  function searchIndex() { for (var i = 0; i < S.groups.length; i++) if (S.groups[i].id === 'search') return i; return -1; }
  function startSearch() {
    var gi = searchIndex();
    if (gi < 0) return;
    if (S.moving) moveKey(KEY.ENTER);
    S.gi = gi; S.ci = 0; S.focus = 'channels'; S.searchEdit = true;
    renderList();
    var inp = $('search-input');
    show('search-input', true);
    inp.value = S.q || '';
    inp.focus();
    try { inp.setSelectionRange(inp.value.length, inp.value.length); } catch (e) {}
  }
  function endSearch() {
    if (!S.searchEdit) return;
    S.searchEdit = false;
    var inp = $('search-input');
    inp.blur(); show('search-input', false);
    if (S.mode === 'list') renderList();
  }
  function updateSearch() {
    var gi = searchIndex();
    if (gi < 0) return;
    S.q = $('search-input').value;
    S.groups[gi].items = searchItems(S.visible);
    S.ci = 0;
    clearTimeout(S.progT);
    if (normT(S.q).trim().length < 3) S.progHits = [];
    else S.progT = setTimeout(function () {
      S.progHits = progSearch(S.q);
      if (S.mode === 'list' && S.groups[S.gi] && S.groups[S.gi].id === 'search') renderList();
    }, 450);
    renderList();
  }
  /** Tasten während der Eingabe: Text geht an die Bildschirmtastatur, OK/▲/▼/Zurück beenden die Eingabe */
  function searchKey(k, ev) {
    if (k === KEY.ENTER || k === KEY.UP || k === KEY.DOWN || k === KEY.BACK || k === KEY.ESC || k === KEY.RED) {
      ev.preventDefault(); endSearch(); return true;
    }
    return false;
  }

  // ---------- Kategorie-Icons (Einstellung „Kategorie-Icons“: Linien, farbige Kacheln, Buchstaben) ----------
  var GICON = {
    tv: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M16 3l-4 4-4-4"/>',
    news: '<path d="M16 6h3a1 1 0 0 1 1 1v11a2 2 0 0 1-4 0V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v12a3 3 0 0 0 3 3h11"/><path d="M8 8h4M8 12h4M8 16h4"/>',
    sport: '<circle cx="12" cy="12" r="9"/><path d="M12 7l4.76 3.45-1.82 5.6H9.06l-1.82-5.6z"/><path d="M12 7V3M16.76 10.45l3.8-1.24M14.94 16.05l2.35 3.24M9.06 16.05l-2.35 3.24M7.24 10.45l-3.8-1.24"/>',
    movie: '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M8 4v16M16 4v16M4 8h4M4 16h4M4 12h16M16 8h4M16 16h4"/>',
    series: '<path d="M12 4l8 4-8 4-8-4z"/><path d="M4 12l8 4 8-4"/><path d="M4 16l8 4 8-4"/>',
    kids: '<circle cx="12" cy="12" r="9"/><path d="M9 10h.01M15 10h.01"/><path d="M9.5 15a3.5 3.5 0 0 0 5 0"/>',
    music: '<circle cx="6" cy="17" r="3"/><circle cx="16" cy="17" r="3"/><path d="M9 17V4h10v13M9 8h10"/>',
    edu: '<circle cx="12" cy="12" r="9"/><path d="M3.6 9h16.8M3.6 15h16.8"/><path d="M11.5 3a17 17 0 0 0 0 18M12.5 3a17 17 0 0 1 0 18"/>',
    fun: '<path d="M16 18a2 2 0 0 1 2 2 2 2 0 0 1 2-2 2 2 0 0 1-2-2 2 2 0 0 1-2 2zm0-12a2 2 0 0 1 2 2 2 2 0 0 1 2-2 2 2 0 0 1-2-2 2 2 0 0 1-2 2zM9 18a6 6 0 0 1 6-6 6 6 0 0 1-6-6 6 6 0 0 1-6 6 6 6 0 0 1 6 6z"/>',
    adult: '<rect x="5" y="11" width="14" height="10" rx="2"/><circle cx="12" cy="16" r="1"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
    region: '<circle cx="12" cy="11" r="3"/><path d="M17.66 16.66l-4.25 4.24a2 2 0 0 1-2.83 0l-4.24-4.24a8 8 0 1 1 11.32 0z"/>',
    hd: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 9v6M10 9v6M7 12h3M14 9v6h1.5a2 2 0 0 0 2-2v-2a2 2 0 0 0-2-2H14z"/>',
    radio: '<path d="M14 3L4.5 7.7A1 1 0 0 0 4 8.6V19a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-9a2 2 0 0 0-2-2H4"/><circle cx="15" cy="15" r="2"/><path d="M7 12h1M7 15h1M7 18h1"/>',
    life: '<path d="M19.5 12.57L12 20l-7.5-7.43A5 5 0 1 1 12 6.01a5 5 0 1 1 7.5 6.57"/>',
    all: '<rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><rect x="14" y="14" width="6" height="6" rx="1"/>',
    fav: '<path d="M12 17.75l-6.17 3.24 1.18-6.87-5-4.86 6.9-1L12 2l3.09 6.26 6.9 1-5 4.86 1.18 6.87z"/>',
    search: '<circle cx="10" cy="10" r="7"/><path d="M21 21l-6-6"/>',
    vod: '<path d="M7 4v16l13-8z"/>',
    hist: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/>',
    arc: '<path d="M12 8v4l2 2"/><path d="M3.05 11a9 9 0 1 1 .5 4M3 20v-5h5"/>',
    now: '<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M10 8l5 2.5-5 2.5z"/><path d="M8 21h8M12 17v4"/>'
  };
  // Erkennung am Kategorienamen (Edem: russisch, Landesgruppen in Landessprache); Reihenfolge = Vorrang
  var GCAT = [
    ['kids', '#f08a24', /дет|мульт|kids|kinder|child|cartoon|çocuk/i],
    ['sport', '#22a35a', /спорт|sport|футбол|football|fußball|spor\b/i],
    ['news', '#d9534f', /новост|news|nachricht|haber|новин/i],
    ['music', '#e0478a', /муз|music|musik|müzik/i],
    ['series', '#6366f1', /сериал|series|serie|dizi/i],
    ['movie', '#8b5cf6', /кино|фильм|movie|film|cinema|kino/i],
    ['edu', '#14a3b8', /познав|док|науч|discovery|doku|wissen|educat|природ|nature|истор|belgesel/i],
    ['fun', '#ca8a04', /развлек|entertain|unterhalt|юмор|comedy|шоу|show|eğlence/i],
    ['radio', '#a855f7', /радио|radio/i],
    ['life', '#db2777', /кух|food|cook|lifestyle|стиль|мода|fashion|travel|путеш|релакс/i],
    ['region', '#2f7fd1', /türk|moldov|україн|украин|ישרא|израил|հայ|армян|ქართ|груз|o'zbek|uzbek|узбек|azərb|azerb|азерб|қазақ|казах|беларус|belarus|точик|тадж|tajik|\busa\b|сша|deutsch|german|немец|polsk|польск|europ|европ|латв|литв|эстон|регион|region|local/i],
    ['hd', '#0891b2', /\bhd\b|\b4k\b|uhd|fhd|ultra/i],
    ['tv', '#5b6b8c', /общ|general|allgem|эфир|федерал|другие|other|sonstig/i]
  ];
  var GSPECIAL = { all: ['all', null], fav: ['fav', '#e0a200'], search: ['search', '#5b6b8c'], vod: ['vod', '#7c3aed'],
    hist: ['hist', '#64748b'], arc: ['arc', '#d97706'], now: ['now', '#0ea5e9'], cont: ['hist', '#64748b'] };
  function groupCat(g, def) {
    var sp = GSPECIAL[g.id];
    if (sp) return { k: sp[0], c: sp[1] || ACCENTS[get('accent')] || ACCENTS.blue, special: true };
    var n = g.name || '';
    if (g.adult || ADULT_RE.test(n)) return { k: 'adult', c: '#444a57' };
    for (var i = 0; i < GCAT.length; i++) if (GCAT[i][2].test(n)) return { k: GCAT[i][0], c: GCAT[i][1] };
    return { k: def || 'tv', c: '#5b6b8c' };
  }
  /** Icon vor einem Kategorienamen; def = Icon für unbekannte Kategorien (Mediathek: Film) */
  function groupIcon(g, def) {
    var mode = get('groupIcons');
    if (mode === 'off') return '<span class="gi">' + (g.icon || '') + '</span>';
    var c = groupCat(g, def), svg = '<svg viewBox="0 0 24 24">' + GICON[c.k] + '</svg>';
    if (mode === 'line') return '<span class="gk gk-line">' + svg + '</span>';
    if (mode === 'letter') {
      var m = c.special ? null : /[^\s\d\W_]|[Ѐ-ӿ԰-֏֐-׿Ⴀ-ჿ]|\d/.exec(g.name || '');
      return '<span class="gk gk-ring" style="border-color:' + c.c + '">' + (m ? esc(m[0].toUpperCase()) : svg) + '</span>';
    }
    return '<span class="gk gk-tile" style="background:' + c.c + '">' + svg + '</span>';
  }
  function groupName(g) { return g.id === 'search' ? t('search') + (S.q ? ': ' + S.q : '') : g.id === 'vod' ? t('vod') : g.id === 'all' ? t('allChannels') : g.id === 'fav' ? t('favorites') : g.id === 'arc' ? t('withArchive') : g.id === 'hist' ? t('history') : g.id === 'now' ? t('nowTv') : g.name; }

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
    S.history = h; psave('history', h);
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
    psave('hiddenGroups', S.hiddenGroups);
    buildGroups();
    if (S.gi >= S.groups.length) S.gi = S.groups.length - 1;
    toast(t(hidden ? 'groupHidden' : 'groupShown', n), 2500);
  }
  function actUnhideAll() {
    S.hiddenGroups = {}; psave('hiddenGroups', S.hiddenGroups);
    S.chHide = {}; psave('chHide', S.chHide);
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
    autoRemind();
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
  /** gesperrt: Erwachsenen-Kategorie (Einstellung „sperren“) oder einzeln gesperrter Sender, solange die PIN nicht eingegeben wurde */
  function isLocked(c) { return !S.unlocked && !!c && ((get('adult') === 'lock' && isAdult(c)) || !!(S.chLock && S.chLock[chKey(c)])); }
  function needsPin(ch) { return isLocked(ch); }

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
      S.archive = null; S.livePause = null;
      if (S.previewing !== ch) Player.start(ch.url);
      applyAspect();
      S.previewing = null;
      psave('last', chKey(ch));
      var src = srcById(S.srcId); if (src && src.last !== chKey(ch)) { src.last = chKey(ch); save('sources', S.sources); }
      var g = S.groups[S.gi];
      psave('lastGroup', g && g.id !== 'search' && g.items.indexOf(ch) >= 0 ? groupKey(g) : 'g:' + ch.group);
      S.ibSel = 0;
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
    S.livePause = null;
    applyAspect();
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

  // ---------- Live-Pause: Sender mit Archiv laufen nach der Pause an derselben Stelle weiter ----------
  function pauseLive() {
    if (!S.current || S.archive || S.vod) return;
    S.livePause = { t: nowSec(), ch: S.current };
    Player.video().pause();
    showInfo();
    toast(t(S.current.catchupDays > 0 ? 'livePaused' : 'livePausedNoArc'), 3500);
  }
  function resumeLive() {
    var lp = S.livePause; if (!lp) return;
    S.livePause = null;
    var ch = lp.ch, t0 = lp.t;
    if (ch !== S.current) return;
    if (ch.catchupDays > 0 && nowSec() - t0 > 15) {
      var e = epgAt(ch, t0), sh = shiftOf(ch);
      var prog = e.now ? { s: e.now.s + sh, e: e.now.e + sh, t: e.now.t, d: e.now.d } : { s: t0 - 7200, e: t0 + 3 * 3600, t: '' };
      playArchive(ch, prog, t0);
      toast(t('pauseResumed', hm(t0)), 2500);
    } else { Player.start(ch.url); showInfo(); }
  }

  // ---------- Bildformat (je Sender über den Knopf in der Info-Leiste) ----------
  var ASPECTS = ['fit', 'fill', 'stretch', 'zoom'], ASPECT_LBL = { fit: 'vFit', fill: 'vFill', stretch: 'vStretch', zoom: 'vZoom' };
  function curAspect() { return (S.current && !S.vod && S.aspectCh && S.aspectCh[chKey(S.current)]) || get('aspect'); }
  function cycleAspect() {
    if (!S.current || S.vod) return;
    var a = ASPECTS[(ASPECTS.indexOf(curAspect()) + 1) % ASPECTS.length], k = chKey(S.current);
    if (a === get('aspect')) delete S.aspectCh[k]; else S.aspectCh[k] = a;
    var keys = Object.keys(S.aspectCh); if (keys.length > 500) delete S.aspectCh[keys[0]];
    psave('aspectCh', S.aspectCh);
    applyAspect(); showInfo();
    toast(t('aspectFor', t(ASPECT_LBL[a]), S.current.name), 2000);
  }

  function applyAspect() {
    var v = $('video'), a = curAspect();
    if (v.classList.contains('mini')) return;
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
  function hideInfo() { S.ibSel = 0; show('infobar', false); updateClock(); }
  /** Bildinfo (Auflösung, Bildrate, Codec, Bitrate) */
  function codecName(c) {
    c = String(c || '').toLowerCase();
    return /^(avc|h264)/.test(c) ? 'H.264' : /^(hvc|hev|h265)/.test(c) ? 'HEVC' : /^av01/.test(c) ? 'AV1' : /^vp0?9/.test(c) ? 'VP9' : c ? c.split('.')[0].toUpperCase() : '';
  }
  function renderStream() {
    var el = $('ib-stream'), st = +get('streamInfo') && (S.current || S.vod) ? Player.stats() : null, p = [];
    if (st && st.h) {
      p.push(st.w + '×' + st.h);
      if (st.fps) p.push(st.fps + ' fps');
      if (st.codec) p.push(codecName(st.codec));
      if (st.kbps) p.push((st.kbps / 1000).toFixed(1) + ' Mbit/s');
    }
    el.textContent = p.join('  ·  ');
    show('ib-stream', p.length > 0);
  }

  // ---------- Tonspur ----------
  var LANG3 = { rus: 'ru', ukr: 'uk', deu: 'de', ger: 'de', eng: 'en', pol: 'pl', tur: 'tr', spa: 'es', fra: 'fr', fre: 'fr', ita: 'it', ron: 'ro', rum: 'ro',
    por: 'pt', nld: 'nl', dut: 'nl', ces: 'cs', cze: 'cs', slk: 'sk', slo: 'sk', hun: 'hu', bul: 'bg', ell: 'el', gre: 'el', lit: 'lt', lav: 'lv', est: 'et', kaz: 'kk', bel: 'be' };
  function langName(code) {
    var c = String(code || '').toLowerCase().split(/[-_]/)[0];
    c = LANG3[c] || c;
    for (var i = 0; i < LANG_NAMES.length; i++) if (LANG_NAMES[i][0] === c) return LANG_NAMES[i][1];
    return '';
  }
  function trackName(tr, i) {
    if (!tr) return t('audioTrack');
    var ln = langName(tr.lang) || langName(tr.label), lb = tr.label;
    if (lb && lb.length <= 3 && ln) lb = '';
    return lb || ln || (tr.lang ? tr.lang.toUpperCase() : t('audioTrack') + ' ' + (i + 1));
  }
  function openAudio() {
    if (!S.current || S.vod) return;
    var tk = Player.tracks();
    S.modal = 'audio';
    S.aSel = Math.max(0, tk.cur);
    clearTimeout(S.infoTimer);
    renderAudio();
    show('audio', true);
  }
  function renderAudio() {
    var tk = Player.tracks(), el = $('audio-rows');
    if (tk.list.length < 2) { el.innerHTML = '<div class="audio-none">' + esc(t('audioOnly')) + '</div>'; return; }
    var h = '';
    for (var i = 0; i < tk.list.length; i++)
      h += '<div class="row' + (i === S.aSel ? ' sel' : '') + '" data-i="' + i + '"><span class="t">' + esc(trackName(tk.list[i], i)) + '</span>' + (i === tk.cur ? '<span class="check">✓</span>' : '') + '</div>';
    el.innerHTML = h;
  }
  function closeAudio() { S.modal = null; show('audio', false); showInfo(); }
  function pickTrack(i) {
    var tk = Player.tracks(), tr = tk.list[i];
    if (!tr) { closeAudio(); return; }
    Player.setTrack(i);
    S.audioPref[urlKey(S.current.url)] = { lang: tr.lang, label: tr.label };
    var keys = Object.keys(S.audioPref);
    if (keys.length > 300) delete S.audioPref[keys[0]];
    psave('audioPref', S.audioPref);
    closeAudio();
    toast(t('audioTrack') + ': ' + trackName(tr, i), 1800);
  }
  function audioKey(k) {
    var n = Player.tracks().list.length;
    if (k === KEY.UP && n > 1) { S.aSel = (S.aSel - 1 + n) % n; renderAudio(); }
    else if (k === KEY.DOWN && n > 1) { S.aSel = (S.aSel + 1) % n; renderAudio(); }
    else if (k === KEY.ENTER) { if (n > 1) pickTrack(S.aSel); else closeAudio(); }
    else if (k === KEY.BACK || k === KEY.ESC || k === KEY.BACKSPACE || k === KEY.LEFT) closeAudio();
  }

  function renderInfo() {
    if (S.vod) return renderVodInfo();
    var ch = S.current; if (!ch) return;
    var tile = $('ib-logo').parentNode;
    $('ib-num').textContent = chNum(ch);
    if (ch.logo && get('showLogos')) { $('ib-logo').src = ch.logo; $('ib-logo').style.display = ''; tile.classList.remove('nologo'); }
    else { $('ib-logo').style.display = 'none'; tile.classList.add('nologo'); }
    $('ib-name').textContent = ch.name;
    var badge = $('ib-badge');
    badge.textContent = S.livePause ? '❚❚ ' + t('pauseChip') : S.archive ? t('archive') : t('live');
    badge.className = 'chip ' + (S.livePause ? 'paused' : S.archive ? 'archive' : 'live');
    $('ib-arc').textContent = '⟲ ' + ch.catchupDays; show('ib-arc', ch.catchupDays > 0);
    show('ib-fav', isFav(ch));
    show('ib-audio', true);
    $('ib-audio').classList[S.ibSel === 1 ? 'add' : 'remove']('sel');
    show('ib-aspect', true);
    $('ib-aspect').classList[S.ibSel === 2 ? 'add' : 'remove']('sel');
    $('ib-aspect-t').textContent = t(ASPECT_LBL[curAspect()] || 'vFit');
    renderStream();
    var tk = Player.tracks();
    $('ib-audio-t').textContent = tk.list.length > 1 ? trackName(tk.list[tk.cur], tk.cur) : t('audioTrack');
    var d = new Date();
    $('ib-clock').textContent = hm(nowSec());
    $('ib-date').textContent = dateStr(d);

    var tpos = S.livePause ? S.livePause.t : archivePos(), e = epgAt(ch, tpos), sh = shiftOf(ch);
    if (e.now) {
      $('ib-time').textContent = hm(e.now.s + sh) + ' – ' + hm(e.now.e + sh);
      $('ib-title').textContent = e.now.t;
      $('ib-progress').style.width = Math.min(100, Math.max(0, (tpos - e.now.s - sh) / (e.now.e - e.now.s) * 100)) + '%';
      $('ib-left').textContent = S.livePause ? t('pausedAt', hm(S.livePause.t)) : S.archive ? '' : t('minLeft', Math.max(0, Math.round((e.now.e + sh - tpos) / 60)));
    } else {
      $('ib-time').textContent = '';
      $('ib-title').textContent = S.epgStatus || (EPG.isLoaded() ? t('noInfo') : '');
      $('ib-progress').style.width = '0';
      $('ib-left').textContent = '';
    }
    if (S.livePause && !e.now) $('ib-left').textContent = t('pausedAt', hm(S.livePause.t));
    $('ib-next').textContent = S.livePause ? t(ch.catchupDays > 0 ? 'livePaused' : 'livePausedNoArc') : S.archive ? t('archiveHelp', get('seekStep')) :
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
    if (sec > 0) S.listCloseT = setTimeout(function () { if (S.mode === 'list' && !S.modal && !S.searchEdit) closePanels(); else if (S.searchEdit) armListClose(); }, sec * 1000);
  }

  function closePanels() {
    if (S.moving) { S.moving = false; if (S.groups[S.gi] && S.groups[S.gi].id === 'fav') saveFavOrder(S.groups[S.gi].items); }
    if (S.mode === 'list') S.listPos = { gi: S.gi, ci: S.ci };
    S.mode = 'player';
    S.set.editing = null;
    if (S.searchEdit) { S.searchEdit = false; $('search-input').blur(); show('search-input', false); }
    show('list', false); show('epg', false); show('settings', false); show('vod', false); show('now', false);
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
      return '<div class="row' + (sel ? ' sel' : '') + (gr.hidden ? ' hid' : '') + '">' + groupIcon(gr) + '<span class="t">' + esc(groupName(gr)) + '</span>' +
        (gr.hidden ? '<span class="hidmark">⊘</span>' : '') +
        (gr.adult && locking ? '<span class="lock">🔒</span>' : '') + (gr.id === 'vod' || gr.id === 'now' ? '' : '<span class="pill">' + listCount(gr) + '</span>') + '</div>';
    });
    $('group-title').textContent = groupName(g);
    $('group-count').textContent = g.id === 'vod' || g.id === 'now' ? '' : listCount(g);
    var now = nowSec(), showEpg = get('showEpgList');
    if (!listCount(g)) {
      $('channels').innerHTML = '<div class="row dim" style="height:4rem">' + esc(g.id === 'vod' ? t('vodOpen') : g.id === 'now' ? t('nowOpen') : g.id === 'fav' ? t('favHint') : g.id === 'search' ? t(S.q ? 'searchNone' : 'searchHint') : t('empty')) + '</div>';
    } else {
      if (S.ci >= listCount(g)) S.ci = listCount(g) - 1;
      renderRows($('channels'), listCount(g), S.ci, function (i, sel) {
        if (i >= g.items.length) return progRow(listItem(g, i), sel, now);
        var c = g.items[i], hid = isLocked(c), chid = S.chHide[chKey(c)], e = showEpg && !hid ? epgAt(c, now) : {}, sh = shiftOf(c);
        var pct = e.now ? Math.min(100, Math.max(0, (now - e.now.s - sh) / (e.now.e - e.now.s) * 100)) : 0;
        return '<div class="row ch' + (sel ? ' sel' : '') + (sel && S.moving ? ' moving' : '') + (c === S.current ? ' playing' : '') + (S.previewing && c === S.previewing ? ' previewing' : '') + (chid ? ' hid' : '') + '">' +
          '<span class="n">' + (g.id === 'fav' ? i + 1 : c.num) + '</span><span class="arc' + (c.catchupDays > 0 ? ' on' : '') + '"></span>' + (hid ? (get('showLogos') ? '<span class="lg"></span>' : '') : logoHtml(c, 'lg')) +
          '<span class="txt"><span class="name">' + esc(c.name) + '</span>' +
          (e.now ? '<span class="sub">' + esc(e.now.t) + '</span><span class="mini"><div style="width:' + pct + '%"></div></span>' : '') +
          '</span><span class="icons">' + (sel && S.moving ? '<span class="mv">⇅</span>' : isFav(c) ? '<span class="fav">★</span>' : '') +
          (hid ? '<span class="lock">🔒</span>' : '') + (chid ? '<span class="hidmark">⊘</span>' : '') + '</span></div>';
      });
    }
    var cur = listItem(g, S.ci);
    renderPreview(cur.c, cur.p ? cur : null);
    schedulePreview(cur.c);
    placeVideo();
    $('hint-yellow').textContent = t(S.focus === 'groups' ? 'hHideGroup' : 'hFav');
    $('hint-ok').textContent = t(S.moving ? 'hMoveDone' : 'hPlay') + (S.focus === 'channels' && cur.c && !cur.p && !S.moving ? '  ·  ' + t('hOptions') : '');
    armListClose();
  }

  function renderPreview(c, hit) {
    if (!c) { $('pv-name').textContent = ''; $('pv-meta').textContent = ''; $('pv-now').textContent = ''; $('pv-desc').textContent = ''; $('pv-next').innerHTML = ''; $('pv-progress').style.width = '0'; $('pv-logo').style.display = 'none'; return; }
    $('pv-name').textContent = c.name;
    $('pv-meta').textContent = '№ ' + chNum(c) + '  ·  ' + c.group + (c.catchupDays ? '  ·  ' + t('archiveDays', c.catchupDays) : '');
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
    if (hit) {
      var x = hit.p, hs = hit.sh;
      $('pv-now').textContent = dateStr(new Date((x.s + hs) * 1000)) + '  ' + hm(x.s + hs) + ' – ' + hm(x.e + hs) + '   ' + x.t;
      $('pv-desc').textContent = x.d || ''; $('pv-next').innerHTML = '';
      $('pv-progress').style.width = x.s + hs <= now && x.e + hs > now ? Math.min(100, (now - x.s - hs) / (x.e - x.s) * 100) + '%' : '0';
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
    if (k === KEY.RED) { startSearch(); return; }
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
      else if (k === KEY.RIGHT || k === KEY.ENTER) {
        if (S.groups[S.gi] && S.groups[S.gi].id === 'vod') { openVod(); return; }
        if (S.groups[S.gi] && S.groups[S.gi].id === 'now') { openNow('list'); return; }
        if (S.groups[S.gi] && S.groups[S.gi].id === 'search' && (k === KEY.ENTER || !listCount(S.groups[S.gi]))) { startSearch(); return; }
        S.focus = 'channels';
      }
      else return;
    } else {
      if (g && g.id === 'vod') { if (k === KEY.ENTER || k === KEY.RIGHT) openVod(); else if (k === KEY.LEFT || k === KEY.UP || k === KEY.DOWN) { S.focus = 'groups'; renderList(); } return; }
      if (g && g.id === 'now') { if (k === KEY.ENTER || k === KEY.RIGHT) openNow('list'); else if (k === KEY.LEFT || k === KEY.UP || k === KEY.DOWN) { S.focus = 'groups'; renderList(); } return; }
      var cnt = g ? listCount(g) : 0, it = g ? listItem(g, S.ci) : {};
      if (g && g.id === 'search' && !cnt && k === KEY.ENTER) { startSearch(); return; }
      var page = pageSize($('channels'));
      if (k === KEY.UP) S.ci = cnt ? (S.ci - 1 + cnt) % cnt : 0;
      else if (k === KEY.DOWN) S.ci = cnt ? (S.ci + 1) % cnt : 0;
      else if (k === KEY.CH_UP) S.ci = Math.max(0, S.ci - page);
      else if (k === KEY.CH_DOWN) S.ci = Math.max(0, Math.min(cnt - 1, S.ci + page));
      else if (k === KEY.LEFT) S.focus = 'groups';
      else if (k === KEY.ENTER && it.p) { playHit(it); return; }
      else if (k === KEY.ENTER) {
        var c = it.c;
        if (c) guarded(c, function () {
          if (c !== S.current || S.archive || S.previewing || S.livePause) play(c);
          if (get('listOk') === 'stay') renderList(); else closePanels();
        });
        return;
      } else if (k === KEY.RIGHT || k === KEY.GREEN) { if (it.c) guarded(it.c, function () { openEpg(it.c, it.p); }); return; }
      else if (k === KEY.YELLOW) toggleFav(it.c);
      else if (k >= 48 && k <= 57) { numKey(String(k - 48)); return; }
      else return;
    }
    renderList();
  }

  function toggleFav(c) {
    if (!c) return;
    var key = chKey(c);
    if (S.favs[key]) delete S.favs[key]; else S.favs[key] = favMax() + 1;
    psave('favs', S.favs);
    remotePush();
    buildGroups();
    if (S.groups[S.gi] && S.groups[S.gi].id === 'fav') S.ci = Math.max(0, Math.min(S.ci, S.groups[S.gi].items.length - 1));
    toast(S.favs[key] ? t('favAdded', c.name) : t('favRemoved', c.name), 2000);
    if (S.mode === 'player' && visible('infobar')) renderInfo();
  }

  // ---------- Auswahlmenü (Senderoptionen, Profilwahl) ----------
  function openMenu(title, items, sel, onBack) {
    S.menu = { items: items, sel: sel || 0, back: onBack };
    S.modal = 'menu';
    $('menu-title').textContent = title;
    renderMenu(); show('menu', true);
  }
  function renderMenu() {
    var m = S.menu, h = '';
    for (var i = 0; i < m.items.length; i++)
      h += '<div class="row' + (i === m.sel ? ' sel' : '') + '" data-i="' + i + '"><span class="t">' + esc(m.items[i].label) + '</span>' + (m.items[i].check ? '<span class="check">✓</span>' : '') + '</div>';
    $('menu-rows').innerHTML = h;
  }
  function closeMenu() { var m = S.menu; S.modal = null; S.menu = null; show('menu', false); return m; }
  function pickMenu(i) { var m = closeMenu(), it = m && m.items[i]; if (it) it.run(); }
  function menuKey(k) {
    var m = S.menu, n = m.items.length;
    if (k === KEY.UP) m.sel = (m.sel - 1 + n) % n;
    else if (k === KEY.DOWN) m.sel = (m.sel + 1) % n;
    else if (k === KEY.ENTER) return pickMenu(m.sel);
    else if (k === KEY.BACK || k === KEY.ESC || k === KEY.BACKSPACE || k === KEY.LEFT) { closeMenu(); if (m.back) m.back(); return; }
    else return;
    renderMenu();
  }

  /** OK lang auf einem Sender: Favorit, Verschieben, Sperren, Ausblenden */
  function openChMenu(c) {
    if (!c) return;
    var g = S.groups[S.gi], k = chKey(c), items = [];
    items.push({ label: t(isFav(c) ? 'mFavOff' : 'mFavOn'), run: function () { toggleFav(c); renderList(); } });
    if (g && g.id === 'fav' && g.items.length > 1) items.push({ label: t('mMove'), run: startMove });
    items.push({ label: t(S.chLock[k] ? 'mUnlock' : 'mLock'), run: function () { toggleLock(c); } });
    items.push({ label: t(S.chHide[k] ? 'mUnhide' : 'mHide'), run: function () { toggleHideCh(c); } });
    items.push({ label: t('mDiag'), run: function () { openDiag(c); } });
    if (S.logoMap[k]) items.push({ label: t('mLogoReset'), run: function () { delete S.logoMap[k]; save('logoMap', S.logoMap); applyLogos(); toast(t('logoReset', c.name), 2000); rerender(); remotePush(); } });
    openMenu(c.name, items, 0, function () { if (S.mode === 'list') renderList(); });
  }
  function toggleLock(c) {
    var k = chKey(c);
    var go = function () {
      if (S.chLock[k]) delete S.chLock[k]; else { S.chLock[k] = 1; S.unlocked = false; } // Sperre gilt sofort
      psave('chLock', S.chLock);
      toast(t(S.chLock[k] ? 'chLocked' : 'chUnlocked', c.name), 2500);
      if (S.mode === 'list') renderList();
    };
    if (S.chLock[k] && !S.unlocked) askPin(function (ok) { if (ok) go(); else if (S.mode === 'list') renderList(); }); else go();
  }
  function toggleHideCh(c) {
    var k = chKey(c), hid = !S.chHide[k];
    if (hid) S.chHide[k] = 1; else delete S.chHide[k];
    psave('chHide', S.chHide);
    buildGroups();
    var g = S.groups[S.gi]; if (g) S.ci = Math.max(0, Math.min(S.ci, listCount(g) - 1));
    toast(t(hid ? 'chHidden' : 'chShown', c.name), 2500);
    if (S.mode === 'list') renderList();
  }
  function actUnlockAll() {
    S.chLock = {}; psave('chLock', S.chLock);
    if (S.channels.length) buildGroups();
    toast(t('locksCleared'), 2000); renderSettings();
  }

  // ---------- „Jetzt im TV“: Favoriten (sonst Sender mit Programm) als Kacheln mit laufender Sendung ----------
  var NOW_COLS = 4, NOW_ROWS = 3;
  function nowItems() {
    var favs = S.groups[1] && S.groups[1].id === 'fav' ? S.groups[1].items : [];
    if (favs.length) return { fav: true, items: favs.slice(0, 200) };
    var now = nowSec();
    return { fav: false, items: (S.groups[0] ? S.groups[0].items : []).filter(function (c) { return !!epgAt(c, now).now; }).slice(0, 200) };
  }
  function openNow(from) {
    var ni = nowItems();
    S.nowV = { items: ni.items, fav: ni.fav, sel: Math.max(0, ni.items.indexOf(S.current)), from: from || S.mode };
    S.mode = 'now';
    show('list', false); show('epg', false); hideInfo(); show('now', true);
    renderNow(); updateClock();
  }
  function renderNow() {
    var n = S.nowV, items = n.items, now = nowSec(), h = '';
    $('now-sub').textContent = n.fav ? t('favorites') : t('allChannels');
    if (!items.length) { $('now-grid').innerHTML = '<div class="now-empty">' + esc(EPG.isLoaded() ? t('nowEmpty') : (S.epgStatus || t('noEpg'))) + '</div>'; return; }
    var rows = Math.ceil(items.length / NOW_COLS), row = Math.floor(n.sel / NOW_COLS);
    var first = Math.max(0, Math.min(row - 1, rows - NOW_ROWS)) * NOW_COLS;
    for (var i = first; i < Math.min(items.length, first + NOW_COLS * NOW_ROWS); i++) {
      var c = items[i], lock = isLocked(c), e = lock ? {} : epgAt(c, now), sh = shiftOf(c);
      var pct = e.now ? Math.min(100, Math.max(0, (now - e.now.s - sh) / (e.now.e - e.now.s) * 100)) : 0;
      h += '<div class="now-tile' + (i === n.sel ? ' sel' : '') + (c === S.current ? ' playing' : '') + '" data-i="' + i + '">' +
        '<div class="nt-head">' + (lock ? '<span class="nt-logo"></span>' : logoHtml(c, 'nt-logo')) +
        '<span class="nt-num">' + (n.fav ? i + 1 : c.num) + '</span><span class="nt-name">' + esc(c.name) + '</span></div>' +
        '<div class="nt-title">' + esc(lock ? '🔒 ' + t('locked') : e.now ? e.now.t : t('noInfo')) + '</div>' +
        '<div class="nt-time">' + (e.now ? '<b>' + hm(e.now.s + sh) + ' – ' + hm(e.now.e + sh) + '</b><span>' + esc(t('minLeft', Math.max(0, Math.round((e.now.e + sh - now) / 60)))) + '</span>' : '') + '</div>' +
        '<div class="progress"><div style="width:' + pct + '%"></div></div>' +
        '<div class="nt-next">' + (e.next ? esc(t('next') + ': ' + hm(e.next.s + sh) + '  ' + e.next.t) : '') + '</div></div>';
    }
    $('now-grid').innerHTML = h;
  }
  function closeNow() {
    var from = S.nowV && S.nowV.from;
    if (from === 'list') { show('now', false); openList(); } else closePanels();
  }
  function nowKey(k) {
    var n = S.nowV, len = n.items.length, c = n.items[n.sel];
    if (k === KEY.BACK || k === KEY.ESC || k === KEY.BACKSPACE) { closeNow(); return; }
    if (k === KEY.BLUE) { openSettings(); return; }
    if (!len) return;
    if (k === KEY.LEFT) n.sel = Math.max(0, n.sel - 1);
    else if (k === KEY.RIGHT) n.sel = Math.min(len - 1, n.sel + 1);
    else if (k === KEY.UP) { if (n.sel >= NOW_COLS) n.sel -= NOW_COLS; }
    else if (k === KEY.DOWN) { if (n.sel + NOW_COLS < len) n.sel += NOW_COLS; else if (Math.floor(n.sel / NOW_COLS) < Math.floor((len - 1) / NOW_COLS)) n.sel = len - 1; }
    else if (k === KEY.CH_UP) n.sel = Math.max(0, n.sel - NOW_COLS * NOW_ROWS);
    else if (k === KEY.CH_DOWN) n.sel = Math.min(len - 1, n.sel + NOW_COLS * NOW_ROWS);
    else if (k === KEY.ENTER) { guarded(c, function () { closePanels(); if (c !== S.current || S.archive || S.livePause) play(c); }); return; }
    else if (k === KEY.GREEN) { guarded(c, function () { show('now', false); openEpg(c); }); return; }
    else return;
    renderNow();
  }

  // ---------- Mediathek (Filme & Serien als eigene M3U-Playlist, z. B. Edem „Медиатека“) ----------
  var V = { url: '', items: [], cats: [], ci: 0, ii: 0, focus: 'cats', loading: false, at: 0, resumeLive: false, ser: null, q: '', seen: null };
  function hasVod() { return !!String(get('vod') || '').trim(); }
  function vodKey(it) { return (it.ser ? '§' : '') + (it.group || '') + '|' + it.name; }
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
    if (done || (p.dur && p.pos > p.dur - 120)) { delete all[k]; vodMarkSeen(k, true); }
    else if (p.pos > 30) all[k] = { p: Math.floor(p.pos), d: Math.floor(p.dur), t: Date.now() };
    else return;
    var keys = Object.keys(all).sort(function (a, b) { return all[b].t - all[a].t; });
    for (var i = 60; i < keys.length; i++) delete all[keys[i]];
    save('vodPos', all);
  }

  // gesehene Filme und Folgen (Häkchen)
  function vodSeen() { return V.seen || (V.seen = load('vodSeen', {})); }
  function vodMarkSeen(k, on) {
    var m = vodSeen();
    if (on) m[k] = Date.now(); else delete m[k];
    var keys = Object.keys(m);
    if (keys.length > 3000) { keys.sort(function (a, b) { return m[a] - m[b]; }); for (var i = 0; i < keys.length - 3000; i++) delete m[keys[i]]; }
    save('vodSeen', m);
  }
  function serSeen(x) { var m = vodSeen(), n = 0; x.eps.forEach(function (e) { if (m[vodKey(e)]) n++; }); return n; }
  function isSeen(it) { return it.ser ? serSeen(it) === it.eps.length : !!vodSeen()[vodKey(it)]; }

  // Staffel und Folge aus dem Titel lesen: „S01E02“, „1x02“, „1 сезон 2 серия“, „Сезон 1 Серия 2“, „Staffel 1 Folge 2“, „Серия 5“ …
  var EP_W = '(?:серия|серії|серыя|сер\\.|эпизод|епізод|episode|ep\\.?|folge|odcinek|épisode|episodio|epizod[aeuy]?|bölüm|aflevering|díl|rész|епизод|серија|бөлім|osa|sērija|serija)';
  var SE_W = '(?:сезон|season|staffel|sezon|saison|stagione|temporada|seizoen|série|séria|sezóna|évad|sezonas|sezona|hooaeg|маусым|σεζόν)';
  var SEP = '[\\s.\\-_:,(\\[|–—]+';
  var EP_RES = [
    [new RegExp('^(.*?)' + SEP + 'S(\\d{1,2})[\\s._]*E(\\d{1,4})(?![0-9])', 'i'), 2, 3],
    [new RegExp('^(.*?)' + SEP + '(\\d{1,2})x(\\d{1,4})(?![0-9])', 'i'), 2, 3],
    [new RegExp('^(.*?)' + SEP + SE_W + '\\s*(\\d{1,2})[\\s.,:\\-|)\\]–—]*' + EP_W + '\\s*(\\d{1,4})', 'i'), 2, 3],
    [new RegExp('^(.*?)' + SEP + '(\\d{1,2})\\s*(?:-?(?:й|ый|ий|я|\\.))?\\s*' + SE_W + '[\\s.,:\\-|)\\]–—]*(\\d{1,4})\\s*(?:-?(?:я|ая|\\.))?\\s*' + EP_W, 'i'), 2, 3],
    [new RegExp('^(.*?)' + SEP + EP_W + '\\s*(\\d{1,4})', 'i'), 0, 2],
    [new RegExp('^(.*?)' + SEP + '(\\d{1,4})\\s*(?:-?(?:я|ая|\\.))?\\s*' + EP_W, 'i'), 0, 2]
  ];
  function vodEp(name) {
    for (var i = 0; i < EP_RES.length; i++) {
      var m = EP_RES[i][0].exec(name || '');
      if (!m) continue;
      var base = m[1].replace(/[\s.\-_:,(\[|–—]+$/, '').trim();
      if (base.length < 2) continue;
      return { base: base, s: EP_RES[i][1] ? +m[EP_RES[i][1]] : 0, e: +m[EP_RES[i][2]] };
    }
    return null;
  }
  function epOf(it) { return it._ep === undefined ? (it._ep = vodEp(it.name)) : it._ep; }
  function epLabel(ep) { return !ep ? '' : ep.s ? t('seasonEp', ep.s, ep.e) : t('episodeN', ep.e); }
  /** Folgen derselben Serie (mindestens 2) zu einem Eintrag zusammenfassen */
  function vodGroup(list) {
    var out = [], ser = {};
    list.forEach(function (it) {
      var ep = epOf(it);
      if (!ep) { out.push(it); return; }
      var k = it.group + '|' + normT(ep.base), x = ser[k];
      if (!x) { x = ser[k] = { ser: true, name: ep.base, group: it.group, logo: it.logo, url: '', eps: [] }; out.push(x); }
      x.eps.push(it);
    });
    return out.map(function (x) {
      if (!x.ser) return x;
      if (x.eps.length < 2) return x.eps[0];
      x.eps.sort(function (a, b) { return (a._ep.s - b._ep.s) || (a._ep.e - b._ep.e); });
      var ss = {}; x.eps.forEach(function (e) { ss[e._ep.s] = 1; }); x.seasons = Object.keys(ss).length;
      return x;
    });
  }
  function vodSearch(q) {
    q = normT(q).trim();
    if (q.length < 2) return [];
    return (V.flat || []).filter(function (x) {
      return normT(x.name).indexOf(q) >= 0 || (x.ser && x.eps.some(function (e) { return normT(e.name).indexOf(q) >= 0; }));
    }).slice(0, 300);
  }
  function vodSerOf(it) {
    for (var i = 0; i < V.cats.length; i++) {
      var c = V.cats[i]; if (c.id !== 'g' || c.name !== it.group) continue;
      for (var j = 0; j < c.items.length; j++) if (c.items[j].ser && c.items[j].eps.indexOf(it) >= 0) return c.items[j];
    }
    return null;
  }

  function vodBuild() {
    // Auswahl merken (Kategorie + Titel, ggf. geöffnete Serie), damit sie nach dem Neuaufbau an derselben Stelle steht
    var serK = V.ser ? vodKey(V.ser.it) : '', serII = V.ii;
    if (V.ser) { V.ii = V.ser.back; V.ser = null; }
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
    V.flat = vodGroup(items);
    V.cats.push({ id: 'search', items: vodSearch(V.q), icon: '⌕' });
    if (cont.length) V.cats.push({ id: 'cont', items: cont, icon: '◷' });
    if (order.length > 1) V.cats.push({ id: 'all', items: V.flat, icon: '▦' });
    order.forEach(function (g) { V.cats.push({ id: 'g', name: g, items: vodGroup(map[g]), adult: ADULT_RE.test(g) }); });
    V.ci = V.cats.length > 1 ? 1 : 0; V.ii = 0;
    for (var i = 0; i < V.cats.length; i++) if (V.cats[i].id + '|' + (V.cats[i].name || '') === ocId) { V.ci = i; break; }
    if (oiKey && V.cats[V.ci]) for (var j = 0; j < V.cats[V.ci].items.length; j++) if (vodKey(V.cats[V.ci].items[j]) === oiKey) { V.ii = j; break; }
    var sx = serK && V.cats[V.ci] && V.cats[V.ci].items[V.ii];
    if (sx && sx.ser && vodKey(sx) === serK) { V.ser = { it: sx, back: V.ii }; V.ii = Math.min(serII, sx.eps.length - 1); }
  }
  function vodCatName(c) { return c.id === 'cont' ? t('vodContinue') : c.id === 'all' ? t('vodAll') : c.id === 'search' ? t('vodSearch') + (V.q ? ': ' + V.q : '') : c.name; }
  /** angezeigte Liste: Titel der Kategorie oder Folgen der geöffneten Serie */
  function vodList() { return V.ser ? V.ser.it.eps : (V.cats[V.ci] || { items: [] }).items; }
  function vodEnterSer(x) {
    var pos = vodPos(), m = vodSeen(), best = -1, bt = 0, first = -1;
    x.eps.forEach(function (e, i) { var pp = pos[vodKey(e)]; if (pp && pp.t > bt) { bt = pp.t; best = i; } if (first < 0 && !m[vodKey(e)]) first = i; });
    V.ser = { it: x, back: V.ii };
    V.ii = best >= 0 ? best : first >= 0 ? first : 0;
    renderVod();
  }
  function vodLeaveSer() { if (!V.ser) return false; V.ii = V.ser.back; V.ser = null; renderVod(); return true; }
  function vodStartSearch() {
    V.ser = null;
    for (var i = 0; i < V.cats.length; i++) if (V.cats[i].id === 'search') V.ci = i;
    V.focus = 'items'; V.ii = 0; S.vodEdit = true;
    renderVod();
    var inp = $('vod-search');
    show('vod-search', true); inp.value = V.q || ''; inp.focus();
    try { inp.setSelectionRange(inp.value.length, inp.value.length); } catch (e) {}
  }
  function vodEndSearch() {
    if (!S.vodEdit) return;
    S.vodEdit = false;
    var inp = $('vod-search'); inp.blur(); show('vod-search', false);
    var c = V.cats[V.ci]; V.focus = c && c.items.length ? 'items' : 'cats';
    if (S.mode === 'vod') renderVod();
  }
  function vodSearchInput() {
    V.q = $('vod-search').value;
    for (var i = 0; i < V.cats.length; i++) if (V.cats[i].id === 'search') V.cats[i].items = vodSearch(V.q);
    V.ii = 0; renderVod();
  }

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
    var cats = V.cats, c = cats[V.ci] || { items: [] }, pos = vodPos(), seen = vodSeen(), list = vodList(), inSer = !!V.ser;
    var locking = get('adult') === 'lock' && !S.unlocked;
    $('vod-cats').parentNode.classList[V.focus === 'cats' ? 'add' : 'remove']('active');
    $('vod-items').parentNode.classList[V.focus === 'items' ? 'add' : 'remove']('active');
    renderRows($('vod-cats'), cats.length, V.ci, function (i, sel) {
      var g = cats[i];
      return '<div class="row' + (sel ? ' sel' : '') + '">' + groupIcon(g, 'movie') + '<span class="t">' + esc(vodCatName(g)) + '</span>' +
        (g.adult && locking ? '<span class="lock">🔒</span>' : '') + (g.id === 'search' && !g.items.length ? '' : '<span class="pill">' + g.items.length + '</span>') + '</div>';
    });
    $('vod-title').textContent = inSer ? V.ser.it.name : vodCatName(c);
    $('vod-count').textContent = list.length;
    if (V.ii >= list.length) V.ii = Math.max(0, list.length - 1);
    if (!list.length) $('vod-items').innerHTML = '<div class="row dim" style="height:4rem">' + esc(t(c.id === 'search' && !inSer ? (normT(V.q).trim().length < 2 ? 'vodSearchHint' : 'nothingFound') : 'empty')) + '</div>';
    else renderRows($('vod-items'), list.length, V.ii, function (i, sel) {
      var it = list[i], hid = locking && isAdult(it), pp = !it.ser && pos[vodKey(it)];
      var pct = pp && pp.d ? Math.min(100, pp.p / pp.d * 100) : 0, sub = '', name = it.name, ok = false;
      if (it.ser) {
        var ns = serSeen(it); ok = ns === it.eps.length;
        sub = (c.id !== 'g' ? it.group + '  ·  ' : '') + (it.seasons > 1 ? t('vodSeasons', it.seasons) + '  ·  ' : '') + t('vodEps', it.eps.length) + (ns && !ok ? '  ·  ✓ ' + ns : '');
      } else {
        ok = !!seen[vodKey(it)];
        if (inSer) { name = epLabel(it._ep); sub = it.name; } else if (c.id !== 'g') sub = it.group;
      }
      var icons = (it.ser ? '<span class="sr">❯</span>' : '') + (ok ? '<span class="seen">✓</span>' : '') + (hid ? '<span class="lock">🔒</span>' : '');
      return '<div class="row ch vi' + (sel ? ' sel' : '') + (ok ? ' watched' : '') + '">' + vodThumb(it, hid) +
        '<span class="txt"><span class="name">' + esc(name) + '</span>' +
        (sub ? '<span class="sub">' + esc(sub) + '</span>' : '') +
        (pct ? '<span class="mini"><div style="width:' + pct + '%"></div></span>' : '') + '</span>' +
        (icons ? '<span class="icons">' + icons + '</span>' : '') + '</div>';
    });
    renderVodCard(list[V.ii], pos);
  }

  function renderVodCard(it, pos) {
    var img = $('vod-poster');
    if (!it) { img.style.display = 'none'; $('vod-name').textContent = ''; $('vod-meta').textContent = ''; $('vod-resume').textContent = ''; return; }
    var hid = needsPin(it);
    if (it.logo && !hid) { if (img.getAttribute('src') !== it.logo) img.src = it.logo; img.style.display = ''; } else img.style.display = 'none';
    $('vod-name').textContent = it.name;
    if (it.ser) {
      var ns = serSeen(it);
      $('vod-meta').textContent = it.group + '  ·  ' + (it.seasons > 1 ? t('vodSeasons', it.seasons) + '  ·  ' : '') + t('vodEps', it.eps.length);
      $('vod-resume').textContent = hid ? '🔒 ' + t('locked') : ns ? '✓ ' + t('vodSeenN', ns, it.eps.length) : '';
      return;
    }
    var ep = epOf(it);
    $('vod-meta').textContent = it.group + (ep && V.ser ? '  ·  ' + epLabel(ep) : '');
    var pp = pos[vodKey(it)];
    $('vod-resume').textContent = hid ? '🔒 ' + t('locked') : pp ? t('vodResumeAt', fmtDur(pp.p) + (pp.d ? ' / ' + fmtDur(pp.d) : '')) : vodSeen()[vodKey(it)] ? '✓ ' + t('vodWatched') : '';
  }

  function vodKeyDown(k) {
    var c = V.cats[V.ci], items = vodList();
    if (k === KEY.BACK || k === KEY.ESC || k === KEY.BACKSPACE) {
      if (vodLeaveSer()) return;
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
        if (c.id === 'search') { if (k === KEY.ENTER || !items.length) vodStartSearch(); else { V.focus = 'items'; renderVod(); } return; }
        if (!items.length) return;
        var go = function () { V.focus = 'items'; renderVod(); };
        if (c.adult && get('adult') === 'lock' && !S.unlocked) askPin(function (ok) { if (ok) go(); }); else go();
        return;
      } else return;
    } else {
      var page = pageSize($('vod-items'));
      if (!items.length) { V.focus = 'cats'; renderVod(); return; }
      var cur = items[V.ii];
      if (k === KEY.UP && V.ii === 0 && c.id === 'search' && !V.ser) { vodStartSearch(); return; }
      if (k === KEY.UP) V.ii = (V.ii - 1 + items.length) % items.length;
      else if (k === KEY.DOWN) V.ii = (V.ii + 1) % items.length;
      else if (k === KEY.CH_UP) V.ii = Math.max(0, V.ii - page);
      else if (k === KEY.CH_DOWN) V.ii = Math.min(items.length - 1, V.ii + page);
      else if (k === KEY.LEFT) { if (vodLeaveSer()) return; V.focus = 'cats'; }
      else if (cur && cur.ser && (k === KEY.ENTER || k === KEY.RIGHT || k === KEY.PLAY || k === KEY.PLAYPAUSE)) { guarded(cur, function () { vodEnterSer(cur); }); return; }
      else if (k === KEY.ENTER || k === KEY.PLAY || k === KEY.PLAYPAUSE) { playVod(cur); return; }
      else if (k === KEY.RED) { if (!cur.ser) playVod(cur, true); return; }
      else if (k === KEY.GREEN) {
        // gesehen / nicht gesehen umschalten (bei einer Serie alle Folgen)
        var on = !isSeen(cur);
        (cur.ser ? cur.eps : [cur]).forEach(function (e) { vodMarkSeen(vodKey(e), on); });
        toast((on ? '✓ ' : '') + t(on ? 'vodMarked' : 'vodUnmarked'), 1500);
      }
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
      S.vod = { item: it, ser: V.ser && V.ser.it.eps.indexOf(it) >= 0 ? V.ser.it : vodSerOf(it) };
      S.livePause = null;
      S.mode = 'player'; show('vod', false);
      applyAspect();
      Player.start(it.url, false, at);
      if (at) toast(t('vodResumed', fmtDur(at)), 2500);
      showInfo();
    });
  }
  /** Film beenden und zurück in die Mediathek */
  function exitVod(done) {
    vodSavePos(done);
    // Folge zu Ende: nächste Folge der Serie gleich abspielen
    var v = S.vod, eps = v && v.ser ? v.ser.eps : null, n = eps ? eps.indexOf(v.item) : -1;
    if (done && n >= 0 && n + 1 < eps.length) {
      if (V.ser && V.ser.it === v.ser) V.ii = n + 1;
      S.vod = null;
      playVod(eps[n + 1], true);
      toast('▶ ' + (epLabel(epOf(eps[n + 1])) || eps[n + 1].name), 3000);
      return;
    }
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
    show('ib-audio', false); show('ib-aspect', false);
    renderStream();
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
  function openEpg(ch, prog) {
    S.mode = 'epg';
    S.epg.ch = ch;
    S.epg.day = 0;
    show('list', false); hideInfo(); show('epg', true);
    if (ch.logo && get('showLogos')) { $('epg-logo').src = ch.logo; $('epg-logo').parentNode.style.display = ''; }
    else $('epg-logo').parentNode.style.display = 'none';
    $('epg-title').textContent = ch.num + '  ' + ch.name;
    buildEpgDay(true);
    if (prog) {
      var d0 = new Date(); d0.setHours(0, 0, 0, 0);
      var ds = new Date((prog.s + shiftOf(ch)) * 1000); ds.setHours(0, 0, 0, 0);
      S.epg.day = Math.max(minDay(ch), Math.min(2, Math.round((ds.getTime() - d0.getTime()) / 86400000)));
      buildEpgDay(false);
      var pi = S.epg.items.indexOf(prog); if (pi >= 0) { S.epg.sel = pi; renderEpg(); }
    }
    updateClock();
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
        '<span class="mk">' + (isNow ? '●' : canArchive(ch, p) ? '⟲' : reminded(ch, p) ? '⏰' : '') + '</span>' +
        '<span class="t">' + esc(p.t) + '</span><span class="dur">' + t('minutes', Math.round((p.e - p.s) / 60)) + '</span></div>';
    });
    var p = items[S.epg.sel], isNow = p.s + sh <= now && p.e + sh > now;
    $('epg-pname').textContent = p.t;
    $('epg-ptime').textContent = dateStr(new Date((p.s + sh) * 1000)) + '  ' + hm(p.s + sh) + ' – ' + hm(p.e + sh);
    $('epg-pstate').textContent = isNow ? '● ' + t('live') + ' · ' + t('minLeft', Math.round((p.e + sh - now) / 60)) :
      canArchive(ch, p) ? '⟲ ' + t('archive') : p.s + sh > now ? (reminded(ch, p) ? '⏰ ' + t('remindActive') : t('notStarted') + '  ·  ' + t('remindHint')) + (serIdx(ch, p) ? '  ·  🔁 ' + t('seriesActive') : '') : t('noArchive');
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
      else if (p.s + sh > now) remindMenu(ch, p);
      else toast(t('noArchive'));
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
    sys: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',
    profiles: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18.5 14.2A6.5 6.5 0 0 1 21.5 20"/>'
  };

  var SUBCOL = { white: '#ffffff', yellow: '#ffd75e', cyan: '#8fe3ff' };
  var CATS = [
    { id: 'source', label: 'catSource', items: [
      { id: 'srcSel', type: 'act', label: 'sSrcSel', help: 'hSrc', run: openSrcMenu, value: function () { return (srcById(S.srcId) || {}).name || ''; }, when: function () { return S.sources.length > 0; } },
      { id: 'srcName', type: 'text', label: 'sSrcName', help: 'hSrc', getv: function () { return (srcById(S.srcId) || {}).name || ''; }, setv: renameSource, when: function () { return S.sources.length > 0; } },
      { k: 'source', label: 'sSource', opts: function () { return tr([['edem', 'vEdem'], ['url', 'vUrl']]); } },
      { k: 'key', type: 'text', label: 'sKey', help: 'hKey', when: isEdem, mask: true, dep: ['source', 'edem'] },
      { k: 'domain', type: 'text', label: 'sDomain', help: 'hDomain', when: isEdem, dep: ['source', 'edem'] },
      { k: 'plRefresh', label: 'sPlRefresh', help: 'hPlRefresh', opts: function () { return [[0, t('vOff')]].concat([6, 12, 24].map(function (v) { return [v, t('hours', v)]; })); } },
      { k: 'playlist', type: 'text', label: 'sPlaylist', help: 'hPlaylist', when: function () { return !isEdem(); }, dep: ['source', 'url'] },
      { k: 'vod', type: 'text', label: 'sVod', help: 'hVod' },
      { id: 'openVod', type: 'act', label: 'sOpenVod', help: 'hVod', run: openVod, when: hasVod },
      { id: 'qrSource', type: 'act', label: 'sRemoteQr', help: 'hRemoteQr', run: openQr, when: function () { return Platform.phoneSetup; } },
      { id: 'loadList', type: 'act', label: 'sLoadList', help: 'hLoadList', primary: true, run: actLoadList },
      { id: 'srcAdd', type: 'act', label: 'sSrcAdd', help: 'hSrc', run: addSource, when: function () { return isConfigured() && S.sources.length < 8; } },
      { id: 'srcDel', type: 'act', label: 'sSrcDel', help: 'hSrc', confirm: true, run: delSource, when: function () { return S.sources.length > 1; } }
    ] },
    { id: 'iface', label: 'catInterface', items: [
      { k: 'lang', label: 'sLang', opts: function () { return I18N.langs; } },
      { k: 'theme', label: 'sTheme', opts: function () { return tr([['night', 'tNight'], ['oled', 'tOled'], ['graphite', 'tGraphite'], ['ocean', 'tOcean'], ['aurora', 'tAurora'], ['light', 'tLight']]); } },
      { k: 'splash', label: 'sSplash', help: 'hSplash', opts: yn },
      { k: 'logoShape', label: 'sLogoShape', opts: function () { return tr([['rect', 'vLogoRect'], ['round', 'vLogoRound'], ['square', 'vLogoSquare']]); } },
      { k: 'textColor', label: 'sTextColor', help: 'hTextColor', swatch: TEXTS, opts: function () { return tr([['auto', 'vAuto'], ['white', 'fWhite'], ['cream', 'fCream'], ['yellow', 'fYellow'], ['cyan', 'fCyan'], ['green', 'fGreen'], ['pink', 'fPink'], ['black', 'fBlack']]); } },
      { k: 'accent', label: 'sAccent', swatch: ACCENTS, opts: function () { return tr([['blue', 'cBlue'], ['green', 'cGreen'], ['purple', 'cPurple'], ['orange', 'cOrange'], ['red', 'cRed'], ['teal', 'cTeal']]); } },
      { k: 'scale', label: 'sScale', opts: function () { return [80, 90, 100, 110, 120, 130].map(function (v) { return [v, v + ' %']; }); } },
      { k: 'clock', label: 'sClock', opts: function () { return tr([['off', 'vOff'], ['menus', 'vMenus'], ['always', 'vAlways']]); } },
      { k: 'timeFmt', label: 'sTimeFmt', opts: function () { return [['24', '24 h  (20:15)'], ['12', '12 h  (8:15p)']]; } },
      { k: 'infoTimeout', label: 'sInfoTimeout', opts: function () { return [3, 5, 8, 12].map(function (v) { return [v, t('seconds', v)]; }).concat([[0, t('vUntilClosed')]]); } },
      { k: 'infoOnZap', label: 'sInfoOnZap', opts: yn },
      { k: 'infoPos', label: 'sInfoPos', opts: function () { return tr([['bottom', 'vBottom'], ['top', 'vTop']]); } },
      { k: 'panelBg', label: 'sPanelBg', opts: function () { return tr([['solid', 'vSolid'], ['glass', 'vGlass']]); } },
      { k: 'anim', label: 'sAnim', opts: yn },
      { k: 'saver', label: 'sSaver', help: 'hSaver', opts: function () { return [[0, t('vOff')]].concat([1, 3, 5, 10].map(function (v) { return [v, t('minutes', v)]; })); } }
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
      { k: 'groupNow', label: 'sGroupNow', help: 'hGroupNow', opts: yn },
      { k: 'logoTpl', type: 'text', label: 'sLogoTpl', help: 'hLogoTpl' },
      { id: 'logoPhone', type: 'act', label: 'sLogoPhone', help: 'hLogoPhone', run: openQr, when: function () { return Platform.phoneSetup; } },
      { k: 'groupIcons', label: 'sGroupIcons', opts: function () { return tr([['tile', 'vIconTile'], ['line', 'vIconLine'], ['letter', 'vIconLetter'], ['off', 'vOff']]); } },
      { k: 'groupCounts', label: 'sGroupCounts', opts: yn },
      { k: 'groupHistory', label: 'sGroupHistory', opts: yn },
      { k: 'showHidden', label: 'sShowHidden', help: 'hShowHidden', opts: yn },
      { id: 'unhideAll', type: 'act', label: 'sUnhideAll', help: 'hShowHidden', run: actUnhideAll, when: function () { return Object.keys(S.hiddenGroups).length + Object.keys(S.chHide).length > 0; } },
      { k: 'listAutoClose', label: 'sListAutoClose', help: 'hListAutoClose', opts: function () { return [[0, t('vOff')]].concat([10, 20, 30, 60].map(function (v) { return [v, t('seconds', v)]; })); } },
      { k: 'numDelay', label: 'sNumDelay', opts: function () { return [1, 1.5, 2, 3].map(function (v) { return [v, t('seconds', v)]; }); } }
    ] },
    { id: 'play', label: 'catPlayback', items: [
      { k: 'engine', label: 'sEngine', help: 'hEngine', opts: function () { return tr([['native', 'vNative'], ['hlsjs', 'vHlsjs']]); } },
      { k: 'aspect', label: 'sAspect', opts: function () { return tr([['fit', 'vFit'], ['fill', 'vFill'], ['stretch', 'vStretch'], ['zoom', 'vZoom']]); } },
      { k: 'buffer', label: 'sBuffer', help: 'hBuffer', opts: function () { return [10, 20, 30, 60].map(function (v) { return [v, t('seconds', v)]; }); } },
      { k: 'retries', label: 'sRetries', opts: function () { return [[0, '0'], [3, '3'], [10, '10'], [-1, t('vUnlimited')]]; } },
      { k: 'timeout', label: 'sTimeout', help: 'hTimeout', opts: function () { return [10, 15, 30, 60].map(function (v) { return [v, t('seconds', v)]; }).concat([[0, t('vOff')]]); } },
      { k: 'audioLang', label: 'sAudioLang', help: 'hAudioLang', opts: function () { return [['auto', t('vAuto')]].concat(LANG_NAMES); } },
      { k: 'subtitles', label: 'sSubtitles', opts: yn },
      { k: 'subSize', label: 'sSubSize', help: 'hSubStyle', when: subsOn, opts: function () { return tr([['s', 'vSubS'], ['m', 'vSubM'], ['l', 'vSubL'], ['xl', 'vSubXL']]); } },
      { k: 'subColor', label: 'sSubColor', help: 'hSubStyle', when: subsOn, swatch: SUBCOL, opts: function () { return tr([['white', 'fWhite'], ['yellow', 'fYellow'], ['cyan', 'fCyan']]); } },
      { k: 'subBg', label: 'sSubBg', help: 'hSubStyle', when: subsOn, opts: function () { return tr([['shadow', 'vShadow'], ['box', 'vBox'], ['none', 'vOff']]); } },
      { k: 'startScreen', label: 'sStartScreen', opts: function () { return tr([['play', 'vStartPlay'], ['list', 'vStartList']]); } },
      { k: 'streamInfo', label: 'sStreamInfo', help: 'hStreamInfo', opts: yn },
      { id: 'diag', type: 'act', label: 'sDiag', help: 'hDiag', run: function () { openDiag(S.current); }, when: function () { return !!S.current; } },
      { id: 'sleep', label: 'sSleep', getv: function () { return S.sleepMin; }, setv: setSleep,
        opts: function () { return [[0, t('vOff')]].concat([15, 30, 60, 90, 120, 180].map(function (v) { return [v, t('minutes', v)]; })); } },
      { k: 'wake', label: 'sWake', help: 'hWake', opts: yn },
      { k: 'wakeH', label: 'sWakeHour', help: 'hWake', when: wakeOn, opts: function () { var o = []; for (var h = 0; h < 24; h++) o.push([h, pad(h) + ':' + pad(+get('wakeM'))]); return o; } },
      { k: 'wakeM', label: 'sWakeMin', help: 'hWake', when: wakeOn, opts: function () { var o = []; for (var m = 0; m < 60; m += 5) o.push([m, pad(+get('wakeH')) + ':' + pad(m)]); return o; } },
      { k: 'wakeDays', label: 'sWakeDays', help: 'hWake', when: wakeOn, opts: function () { return tr([['daily', 'vDaily'], ['weekdays', 'vWeekdays'], ['weekend', 'vWeekend']]); } },
      { k: 'wakeCh', label: 'sWakeCh', help: 'hWake', when: wakeOn, opts: wakeChOpts }
    ] },
    { id: 'epg', label: 'catEpg', items: [
      { k: 'epgMode', label: 'sEpgMode', opts: function () { return tr([['full', 'vEpgFull'], ['compact', 'vEpgCompact'], ['playlist', 'vEpgPlaylist'], ['custom', 'vEpgCustom'], ['off', 'vOff']]); } },
      { k: 'epg', type: 'text', label: 'sEpgUrl', when: function () { return get('epgMode') === 'custom'; }, dep: ['epgMode', 'custom'] },
      { k: 'epgShift', label: 'sEpgShift', opts: function () { var o = []; for (var h = -12; h <= 12; h++) o.push([h, t('hours', (h > 0 ? '+' : '') + h)]); return o; } },
      { k: 'epgRefresh', label: 'sEpgRefresh', opts: function () { return [6, 12, 24].map(function (v) { return [v, t('hours', v)]; }); } },
      { k: 'catchup', label: 'sCatchup', help: 'hCatchup', opts: function () { return [['auto', t('vAuto')], ['shift', 'Shift (utc/lutc)'], ['flussonic', 'Flussonic']]; } },
      { k: 'seekStep', label: 'sSeek', opts: function () { return [1, 2, 5, 10].map(function (v) { return [v, t('minutes', v)]; }); } },
      { k: 'archiveOffset', label: 'sArchiveOffset', help: 'hArchiveOffset', opts: function () { return [[0, t('vOff')]].concat([1, 2, 5, 10].map(function (v) { return [v, t('minutes', v)]; })); } },
      { k: 'remindLead', label: 'sRemindLead', help: 'hRemind', opts: function () { return [[0, t('vAtStart')]].concat([1, 2, 5].map(function (v) { return [v, t('minBefore', v)]; })); } },
      { k: 'remindAct', label: 'sRemindAct', help: 'hRemind', opts: function () { return tr([['ask', 'vAsk'], ['switch', 'vSwitch']]); } },
      { k: 'watchWords', type: 'text', label: 'sWatch', help: 'hWatch' },
      { id: 'seriesList', type: 'act', label: 'sSeries', help: 'hSeries', value: function () { return String(S.series.length); }, when: function () { return S.series.length > 0; }, run: openSeriesMenu },
      { id: 'clearRemind', type: 'act', label: 'sClearRemind', help: 'hRemind', confirm: true, value: function () { return String(S.reminders.length + S.series.length); }, when: function () { return S.reminders.length + S.series.length > 0; },
        run: function () { S.reminders = []; S.series = []; psave('reminders', S.reminders); psave('series', S.series); toast(t('remindsCleared'), 2000); renderSettings(); } },
      { id: 'clearEpg', type: 'act', label: 'sClearEpg', help: 'hClearEpg', run: actClearEpg }
    ] },
    { id: 'parental', label: 'catParental', items: [
      { k: 'adult', label: 'sAdult', help: 'hAdult', opts: function () { return tr([['show', 'vShow'], ['lock', 'vLock'], ['hide', 'vHide']]); } },
      { k: 'pin', type: 'text', label: 'sPin', help: 'hPin', digits: true },
      { k: 'protectSettings', label: 'sProtect', help: 'hProtect', opts: yn },
      { id: 'unlockAll', type: 'act', label: 'sUnlockAll', help: 'hUnlockAll', confirm: true, run: actUnlockAll, value: function () { return String(Object.keys(S.chLock).length); },
        when: function () { return Object.keys(S.chLock).length > 0; } }
    ] },
    { id: 'profiles', label: 'catProfiles', items: [
      { id: 'profile', label: 'sProfile', help: 'hProfile', opts: profOpts, getv: function () { return S.prof; }, setv: function (v) { switchProfile(String(v)); } },
      { id: 'profName', type: 'text', label: 'sProfileName', help: 'hProfile', getv: function () { return profName(S.prof); }, setv: renameProfile },
      { id: 'addProfile', type: 'act', label: 'sAddProfile', help: 'hProfile', run: addProfile, when: function () { return S.profiles.length < 8; } },
      { id: 'delProfile', type: 'act', label: 'sDelProfile', confirm: true, run: delProfile, when: function () { return !!S.prof; } },
      { k: 'profileAsk', label: 'sProfileAsk', help: 'hProfileAsk', opts: yn, when: function () { return S.profiles.length > 0; } }
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
      { k: 'updateCheck', label: 'sUpdateCheck', help: 'hUpdateCheck', opts: yn },
      { id: 'checkUpdate', type: 'act', label: 'sCheckUpdate', run: function () { checkUpdate(true); } },
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
      var v = String(itemValue(it) || '');
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
      if (err) {
        // ohne Root: Protokoll des Developer-Mode-Autostarts vom eigenen Dienst holen
        luna('luna://com.iptvplayer.app.service/autostartLog', {}, function (r) {
          var l = r && r.returnValue && r.log && r.log.length ? r.log.slice(-6).join('\n') : '';
          if (l !== (S.autostartLog || '')) { S.autostartLog = l; if (S.mode === 'settings') renderSettings(); }
        });
        return;
      }
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
      S.autostart = on; save('autostart', on); save('autostartV', 2);
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
        checkAutostart();
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
      else val = (it.swatch && it.swatch[itemValue(it)] ? '<span class="swatch" style="background:' + it.swatch[itemValue(it)] + '"></span>' : '') +
        '<span class="arr">‹</span><span>' + esc(displayValue(it)) + '</span><span class="arr">›</span>';
      return '<div class="' + cls + '"><span class="lbl">' + esc(t(it.label)) + '</span><span class="val">' + val + '</span></div>';
    });
    var cur = items[st.ri];
    var help = st.focus === 'rows' && cur && cur.help ? t(cur.help) : '';
    if (help && cur.id === 'autostart' && S.autostartLog) help += '\n' + t('autostartLog') + ':\n' + S.autostartLog;
    $('set-help').textContent = help;
  }

  function startEdit(it) {
    S.set.editing = it.k || it.id; S.set.editItem = it;
    var rows = $('set-rows').querySelectorAll('.opt.sel .val');
    if (!rows.length) return;
    rows[0].innerHTML = '<input id="set-input" type="' + (it.digits ? 'tel' : 'text') + '" spellcheck="false" autocomplete="off" maxlength="' + (it.digits ? 4 : 2000) + '">';
    var inp = $('set-input');
    inp.value = itemValue(it) || '';
    inp.focus();
  }

  function finishEdit(commit) {
    var k = S.set.editing, it = S.set.editItem, inp = $('set-input');
    S.set.editing = null; S.set.editItem = null;
    if (commit && inp && it && it.setv) it.setv(inp.value.trim());
    else if (commit && inp) {
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
    if (c.id === 'parental' && (get('adult') !== 'show' || Object.keys(S.chLock).length) && !S.unlocked) askPin(function (ok) { if (ok) go(); });
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
      case 'watchWords': autoRemind(); break;
      case 'accent':
        var hex = ACCENTS[get('accent')] || ACCENTS.blue, n = parseInt(hex.substring(1), 16);
        document.documentElement.style.setProperty('--accent', hex);
        document.documentElement.style.setProperty('--accent-rgb', (n >> 16) + ',' + ((n >> 8) & 255) + ',' + (n & 255));
        break;
      case 'textColor':
        var tc = TEXTS[get('textColor')];
        if (tc) document.body.style.setProperty('--text', tc); else document.body.style.removeProperty('--text');
        break;
      case 'scale': document.documentElement.style.setProperty('--scale', (+get('scale') || 100) / 100); break;
      case 'clock': case 'timeFmt': updateClock(); break;
      case 'sort': case 'adult': if (S.channels.length) buildGroups(); break;
      case 'theme':
        document.body.className = document.body.className.replace(/\s*theme-\w+/g, '');
        if (get('theme') !== 'night') document.body.classList.add('theme-' + get('theme'));
        break;
      case 'logoShape':
        document.body.classList[get('logoShape') === 'round' ? 'add' : 'remove']('logo-round');
        document.body.classList[get('logoShape') === 'square' ? 'add' : 'remove']('logo-square');
        placeVideo();
        break;
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
      case 'subSize': case 'subColor': case 'subBg': applySubStyle(); break;
      case 'logoTpl': applyLogos(); rerender(); break;
      case 'groupNow': if (S.channels.length) { buildGroups(); S.gi = 0; S.ci = 0; } break;
      case 'streamInfo': if (visible('infobar')) renderInfo(); break;
      case 'wake': case 'wakeH': case 'wakeM': case 'wakeDays': case 'wakeCh':
        clearTimeout(S.wakeT); S.wakeT = setTimeout(function () { armWake(false); }, 1500);
        if (S.mode === 'settings') renderSettings();
        break;
      case 'epgMode': case 'epg': loadEpg(); break;
      case 'epgRefresh': armEpgRefresh(); break;
    }
  }
  function applyAll() {
    ['lang', 'theme', 'logoShape', 'textColor', 'accent', 'scale', 'engine', 'aspect', 'panelBg', 'anim', 'groupCounts', 'infoPos', 'subSize'].forEach(applySetting);
    armEpgRefresh(); armPlRefresh();
  }
  function rerender() {
    if (S.mode === 'list') renderList();
    else if (S.mode === 'epg') buildEpgDay(false);
    else if (S.mode === 'settings') renderSettings();
    else if (S.mode === 'vod') renderVod();
    else if (S.mode === 'now') renderNow();
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
    if (mode === 'last') {
      var last = pload('last', ''), sl = (srcById(S.srcId) || {}).last;
      for (i = 0; i < S.channels.length; i++) if (chKey(S.channels[i]) === last) ch = S.channels[i];
      if (!ch && sl) for (i = 0; i < S.channels.length; i++) if (chKey(S.channels[i]) === sl) ch = S.channels[i];
    }
    if (mode === 'fav' && S.groups[1] && S.groups[1].items.length) ch = S.groups[1].items[0];
    if (ch && get('adult') !== 'show' && isAdult(ch)) ch = null;
    return ch || list[0];
  }

  /** Beim Start die zuletzt benutzte Kategorie wieder wählen (Umschalten und Liste bleiben darin) */
  function startGroup(ch) {
    if (!ch) return;
    var mode = get('start'), want = mode === 'last' ? pload('lastGroup', '') : mode === 'fav' ? 'fav' : '';
    for (var i = 0; i < S.groups.length; i++) {
      var g = S.groups[i], idx = g.items.indexOf(ch);
      if (want && groupKey(g) === want && idx >= 0) { S.gi = i; S.ci = idx; S.listPos = { gi: i, ci: idx }; return; }
    }
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
    S.favs = {}; psave('favs', S.favs); if (S.channels.length) buildGroups(); toast(t('favsCleared')); renderSettings();
  }
  function actResetAll() {
    try {
      var ks = [];
      for (var i = 0; i < localStorage.length; i++) ks.push(localStorage.key(i));
      ks.forEach(function (k) { var b = k.split('@')[0]; if (PROFILE_KEYS.indexOf(b) >= 0 || ['settings', 'profiles', 'profile', 'profileMain', 'wakeDone', 'sources', 'sourceId', 'logoMap'].indexOf(b) >= 0) localStorage.removeItem(k); });
    } catch (e) {}
    EPG.clearCache(function () { toast(t('resetDone')); setTimeout(function () { location.reload(); }, 800); });
  }

  // ---------- Sicherung auf dem Fernseher ----------
  function backupData() { return { app: 'iptvplayer', v: 1, date: new Date().toISOString(), settings: S.settings, favs: S.favs, sources: S.sources, sourceId: S.srcId, logos: S.logoMap }; }
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
    save('settings', st); psave('favs', fv);
    if (Object.prototype.toString.call(b.sources) === '[object Array]') { save('sources', b.sources.filter(function (x) { return x && x.id && x.cfg; })); save('sourceId', String(b.sourceId || '')); }
    if (b.logos && typeof b.logos === 'object') save('logoMap', cleanLogos(b.logos));
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
    ['wTitle', 'wSave', 'wSaved', 'wDownload', 'wUpload', 'wBackup', 'wBackupHelp', 'wPin', 'wErr', 'wRestored', 'wFavs', 'wLogos', 'wLogoSearch', 'wLogoHelp', 'wLogoUrl'].forEach(function (k) { ui[k] = t(k); });
    var schema = remoteSchema(), vals = {};
    schema.forEach(function (c) { c.items.forEach(function (it) { var v = get(it.k); vals[it.k] = v === undefined || v === null ? '' : String(v); }); });
    vals.pin = ''; // PIN wird im Formular nie angezeigt
    // Sender für die Logo-Bearbeitung: [Name, Schlüssel, Logo aus der Playlist, eigenes Logo]
    var chs = S.channels.map(function (c) { var k = chKey(c); return [c.name, k, c._logo0 || '', S.logoMap[k] || '']; });
    return { ui: ui, schema: schema, settings: vals, favs: S.favs, channels: chs, title: 'IPTVPlayer ' + VERSION, backup: backupData() };
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
    if (k === 'watchWords') v = v.replace(/\s*[,;\n]\s*/g, ', ').substring(0, 300);
    return v;
  }

  /** Änderungen vom Handy prüfen und übernehmen */
  function remoteEvent(e) {
    if (e.type === 'restore') { restoreBackup(e.data); return; }
    if (e.type !== 'apply' || !e.data || typeof e.data.settings !== 'object') return;
    var defs = {}, changed = [], pinFail = false, nl = 0;
    if (e.data.logos && typeof e.data.logos === 'object') {
      if (+get('protectSettings') && String(e.data.pin || '') !== String(get('pin'))) pinFail = true;
      else {
        var lg = e.data.logos;
        Object.keys(lg).forEach(function (k) { var u = String(lg[k] || '').trim(); if (!u) delete S.logoMap[k]; else if (/^https?:\/\/\S+$/.test(u)) S.logoMap[k] = u; else return; nl++; });
        if (nl) { save('logoMap', S.logoMap); applyLogos(); remotePush(); }
      }
    }
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
    var msg = pinFail ? t('pinRemote') : nl && !changed.length ? t('logosApplied', nl) : t('remoteApplied');
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

  // ---------- Update-Prüfung ----------
  // Neueste Version aus dem Homebrew-Katalog (GitHub Pages); Hinweise aus dem GitHub-Release.
  var UPD_URL = 'https://vbleich-lab.github.io/IPTVPlayer/api/apps.json';
  var UPD_NOTES = 'https://api.github.com/repos/vbleich-lab/IPTVPlayer/releases/tags/v';
  var UPD_DL = 'https://github.com/vbleich-lab/IPTVPlayer/releases/download/v';
  var U = { info: null, sel: 0, busy: false };
  function verCmp(a, b) {
    var x = String(a).split('.'), y = String(b).split('.');
    for (var i = 0; i < Math.max(x.length, y.length); i++) { var d = (+x[i] || 0) - (+y[i] || 0); if (d) return d > 0 ? 1 : -1; }
    return 0;
  }
  function canSelfUpdate() { return Platform.name === 'webos' || Platform.name === 'android'; }
  /** manual: aus den Einstellungen („Jetzt nach Updates suchen“) – meldet auch „aktuell“ und Fehler */
  function checkUpdate(manual) {
    if (!manual && (!+get('updateCheck') || Platform.name === 'browser')) return;
    if (manual) toast(t('updChecking'), 1500);
    xhrText(UPD_URL + '?t=' + Date.now(), function (err, text) {
      var m = null;
      try { m = JSON.parse(text).packages[0].manifest; } catch (e) { err = err || e; }
      if (err || !m || !m.version) { if (manual) toast(t('updFail', err ? err.message : '?')); return; }
      if (verCmp(m.version, VERSION) <= 0) { save('updLater', ''); if (manual) toast(t('updNone', VERSION)); return; }
      U.info = { v: m.version, ipk: m.ipkUrl, sha: m.ipkHash && m.ipkHash.sha256, apk: UPD_DL + m.version + '/IPTVPlayer-' + m.version + '.apk' };
      if (!canSelfUpdate()) { toast(t('updManualAvail', m.version), 8000); return; }
      // „Beim nächsten Start“ gewählt: jetzt ohne weitere Frage installieren
      if (!manual && load('updLater', '') === m.version) { openUpdate(); runUpdate(); return; }
      openUpdate();
    });
  }
  function openUpdate() {
    if (S.modal && S.modal !== 'update') { setTimeout(openUpdate, 10000); return; } // erst PIN o. Ä. abwarten
    U.sel = 0; U.busy = false;
    S.modal = 'update';
    $('upd-title').textContent = t('updTitle');
    $('upd-text').textContent = t('updText', U.info.v, VERSION);
    $('upd-notes').innerHTML = '';
    $('upd-status').textContent = '';
    renderUpdate();
    show('update', true);
    xhrText(UPD_NOTES + U.info.v, function (err, text) {
      if (err) return;
      var body = ''; try { body = JSON.parse(text).body || ''; } catch (e) {}
      // Abschnitte je Sprache (<!-- lang:xx -->): Sprache der Oberfläche, sonst Russisch, sonst der erste
      var secs = {}, first = '';
      body.split(/<!--\s*lang:([a-z]{2})\s*-->/).forEach(function (part, i, arr) { if (i % 2) { secs[part] = arr[i + 1] || ''; if (!first) first = part; } });
      if (first) body = secs[I18N.get()] || secs.ru || secs[first];
      var lines = body.split(/\r?\n/).filter(function (l) { return /^\s*[-*]\s+/.test(l); }).slice(0, 5);
      $('upd-notes').innerHTML = lines.map(function (l) { return '<div>' + esc(l.replace(/^\s*[-*]\s+/, '').replace(/\*\*/g, '')) + '</div>'; }).join('');
    });
  }
  function renderUpdate() {
    $('upd-now').className = 'upd-btn' + (U.sel === 0 ? ' sel' : '') + (U.busy ? ' off' : '');
    $('upd-later').className = 'upd-btn' + (U.sel === 1 ? ' sel' : '') + (U.busy ? ' off' : '');
    $('upd-now').textContent = t('updNow');
    $('upd-later').textContent = t('updLater');
  }
  function closeUpdate() { S.modal = null; show('update', false); }
  function updStatus(txt, err) { $('upd-status').textContent = txt; $('upd-status').className = 'upd-status' + (err ? ' err' : ''); }
  function updateLater() {
    save('updLater', U.info.v);
    closeUpdate();
    toast(t('updLaterSaved', U.info.v), 3000);
  }
  function updFailed(text) {
    U.busy = false; renderUpdate();
    updStatus(t('updError', text) + (Platform.name === 'webos' ? '  ' + t('updManualHb') : ''), true);
  }
  function runUpdate() {
    if (!U.info) return;
    save('updLater', '');
    U.busy = true; renderUpdate();
    updStatus(t('updLoading'));
    if (Platform.name === 'android') {
      var r = Platform.installUpdate(U.info.apk);
      if (r === 'perm') { U.busy = false; renderUpdate(); updStatus(t('updPerm'), true); }
      else if (r !== 'started') updFailed(r.replace(/^error:\s*/, ''));
      return;
    }
    if (Platform.name !== 'webos' || !window.PalmServiceBridge) { updFailed('not supported'); return; }
    updateViaHb(function (ok, err) { if (!ok) updateViaService(err); });
  }
  /** Gerootete Fernseher: Installation über den Dienst des Homebrew Channels (lädt, prüft sha256, installiert als root) */
  function updateViaHb(cb) {
    var b = new window.PalmServiceBridge(), started = false, done = false;
    S.bridges.push(b);
    var fin = function (ok, err) { if (done) return; done = true; cb(ok, err); };
    b.onservicecallback = function (msg) {
      var r; try { r = JSON.parse(msg); } catch (e) { r = { returnValue: false, errorText: String(msg) }; }
      if (r.returnValue === false) {
        // Dienst fehlt oder verweigert (kein Root): eigenen Dienst versuchen; sonst echter Fehler
        if (!started) fin(false, r.errorText || '?'); else { done = true; updFailed(r.errorText || '?'); }
        return;
      }
      started = true;
      if (r.finished) { done = true; updStatus(t('updInstalling')); return; }
      updStatus(t('updInstalling') + (r.statusText ? '  (' + r.statusText + ')' : ''));
    };
    try { b.call('luna://org.webosbrew.hbchannel.service/install', JSON.stringify({ ipkUrl: U.info.ipk, ipkHash: U.info.sha, subscribe: true })); }
    catch (e) { fin(false, e.message); }
  }
  /** Developer Mode: eigener Dienst lädt die .ipk und installiert sie über den Installationsdienst */
  function updateViaService(hbErr) {
    var b = new window.PalmServiceBridge();
    S.bridges.push(b);
    b.onservicecallback = function (msg) {
      var r; try { r = JSON.parse(msg); } catch (e) { r = { returnValue: false, errorText: String(msg) }; }
      if (r.returnValue === false) { updFailed(r.errorText || '?'); return; }
      if (r.state === 'download') updStatus(t('updLoading'));
      else if (r.state === 'verify' || r.state === 'install' || r.state === 'installing' || r.state === 'installed') updStatus(t('updInstalling'));
    };
    try { b.call('luna://com.iptvplayer.app.service/update', JSON.stringify({ url: U.info.ipk, sha256: U.info.sha, subscribe: true })); }
    catch (e) { updFailed(e.message); }
  }
  // Android meldet Download/Installation über diese Funktion (Bridge.java)
  window.IPTVUpdateState = function (st, text) {
    if (st === 'install') { U.busy = false; renderUpdate(); updStatus(t('updConfirm')); }
    else if (st === 'error') updFailed(text || '?');
  };
  function updateKey(k) {
    if (U.busy) { if (k === KEY.BACK || k === KEY.ESC || k === KEY.BACKSPACE) closeUpdate(); return; }
    if (k === KEY.LEFT || k === KEY.RIGHT || k === KEY.UP || k === KEY.DOWN) { U.sel = 1 - U.sel; renderUpdate(); }
    else if (k === KEY.ENTER) { if (U.sel === 0) runUpdate(); else updateLater(); }
    else if (k === KEY.BACK || k === KEY.ESC || k === KEY.BACKSPACE) updateLater();
  }

  // ---------- Startbildschirm ----------
  // Sichtbar ab dem Laden der Seite; verschwindet, sobald der erste Sender läuft (mind. 1,5 s, höchstens 12 s).
  var SPLASH_T0 = Date.now(), splashDone = false;
  function hideSplash(now) {
    if (splashDone) return;
    var wait = now ? 0 : Math.max(0, 1500 - (Date.now() - SPLASH_T0));
    splashDone = true;
    setTimeout(function () {
      var el = $('splash'); if (!el) return;
      el.className = 'out';
      setTimeout(function () { el.style.display = 'none'; }, now ? 0 : 550);
    }, wait);
  }
  function splashStatus(txt) { if (!splashDone && $('sp-status')) $('sp-status').textContent = txt || ''; }

  // ---------- Profile ----------
  function loadProfileData() {
    S.favs = pload('favs', {}); S.history = pload('history', []); S.hiddenGroups = pload('hiddenGroups', {});
    S.audioPref = pload('audioPref', {}); S.aspectCh = pload('aspectCh', {}); S.chLock = pload('chLock', {}); S.chHide = pload('chHide', {});
    S.reminders = pload('reminders', []); S.series = pload('series', []); S.remindDone = pload('remindDone', {});
  }
  function profById(id) {
    if (!id) return { id: '', name: '' };
    for (var i = 0; i < S.profiles.length; i++) if (S.profiles[i].id === id) return S.profiles[i];
    return null;
  }
  function profName(id) { var p = profById(id); return id ? (p ? p.name : '?') : (load('profileMain', '') || t('profileMain')); }
  function profOpts() { return [['', profName('')]].concat(S.profiles.map(function (p) { return [p.id, p.name]; })); }
  function setProfile(id) { S.prof = id; save('profile', id); loadProfileData(); S.listPos = null; S.unlocked = false; }
  function switchProfile(id, quiet) {
    if (id === S.prof || !profById(id)) return;
    if (S.moving) S.moving = false;
    setProfile(id);
    if (S.channels.length) {
      buildGroups();
      var ch = startChannel(); startGroup(ch);
      if (ch) play(ch);
      if (S.mode !== 'player') hideInfo();
    }
    if (!quiet) toast(t('profileActive', profName(id)), 2500);
    if (S.mode === 'settings') renderSettings();
  }
  function renameProfile(v) {
    v = String(v || '').trim().slice(0, 24);
    if (!v) return;
    if (!S.prof) save('profileMain', v);
    else { profById(S.prof).name = v; save('profiles', S.profiles); }
  }
  function addProfile() {
    var id = 'p' + Date.now().toString(36);
    S.profiles.push({ id: id, name: t('profileN', S.profiles.length + 2) });
    save('profiles', S.profiles);
    switchProfile(id);
  }
  function delProfile() {
    var id = S.prof; if (!id) return;
    PROFILE_KEYS.forEach(function (k) { try { localStorage.removeItem(k + '@' + id); } catch (e) {} });
    S.profiles = S.profiles.filter(function (p) { return p.id !== id; });
    save('profiles', S.profiles);
    S.prof = null;
    switchProfile('');
  }
  /** Profilwahl beim Start (Einstellung „Beim Start fragen“) */
  function askProfile(cb) {
    var opts = profOpts(), sel = 0;
    for (var i = 0; i < opts.length; i++) if (opts[i][0] === S.prof) sel = i;
    openMenu(t('profileChoose'), opts.map(function (o) {
      return { label: o[1], check: o[0] === S.prof, run: function () { if (o[0] !== S.prof) setProfile(o[0]); if (S.channels.length) buildGroups(); cb(); } };
    }), sel, cb);
  }

  // ---------- Weck-Timer: zur eingestellten Zeit einen Sender einschalten ----------
  function wakeOn() { return !!+get('wake'); }
  function wakeChOpts() {
    var o = [['last', t('vLast')]], seen = { last: 1 }, w = get('wakeCh');
    var add = function (c) { var k = c && chKey(c); if (c && !seen[k]) { seen[k] = 1; o.push([k, c.name]); } };
    if (w !== 'last') S.channels.forEach(function (c) { if (chKey(c) === w) add(c); });
    if (S.current) add(S.current);
    (S.groups[1] && S.groups[1].items.length ? S.groups[1].items : (S.groups[0] ? S.groups[0].items.slice(0, 30) : [])).forEach(add);
    return o;
  }
  function wakeDayOk(d) { var w = get('wakeDays'), wd = d.getDay(); return w === 'weekdays' ? wd >= 1 && wd <= 5 : w === 'weekend' ? wd === 0 || wd === 6 : true; }
  /** fällig: heute noch nicht geweckt und höchstens 10 Minuten nach der Weckzeit */
  function wakeDue(d) {
    if (!wakeOn() || !wakeDayOk(d)) return false;
    var m = d.getHours() * 60 + d.getMinutes(), w = +get('wakeH') * 60 + +get('wakeM');
    return m >= w && m <= w + 10 && load('wakeDone', '') !== d.toDateString();
  }
  function wakeChannel() {
    var w = get('wakeCh'), k = w === 'last' ? pload('last', '') : w;
    for (var i = 0; i < S.visible.length; i++) if (chKey(S.visible[i]) === k) return S.visible[i];
    return startChannel();
  }
  function wakeUp() {
    save('wakeDone', new Date().toDateString());
    var ch = wakeChannel(); if (!ch) return;
    hideSaver();
    if (S.modal === 'sleep') { show('sleep', false); S.modal = null; }
    if (S.vod) { vodSavePos(); S.vod = null; }
    if (S.mode !== 'player') closePanels();
    startGroup(ch);
    play(ch);
    toast('⏰ ' + t('sWake') + ' – ' + ch.name, 5000);
  }
  /** Gerät soll die App zur Weckzeit selbst starten (webOS: Dienst/Activity Manager, Android: AlarmManager) */
  function armWake(quiet) {
    var on = wakeOn(), h = +get('wakeH'), m = +get('wakeM'), days = get('wakeDays');
    if (Platform.name === 'android') {
      var r = Platform.androidWake(on, h, m, days);
      if (on && r === 'perm') { toast(t('autostartPerm'), 10000); Platform.openAutostartPermission(); }
      else if (on && !quiet) toast(t('wakeSet', pad(h) + ':' + pad(m)), 3000);
    } else if (Platform.name === 'webos' && window.PalmServiceBridge && (on || load('wakeArmed', 0))) {
      luna('luna://com.iptvplayer.app.service/setWake', { on: on, h: h, m: m, days: days }, function (r) {
        var ok = r && r.returnValue;
        save('wakeArmed', on && ok ? 1 : 0);
        if (on && !(quiet && ok)) toast(ok ? t('wakeSet', pad(h) + ':' + pad(m)) : t('wakeSvcFail'), ok ? 3000 : 8000);
      });
    } else if (on && !quiet) toast(t('wakeSvcFail'), 6000);
  }

  // ---------- Bildschirmschoner: nur bei Pause oder wenn die Senderliste lange offen bleibt ----------
  S.lastKey = Date.now();
  function isPaused() { return !!S.livePause || (!!(S.archive || S.vod) && Player.position().paused); }
  function saverCheck() {
    var min = +get('saver');
    if (!min || S.saver || S.modal || S.searchEdit || document.hidden || Date.now() - S.lastKey < min * 60000) return;
    if (S.mode === 'player' && isPaused()) showSaver('pause');
    else if (S.mode === 'list') showSaver('list');
  }
  function showSaver(why) {
    S.saver = why;
    renderSaver(); show('saver', true); moveSaver();
    clearInterval(S.saverT);
    S.saverT = setInterval(function () { renderSaver(); moveSaver(); }, 12000);
  }
  function renderSaver() {
    var ch = S.vod ? null : S.current, it = S.vod ? S.vod.item : ch, e = ch ? epgAt(ch, S.livePause ? S.livePause.t : archivePos()) : {};
    $('sv-clock').textContent = hm(nowSec());
    $('sv-date').textContent = dateStr(new Date());
    var lg = $('sv-logo');
    if (it && it.logo && get('showLogos')) { if (lg.getAttribute('src') !== it.logo) lg.src = it.logo; lg.style.display = ''; } else lg.style.display = 'none';
    $('sv-name').textContent = it ? it.name : '';
    $('sv-title').textContent = e.now ? e.now.t : '';
    $('sv-state').textContent = S.saver === 'pause' ? '❚❚  ' + t('paused') : '';
  }
  function moveSaver() {
    var b = $('sv-box'), W = window.innerWidth, H = window.innerHeight;
    b.style.left = Math.round(Math.random() * Math.max(0, W - b.offsetWidth)) + 'px';
    b.style.top = Math.round(Math.random() * Math.max(0, H - b.offsetHeight)) + 'px';
  }
  function hideSaver() {
    if (!S.saver) return false;
    S.saver = null; clearInterval(S.saverT); show('saver', false);
    return true;
  }

  // ---------- Erinnerungen an Sendungen (OK auf einer kommenden Sendung im Programmführer) ----------
  function reminded(ch, p) {
    var k = chKey(ch), s0 = p.s + shiftOf(ch);
    for (var i = 0; i < S.reminders.length; i++) if (S.reminders[i].k === k && S.reminders[i].s === s0) return i + 1;
    return 0;
  }
  function toggleReminder(ch, p) {
    var i = reminded(ch, p), sh = shiftOf(ch);
    if (i) {
      S.reminders.splice(i - 1, 1); toast(t('remindOff'), 2000);
      S.remindDone[chKey(ch) + '|' + (p.s + sh)] = p.e + sh; psave('remindDone', S.remindDone); // nicht automatisch wieder anlegen
    }
    else {
      S.reminders.push({ k: chKey(ch), s: p.s + sh, e: p.e + sh, t: p.t, n: ch.name });
      S.reminders.sort(function (a, b) { return a.s - b.s; });
      if (S.reminders.length > 100) S.reminders.length = 100;
      toast(t('remindSet', p.t, hm(p.s + sh)), 3000);
    }
    psave('reminders', S.reminders);
  }
  function remindSwitch(r) {
    var ch = null;
    for (var i = 0; i < S.visible.length; i++) if (chKey(S.visible[i]) === r.k) { ch = S.visible[i]; break; }
    if (!ch) { toast(t('chNotFound', r.n), 3000); return; }
    hideSaver();
    if (S.modal === 'sleep') { show('sleep', false); S.modal = null; }
    if (S.vod) { vodSavePos(); S.vod = null; }
    if (S.mode !== 'player') closePanels();
    if (ch !== S.current || S.archive || S.livePause) play(ch);
  }
  function checkReminders() {
    if (!S.reminders || !S.reminders.length || !S.channels.length) return;
    var now = nowSec(), lead = (+get('remindLead') || 0) * 60, changed = false;
    for (var i = 0; i < S.reminders.length; i++) {
      var r = S.reminders[i];
      if (r.e <= now) { S.reminders.splice(i--, 1); changed = true; continue; }
      if (r.s - lead > now) continue;
      if (S.modal && S.modal !== 'menu') continue; // PIN, Update o. Ä. offen: später erneut
      S.reminders.splice(i--, 1); changed = true;
      var cur = S.current && chKey(S.current) === r.k && !S.archive && !S.vod;
      if (cur) { toast('⏰ ' + r.t, 5000); continue; }
      if (get('remindAct') === 'switch') { remindSwitch(r); toast('⏰ ' + r.t, 5000); continue; }
      hideSaver();
      if (S.modal === 'menu') closeMenu();
      (function (r) {
        openMenu('⏰ ' + hm(r.s) + '  ' + r.t, [
          { label: t('remindNow', r.n), run: function () { remindSwitch(r); } },
          { label: t('remindIgnore'), run: function () {} }
        ], 0);
      })(r);
      break;
    }
    if (changed) psave('reminders', S.reminders);
  }

  // ---------- Merkliste (Suchbegriffe) und Serien: Erinnerungen automatisch anlegen ----------
  /** Titel ohne Folgennummer, damit alle Folgen einer Sendung denselben Schlüssel haben */
  function serKey(title) {
    return normT(title).replace(/\([^)]*\)|\[[^\]]*\]/g, ' ')
      .replace(/\d+\s*-?\s*(?:я|й|ая|ый)?\s*(?:серия|сер\.|часть|ч\.|сезон|folge|teil|staffel|episode|ep\.|season|odcinek|część|bölüm|épisode|episodio|capítulo)/g, ' ')
      .replace(/(?:серия|сер\.|часть|ч\.|сезон|folge|teil|staffel|episode|ep\.|season|odcinek|część|bölüm|épisode|episodio|capítulo)\s*\d+/g, ' ')
      .replace(/[\s.,:;!?…\-–—]+$/, '').replace(/^[\s.,:;\-–—]+/, '').replace(/\s+/g, ' ');
  }
  function watchList() {
    return String(get('watchWords') || '').split(/[,;\n]/).map(function (w) { return normT(w).trim(); }).filter(function (w) { return w.length >= 3; });
  }
  function serIdx(ch, p) {
    var k = chKey(ch), st = serKey(p.t);
    for (var i = 0; i < S.series.length; i++) if (S.series[i].k === k && S.series[i].t === st) return i + 1;
    return 0;
  }
  /** OK auf einer kommenden Sendung: einmal erinnern oder an alle Folgen */
  function remindMenu(ch, p) {
    var si = serIdx(ch, p);
    openMenu(p.t, [
      { label: t(reminded(ch, p) ? 'remindDel' : 'remindOne'), run: function () { toggleReminder(ch, p); renderEpg(); } },
      { label: t(si ? 'seriesOff' : 'seriesOn'), run: function () { toggleSeries(ch, p); renderEpg(); } }
    ], 0);
  }
  function toggleSeries(ch, p) {
    var i = serIdx(ch, p), k = chKey(ch), st = serKey(p.t);
    if (i) {
      S.series.splice(i - 1, 1);
      S.reminders = S.reminders.filter(function (r) { return !(r.k === k && serKey(r.t) === st); });
      psave('series', S.series); psave('reminders', S.reminders);
      toast(t('seriesRemoved', p.t), 2500);
      return;
    }
    S.series.push({ k: k, t: st, d: p.t, n: ch.name });
    if (S.series.length > 40) S.series.shift();
    psave('series', S.series);
    if (!reminded(ch, p)) toggleReminder(ch, p);
    var n = autoRemind(true);
    toast(t('seriesSet', p.t, n + 1), 3500);
  }
  /** Einstellungen: gemerkte Serien ansehen und einzeln entfernen */
  function openSeriesMenu() {
    if (!S.series.length) return;
    openMenu(t('sSeries'), S.series.map(function (x, i) {
      return { label: x.d + '  ·  ' + x.n, run: function () {
        var rm = S.series.splice(i, 1)[0];
        S.reminders = S.reminders.filter(function (r) { return !(r.k === rm.k && serKey(r.t) === rm.t); });
        psave('series', S.series); psave('reminders', S.reminders);
        toast(t('seriesRemoved', rm.d), 2500); renderSettings();
        if (S.series.length) openSeriesMenu();
      } };
    }), 0);
  }
  /** Programm der nächsten 2 Tage nach Suchbegriffen und gemerkten Serien durchsuchen; gibt die Zahl neuer Erinnerungen zurück */
  function autoRemind(quiet) {
    if (!S.series || !EPG.isLoaded() || !S.channels.length) return 0;
    var words = watchList(), ser = {}, done = S.remindDone, now = nowSec(), until = now + 2 * 86400, added = [];
    S.series.forEach(function (x) { ser[x.k + '|' + x.t] = 1; });
    if (!words.length && !S.series.length) return 0;
    for (var i = 0; i < S.visible.length; i++) {
      var c = S.visible[i], arr = EPG.list(c);
      if (!arr || !arr.length || isLocked(c)) continue;
      var k = chKey(c), sh = shiftOf(c);
      for (var j = 0; j < arr.length; j++) {
        var x = arr[j], st = x.s + sh;
        if (st <= now || st > until || done[k + '|' + st]) continue;
        var n = x._n || (x._n = normT(x.t)), hit = false;
        for (var w = 0; w < words.length && !hit; w++) if (n.indexOf(words[w]) >= 0) hit = true;
        if (!hit && !(S.series.length && ser[k + '|' + serKey(x.t)])) continue;
        done[k + '|' + st] = x.e + sh; // nur einmal anlegen, auch wenn sie später gelöscht oder ausgelöst wird
        if (reminded(c, x) || S.reminders.length >= 100) continue;
        S.reminders.push({ k: k, s: st, e: x.e + sh, t: x.t, n: c.name, a: 1 });
        added.push(k + '|' + st);
      }
    }
    Object.keys(done).forEach(function (key) { if (done[key] < now) delete done[key]; });
    if (!added.length) { psave('remindDone', done); return 0; }
    S.reminders.sort(function (a, b) { return a.s - b.s; });
    psave('reminders', S.reminders); psave('remindDone', done);
    if (!quiet) toast('⏰ ' + t('autoAdded', added.length), 3500);
    if (S.mode === 'epg') renderEpg();
    return added.length;
  }

  // ---------- Untertitel-Stil ----------
  function subsOn() { return !!+get('subtitles'); }
  function applySubStyle() {
    var el = $('cue-style');
    if (!el) { el = document.createElement('style'); el.id = 'cue-style'; document.head.appendChild(el); }
    var size = { s: '80%', m: '100%', l: '130%', xl: '160%' }[get('subSize')] || '100%', bg = get('subBg');
    el.textContent = 'video::cue { font-size: ' + size + '; color: ' + (SUBCOL[get('subColor')] || '#fff') + '; background: ' +
      (bg === 'box' ? 'rgba(0,0,0,.75)' : 'transparent') + '; text-shadow: ' + (bg === 'shadow' ? '0 0 4px #000, 0 2px 3px #000' : 'none') + '; }';
  }

  // ---------- Senderprüfung: Antwortzeit, Playlist, Datenrate, Aussetzer ----------
  var D = { run: 0, ch: null, lines: [] };
  function openDiag(ch) {
    ch = ch || S.current; if (!ch) return;
    S.modal = 'diag'; show('diag', true);
    clearTimeout(S.infoTimer);
    runDiag(ch);
  }
  function closeDiag() { D.run++; S.modal = null; show('diag', false); }
  function renderDiag() {
    $('diag-title').textContent = t('diagTitle') + ' – ' + (D.ch ? D.ch.name : '');
    $('diag-rows').innerHTML = D.lines.map(function (l) {
      return '<div class="dg-row ' + (l[2] || '') + '"><span>' + esc(l[0]) + '</span><b>' + esc(l[1]) + '</b></div>';
    }).join('') + (D.busy ? '<div class="dg-row dim"><span>' + esc(t('diagRunning')) + '</span></div>' : '');
  }
  function dline(l, v, c) { D.lines.push([l, v, c || '']); renderDiag(); }
  function resolveUrl(base, rel) {
    if (/^\w+:\/\//.test(rel)) return rel;
    if (rel.charAt(0) === '/') return (/^\w+:\/\/[^\/]+/.exec(base) || [''])[0] + rel;
    return base.replace(/[?#].*$/, '').replace(/[^\/]*$/, '') + rel;
  }
  /** GET mit Zeitmessung; bytes: Download höchstens so lange messen (für endlose TS-Streams) */
  function dfetch(url, bin, cb) {
    var x = new XMLHttpRequest(), t0 = Date.now(), first = 0, done = false, got = 0;
    var fin = function (err) { if (done) return; done = true; clearTimeout(stop); cb(err, x, (first || Date.now()) - t0, got, Date.now() - t0); };
    x.open('GET', url, true);
    if (bin) x.responseType = 'arraybuffer';
    x.timeout = 15000;
    x.onreadystatechange = function () { if (x.readyState >= 2 && !first) first = Date.now(); };
    x.onprogress = function (e) { got = e.loaded || got; };
    x.onload = function () {
      if (bin && x.response) got = x.response.byteLength;
      if (x.status && (x.status < 200 || x.status >= 300)) fin('HTTP ' + x.status); else fin(null);
    };
    x.onerror = function () { fin(t('netError')); };
    x.ontimeout = function () { fin(t('timeout')); };
    var stop = bin ? setTimeout(function () { if (!done) { try { x.abort(); } catch (e) {} fin(null); } }, 7000) : null;
    x.send();
  }
  function runDiag(ch) {
    var id = ++D.run, url = ch.url;
    D.ch = ch; D.lines = []; D.busy = true; renderDiag();
    dline(t('diagServer'), (/^\w+:\/\/([^\/:?]+)/.exec(url) || [])[1] || '?');
    var hlsUrl = /\.m3u8?(\?|$)/i.test(url) || !/\.(ts|mp4|mkv)(\?|$)/i.test(url);
    var end = function (verdict, cls) {
      if (id !== D.run) return;
      if (ch === S.current) {
        var st = Player.stats();
        if (st.h) dline(t('sStreamInfo').replace(/\s.*$/, ''), st.w + '×' + st.h + (st.fps ? ' · ' + st.fps + ' fps' : ''));
        dline(t('diagStalls'), String(st.stalls), st.stalls > 3 ? 'warn' : '');
        dline(t('diagRetries'), String(st.retries), st.retries > 0 ? 'warn' : '');
      }
      D.busy = false;
      dline(t('diagResult'), verdict, cls);
    };
    var speed = function (segUrl, dur, needBps) {
      dfetch(segUrl, true, function (err, x, ms, bytes, total) {
        if (id !== D.run) return;
        if (err && !bytes) { dline(t('diagRate'), err, 'bad'); return end(t('diagFail'), 'bad'); }
        var mbit = bytes * 8 / Math.max(1, total) / 1000;
        dline(t('diagRate'), mbit.toFixed(1) + ' Mbit/s', '');
        var need = needBps ? needBps / 1e6 : dur ? bytes * 8 / dur / 1e6 : 0;
        if (need) dline(t('diagNeed'), need.toFixed(1) + ' Mbit/s');
        var ratio = need ? mbit / need : 0;
        if (need) dline(t('diagRealtime', ratio.toFixed(1)), '', ratio >= 2 ? 'ok' : ratio >= 1.2 ? 'warn' : 'bad');
        if (!need) end(mbit > 3 ? t('diagGood') : t('diagTight'), mbit > 3 ? 'ok' : 'warn');
        else end(ratio >= 2 ? t('diagGood') : ratio >= 1.2 ? t('diagTight') : t('diagSlow'), ratio >= 2 ? 'ok' : ratio >= 1.2 ? 'warn' : 'bad');
      });
    };
    if (!hlsUrl) return speed(url, 0, 0);
    dfetch(url, false, function (err, x, ms) {
      if (id !== D.run) return;
      if (err) { dline(t('diagReply'), err, 'bad'); return end(t('diagFail'), 'bad'); }
      dline(t('diagReply'), ms + ' ms', ms < 800 ? 'ok' : ms < 2500 ? 'warn' : 'bad');
      var txt = x.responseText || '', base = x.responseURL || url;
      if (txt.indexOf('#EXTM3U') < 0) return speed(url, 0, 0);
      var media = function (txt, base, bw) {
        var lines = txt.split(/\r?\n/), segs = [], durs = [], d = 0;
        for (var i = 0; i < lines.length; i++) {
          var l = lines[i].trim();
          if (/^#EXTINF:/.test(l)) d = parseFloat(l.substring(8)) || 0;
          else if (l && l.charAt(0) !== '#') { segs.push(l); durs.push(d); }
        }
        if (!segs.length) { dline(t('diagPlaylist'), '–', 'bad'); return end(t('diagFail'), 'bad'); }
        dline(t('diagPlaylist'), t('diagSegs', segs.length, Math.round(durs[0] || 0)), 'ok');
        var j = Math.max(0, segs.length - 2);
        speed(resolveUrl(base, segs[j]), durs[j], bw);
      };
      if (txt.indexOf('#EXT-X-STREAM-INF') >= 0) {
        var ls = txt.split(/\r?\n/), best = null;
        for (var i = 0; i < ls.length; i++) {
          var m = /^#EXT-X-STREAM-INF:(.*)$/.exec(ls[i].trim());
          if (!m) continue;
          var bw = +((/(?:^|,)BANDWIDTH=(\d+)/.exec(m[1]) || [])[1] || 0), u = (ls[i + 1] || '').trim();
          if (u && (!best || bw > best.bw)) best = { bw: bw, u: u, n: 0 };
        }
        var n = (txt.match(/#EXT-X-STREAM-INF/g) || []).length;
        if (!best) return end(t('diagFail'), 'bad');
        dline(t('diagVariants'), n + (best.bw ? '  ·  max ' + (best.bw / 1e6).toFixed(1) + ' Mbit/s' : ''));
        var vu = resolveUrl(base, best.u);
        dfetch(vu, false, function (err2, x2) {
          if (id !== D.run) return;
          if (err2) { dline(t('diagPlaylist'), err2, 'bad'); return end(t('diagFail'), 'bad'); }
          media(x2.responseText || '', x2.responseURL || vu, best.bw);
        });
      } else media(txt, base, 0);
    });
  }

  // ---------- Mehrere Anbieter: Zugangsdaten, Playlist, Mediathek und EPG je Anbieter ----------
  var SRC_KEYS = ['source', 'key', 'domain', 'playlist', 'vod', 'plRefresh', 'epgMode', 'epg', 'epgShift', 'catchup'];
  function srcById(id) { if (!S.sources) return null; for (var i = 0; i < S.sources.length; i++) if (S.sources[i].id === id) return S.sources[i]; return null; }
  function srcCfg() { var o = {}; SRC_KEYS.forEach(function (k) { if (S.settings[k] !== undefined && S.settings[k] !== null) o[k] = S.settings[k]; }); return o; }
  function syncSource() { var s = srcById(S.srcId); if (s) { s.cfg = srcCfg(); save('sources', S.sources); } }
  function newSrcId() { return 's' + Date.now().toString(36) + Math.floor(Math.random() * 1000); }
  function addSource() {
    if (!S.sources.length) {
      var first = { id: newSrcId(), name: get('source') === 'edem' ? 'Edem' : t('srcN', 1), cfg: srcCfg(), last: S.current ? chKey(S.current) : '' };
      S.sources.push(first); S.srcId = first.id; save('sourceId', S.srcId);
    }
    var id = newSrcId();
    S.sources.push({ id: id, name: t('srcN', S.sources.length + 1), cfg: { source: 'url' } });
    save('sources', S.sources);
    switchSource(id);
  }
  function renameSource(v) {
    v = String(v || '').trim().slice(0, 24); var s = srcById(S.srcId);
    if (v && s) { s.name = v; save('sources', S.sources); }
  }
  function delSource() {
    var id = S.srcId;
    S.sources = S.sources.filter(function (s) { return s.id !== id; });
    save('sources', S.sources);
    S.srcId = null;
    if (S.sources.length) switchSource(S.sources[0].id);
  }
  function openSrcMenu() {
    var sel = 0;
    openMenu(t('srcChoose'), S.sources.map(function (s, i) {
      if (s.id === S.srcId) sel = i;
      return { label: s.name, check: s.id === S.srcId, run: function () { switchSource(s.id); } };
    }), sel, function () { renderSettings(); });
  }
  function switchSource(id) {
    var s = srcById(id);
    if (!s || id === S.srcId) { if (S.mode === 'settings') renderSettings(); return; }
    syncSource();
    S.srcId = id; save('sourceId', id);
    SRC_KEYS.forEach(function (k) { if (s.cfg[k] !== undefined) S.settings[k] = s.cfg[k]; else delete S.settings[k]; });
    save('settings', S.settings); remotePush();
    V.url = ''; V.items = []; armPlRefresh();
    S.previewing = null; S.archive = null; S.livePause = null; S.listPos = null; S.gi = 0; S.ci = 0;
    if (!isConfigured()) {
      S.channels = []; S.visible = []; S.groups = []; S.current = null; Player.stop(); hideInfo();
      toast(t('srcEmpty', s.name), 6000);
      if (S.mode !== 'settings') openSettings(0); else { S.set.ci = 0; S.set.focus = 'rows'; S.set.ri = 0; renderSettings(); }
      return;
    }
    toast(t('loadingList'), 20000);
    loadPlaylist(function (err) {
      if (err) { toast(t('errorX', err.message), 6000); return; }
      toast(t('srcActive', s.name), 2500);
      var ch = startChannel(); startGroup(ch); play(ch);
      if (S.mode !== 'player') hideInfo();
      if (S.mode === 'settings') renderSettings();
    });
    if (S.mode === 'settings') renderSettings();
  }

  // ---------- Eigene Senderlogos (Vorlage für fehlende Logos, eigene Logos per Smartphone) ----------
  function slugName(n) { return String(n || '').toLowerCase().replace(/ё/g, 'е').replace(/[^a-z0-9Ѐ-ӿ]+/g, '-').replace(/^-+|-+$/g, ''); }
  function cleanLogos(m) { var o = {}; Object.keys(m).forEach(function (k) { var u = String(m[k] || ''); if (/^https?:\/\/\S+$/.test(u)) o[k] = u; }); return o; }
  function applyLogos() {
    var tpl = String(get('logoTpl') || '').trim();
    if (!/^https?:\/\//.test(tpl)) tpl = '';
    S.channels.forEach(function (c) {
      if (c._logo0 === undefined) c._logo0 = c.logo || '';
      var own = S.logoMap[chKey(c)];
      c.logo = own || c._logo0 || (tpl ? tpl.replace(/\{name\}/g, encodeURIComponent(c.name)).replace(/\{slug\}/g, slugName(c.name)).replace(/\{id\}/g, encodeURIComponent(c.tvgId || '')) : '');
    });
  }

  // ---------- Zifferneingabe ----------
  function numKey(d) {
    if (S.numBuf.length >= 4) return;
    S.numBuf += d;
    $('numinput').textContent = S.numBuf; show('numinput', true);
    clearTimeout(S.numTimer);
    S.numTimer = setTimeout(function () {
      var n = parseInt(S.numBuf, 10); S.numBuf = ''; show('numinput', false);
      var ch = null, g = S.groups[S.gi];
      if (g && g.id === 'fav' && (S.mode === 'list' || g.items.indexOf(S.current) >= 0)) ch = g.items[n - 1] || null;
      else for (var i = 0; i < S.visible.length; i++) if (S.visible[i].num === n) { ch = S.visible[i]; break; }
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
        if (S.livePause) { resumeLive(); break; }
        if (S.ibSel && visible('infobar')) { if (S.ibSel === 1) openAudio(); else cycleAspect(); break; }
        if (get('okAction') === 'info') { if (visible('infobar')) hideInfo(); else showInfo(); } else openList();
        break;
      case KEY.UP: zap(-1); break;
      case KEY.DOWN: zap(1); break;
      case KEY.CH_UP: zap(-1); break;
      case KEY.CH_DOWN: zap(1); break;
      // links/rechts: Knöpfe der Info-Leiste wählen (Tonspur, Bildformat); OK öffnet bzw. schaltet weiter
      case KEY.LEFT: if (S.archive) archiveSeek(-step); else { S.ibSel = visible('infobar') ? Math.max(0, S.ibSel - 1) : 0; showInfo(); } break;
      case KEY.RIGHT: if (S.archive) archiveSeek(step); else { S.ibSel = visible('infobar') ? Math.min(2, S.ibSel + 1) : 1; showInfo(); } break;
      case KEY.RW: if (S.archive) archiveSeek(-1800); else if (S.current && S.current.catchupDays) openEpg(S.current); break;
      case KEY.FF: if (S.archive) archiveSeek(1800); else if (!S.livePause) openNow('player'); break;
      case KEY.GREEN: if (S.current) openEpg(S.current); break;
      case KEY.YELLOW: toggleFav(S.current); break;
      case KEY.BLUE: openSettings(); break;
      case KEY.RED: if (S.prev) play(S.prev); break;
      case KEY.INFO: if (visible('infobar')) hideInfo(); else showInfo(); break;
      case KEY.PLAY: case KEY.PAUSE: case KEY.PLAYPAUSE:
        if (S.archive) { toast(Player.togglePause() ? t('paused') : t('resumed'), 1200); showInfo(); }
        else if (S.livePause) { if (k !== KEY.PAUSE) resumeLive(); }
        else if (k !== KEY.PLAY) pauseLive();
        break;
      case KEY.STOP: if (S.archive || S.livePause) play(S.current); break;
      case KEY.BACK: case KEY.ESC: case KEY.BACKSPACE:
        if (visible('infobar')) hideInfo();
        else if (S.archive || S.livePause) { play(S.current); toast(t('backLive'), 1500); }
        else if (Platform.canExit && k === KEY.BACK) {
          if (Date.now() - (S.backArmed || 0) < 2500) Platform.exit();
          else { S.backArmed = Date.now(); toast(t('exitHint'), 2500); }
        }
        else openList();
        break;
    }
  }

  window.addEventListener('resize', function () { placeVideo(); });
  /** Langes Drücken von OK auf einem Sender öffnet die Senderoptionen; kurzes Drücken wirkt beim Loslassen */
  function longPressOk() {
    var g = S.groups[S.gi];
    return S.mode === 'list' && !S.modal && !S.moving && S.focus === 'channels' && g && S.ci < g.items.length && !!g.items[S.ci];
  }
  function onKeyDown(ev) {
    var k = Platform.mapKey(ev.keyCode);
    S.lastKey = Date.now();
    if (S.saver) { if (ev.preventDefault) ev.preventDefault(); hideSaver(); return; }
    if (S.searchEdit) { searchKey(k, ev); return; }
    if (S.vodEdit) {
      if (k === KEY.ENTER || k === KEY.UP || k === KEY.DOWN || k === KEY.BACK || k === KEY.ESC) { ev.preventDefault(); vodEndSearch(); }
      return;
    }
    if (k === KEY.ENTER && (S.okDown || longPressOk())) {
      ev.preventDefault();
      if (S.okDown) return; // Wiederholung beim Gedrückthalten
      S.okDown = Date.now();
      S.okTimer = setTimeout(function () { S.okTimer = null; var g = S.groups[S.gi]; openChMenu(g && g.items[S.ci]); }, 700);
      return;
    }
    if (S.modal === 'pin') { ev.preventDefault(); return pinKey(k); }
    if (S.modal === 'menu') { ev.preventDefault(); return menuKey(k); }
    if (S.modal === 'diag') { ev.preventDefault(); if (k === KEY.ENTER) runDiag(D.ch); else if (k === KEY.BACK || k === KEY.ESC || k === KEY.BACKSPACE) closeDiag(); return; }
    if (S.modal === 'audio') { ev.preventDefault(); return audioKey(k); }
    if (S.modal === 'update') { ev.preventDefault(); return updateKey(k); }
    if (S.modal === 'qr') { ev.preventDefault(); if (k === KEY.BACK || k === KEY.ESC || k === KEY.BACKSPACE || k === KEY.ENTER) closeQr(); return; }
    if (S.modal === 'sleep') { ev.preventDefault(); show('sleep', false); S.modal = null; if (S.current) play(S.current); return; }
    if (S.mode === 'settings') return settingsKey(k, ev);
    if (k === KEY.BACK || k === KEY.BACKSPACE || (k >= 33 && k <= 40)) ev.preventDefault();
    if (S.mode === 'list') listKey(k);
    else if (S.mode === 'epg') epgKey(k);
    else if (S.mode === 'vod') vodKeyDown(k);
    else if (S.mode === 'now') nowKey(k);
    else playerKey(k);
  }
  document.addEventListener('keydown', onKeyDown);
  $('search-input').addEventListener('input', updateSearch);
  $('vod-search').addEventListener('input', vodSearchInput);
  $('vod-search').addEventListener('blur', function () { setTimeout(function () { if (S.vodEdit && document.activeElement !== $('vod-search')) vodEndSearch(); }, 200); });
  $('search-input').addEventListener('blur', function () { setTimeout(function () { if (S.searchEdit && document.activeElement !== $('search-input')) endSearch(); }, 200); });
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
    S.livePause = null;
    if (S.vod) { var pp = vodPos()[vodKey(S.vod.item)]; Player.start(S.vod.item.url, false, pp ? pp.p : 0); return; }
    if (S.current && !V.resumeLive) { S.archive = null; S.previewing = null; Player.start(S.current.url); }
  };
  if (Platform.name === 'tizen') {
    document.addEventListener('visibilitychange', function () { if (document.hidden) window.IPTVSuspend(); else window.IPTVResume(); });
  }
  // webOS-Autostart ohne Root: dem eigenen Dienst melden, ob die App sichtbar ist
  // (der Dienst darf getForegroundAppInfo nicht abfragen und startet die App sonst erneut)
  function reportVisible() {
    if (Platform.name !== 'webos' || !S.autostart || !window.PalmServiceBridge) return;
    luna('luna://com.iptvplayer.app.service/appState', { visible: !document.hidden }, function () {});
  }
  if (Platform.name === 'webos') {
    document.addEventListener('visibilitychange', reportVisible);
    document.addEventListener('webOSRelaunch', function () { setTimeout(reportVisible, 300); if (S.channels.length && wakeDue(new Date())) wakeUp(); });
    setTimeout(reportVisible, 1500);
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
    S.lastKey = Date.now();
    if (hideSaver()) return;
    if (S.modal === 'qr') { closeQr(); return; }
    if (S.modal === 'diag') { closeDiag(); return; }
    if (S.modal === 'menu') { var mr = closestEl(ev.target, '#menu-rows [data-i]'); if (mr) pickMenu(+mr.getAttribute('data-i')); else if (!closestEl(ev.target, '.modal-card')) { var mm = closeMenu(); if (mm.back) mm.back(); } return; }
    if (S.modal === 'update') { var ub = closestEl(ev.target, '.upd-btn'); if (ub && !U.busy) { if (ub.id === 'upd-now') runUpdate(); else updateLater(); } return; }
    if (S.modal === 'audio') { var ar = closestEl(ev.target, '#audio-rows [data-i]'); if (ar) pickTrack(+ar.getAttribute('data-i')); else if (!closestEl(ev.target, '.modal-card')) closeAudio(); return; }
    if (S.modal) return;
    var act = closestEl(ev.target, '[data-act]');
    if (act) {
      var a = act.getAttribute('data-act');
      if (a === 'settings' && S.mode !== 'settings') openSettings();
      else if (a === 'audio' && S.mode === 'player') openAudio();
      else if (a === 'aspect' && S.mode === 'player') cycleAspect();
      else if (a === 'close' && (S.mode !== 'settings' || S.channels.length)) closePanels();
      else if (a === 'groups' && S.mode === 'list') { S.focus = 'groups'; renderList(); }
      else if (a === 'vodcats' && S.mode === 'vod') { if (!vodLeaveSer()) { V.focus = 'cats'; renderVod(); } }
      return;
    }
    var row = closestEl(ev.target, '[data-i]');
    if (row && row.parentNode) {
      var i = +row.getAttribute('data-i'), box = row.parentNode.id, st = S.set;
      if (box === 'groups') { S.gi = i; S.ci = 0; if (S.groups[i] && S.groups[i].id === 'vod') { openVod(); return; } if (S.groups[i] && S.groups[i].id === 'now') { openNow('list'); return; } if (S.groups[i] && S.groups[i].id === 'search') { startSearch(); return; } S.focus = 'channels'; renderList(); }
      else if (box === 'vod-cats') { V.ci = i; V.ii = 0; V.focus = 'cats'; vodKeyDown(KEY.ENTER); }
      else if (box === 'vod-items') { if (V.focus === 'items' && V.ii === i) vodKeyDown(KEY.ENTER); else { V.focus = 'items'; V.ii = i; renderVod(); } }
      else if (box === 'now-grid') { if (S.nowV.sel === i) nowKey(KEY.ENTER); else { S.nowV.sel = i; renderNow(); } }
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
    S.lastKey = Date.now();
    if (S.modal || S.saver) return;
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
  Player.on('loading', function (on) { show('spinner', on && splashDone); });
  Player.on('playing', function () { hideSplash(); });
  Player.on('error', function () { hideSplash(); toast(t('streamError')); });
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
    if (S.mode === 'now') renderNow();
    if (S.vod) vodSavePos();
    updateClock();
  }, 15000);
  // Laufzeit im Film und Bildinfo sekundengenau
  setInterval(function () { if (visible('infobar')) { if (S.vod) renderVodInfo(); else renderStream(); } }, 1000);
  setInterval(saverCheck, 5000);
  setInterval(checkReminders, 15000);
  setInterval(function () { autoRemind(); }, 600000);
  setInterval(function () { if (S.channels.length && wakeDue(new Date())) wakeUp(); }, 20000);

  S.progHits = [];
  S.logoMap = load('logoMap', {});
  S.sources = load('sources', []);
  S.srcId = load('sourceId', '');
  if (S.sources.length && !srcById(S.srcId)) S.srcId = S.sources[0].id;
  S.profiles = load('profiles', []);
  S.prof = load('profile', '');
  if (!profById(S.prof)) S.prof = '';
  loadProfileData();
  Player.configure({ prefFn: function (url) { return S.audioPref[urlKey(url)] || null; } });
  S.autostart = !!load('autostart', false);
  // Developer-Mode-Autostart aus 2.9.3 (ohne Trigger) einmalig durch die neue Aktivität (Hochfahren + Aufwachen) ersetzen
  if (Platform.name === 'webos' && S.autostart && load('autostartV', 0) < 2) {
    setTimeout(function () {
      rootExec('true', function (err) {
        if (!err) { save('autostartV', 2); return; }
        devAutostart(true, function (e) { if (!e) save('autostartV', 2); });
      });
    }, 8000);
  }
  S.settings = load('settings', {});
  // Testmodus im Browser: index.html?playlist=URL
  var qm = /[?&]playlist=([^&]+)/.exec(location.search);
  if (qm && !isConfigured()) { S.settings.source = 'url'; S.settings.playlist = decodeURIComponent(qm[1]); }
  applyAll();
  translateStatic();

  $('sp-tag').textContent = t('splashTag');
  $('sp-ver').textContent = VERSION;
  if (!+get('splash')) hideSplash(true);
  setTimeout(function () { hideSplash(); }, 12000); // Sender startet nicht: Startbildschirm trotzdem schließen
  if (!isConfigured()) {
    hideSplash();
    openSettings(0);
  } else {
    splashStatus(t('loadingList'));
    loadPlaylist(function (err) {
      if (err) { hideSplash(true); openSettings(0); toast(t('errorX', err.message), 6000); return; }
      splashStatus('');
      var begin = function () {
        var wake = wakeDue(new Date());
        if (wake) save('wakeDone', new Date().toDateString());
        var ch = wake ? wakeChannel() : startChannel();
        startGroup(ch);
        play(ch);
        if (wake) toast('⏰ ' + t('sWake') + ' – ' + ch.name, 5000);
        else if (get('startScreen') === 'list') openList();
        setTimeout(function () { checkUpdate(false); }, 6000);
      };
      if (+get('profileAsk') && S.profiles.length) { hideSplash(true); askProfile(begin); }
      else begin();
    });
    if (wakeOn() && Platform.name === 'android') setTimeout(function () { armWake(true); }, 4000); // Alarm nach Updates neu setzen
  }

  // für Tests im Browser
  window.EdemApp = { state: S, get: get, set: setVal };
})();
