package com.iptvplayer.app;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import android.webkit.JavascriptInterface;

/** Funktionen, die die Web-App über window.IPTVAndroid aufruft (siehe app/js/platform.js). */
public class Bridge {
    static final String PREFS = "iptvplayer";
    private final Activity activity;

    Bridge(Activity activity) { this.activity = activity; }

    static SharedPreferences prefs(Context c) { return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE); }

    static boolean canStartFromBackground(Context c) {
        return Build.VERSION.SDK_INT < 29 || Settings.canDrawOverlays(c);
    }

    @JavascriptInterface
    public void exit() {
        activity.runOnUiThread(new Runnable() {
            @Override public void run() {
                if (Build.VERSION.SDK_INT >= 21) activity.finishAndRemoveTask(); else activity.finish();
            }
        });
    }

    /** Startet den Web-Server für die Smartphone-Einrichtung (Port 8765–8768). */
    @JavascriptInterface
    public boolean startServer() {
        return PhoneServer.get(activity.getApplicationContext()).start();
    }

    /** "on" / "off" */
    @JavascriptInterface
    public String getAutostart() {
        return prefs(activity).getBoolean("autostart", false) ? "on" : "off";
    }

    /** Ergebnis: "on", "off" oder "perm" (Berechtigung „Über anderen Apps einblenden“ fehlt) */
    @JavascriptInterface
    public String setAutostart(boolean on) {
        Context c = activity.getApplicationContext();
        if (on && !canStartFromBackground(c)) return "perm";
        prefs(c).edit().putBoolean("autostart", on).apply();
        if (on) AutostartService.start(c, false);
        else c.stopService(new Intent(c, AutostartService.class));
        return on ? "on" : "off";
    }

    /** Öffnet die Einstellung „Über anderen Apps einblenden“ (falls das Gerät sie anbietet). */
    @JavascriptInterface
    public void openOverlaySettings() {
        activity.runOnUiThread(new Runnable() {
            @Override public void run() {
                Uri pkg = Uri.parse("package:" + activity.getPackageName());
                try {
                    activity.startActivity(new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, pkg));
                } catch (Exception e) {
                    try { activity.startActivity(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, pkg)); } catch (Exception ignored) { }
                }
            }
        });
    }
}
