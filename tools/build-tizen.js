#!/usr/bin/env node
/*
 * Baut die Samsung-Version: dist/IPTVPlayer-<version>.wgt (unsigniert).
 *
 *   node tools/build-tizen.js
 *
 * Installation auf dem Fernseher (signiert dabei automatisch mit dem eigenen Samsung-Zertifikat):
 *   TizenBrew Installer → „Install from GitHub“ → vbleich-lab/IPTVPlayer
 * oder mit Tizen Studio: tizen package -t wgt -s <Zertifikatsprofil> -- dist/IPTVPlayer-<version>.wgt
 */
var fs = require('fs'), path = require('path'), zip = require('./zip');

var ROOT = path.join(__dirname, '..');
var APP = path.join(ROOT, 'app');
var version = JSON.parse(fs.readFileSync(path.join(APP, 'appinfo.json'), 'utf8')).version;

function walk(dir, rel, out) {
  fs.readdirSync(dir).sort().forEach(function (n) {
    var full = path.join(dir, n), r = rel ? rel + '/' + n : n;
    if (fs.statSync(full).isDirectory()) walk(full, r, out);
    else out.push(r);
  });
  return out;
}

var SKIP = /^(demo\/|appinfo\.json$|icon\.png$|largeIcon\.png$)/; // webOS-Dateien und Demo nicht mitnehmen
var entries = [{
  name: 'config.xml',
  data: Buffer.from(fs.readFileSync(path.join(ROOT, 'tizen', 'config.xml'), 'utf8').replace('@VERSION@', version), 'utf8')
}, {
  name: 'icon.png', data: fs.readFileSync(path.join(ROOT, 'tizen', 'icon.png'))
}];
walk(APP, '', []).forEach(function (r) {
  if (!SKIP.test(r)) entries.push({ name: r, data: fs.readFileSync(path.join(APP, r)) });
});

fs.mkdirSync(path.join(ROOT, 'dist'), { recursive: true });
var out = path.join(ROOT, 'dist', 'IPTVPlayer-' + version + '.wgt');
fs.writeFileSync(out, zip(entries));
console.log('geschrieben: ' + path.relative(ROOT, out) + ' (' + entries.length + ' Dateien, ' + fs.statSync(out).size + ' Bytes)');
