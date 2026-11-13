/* Video-Player: nutzt den nativen webOS-Player (HLS/MPEG-TS), optional hls.js */
var Player = (function () {
  'use strict';

  var video, hls = null, engine = 'native', currentUrl = '', retries = 0, retryTimer = null;
  var opts = { buffer: 30, retries: 3, timeout: 15, audioLang: 'auto', subtitles: false };
  var loadTimer = null, gotPlaying = false;
  // Mediathek (Filme): Startposition und letzte Position für Neuversuche
  var vodMode = false, seekTo = 0, lastTime = 0;
  // Kürzel, an denen Tonspuren in der jeweiligen Sprache erkannt werden
  var LANG_ALIASES = { ru: ['ru', 'rus', 'рус'], uk: ['uk', 'ukr', 'укр'], de: ['de', 'deu', 'ger', 'нем'], en: ['en', 'eng', 'англ'],
    tr: ['tr', 'tur'], pl: ['pl', 'pol'], es: ['es', 'spa'], fr: ['fr', 'fra', 'fre'], it: ['it', 'ita'], ro: ['ro', 'ron', 'rum'] };
  var listeners = { loading: function () {}, playing: function () {}, error: function () {} };
  var HLS_CDN = 'https://cdn.jsdelivr.net/npm/hls.js@1/dist/hls.min.js';
  var hlsLoading = false, hlsQueue = [];

  function nativeHls() {
    return !!(video.canPlayType('application/vnd.apple.mpegurl') || video.canPlayType('application/x-mpegURL'));
  }

  function ensureHls(cb) {
    if (window.Hls) return cb(true);
    hlsQueue.push(cb);
    if (hlsLoading) return;
    hlsLoading = true;
    var s = document.createElement('script');
    s.src = HLS_CDN;
    s.onload = function () { flush(!!window.Hls); };
    s.onerror = function () { flush(false); };
    document.head.appendChild(s);
    function flush(ok) { hlsLoading = false; var q = hlsQueue; hlsQueue = []; for (var i = 0; i < q.length; i++) q[i](ok); }
  }

  function destroyHls() { if (hls) { try { hls.destroy(); } catch (e) {} hls = null; } }

  function init(el) {
    video = el;
    video.addEventListener('waiting', function () { listeners.loading(true); });
    video.addEventListener('playing', function () {
      retries = 0; clearTimeout(loadTimer);
      if (!gotPlaying) { gotPlaying = true; pickAudio(); applySubs(); }
      listeners.loading(false); listeners.playing();
    });
    if (video.audioTracks && video.audioTracks.addEventListener) video.audioTracks.addEventListener('addtrack', function () { pickAudio(); });
    if (video.textTracks && video.textTracks.addEventListener) video.textTracks.addEventListener('addtrack', function () { applySubs(); });
    video.addEventListener('canplay', function () { listeners.loading(false); });
    video.addEventListener('loadedmetadata', function () {
      if (seekTo > 0) { try { video.currentTime = seekTo; } catch (e) {} }
      seekTo = 0;
    });
    video.addEventListener('timeupdate', function () { if (vodMode && video.currentTime > 0) lastTime = video.currentTime; });
    video.addEventListener('error', function () { handleError('Stream-Fehler (' + (video.error ? video.error.code : '?') + ')'); });
    video.addEventListener('ended', function () { if (!listeners.ended || !listeners.ended()) handleError('Stream beendet'); });
  }

  function handleError(msg) {
    if (!currentUrl) return;
    if (opts.retries < 0 || retries < opts.retries) {
      retries++;
      clearTimeout(retryTimer);
      retryTimer = setTimeout(function () { start(currentUrl, true); }, 1500 * Math.min(retries, 5));
    } else {
      listeners.loading(false);
      listeners.error(msg);
    }
  }

  function langMatch(lang, name) {
    var al = LANG_ALIASES[opts.audioLang] || [], s = ' ' + ((lang || '') + ' ' + (name || '')).toLowerCase();
    for (var i = 0; i < al.length; i++) if (s.indexOf(' ' + al[i]) >= 0) return true;
    return false;
  }

  /** bevorzugte Tonspur wählen (hls.js oder nativer Player) */
  function pickAudio() {
    if (!opts.audioLang || opts.audioLang === 'auto') return;
    var i;
    if (hls && hls.audioTracks && hls.audioTracks.length > 1) {
      for (i = 0; i < hls.audioTracks.length; i++) if (langMatch(hls.audioTracks[i].lang, hls.audioTracks[i].name)) { if (hls.audioTrack !== i) hls.audioTrack = i; return; }
      return;
    }
    var at = video.audioTracks;
    if (!at || at.length < 2) return;
    var idx = -1;
    for (i = 0; i < at.length; i++) if (idx < 0 && langMatch(at[i].language, at[i].label)) idx = i;
    if (idx >= 0) for (i = 0; i < at.length; i++) at[i].enabled = i === idx;
  }

  /** Untertitel ein/aus; bevorzugt die Sprache der gewählten Tonspur */
  function applySubs() {
    var on = !!opts.subtitles, i;
    if (hls && hls.subtitleTracks) {
      try {
        hls.subtitleDisplay = on;
        if (on && hls.subtitleTracks.length && hls.subtitleTrack < 0) {
          var idx = 0;
          for (i = 0; i < hls.subtitleTracks.length; i++) if (langMatch(hls.subtitleTracks[i].lang, hls.subtitleTracks[i].name)) { idx = i; break; }
          hls.subtitleTrack = idx;
        }
        if (!on) hls.subtitleTrack = -1;
      } catch (e) {}
    }
    var tt = video.textTracks, shown = false;
    if (!tt) return;
    for (i = 0; i < tt.length; i++) {
      var want = on && !shown && (tt[i].kind === 'subtitles' || tt[i].kind === 'captions');
      try { tt[i].mode = want ? 'showing' : 'hidden'; } catch (e2) {}
      if (want) shown = true;
    }
  }

  /** startAt (Sekunden) nur für Filme der Mediathek: Wiedergabe ab dieser Stelle, Neuversuche setzen an der letzten Stelle fort */
  function start(url, isRetry, startAt) {
    if (!isRetry) { retries = 0; vodMode = startAt !== undefined && startAt !== null; seekTo = +startAt || 0; lastTime = seekTo; }
    else if (vodMode && lastTime > 5) seekTo = lastTime;
    clearTimeout(retryTimer);
    currentUrl = url;
    gotPlaying = false;
    clearTimeout(loadTimer);
    // Sender, die nach X Sekunden nicht laufen, gelten als Fehler (-> Neuversuch)
    if (opts.timeout > 0) loadTimer = setTimeout(function () { if (!gotPlaying && currentUrl === url) handleError('Timeout'); }, opts.timeout * 1000);
    listeners.loading(true);
    destroyHls();
    var isM3u8 = /\.m3u8?(\?|$)/i.test(url) || !/\.(ts|mp4|mkv)(\?|$)/i.test(url);
    var useHls = isM3u8 && (engine === 'hlsjs' || !nativeHls());

    if (useHls) {
      ensureHls(function (ok) {
        if (url !== currentUrl) return;
        if (!ok || !window.Hls.isSupported()) { playNative(url); return; }
        hls = new window.Hls({ maxBufferLength: opts.buffer, liveSyncDurationCount: 3, enableWorker: true, startPosition: seekTo > 0 ? seekTo : -1 });
        hls.on(window.Hls.Events.ERROR, function (_, d) {
          if (!d.fatal) return;
          if (d.type === window.Hls.ErrorTypes.MEDIA_ERROR) { hls.recoverMediaError(); return; }
          handleError('HLS-Fehler: ' + d.details);
        });
        hls.on(window.Hls.Events.AUDIO_TRACKS_UPDATED, function () { pickAudio(); });
        hls.on(window.Hls.Events.SUBTITLE_TRACKS_UPDATED, function () { applySubs(); });
        hls.loadSource(url);
        hls.attachMedia(video);
        var p = video.play(); if (p && p.catch) p.catch(function () {});
      });
    } else {
      playNative(url);
    }
  }

  function playNative(url) {
    video.removeAttribute('src');
    video.load();
    video.src = url;
    var p = video.play(); if (p && p.catch) p.catch(function () {});
  }

  function stop() {
    currentUrl = ''; vodMode = false; seekTo = 0;
    clearTimeout(retryTimer);
    clearTimeout(loadTimer);
    destroyHls();
    video.pause();
    video.removeAttribute('src');
    video.load();
  }

  function togglePause() {
    if (video.paused) { var p = video.play(); if (p && p.catch) p.catch(function () {}); return false; }
    video.pause(); return true;
  }

  /** Mediathek: relativ spulen */
  function seek(delta) {
    var d = video.duration, p = (video.currentTime || 0) + delta;
    if (isFinite(d) && d > 0) p = Math.min(p, d - 3);
    try { video.currentTime = Math.max(0, p); } catch (e) {}
  }
  function position() {
    var d = video.duration;
    return { pos: video.currentTime || lastTime || 0, dur: isFinite(d) && d > 0 ? d : 0, paused: video.paused };
  }

  return {
    init: init, start: start, stop: stop, togglePause: togglePause, seek: seek, position: position,
    setEngine: function (e) { engine = e; },
    configure: function (o) { if (o.engine) engine = o.engine; if (o.buffer) opts.buffer = o.buffer; if (o.retries !== undefined && !isNaN(o.retries)) opts.retries = o.retries;
      if (o.timeout !== undefined && !isNaN(o.timeout)) opts.timeout = o.timeout; if (o.audioLang) { opts.audioLang = o.audioLang; pickAudio(); }
      if (o.subtitles !== undefined) { opts.subtitles = !!o.subtitles; applySubs(); } },
    on: function (ev, fn) { listeners[ev] = fn; },
    video: function () { return video; }
  };
})();
