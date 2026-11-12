/* M3U-Playlist-Parser und Archiv-URL-Builder (ES5 für ältere webOS-Versionen) */
var M3U = (function () {
  'use strict';

  var ATTR_RE = /([\w-]+)="([^"]*)"/g;

  function parseAttrs(str) {
    var out = {}, m;
    ATTR_RE.lastIndex = 0;
    while ((m = ATTR_RE.exec(str))) out[m[1].toLowerCase()] = m[2];
    return out;
  }

  // Kommas innerhalb von Attributwerten ignorieren, um den Namen zu finden
  function splitExtinf(line) {
    var inQ = false;
    for (var i = 8; i < line.length; i++) {
      var c = line.charAt(i);
      if (c === '"') inQ = !inQ;
      else if (c === ',' && !inQ) return { attrs: line.substring(8, i), name: line.substring(i + 1).trim() };
    }
    return { attrs: line.substring(8), name: '' };
  }

  function parse(text) {
    var lines = text.split(/\r?\n/);
    var res = { epgUrl: '', catchup: '', catchupSource: '', channels: [] };
    var cur = null, grp = '';
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if (!line) continue;
      if (line.indexOf('#EXTM3U') === 0) {
        var h = parseAttrs(line);
        res.epgUrl = h['url-tvg'] || h['x-tvg-url'] || h['tvg-url'] || '';
        res.catchup = h['catchup'] || '';
        res.catchupSource = h['catchup-source'] || '';
        res.catchupDays = parseInt(h['catchup-days'] || h['tvg-rec'] || '0', 10) || 0;
      } else if (line.indexOf('#EXTINF') === 0) {
        var p = splitExtinf(line), a = parseAttrs(p.attrs);
        cur = {
          name: p.name || a['tvg-name'] || 'Kanal',
          tvgId: a['tvg-id'] || '',
          tvgName: a['tvg-name'] || '',
          logo: a['tvg-logo'] || '',
          group: a['group-title'] || '',
          catchup: a['catchup'] || a['catchup-type'] || '',
          catchupSource: a['catchup-source'] || '',
          catchupDays: (function (v) { return v === undefined ? -1 : (parseInt(v, 10) || 0); })(a['catchup-days'] || a['tvg-rec'] || a['timeshift']),
          shift: parseFloat(a['tvg-shift'] || '0') || 0
        };
      } else if (line.indexOf('#EXTGRP:') === 0) {
        grp = line.substring(8).trim();
        if (cur && !cur.group) cur.group = grp;
      } else if (line.charAt(0) === '#') {
        continue;
      } else if (cur) {
        cur.url = line;
        if (!cur.group) cur.group = grp || 'Ohne Gruppe';
        if (!cur.catchup) cur.catchup = res.catchup;
        if (!cur.catchupSource) cur.catchupSource = res.catchupSource;
        if (cur.catchupDays < 0) cur.catchupDays = res.catchupDays || 0;
        cur.num = res.channels.length + 1;
        res.channels.push(cur);
        cur = null;
      }
    }
    return res;
  }

  function pad(n) { return (n < 10 ? '0' : '') + n; }

  function fillTemplate(tpl, start, end, now) {
    var d = new Date(start * 1000), de = new Date(end * 1000), dur = end - start;
    function fmtDate(date, fmt) {
      return fmt.replace(/Y/g, date.getUTCFullYear()).replace(/m/g, pad(date.getUTCMonth() + 1))
        .replace(/d/g, pad(date.getUTCDate())).replace(/H/g, pad(date.getUTCHours()))
        .replace(/M/g, pad(date.getUTCMinutes())).replace(/S/g, pad(date.getUTCSeconds()));
    }
    return tpl
      .replace(/\$\{start\}|\{utc\}|\$\{utc\}|\{start\}/g, start)
      .replace(/\$\{end\}|\{utcend\}|\$\{utcend\}|\{end\}/g, end)
      .replace(/\$\{offset\}|\{offset\}/g, now - start)
      .replace(/\$\{duration\}|\{duration\}/g, dur)
      .replace(/\{duration:(\d+)\}/g, function (_, div) { return Math.floor(dur / parseInt(div, 10)); })
      .replace(/\$\{lutc\}|\{lutc\}|\$\{now\}|\{now\}|\$\{timestamp\}|\{timestamp\}/g, now)
      .replace(/\{utc:([^}]+)\}|\$\{\(b\)([^}]+)\}/g, function (_, f1, f2) { return fmtDate(d, f1 || f2); })
      .replace(/\{utcend:([^}]+)\}|\$\{\(e\)([^}]+)\}/g, function (_, f1, f2) { return fmtDate(de, f1 || f2); })
      .replace(/\{Y\}/g, d.getUTCFullYear()).replace(/\{m\}/g, pad(d.getUTCMonth() + 1))
      .replace(/\{d\}/g, pad(d.getUTCDate())).replace(/\{H\}/g, pad(d.getUTCHours()))
      .replace(/\{M\}/g, pad(d.getUTCMinutes())).replace(/\{S\}/g, pad(d.getUTCSeconds()));
  }

  /**
   * Baut die Archiv-URL. start/end in Unix-Sekunden.
   * mode: 'auto' (aus Playlist), 'shift', 'flussonic', 'append'
   */
  function catchupUrl(ch, start, end, mode) {
    var now = Math.floor(Date.now() / 1000);
    var url = ch.url;
    var type = (mode && mode !== 'auto') ? mode : (ch.catchup || 'shift').toLowerCase();

    if (ch.catchupSource && (mode === 'auto' || !mode)) {
      var src = fillTemplate(ch.catchupSource, start, end, now);
      if (type === 'append' || src.charAt(0) === '?' || src.charAt(0) === '&') return url + src;
      return src;
    }
    if (type === 'flussonic' || type === 'flussonic-hls' || type === 'fs' || type === 'xc') {
      var dur = end - start;
      if (/\/(index|video|mono)\.m3u8/.test(url)) return url.replace(/\/(index|video|mono)\.m3u8/, '/$1-' + start + '-' + dur + '.m3u8');
      if (/\/mpegts/.test(url)) return url.replace(/\/mpegts/, '/timeshift_abs-' + start + '.ts');
      return url.replace(/\/([^\/?]+)\.m3u8/, '/index-' + start + '-' + dur + '.m3u8');
    }
    // "shift" / "default": utc + lutc als Parameter (Edem/iLook-Stil)
    return url + (url.indexOf('?') >= 0 ? '&' : '?') + 'utc=' + start + '&lutc=' + now;
  }

  return { parse: parse, catchupUrl: catchupUrl };
})();
