package com.iptvplayer.app;

import android.app.Activity;
import android.app.DownloadManager;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
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

    /**
     * Update: lädt die APK über den DownloadManager und öffnet danach die Paketinstallation des Systems.
     * Rückgabe: "started", "perm" (Installieren aus dieser App nicht erlaubt – Einstellung wird geöffnet) oder "error: …".
     * Zwischenstände meldet die App über window.IPTVUpdateState(state, text).
     */
    @JavascriptInterface
    public String installUpdate(final String url) {
        final Context c = activity.getApplicationContext();
        if (url == null || !url.matches("^https://[^\\s]+\\.apk$")) return "error: bad url";
        if (Build.VERSION.SDK_INT >= 26 && !c.getPackageManager().canRequestPackageInstalls()) {
            activity.runOnUiThread(new Runnable() {
                @Override public void run() {
                    try {
                        activity.startActivity(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + activity.getPackageName())));
                    } catch (Exception ignored) { }
                }
            });
            return "perm";
        }
        try {
            final DownloadManager dm = (DownloadManager) c.getSystemService(Context.DOWNLOAD_SERVICE);
            String name = url.substring(url.lastIndexOf('/') + 1);
            java.io.File old = new java.io.File(c.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS), name);
            if (old.exists()) old.delete();
            DownloadManager.Request req = new DownloadManager.Request(Uri.parse(url));
            req.setTitle("IPTVPlayer Update");
            req.setMimeType("application/vnd.android.package-archive");
            req.setDestinationInExternalFilesDir(c, Environment.DIRECTORY_DOWNLOADS, name);
            final long id = dm.enqueue(req);
            new Thread(new Runnable() {
                @Override public void run() {
                    for (int i = 0; i < 1200; i++) {
                        try { Thread.sleep(500); } catch (InterruptedException e) { return; }
                        android.database.Cursor cur = dm.query(new DownloadManager.Query().setFilterById(id));
                        int st = -1;
                        if (cur != null) {
                            if (cur.moveToFirst()) st = cur.getInt(cur.getColumnIndex(DownloadManager.COLUMN_STATUS));
                            cur.close();
                        }
                        if (st == DownloadManager.STATUS_FAILED || st == -1) { state("error", "download"); return; }
                        if (st == DownloadManager.STATUS_SUCCESSFUL) {
                            Uri apk = dm.getUriForDownloadedFile(id);
                            Intent in = new Intent(Intent.ACTION_VIEW);
                            in.setDataAndType(apk, "application/vnd.android.package-archive");
                            in.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
                            try { activity.startActivity(in); state("install", ""); }
                            catch (Exception e) { state("error", "install: " + e.getMessage()); }
                            return;
                        }
                    }
                    state("error", "timeout");
                }
            }).start();
            return "started";
        } catch (Exception e) {
            return "error: " + e.getMessage();
        }
    }

    private void state(String st, String text) {
        if (!(activity instanceof MainActivity)) return;
        String t = text == null ? "" : text.replace("\\", "\\\\").replace("'", "\\'");
        ((MainActivity) activity).js("window.IPTVUpdateState&&IPTVUpdateState('" + st + "','" + t + "')");
    }

    /** Weck-Timer: "on", "off" oder "perm" (die App darf sich nicht selbst in den Vordergrund holen) */
    @JavascriptInterface
    public String setWake(boolean on, int h, int m, String days) {
        Context c = activity.getApplicationContext();
        prefs(c).edit().putBoolean("wake", on).putInt("wakeH", h).putInt("wakeM", m).putString("wakeDays", days == null ? "daily" : days).apply();
        WakeReceiver.schedule(c);
        if (on && !canStartFromBackground(c)) return "perm";
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
