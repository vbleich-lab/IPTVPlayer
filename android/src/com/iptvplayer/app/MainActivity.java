package com.iptvplayer.app;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.view.KeyEvent;
import android.view.View;
import android.view.WindowManager;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

/**
 * Android-TV-Hülle: zeigt die IPTVPlayer-Web-App (assets/app) im Vollbild-WebView
 * und reicht die Tasten der Fernbedienung mit LG-Codes an die App weiter.
 */
public class MainActivity extends Activity {
    private WebView web;
    private boolean started;

    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        web = new WebView(this);
        web.setBackgroundColor(Color.BLACK);
        web.setFocusable(true);
        web.setFocusableInTouchMode(true);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(true);
        // Playlists und EPG kommen von fremden Servern ohne CORS-Freigabe – wie auf webOS/Tizen erlauben
        s.setAllowFileAccessFromFileURLs(true);
        s.setAllowUniversalAccessFromFileURLs(true);
        if (Build.VERSION.SDK_INT >= 21) s.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        s.setUserAgentString(s.getUserAgentString() + " IPTVPlayerAndroid");
        web.setWebViewClient(new WebViewClient());
        web.setWebChromeClient(new WebChromeClient());
        web.addJavascriptInterface(new Bridge(this), "IPTVAndroid");
        setContentView(web);
        hideSystemUi();
        web.loadUrl("file:///android_asset/app/index.html");
        web.requestFocus();
    }

    private void hideSystemUi() {
        getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_FULLSCREEN
                | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                | View.SYSTEM_UI_FLAG_LAYOUT_STABLE | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION);
    }

    /** Android-Tastencode → Code, mit dem die App arbeitet (LG-Belegung). 0 = normal durchreichen. */
    private static int mapKey(int code) {
        switch (code) {
            case KeyEvent.KEYCODE_BACK: return 461;
            case KeyEvent.KEYCODE_PROG_RED: return 403;
            case KeyEvent.KEYCODE_PROG_GREEN: return 404;
            case KeyEvent.KEYCODE_GUIDE: return 404;            // Programmführer
            case KeyEvent.KEYCODE_PROG_YELLOW: return 405;
            case KeyEvent.KEYCODE_PROG_BLUE: return 406;
            case KeyEvent.KEYCODE_MENU: return 406;             // Einstellungen (z. B. Fire TV)
            case KeyEvent.KEYCODE_SETTINGS: return 406;
            case KeyEvent.KEYCODE_CHANNEL_UP: return 33;
            case KeyEvent.KEYCODE_CHANNEL_DOWN: return 34;
            case KeyEvent.KEYCODE_PAGE_UP: return 33;
            case KeyEvent.KEYCODE_PAGE_DOWN: return 34;
            case KeyEvent.KEYCODE_INFO: return 457;
            case KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE: return 10252;
            case KeyEvent.KEYCODE_MEDIA_PLAY: return 415;
            case KeyEvent.KEYCODE_MEDIA_PAUSE: return 19;
            case KeyEvent.KEYCODE_MEDIA_STOP: return 413;
            case KeyEvent.KEYCODE_MEDIA_FAST_FORWARD: return 417;
            case KeyEvent.KEYCODE_MEDIA_REWIND: return 412;
            case KeyEvent.KEYCODE_LAST_CHANNEL: return 403;     // letzter Kanal
            // Pfeile, OK und Ziffern liefert das WebView selbst mit den richtigen Codes (37–40, 13, 48–57),
            // so funktionieren sie auch beim Eintippen in Textfelder.
            default: return 0;
        }
    }

    @Override
    public boolean dispatchKeyEvent(KeyEvent ev) {
        int code = mapKey(ev.getKeyCode());
        if (code == 0 || web == null) return super.dispatchKeyEvent(ev);
        if (ev.getAction() == KeyEvent.ACTION_DOWN) {
            web.evaluateJavascript("window.IPTVKey&&IPTVKey(" + code + ")", null);
        }
        return true;
    }

    @Override
    protected void onStart() {
        super.onStart();
        if (web != null) {
            web.onResume();
            web.resumeTimers();
            if (started) web.evaluateJavascript("window.IPTVResume&&IPTVResume()", null);
        }
        started = true;
        hideSystemUi();
    }

    @Override
    protected void onStop() {
        if (web != null) {
            web.evaluateJavascript("window.IPTVSuspend&&IPTVSuspend()", null);
            web.onPause();
        }
        super.onStop();
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) hideSystemUi();
    }

    @Override
    protected void onDestroy() {
        if (web != null) { web.destroy(); web = null; }
        super.onDestroy();
    }
}
