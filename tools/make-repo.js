#!/usr/bin/env node
/*
 * Erzeugt das eigene Homebrew-Channel-Repository unter docs/ (wird über GitHub Pages ausgeliefert).
 *
 *   node tools/make-repo.js
 *
 * Voraussetzung: dist/com.iptvplayer.app_<version>_all.ipk ist gebaut und genau diese Datei
 * wird als Release v<version> auf GitHub hochgeladen (die Prüfsumme muss übereinstimmen).
 *
 * Im Homebrew Channel unter Settings › Add repository eintragen:
 *   https://vbleich-lab.github.io/IPTVPlayer/api/apps.json
 */
var fs = require('fs'), path = require('path'), crypto = require('crypto');

var ROOT = path.join(__dirname, '..');
var GH_USER = 'vbleich-lab', GH_REPO = 'IPTVPlayer';
var PAGES = 'https://' + GH_USER + '.github.io/' + GH_REPO + '/';
var SOURCE = 'https://github.com/' + GH_USER + '/' + GH_REPO;

var app = JSON.parse(fs.readFileSync(path.join(ROOT, 'app', 'appinfo.json'), 'utf8'));
var ipkName = app.id + '_' + app.version + '_all.ipk';
var ipkPath = path.join(ROOT, 'dist', ipkName);
if (!fs.existsSync(ipkPath)) { console.error('Fehlt: dist/' + ipkName + ' – zuerst bauen (ares-package app service -o dist -e demo)'); process.exit(1); }
var ipk = fs.readFileSync(ipkPath);

var SHORT = 'IPTV-App für Edem TV oder jede M3U-Playlist: Kanalliste mit Live-Vorschau, Programmführer, Archiv, Einrichtung per Smartphone, Mediathek, 22 Sprachen.';
var DESC = SHORT + ' Optional: Autostart beim Einschalten des Fernsehers (mit Root oder im Developer Mode).';

var manifest = {
  id: app.id,
  version: app.version,
  type: 'web',
  title: app.title,
  appDescription: DESC,
  iconUri: PAGES + 'icon.png',
  sourceUrl: SOURCE,
  rootRequired: 'optional',
  ipkUrl: SOURCE + '/releases/download/v' + app.version + '/' + ipkName,
  ipkHash: { sha256: crypto.createHash('sha256').update(ipk).digest('hex') },
  ipkSize: ipk.length
};

var shots = [
  ['01-player.png', 'Wiedergabe mit Info-Leiste'],
  ['02-channel-list.png', 'Kanalliste mit Gruppen, Programm und Live-Vorschau'],
  ['03-category.png', 'Kategorie mit großer Vorschau'],
  ['04-epg.png', 'Programmführer mit Archiv'],
  ['05-settings.png', 'Einstellungen am Fernseher'],
  ['07-qr.png', 'Einrichtung per Smartphone (QR-Code)']
];

var pkg = {
  id: app.id,
  title: app.title,
  iconUri: manifest.iconUri,
  manifestUrl: PAGES + 'api/apps/' + app.id + '/manifest.json',
  manifest: manifest,
  pool: 'main',
  requirements: { webosRelease: '>=3.0' },
  shortDescription: SHORT,
  fullDescriptionUrl: PAGES + 'api/apps/' + app.id + '/full_description.html',
  screenshots: shots.map(function (s) { return { url: PAGES + 'screenshots/' + s[0], caption: s[1] }; })
};

var apps = {
  paging: { page: 1, count: 1, maxPage: 1, itemsTotal: 1, prevUrl: null, nextUrl: null },
  packages: [pkg]
};

var desc = [
  '<h2>IPTVPlayer</h2>',
  '<p>IPTV-App für LG-Fernseher mit webOS – für Edem TV (iedem.tv) oder jede andere M3U-Playlist.</p>',
  '<ul>',
  '<li><b>Edem TV per Code:</b> nur Zugangsschlüssel und Kanal-Domain eingeben, oder eine eigene Playlist-URL.</li>',
  '<li><b>Kanalliste mit Live-Vorschau,</b> Gruppen, Favoriten, „Zuletzt gesehen“, „Mit Archiv“.</li>',
  '<li><b>Programmführer und Archiv</b> bis 7 Tage zurück.</li>',
  '<li><b>Einrichtung per Smartphone:</b> QR-Code scannen, Einstellungen am Handy eintippen, Sicherung herunterladen.</li>',
  '<li>Über 50 Einstellungen, Kindersicherung mit PIN, 22 Sprachen.</li>',
  '<li><b>Autostart</b> beim Einschalten des Fernsehers (Einstellungen › System, mit Root oder im Developer Mode).</li>',
  '</ul>',
  '<p>Die App enthält keine Sender oder Zugangsdaten – ein eigenes Abo bzw. eine eigene Playlist ist nötig.</p>',
  '<p>Quellcode, Screenshots und Anleitung: <a href="' + SOURCE + '">' + SOURCE + '</a></p>',
  '<p>Unterstützen: <a href="https://paypal.me/VitalijBleich">paypal.me/VitalijBleich</a></p>'
].join('\n');

var out = path.join(ROOT, 'docs');
var appDir = path.join(out, 'api', 'apps', app.id);
fs.mkdirSync(appDir, { recursive: true });
fs.writeFileSync(path.join(out, 'api', 'apps.json'), JSON.stringify(apps, null, 2) + '\n');
fs.writeFileSync(path.join(appDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
fs.writeFileSync(path.join(appDir, 'full_description.html'), desc + '\n');
fs.copyFileSync(path.join(ROOT, 'app', 'largeIcon.png'), path.join(out, 'icon.png'));
fs.writeFileSync(path.join(out, '.nojekyll'), '');
console.log('Repository für ' + app.title + ' ' + app.version + ' geschrieben (sha256 ' + manifest.ipkHash.sha256.slice(0, 12) + '…, ' + ipk.length + ' Bytes)');
console.log('Release-Datei muss sein: ' + manifest.ipkUrl);
