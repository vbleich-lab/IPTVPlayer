package com.iptvplayer.app;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;

import java.util.Calendar;

/** Weck-Timer: startet IPTVPlayer täglich zur eingestellten Zeit (die App wählt dann den Wecksender). */
public class WakeReceiver extends BroadcastReceiver {

    @Override
    public void onReceive(Context c, Intent intent) {
        SharedPreferences p = Bridge.prefs(c);
        if (!p.getBoolean("wake", false)) return;
        int wd = Calendar.getInstance().get(Calendar.DAY_OF_WEEK);
        String days = p.getString("wakeDays", "daily");
        boolean weekend = wd == Calendar.SATURDAY || wd == Calendar.SUNDAY;
        boolean today = "weekdays".equals(days) ? !weekend : "weekend".equals(days) ? weekend : true;
        if (today && Bridge.canStartFromBackground(c)) {
            try {
                c.startActivity(new Intent(c, MainActivity.class)
                        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT));
            } catch (Exception ignored) { }
        }
        schedule(c); // nächster Tag
    }

    private static PendingIntent pending(Context c) {
        int flags = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0);
        return PendingIntent.getBroadcast(c, 7, new Intent(c, WakeReceiver.class), flags);
    }

    /** Alarm für die nächste Weckzeit setzen (oder löschen, wenn der Weck-Timer aus ist) */
    static void schedule(Context c) {
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;
        PendingIntent pi = pending(c);
        am.cancel(pi);
        SharedPreferences p = Bridge.prefs(c);
        if (!p.getBoolean("wake", false)) return;
        Calendar cal = Calendar.getInstance();
        cal.set(Calendar.HOUR_OF_DAY, p.getInt("wakeH", 7));
        cal.set(Calendar.MINUTE, p.getInt("wakeM", 0));
        cal.set(Calendar.SECOND, 0);
        cal.set(Calendar.MILLISECOND, 0);
        if (cal.getTimeInMillis() <= System.currentTimeMillis() + 1000) cal.add(Calendar.DAY_OF_MONTH, 1);
        long at = cal.getTimeInMillis();
        try {
            if (Build.VERSION.SDK_INT >= 31 && !am.canScheduleExactAlarms()) am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
            else if (Build.VERSION.SDK_INT >= 23) am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
            else am.setExact(AlarmManager.RTC_WAKEUP, at, pi);
        } catch (SecurityException e) {
            am.set(AlarmManager.RTC_WAKEUP, at, pi);
        }
    }
}
