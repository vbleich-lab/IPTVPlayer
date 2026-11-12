/*
 * Plattform-Schicht: dieselbe App läuft auf LG webOS, Samsung Tizen und Android TV (WebView).
 * Hier steckt alles, was je Gerät verschieden ist: Tasten-Codes, Beenden, Smartphone-Dienst, Autostart.
 * ES5, wird vor app.js geladen.
 */
var Platform = (function () {
  'use strict';

  var ua = navigator.userAgent || '';
  var android = window.IPTVAndroid || null; // Java-Brücke der Android-App (android/…/Bridge.java)
  var name = android ? 'android'
    : (window.tizen || /Tizen/i.test(ua)) ? 'tizen'
    : (window.PalmServiceBridge || /Web0S|webOS/i.test(ua)) ? 'webos'
    : 'browser';

  var LABELS = { webos: 'webOS', tizen: 'Samsung Tizen', android: 'Android TV', browser: 'Browser' };

  // Gerätespezifische Tasten → Codes, mit denen die App arbeitet (LG-Belegung)
  var KEYMAP = {
    tizen: { 10009: 461, 427: 33, 428: 34, 10252: 10252 }
  };

  // Samsung: Farb-, Medien-, Kanal- und Zifferntasten müssen angemeldet werden, sonst nimmt sie das System
  var TIZEN_KEYS = ['ColorF0Red', 'ColorF1Green', 'ColorF2Yellow', 'ColorF3Blue', 'ChannelUp', 'ChannelDown', 'Info',
    'MediaPlay', 'MediaPause', 'MediaPlayPause', 'MediaStop', 'MediaFastForward', 'MediaRewind',
    '0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];

  function init() {
    if (name === 'tizen' && window.tizen && tizen.tvinputdevice) {
      var supported = {};
      try { tizen.tvinputdevice.getSupportedKeys().forEach(function (k) { supported[k.name] = true; }); } catch (e) {}
      TIZEN_KEYS.forEach(function (k) {
        if (!supported[k]) return;
        try { tizen.tvinputdevice.registerKey(k); } catch (e) {}
      });
    }
  }

  function mapKey(k) {
    var m = KEYMAP[name];
    return m && m[k] !== undefined ? m[k] : k;
  }

  /** App beenden (webOS: das System übernimmt das über die Home-Taste) */
  function exit() {
    try {
      if (name === 'android') android.exit();
      else if (name === 'tizen') tizen.application.getCurrentApplication().exit();
      else window.close();
    } catch (e) { try { window.close(); } catch (e2) {} }
  }

  /** Android: lokalen Web-Server für die Smartphone-Einrichtung starten */
  function startPhoneServer() {
    if (name !== 'android') return false;
    try { return !!android.startServer(); } catch (e) { return false; }
  }

  function androidAutostart(on) {
    try { return on === undefined ? String(android.getAutostart()) : String(android.setAutostart(!!on)); } catch (e) { return 'error:' + e.message; }
  }

  return {
    name: name,
    label: LABELS[name],
    init: init,
    mapKey: mapKey,
    exit: exit,
    canExit: name === 'android' || name === 'tizen',
    // Smartphone-Einrichtung braucht einen lokalen Web-Server: webOS (JS-Dienst), Android (Java), am PC (node service/index.js)
    phoneSetup: name !== 'tizen',
    autostart: name === 'webos' || name === 'android',
    startPhoneServer: startPhoneServer,
    androidAutostart: androidAutostart,
    openAutostartPermission: function () { try { android.openOverlaySettings(); } catch (e) {} }
  };
})();
