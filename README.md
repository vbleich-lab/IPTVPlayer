<p align="center">
  <img src="app/largeIcon.png" width="110" alt="IPTVPlayer-Symbol">
</p>

<h1 align="center">IPTVPlayer</h1>

<p align="center">
  <b>IPTV-App für Smart-TVs: LG webOS, Samsung Tizen, Android TV / Google TV / Fire TV</b><br>
  Für Edem TV (iedem.tv) oder jede andere M3U-Playlist, mit Programmführer, Archiv, Live-Vorschau und Einrichtung per Smartphone.
</p>

<p align="center">
  <a href="https://paypal.me/VitalijBleich"><img src="https://img.shields.io/badge/PayPal-Projekt%20unterst%C3%BCtzen-00457C?logo=paypal&logoColor=white&style=for-the-badge" alt="Mit PayPal unterstützen"></a>
</p>

<p align="center">
  <img src="docs/screenshots/02-channel-list.png" width="900" alt="Kanalliste mit Gruppen, Programm und Live-Vorschau">
</p>

> Die Screenshots zeigen eine Beispiel-Senderliste mit erfundenen Sendern. Im Videobereich ist ein Platzhalterbild zu sehen.

## Welche Datei für welchen Fernseher?

| Fernseher | Datei aus [Releases](../../releases) | Installation |
|---|---|---|
| **LG** (webOS 3 und neuer) | `com.iptvplayer.app_<version>_all.ipk` | [Homebrew Channel oder Developer Mode](#lg-webos) |
| **Samsung** (Tizen, ab etwa 2017) | `IPTVPlayer-<version>.wgt` | [TizenBrew-Installer oder Tizen Studio](#samsung-tizen) |
| **Android TV, Google TV, Fire TV**, z. B. Philips, Sony, TCL, Hisense (Android), Xiaomi, Nvidia Shield, TV-Sticks | `IPTVPlayer-<version>.apk` | [APK installieren](#android-tv--google-tv--fire-tv) |

Alle drei Versionen bauen auf demselben Code auf und haben dieselbe Oberfläche.

---

## Highlights

- 📺 **Edem TV per Code:** nur Zugangsschlüssel und Kanal-Domain eingeben, die App erzeugt die komplette Kanalliste selbst. Alternativ geht jede eigene M3U/M3U8-Playlist.
- 🗂️ **Kanalliste mit Live-Vorschau:** Gruppen, Favoriten, „Zuletzt gesehen“ und „Mit Archiv“. Der gewählte Sender läuft klein in der Vorschau, daneben stehen die laufende Sendung und das Programm.
- 🎬 **Mediathek:** Filme und Serien aus einer eigenen Playlist (bei Edem: *Медиатека*), mit Postern, Spulen und „Weiter ansehen“ an der zuletzt gesehenen Stelle.
- 🗓️ **Programmführer (EPG) und Archiv bis 7 Tage:** Sendung auswählen, OK drücken, und sie läuft aus dem Archiv. Mit ⏪ ⏩ springt man in der Sendung.
- 📱 **Einrichtung per Smartphone:** QR-Code am Fernseher scannen und alle Einstellungen bequem am Handy eintippen. Dort lassen sich auch Sicherungen herunterladen und wieder einspielen.
- ⚙️ **Über 50 Einstellungen in 8 Kategorien,** direkt am Fernseher oder am Handy.
- 🔒 **Kindersicherung** mit PIN für Erwachsenen-Gruppen und auf Wunsch für die Einstellungen.
- 🌍 **22 Sprachen:** Deutsch, English, Русский, Українська, Polski, Türkçe, Español, Français, Italiano, Română, Português, Nederlands, Čeština, Slovenčina, Magyar, Български, Ελληνικά, Lietuvių, Latviešu, Eesti, Қазақша, Беларуская.
- ⚡ **Autostart** beim Einschalten des Fernsehers (LG mit Homebrew Channel/Root und Android TV).
- 🖱️ Bedienung mit der normalen Fernbedienung **oder** mit dem Zeiger der Magic Remote.
- 🧓 Läuft auch auf älteren Fernsehern (ES5-Code, keine modernen Browser-Funktionen nötig).

---

## Screenshots

### Fernsehen mit Info-Leiste
Senderlogo, laufende Sendung mit Fortschritt, nächste Sendung und Archivtage. Die Leiste erscheint beim Umschalten und lässt sich oben oder unten anzeigen.

<img src="docs/screenshots/01-player.png" width="900" alt="Wiedergabe mit Info-Leiste">

### Kategorie geöffnet: Kanäle links, Programm und Vorschau rechts
Nach der Auswahl einer Kategorie verschwindet die Gruppenspalte. Die rechte Bildschirmhälfte zeigt dann die große Live-Vorschau, die laufende Sendung mit Beschreibung und die nächsten Sendungen.

<img src="docs/screenshots/03-category.png" width="900" alt="Kanalliste einer Kategorie mit großer Vorschau">

### Programmführer und Archiv
Tage wechseln mit ◀ ▶. Sendungen mit ⟲ lassen sich aus dem Archiv abspielen.

<img src="docs/screenshots/04-epg.png" width="900" alt="Programmführer mit Archiv">

### Einstellungen am Fernseher
Acht Kategorien. Änderungen wirken sofort, zu jeder Einstellung steht eine kurze Erklärung.

<img src="docs/screenshots/05-settings.png" width="900" alt="Einstellungen, Kategorie Kanalliste">

<img src="docs/screenshots/06-settings-system.png" width="900" alt="Einstellungen, Kategorie System mit Autostart">

### Einrichtung per Smartphone

<table>
  <tr>
    <td width="68%"><img src="docs/screenshots/07-qr.png" alt="QR-Code am Fernseher"></td>
    <td width="32%"><img src="docs/screenshots/08-phone.png" alt="Einstellungsseite auf dem Handy"></td>
  </tr>
  <tr>
    <td>QR-Code am Fernseher scannen (Handy im selben WLAN)</td>
    <td>Formular mit allen Einstellungen auf dem Handy</td>
  </tr>
</table>

---

## Alle Funktionen

**Quellen**
- **Edem TV:** nur *Ключ доступа* (Zugangsschlüssel) und *Домен каналов* (Kanal-Domain) aus dem Kabinett eingeben. Die App lädt die aktuelle Edem-Kanalvorlage (epg.one, etwa 4200 Kanäle) und setzt beides ein: `http://<domain>/iptv/<schlüssel>/<kanal>/index.m3u8`. Die Vorlage wird gespeichert, falls der Server einmal nicht erreichbar ist.
- **Eigene Playlist:** beliebige M3U/M3U8-URL, auf Wunsch automatisch alle 6, 12 oder 24 Stunden neu geladen.

**Mediathek (Filme und Serien)**
- Edem: im Kabinett unter *Медиатека* den Link kopieren und in Einstellungen › Anbieter › *Mediathek-Link* eintragen (am einfachsten per Smartphone). Jede andere VOD-Playlist im M3U-Format funktioniert genauso.
- Öffnen über die Gruppe **Mediathek** in der Kanalliste. Links die Kategorien aus der Playlist, dazu „Weiter ansehen“ und „Alle“.
- OK spielt ab oder setzt an der gemerkten Stelle fort, 🔴 Rot startet von vorn. Im Film: ◀ ▶ ±30 s, ⏪ ⏩ ±5 Min, OK Pause, Zurück führt zurück in die Mediathek, danach läuft wieder der Live-Sender.

**Programmführer**
- Für Edem automatisch von epg.one: „komplett“ mit Archivtagen und Beschreibungen, oder „kompakt“ nur für heute. Alternativ das EPG aus der Playlist (`url-tvg`) oder eine eigene XMLTV-URL.
- Das EPG wird auf dem Fernseher zwischengespeichert und nur in einstellbaren Abständen neu geladen. Gepackte Dateien (`.gz`) funktionieren auch auf älteren Geräten (mitgeliefertes pako).
- Zeitverschiebung ±12 h.

**Archiv (Catch-up)**
- Bis 7 Tage zurück. Formate: Edem/Shift (`utc`/`lutc`), Flussonic und `catchup-source`.
- Sprungweite und Vorlauf einstellbar (die Wiedergabe beginnt 1–10 Minuten früher).

**Kanalliste**
- Gruppen aus der Playlist, dazu Favoriten, „Zuletzt gesehen“ und „Mit Archiv“. Gruppen lassen sich ausblenden (gelbe Taste).
- **Favoriten sortieren:** In den Favoriten OK lang drücken, mit ▲ ▼ verschieben (CH± springt an den Anfang bzw. ans Ende), mit OK fertig. Die Reihenfolge wird mitgesichert.
- Live-Vorschau, Logos, Kanalnummern und die laufende Sendung mit Fortschrittsbalken.
- Sortierung, Startkanal, Verhalten von OK sowie ▲▼, automatisches Schließen und Wartezeit nach Zifferneingabe sind einstellbar.

**Wiedergabe**
- Nativer Player des Fernsehers (HLS und MPEG-TS) oder hls.js.
- Bildformat, Puffer, automatische Neuverbindung, Stream-Zeitlimit, bevorzugte Tonspur (Sprache), Untertitel und Sleep-Timer.
- Merkt sich den letzten Kanal. Rote Taste wechselt zum vorigen Kanal.

**Oberfläche**
- 22 Sprachen (Standard ist die Sprache des Fernsehers), 6 Akzentfarben, Größe 80–130 %.
- Uhr, 24/12 h, Dauer und Position der Info-Leiste, deckender oder durchscheinender Menühintergrund, Animationen.

**Smartphone und Sicherung**
- Auf LG startet ein kleiner webOS-Hintergrunddienst (`service/`) im Heimnetz einen Web-Server (Port 8765), auf Android übernimmt das die App selbst. Zugriff gibt es nur mit dem zufälligen Token aus dem QR-Code; er wird bei jedem App-Start neu erzeugt.
- Änderungen an der Kindersicherung verlangen auch auf dem Handy die PIN.
- Sicherung von Einstellungen und Favoriten auf dem Fernseher oder als JSON-Datei auf dem Handy, später wieder einspielbar.

**Autostart (LG mit Root, Android TV)**
- Einstellungen › System › „Beim Einschalten des Fernsehers starten“. Die App legt über den Root-Dienst des [Homebrew Channel](https://github.com/webosbrew/webos-homebrew-channel) ein Startskript in `/var/lib/webosbrew/init.d` an.
- Die App startet dann nach dem Hochfahren und bei jedem Aufwachen aus dem Standby. „Nein“ entfernt das Skript wieder.
- Android: siehe [Autostart auf Android](#android-tv--google-tv--fire-tv).

---

## Fernbedienung

| Taste | Fernsehen | Kanalliste | Programmführer |
|---|---|---|---|
| OK | Kanalliste | Abspielen | Live / Archiv abspielen |
| ▲ ▼ / CH± | Umschalten | Auswahl / seitenweise | Auswahl |
| ◀ ▶ | Info (im Archiv: ±5 Min) | Gruppen ↔ Kanäle / ▶ = Programm | Tag wechseln |
| 0–9 | Kanalnummer | | |
| ⏪ ⏩ | Archiv ±30 Min | | |
| 🔴 Rot | Letzter Kanal | | |
| 🟢 Grün | Programmführer | Programmführer | Schließen |
| 🟡 Gelb | Favorit | Favorit / Gruppe ausblenden | |
| 🔵 Blau | Einstellungen | Einstellungen | |
| Zurück | Archiv → Live / Liste (Samsung/Android: 2× = App beenden) | Schließen | Zurück zur Liste |

Android-Fernbedienungen ohne Farbtasten: **Menü** öffnet die Einstellungen (wie Blau), **Guide** den Programmführer (wie Grün).

---

## Installation

## LG webOS

### Über den Homebrew Channel (gerootete Fernseher)

Am einfachsten geht es über das eigene Repository dieses Projekts. Updates erscheinen dann automatisch im Homebrew Channel.

1. **Homebrew Channel** öffnen → **Settings** (Zahnrad) → ganz unten bei *Repositories* auf **Add repository**.
2. Diese Adresse eingeben:
   ```
   https://vbleich-lab.github.io/IPTVPlayer/api/apps.json
   ```
3. Zurück zur App-Liste: **IPTVPlayer** auswählen → **Install**.

### Manuell im Developer Mode

Die fertige `.ipk`-Datei liegt unter [Releases](../../releases).

1. Auf dem Fernseher die App **Developer Mode** aus dem LG Content Store installieren, mit einem LG-Developer-Konto anmelden, *Dev Mode Status* einschalten und den Fernseher neu starten.
2. Am PC die webOS-CLI installieren und den Fernseher verbinden (IP und Passphrase stehen in der Developer-Mode-App):
   ```bash
   npm install -g @webos-tools/cli
   ares-setup-device            # Gerät "tv" mit der TV-IP anlegen
   ares-novacom --device tv --getkey
   ```
3. Installieren und starten:
   ```bash
   ares-install --device tv com.iptvplayer.app_<version>_all.ipk
   ares-launch --device tv com.iptvplayer.app
   ```
4. In der App den Zugangsschlüssel und die Kanal-Domain eintragen (oder eine Playlist-URL), am bequemsten per Smartphone über den QR-Code. Der erste EPG-Download kann einige Minuten dauern. Er läuft im Hintergrund; danach kommt das EPG sofort aus dem Cache.

> Im Developer Mode läuft die Sitzung nach 50 Stunden ab und muss in der Developer-Mode-App verlängert werden, sonst entfernt der Fernseher die App.

### Umstieg von Version 2.6 und älter (LG)

Bis Version 2.6 hieß die App intern `com.edemtv.player`, ab 2.7 heißt sie `com.iptvplayer.app`. Der Fernseher sieht sie deshalb als neue App.
1. In der alten App: Einstellungen › *Smartphone & Sicherung* → QR-Code scannen → auf dem Handy **Sicherung herunterladen**.
2. Die neue Version installieren und die alte deinstallieren.
3. In der neuen App per QR-Code die Sicherung wieder hochladen. Einstellungen und Favoriten sind dann zurück.
4. Wer den Autostart benutzt hat: in der neuen App unter Einstellungen › System einmal „Nein“ und wieder „Ja“ wählen. Dann startet der Fernseher die neue App.

## Samsung (Tizen)

Samsung lässt Apps außerhalb des Stores nur mit eigener Signatur zu. Am einfachsten geht es mit dem **TizenBrew-Installer**: Er holt die App direkt von GitHub und signiert sie mit deinem eigenen Samsung-Zertifikat.

**Tizen 7 und neuer (Fernseher ab etwa 2023):**
1. Am Fernseher den Entwicklermodus einschalten: *Apps* öffnen, auf der Fernbedienung **1 2 3 4 5** drücken, *Developer mode* auf **On** stellen und die IP-Adresse des PCs eintragen. Fernseher neu starten.
2. Am PC den [TizenBrew-Installer](https://github.com/reisxd/TizenBrewInstaller/releases) starten und den Fernseher verbinden.
3. **Install from GitHub** wählen und eingeben:
   ```
   vbleich-lab/IPTVPlayer
   ```
   Der Installer nimmt die `.wgt` aus dem neuesten Release, signiert sie (Anmeldung mit dem Samsung-Konto) und installiert sie.

**Ältere Samsung-Fernseher (Tizen 3 bis 6):**
Die `.wgt` aus [Releases](../../releases) muss mit einem eigenen Samsung-Zertifikat signiert werden:
1. [Tizen Studio](https://developer.samsung.com/smarttv/develop/getting-started/setting-up-sdk/installing-tv-sdk.html) mit der *Samsung Certificate Extension* installieren und im *Certificate Manager* ein Samsung-Zertifikat für den Fernseher anlegen (dabei die DUID des Fernsehers eintragen).
2. Entwicklermodus am Fernseher wie oben einschalten.
3. Signieren und installieren:
   ```bash
   tizen package -t wgt -s <Zertifikatsprofil> -- IPTVPlayer-<version>.wgt
   sdb connect <TV-IP>
   tizen install -n IPTVPlayer-<version>.wgt -t <TV-Name>
   ```

Auf Samsung gibt es keine Einrichtung per Smartphone (Tizen-Apps können keinen Web-Server starten) und keinen Autostart. Alles lässt sich direkt mit der Fernbedienung einstellen.

## Android TV / Google TV / Fire TV

Die `.apk` aus [Releases](../../releases) läuft ab Android 5 auf Fernsehern, TV-Boxen und Sticks (auch Fire TV) sowie auf Tablets.

**Mit der App „Downloader“** (Google Play bzw. Amazon Appstore):
1. Am Fernseher die Installation aus unbekannten Quellen für *Downloader* erlauben (Android TV: *Einstellungen › Apps › Sicherheit › Unbekannte Quellen*; Fire TV: *Mein Fire TV › Entwickleroptionen › Apps unbekannter Herkunft*).
2. In *Downloader* den Download-Link der `.apk` aus dem neuesten Release eingeben, herunterladen und installieren.

**Oder per ADB vom PC** (am Fernseher vorher *Entwickleroptionen › USB-/Netzwerk-Debugging* einschalten):
```bash
adb connect <TV-IP>
adb install -r IPTVPlayer-<version>.apk
```

IPTVPlayer erscheint dann in der App-Leiste des Fernsehers. Die Einrichtung per Smartphone (QR-Code) funktioniert wie auf LG.

**Autostart auf Android:** Einstellungen › System › „Beim Einschalten des Fernsehers starten“. Android lässt eine App nur mit der Berechtigung **„Über anderen Apps einblenden“** aus dem Hintergrund starten; IPTVPlayer öffnet die passende Einstellungsseite selbst. Auf Geräten ohne diese Seite (manche Fire-TV- und Android-TV-Modelle) geht es per ADB:
```bash
adb shell appops set com.iptvplayer.app SYSTEM_ALERT_WINDOW allow
```

## Selbst bauen

```bash
npx -p @webos-tools/cli ares-package app service -o dist -e demo   # LG:      dist/com.iptvplayer.app_<version>_all.ipk
node tools/build-tizen.js                                          # Samsung: dist/IPTVPlayer-<version>.wgt (unsigniert)
bash tools/build-android.sh                                        # Android: dist/IPTVPlayer-<version>.apk
```
Für Android braucht man das Android SDK (build-tools und eine Plattform), ein JDK und Python 3, aber kein Gradle. Beim ersten Lauf legt das Skript einen Signierschlüssel unter `~/.android/iptvplayer-release.jks` an. **Diesen Schlüssel sichern:** Updates lassen sich nur mit demselben Schlüssel über eine installierte Version installieren.

**Neue Version veröffentlichen:**
1. Version in `app/appinfo.json`, `service/package.json` und `VERSION` in `app/js/app.js` erhöhen und alle drei Pakete neu bauen (Befehle oben).
2. Das Repository für den Homebrew Channel aktualisieren. Das Skript trägt Version, Download-Link und Prüfsumme in `docs/api/` ein:
   ```bash
   node tools/make-repo.js
   ```
3. Committen, pushen und alle drei Dateien als Release hochladen (genau diese `.ipk`, wegen der Prüfsumme; die `.wgt` muss im neuesten Release liegen, damit der TizenBrew-Installer sie findet):
   ```bash
   gh release create v<version> dist/com.iptvplayer.app_<version>_all.ipk dist/IPTVPlayer-<version>.wgt dist/IPTVPlayer-<version>.apk
   ```

## Im Browser testen

```bash
npx http-server -p 8137
```
Dann `http://localhost:8137/app/index.html?playlist=demo/demo.m3u` öffnen (Tasten: Pfeile, Enter, Backspace = Zurück).
`node app/demo/make-epg.js` erzeugt ein Demo-EPG um die aktuelle Uhrzeit. Für die Smartphone-Einrichtung zusätzlich `node service/index.js` starten; am PC läuft das ohne webOS als normaler Server.

## Projektaufbau

```
app/               Die App (HTML/CSS/ES5-JavaScript), gemeinsam für alle Plattformen
  js/platform.js   Unterschiede LG / Samsung / Android (Tasten, Beenden, Autostart)
  js/app.js        Oberfläche, Steuerung, Einstellungen
  js/player.js     Wiedergabe (nativ / hls.js), Tonspur, Untertitel
  js/epg.js        XMLTV-Parser mit IndexedDB-Cache
  js/m3u.js        Playlist-Parser
  js/i18n.js       Übersetzungen (22 Sprachen)
service/           webOS-JS-Dienst: Web-Server für die Smartphone-Einrichtung (LG)
tizen/config.xml   Samsung-Paketbeschreibung
android/           Android-Hülle (Java): WebView, Tastenzuordnung, Handy-Server, Autostart
tools/             Build-Skripte, Icons, Homebrew-Repository
docs/screenshots/  Bilder für diese Seite
```

## Unterstützen

Dir gefällt die App? Über eine kleine Spende freue ich mich sehr. Sie hilft, IPTVPlayer weiterzuentwickeln.

<a href="https://paypal.me/VitalijBleich"><img src="https://img.shields.io/badge/PayPal-paypal.me%2FVitalijBleich-00457C?logo=paypal&logoColor=white&style=for-the-badge" alt="paypal.me/VitalijBleich"></a>

## Hinweise

- Inoffizielles Projekt, nicht verbunden mit LG, Samsung, Google, Amazon oder Edem TV. Die App enthält keine Sender oder Zugangsdaten; man braucht ein eigenes Abo oder eine eigene Playlist.
- Mitgelieferte Bibliotheken: [pako](https://github.com/nodeca/pako) (MIT/Zlib) und [QR Code Generator](https://github.com/kazuhikoarase/qrcode-generator) (MIT). [hls.js](https://github.com/video-dev/hls.js) (Apache-2.0) wird bei Bedarf nachgeladen.
