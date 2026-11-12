#!/usr/bin/env bash
# Baut die Android-TV-Version: dist/IPTVPlayer-<version>.apk
#
#   bash tools/build-android.sh
#
# Braucht: Android SDK (build-tools + eine Plattform), ein JDK (javac, keytool), Python 3, Node.
# Ohne Gradle: javac → d8 → aapt2 → zipalign → apksigner.
#
# Signierschlüssel: $IPTV_KEYSTORE (Standard ~/.android/iptvplayer-release.jks) mit Passwort aus
# $IPTV_KEYSTORE_PASS oder der Datei <keystore>.pass. Fehlt er, wird einer angelegt.
# WICHTIG: Den Schlüssel sichern – Updates lassen sich nur mit demselben Schlüssel installieren.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SDK="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-${LOCALAPPDATA:-$HOME}/Android/Sdk}}"
[ -d "$SDK" ] || { echo "Android SDK nicht gefunden (ANDROID_HOME setzen)"; exit 1; }
BT="$SDK/build-tools/$(ls "$SDK/build-tools" | sort -V | tail -1)"
PLAT="$(ls -d "$SDK"/platforms/android-* | sort -V | tail -1)"
ANDROID_JAR="$PLAT/android.jar"
EXE=""; [ -f "$BT/aapt2.exe" ] && EXE=".exe"
BAT=""; [ -f "$BT/d8.bat" ] && BAT=".bat"
PY=""; for p in python3 python; do if command -v "$p" >/dev/null 2>&1 && "$p" -c 'import sys' >/dev/null 2>&1; then PY="$p"; break; fi; done
[ -n "$PY" ] || { echo "Python 3 fehlt"; exit 1; }
# Windows (Git Bash): Pfade für Programme, die sie in Dateien/Argumenten nicht selbst umsetzen
winpath() { if command -v cygpath >/dev/null 2>&1; then cygpath -m "$1"; else printf '%s' "$1"; fi; }

VERSION="$(cd "$ROOT" && node -p "require('./app/appinfo.json').version")"
IFS=. read -r MA MI PA <<< "$VERSION"
VCODE=$((MA * 10000 + MI * 100 + PA))
echo "IPTVPlayer $VERSION (versionCode $VCODE), build-tools $(basename "$BT"), $(basename "$PLAT")"

OUT="$ROOT/build/android"
rm -rf "$OUT"
mkdir -p "$OUT/classes" "$OUT/dex" "$OUT/assets/app" "$OUT/assets/www" "$ROOT/dist"

# 1. Web-App als Assets (ohne webOS-Dateien und Demo)
( cd "$ROOT/app" && find . -type f ! -path './demo/*' ! -name appinfo.json ! -name icon.png ! -name largeIcon.png \
    -exec sh -c 'mkdir -p "$0/$(dirname "$1")" && cp "$1" "$0/$1"' "$OUT/assets/app" {} \; )
cp "$ROOT/service/www/phone.html" "$OUT/assets/www/phone.html"

# 2. Java übersetzen
find "$ROOT/android/src" -name '*.java' | while read -r f; do winpath "$f"; echo; done > "$OUT/sources.txt"
javac -nowarn --release 8 -encoding UTF-8 -classpath "$ANDROID_JAR" -d "$OUT/classes" @"$(winpath "$OUT/sources.txt")" 2>&1 | grep -v "^warning: \[options\]\|^1 warning\|^Note:" || true
[ -n "$(find "$OUT/classes" -name '*.class' | head -1)" ] || { echo "javac fehlgeschlagen"; exit 1; }

# 3. Dex
"$BT/d8$BAT" --release --min-api 21 --lib "$ANDROID_JAR" --output "$OUT/dex" $(find "$OUT/classes" -name '*.class')

# 4. Ressourcen + Manifest
"$BT/aapt2$EXE" compile --dir "$ROOT/android/res" -o "$OUT/res.zip"
"$BT/aapt2$EXE" link -o "$OUT/base.apk" -I "$ANDROID_JAR" --manifest "$ROOT/android/AndroidManifest.xml" \
  --min-sdk-version 21 --target-sdk-version 35 --version-code "$VCODE" --version-name "$VERSION" \
  -A "$OUT/assets" "$OUT/res.zip"

# 5. Archiv neu schreiben und classes.dex hinzufügen (resources.arsc bleibt unkomprimiert)
"$PY" - "$OUT/base.apk" "$OUT/dex/classes.dex" "$OUT/unsigned.apk" <<'PYEOF'
import sys, zipfile
src, dex, dst = sys.argv[1:4]
with zipfile.ZipFile(src) as zin, zipfile.ZipFile(dst, 'w') as zout:
    for i in zin.infolist():
        zout.writestr(zipfile.ZipInfo(i.filename, date_time=(2024, 1, 1, 0, 0, 0)), zin.read(i.filename),
                      compress_type=zipfile.ZIP_STORED if i.filename == 'resources.arsc' or i.filename.endswith('.png') else zipfile.ZIP_DEFLATED)
    zout.write(dex, 'classes.dex', compress_type=zipfile.ZIP_DEFLATED)
PYEOF

# 6. Ausrichten + signieren
KS="${IPTV_KEYSTORE:-$HOME/.android/iptvplayer-release.jks}"
if [ -z "${IPTV_KEYSTORE_PASS:-}" ] && [ -f "$KS.pass" ]; then IPTV_KEYSTORE_PASS="$(cat "$KS.pass")"; fi
if [ ! -f "$KS" ]; then
  echo "Lege neuen Signierschlüssel an: $KS"
  mkdir -p "$(dirname "$KS")"
  IPTV_KEYSTORE_PASS="${IPTV_KEYSTORE_PASS:-$("$PY" -c 'import secrets; print(secrets.token_urlsafe(24))')}"
  keytool -genkeypair -keystore "$KS" -storepass "$IPTV_KEYSTORE_PASS" -keypass "$IPTV_KEYSTORE_PASS" -alias iptvplayer \
    -keyalg RSA -keysize 3072 -validity 18250 -dname "CN=IPTVPlayer" -storetype PKCS12 >/dev/null
  ( umask 077; printf '%s' "$IPTV_KEYSTORE_PASS" > "$KS.pass" )
fi
"$BT/zipalign$EXE" -p -f 4 "$OUT/unsigned.apk" "$OUT/aligned.apk"
APK="$ROOT/dist/IPTVPlayer-$VERSION.apk"
"$BT/apksigner$BAT" sign --ks "$KS" --ks-pass "pass:$IPTV_KEYSTORE_PASS" --ks-key-alias iptvplayer --out "$APK" "$OUT/aligned.apk"
"$BT/apksigner$BAT" verify "$APK"
echo "geschrieben: dist/IPTVPlayer-$VERSION.apk ($(wc -c < "$APK") Bytes)"
