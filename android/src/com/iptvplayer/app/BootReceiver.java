package com.iptvplayer.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Nach dem Hochfahren (oder einem App-Update) den Autostart-Dienst starten, falls eingeschaltet. */
public class BootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context c, Intent intent) {
        if (!Bridge.prefs(c).getBoolean("autostart", false)) return;
        boolean boot = !Intent.ACTION_MY_PACKAGE_REPLACED.equals(intent.getAction());
        AutostartService.start(c, boot);
    }
}
