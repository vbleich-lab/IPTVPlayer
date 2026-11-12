package com.iptvplayer.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;

/**
 * Autostart: läuft unauffällig im Hintergrund und öffnet IPTVPlayer nach dem Hochfahren
 * und jedes Mal, wenn der Fernseher aus dem Standby aufwacht (Bildschirm an).
 */
public class AutostartService extends Service {
    private static final String CHANNEL = "autostart";
    private final Handler handler = new Handler(Looper.getMainLooper());
    private BroadcastReceiver screenOn;

    static void start(Context c, boolean boot) {
        Intent i = new Intent(c, AutostartService.class).putExtra("boot", boot);
        try {
            if (Build.VERSION.SDK_INT >= 26) c.startForegroundService(i); else c.startService(i);
        } catch (Exception ignored) { }
    }

    @Override
    public void onCreate() {
        super.onCreate();
        Notification.Builder b;
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
            nm.createNotificationChannel(new NotificationChannel(CHANNEL, "Autostart", NotificationManager.IMPORTANCE_MIN));
            b = new Notification.Builder(this, CHANNEL);
        } else {
            b = new Notification.Builder(this);
        }
        Notification n = b.setContentTitle("IPTVPlayer").setContentText("Autostart aktiv")
                .setSmallIcon(android.R.drawable.ic_media_play).setOngoing(true).build();
        if (Build.VERSION.SDK_INT >= 34) startForeground(1, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
        else startForeground(1, n);

        screenOn = new BroadcastReceiver() {
            @Override public void onReceive(Context c, Intent i) { launchLater(2500); }
        };
        registerReceiver(screenOn, new IntentFilter(Intent.ACTION_SCREEN_ON));
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (!Bridge.prefs(this).getBoolean("autostart", false)) { stopSelf(); return START_NOT_STICKY; }
        if (intent != null && intent.getBooleanExtra("boot", false)) launchLater(6000);
        return START_STICKY;
    }

    private void launchLater(long delay) {
        handler.postDelayed(new Runnable() {
            @Override public void run() {
                if (!Bridge.prefs(AutostartService.this).getBoolean("autostart", false)) return;
                try {
                    Intent i = new Intent(AutostartService.this, MainActivity.class)
                            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT);
                    startActivity(i);
                } catch (Exception ignored) { }
            }
        }, delay);
    }

    @Override
    public void onDestroy() {
        if (screenOn != null) { try { unregisterReceiver(screenOn); } catch (Exception ignored) { } }
        handler.removeCallbacksAndMessages(null);
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) { return null; }
}
