// Erzeugt demo/epg.xml mit Sendungen rund um "jetzt" (node demo/make-epg.js)
const fs = require('fs'), path = require('path');
const pad = n => String(n).padStart(2, '0');
const fmt = d => `${d.getUTCFullYear()}${pad(d.getUTCMonth()+1)}${pad(d.getUTCDate())}${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00 +0000`;
const titles = ['Nachrichten', 'Dokumentation: Planet Erde', 'Spielfilm', 'Sport aktuell', 'Kinderprogramm', 'Talkshow', 'Wetter'];
let xml = '<?xml version="1.0" encoding="UTF-8"?>\n<tv>\n';
['ch1','ch2','ch3','ch4'].forEach((id, k) => {
  xml += `<channel id="${id}"><display-name>Kanal ${k+1}</display-name></channel>\n`;
});
const start = new Date(); start.setUTCMinutes(0,0,0); start.setUTCHours(start.getUTCHours() - 72);
['ch1','ch2','ch3','ch4'].forEach((id, k) => {
  let t = new Date(start);
  for (let i = 0; i < 120; i++) {
    const e = new Date(t.getTime() + (30 + ((i + k) % 3) * 30) * 60000);
    xml += `<programme start="${fmt(t)}" stop="${fmt(e)}" channel="${id}"><title lang="de">${titles[(i+k)%titles.length]} &amp; mehr</title><desc>Beschreibung der Sendung ${i+1}.</desc></programme>\n`;
    t = e;
  }
});
fs.writeFileSync(path.join(__dirname, 'epg.xml'), xml + '</tv>\n');
console.log('epg.xml geschrieben');
