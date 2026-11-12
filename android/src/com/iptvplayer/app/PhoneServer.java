package com.iptvplayer.app;

import android.content.Context;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.NetworkInterface;
import java.net.ServerSocket;
import java.net.Socket;
import java.net.URLDecoder;
import java.security.SecureRandom;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.Date;
import java.util.Enumeration;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.TimeZone;

/**
 * Web-Server für die Einrichtung per Smartphone – gleiche Schnittstelle wie service/index.js (webOS):
 *   App (nur 127.0.0.1): GET /api/hello, POST /api/state, GET /api/wait?since=
 *   Handy (mit Token):   GET /, GET /api/state, POST /api/apply, GET /api/backup, POST /api/restore
 */
public class PhoneServer {
    private static final int[] PORTS = {8765, 8766, 8767, 8768};
    private static final int MAX_BODY = 512 * 1024;
    private static PhoneServer instance;

    private final Context ctx;
    private final String token;
    private ServerSocket server;
    private int port;
    private JSONObject state;
    private final List<JSONObject> events = new ArrayList<JSONObject>();
    private int nextId = 1;
    private final Object lock = new Object();

    static synchronized PhoneServer get(Context c) {
        if (instance == null) instance = new PhoneServer(c);
        return instance;
    }

    private PhoneServer(Context c) {
        ctx = c;
        byte[] b = new byte[6];
        new SecureRandom().nextBytes(b);
        StringBuilder sb = new StringBuilder();
        for (byte x : b) sb.append(String.format("%02x", x & 0xff));
        token = sb.toString();
    }

    synchronized boolean start() {
        if (server != null) return true;
        for (int p : PORTS) {
            try {
                ServerSocket s = new ServerSocket();
                s.setReuseAddress(true);
                s.bind(new InetSocketAddress(p));
                server = s; port = p;
                Thread t = new Thread(new Runnable() { @Override public void run() { acceptLoop(); } }, "phone-server");
                t.setDaemon(true);
                t.start();
                return true;
            } catch (Exception ignored) { }
        }
        return false;
    }

    private void acceptLoop() {
        while (true) {
            try {
                final Socket sock = server.accept();
                Thread t = new Thread(new Runnable() { @Override public void run() { handle(sock); } });
                t.setDaemon(true);
                t.start();
            } catch (Exception e) {
                return;
            }
        }
    }

    // ---------- Hilfen ----------
    private static List<String> ips() {
        List<String> out = new ArrayList<String>();
        try {
            Enumeration<NetworkInterface> ifs = NetworkInterface.getNetworkInterfaces();
            while (ifs != null && ifs.hasMoreElements()) {
                NetworkInterface ni = ifs.nextElement();
                if (!ni.isUp() || ni.isLoopback()) continue;
                Enumeration<InetAddress> as = ni.getInetAddresses();
                while (as.hasMoreElements()) {
                    InetAddress a = as.nextElement();
                    if (a instanceof Inet4Address && !a.isLoopbackAddress()) out.add(a.getHostAddress());
                }
            }
        } catch (Exception ignored) { }
        Collections.sort(out, new Comparator<String>() {
            @Override public int compare(String a, String b) { return score(b) - score(a); }
        });
        return out;
    }

    private static int score(String ip) {
        if (ip.startsWith("192.168.")) return 3;
        if (ip.startsWith("10.")) return 2;
        if (ip.matches("^172\\.(1[6-9]|2\\d|3[01])\\..*")) return 1;
        return 0;
    }

    private JSONObject info() throws Exception {
        JSONObject o = new JSONObject();
        o.put("port", port);
        o.put("token", token);
        o.put("ips", new JSONArray(ips()));
        synchronized (lock) { o.put("last", nextId - 1); }
        return o;
    }

    private static Map<String, String> query(String q) {
        Map<String, String> m = new HashMap<String, String>();
        if (q == null) return m;
        for (String kv : q.split("&")) {
            if (kv.isEmpty()) continue;
            int i = kv.indexOf('=');
            try {
                String k = URLDecoder.decode(i < 0 ? kv : kv.substring(0, i), "UTF-8");
                String v = i < 0 ? "" : URLDecoder.decode(kv.substring(i + 1), "UTF-8");
                m.put(k, v);
            } catch (Exception ignored) { }
        }
        return m;
    }

    private static void send(OutputStream out, int code, String type, byte[] body, String extraHeader) throws Exception {
        String status = code == 200 ? "OK" : code == 204 ? "No Content" : code == 400 ? "Bad Request" : code == 403 ? "Forbidden"
                : code == 404 ? "Not Found" : code == 503 ? "Service Unavailable" : "Error";
        StringBuilder h = new StringBuilder();
        h.append("HTTP/1.1 ").append(code).append(' ').append(status).append("\r\n");
        h.append("Content-Type: ").append(type).append("\r\n");
        h.append("Content-Length: ").append(body.length).append("\r\n");
        h.append("Cache-Control: no-store\r\n");
        h.append("Access-Control-Allow-Origin: *\r\n");
        h.append("Access-Control-Allow-Headers: Content-Type\r\n");
        h.append("Access-Control-Allow-Methods: GET, POST, OPTIONS\r\n");
        if (extraHeader != null) h.append(extraHeader).append("\r\n");
        h.append("Connection: close\r\n\r\n");
        out.write(h.toString().getBytes("UTF-8"));
        out.write(body);
        out.flush();
    }

    private static void json(OutputStream out, int code, Object o) throws Exception {
        send(out, code, "application/json; charset=utf-8", o.toString().getBytes("UTF-8"), null);
    }

    private static JSONObject err(String e) {
        JSONObject o = new JSONObject();
        try { o.put("error", e); } catch (Exception ignored) { }
        return o;
    }

    private JSONObject eventsSince(int since) throws Exception {
        JSONArray arr = new JSONArray();
        synchronized (lock) {
            for (JSONObject e : events) if (e.getInt("id") > since) arr.put(e);
            JSONObject o = new JSONObject();
            o.put("last", nextId - 1);
            o.put("events", arr);
            return o;
        }
    }

    private void pushEvent(String type, JSONObject data) throws Exception {
        synchronized (lock) {
            JSONObject e = new JSONObject();
            e.put("id", nextId++);
            e.put("type", type);
            e.put("data", data);
            events.add(e);
            if (events.size() > 20) events.remove(0);
            lock.notifyAll();
        }
    }

    private byte[] asset(String name) throws Exception {
        InputStream in = ctx.getAssets().open(name);
        ByteArrayOutputStream bo = new ByteArrayOutputStream();
        byte[] buf = new byte[8192];
        int n;
        while ((n = in.read(buf)) > 0) bo.write(buf, 0, n);
        in.close();
        return bo.toByteArray();
    }

    // ---------- Anfrage bearbeiten ----------
    private void handle(Socket sock) {
        try {
            sock.setSoTimeout(40000);
            InputStream in = sock.getInputStream();
            OutputStream out = sock.getOutputStream();
            // Kopf lesen
            ByteArrayOutputStream head = new ByteArrayOutputStream();
            int c, last4 = 0;
            while ((c = in.read()) != -1) {
                head.write(c);
                last4 = (last4 << 8) | c;
                if (last4 == 0x0d0a0d0a) break;
                if (head.size() > 16384) { sock.close(); return; }
            }
            String[] lines = head.toString("UTF-8").split("\r\n");
            if (lines.length == 0 || lines[0].split(" ").length < 2) { sock.close(); return; }
            String method = lines[0].split(" ")[0];
            String url = lines[0].split(" ")[1];
            int clen = 0;
            for (String l : lines) {
                int i = l.indexOf(':');
                if (i > 0 && l.substring(0, i).trim().equalsIgnoreCase("content-length")) clen = Integer.parseInt(l.substring(i + 1).trim());
            }
            String body = "";
            if (clen > 0) {
                if (clen > MAX_BODY) { json(out, 400, err("too large")); sock.close(); return; }
                byte[] b = new byte[clen];
                int off = 0;
                while (off < clen) { int n = in.read(b, off, clen - off); if (n < 0) break; off += n; }
                body = new String(b, 0, off, "UTF-8");
            }
            String path = url.split("\\?")[0];
            Map<String, String> q = query(url.contains("?") ? url.substring(url.indexOf('?') + 1) : null);
            boolean local = sock.getInetAddress().isLoopbackAddress();
            route(method, path, q, body, local, out);
            sock.close();
        } catch (Exception e) {
            try { sock.close(); } catch (Exception ignored) { }
        }
    }

    private void route(String method, String path, Map<String, String> q, String body, boolean local, OutputStream out) throws Exception {
        if (method.equals("OPTIONS")) { send(out, 204, "text/plain", new byte[0], null); return; }

        // Seite fürs Handy
        if (path.equals("/") || path.equals("/index.html")) {
            send(out, 200, "text/html; charset=utf-8", asset("www/phone.html"), null);
            return;
        }

        // nur für die App auf dem Fernseher
        if (path.equals("/api/hello")) { if (local) json(out, 200, info()); else json(out, 403, err("forbidden")); return; }
        if (path.equals("/api/state") && method.equals("POST")) {
            if (!local) { json(out, 403, err("forbidden")); return; }
            try { synchronized (lock) { state = new JSONObject(body.isEmpty() ? "{}" : body); } } catch (Exception e) { json(out, 400, err("bad json")); return; }
            json(out, 200, info());
            return;
        }
        if (path.equals("/api/wait")) {
            if (!local) { json(out, 403, err("forbidden")); return; }
            int since = 0;
            try { since = Integer.parseInt(q.containsKey("since") ? q.get("since") : "0"); } catch (Exception ignored) { }
            long until = System.currentTimeMillis() + 25000;
            synchronized (lock) {
                while (nextId - 1 <= since) {
                    long left = until - System.currentTimeMillis();
                    if (left <= 0) break;
                    lock.wait(left);
                }
            }
            json(out, 200, eventsSince(since));
            return;
        }

        // Handy: Token nötig
        if (path.startsWith("/api/")) {
            if (!token.equals(q.get("t"))) { json(out, 403, err("token")); return; }
            JSONObject st;
            synchronized (lock) { st = state; }
            if (st == null) { json(out, 503, err("tv not ready")); return; }
            if (path.equals("/api/state")) {
                JSONObject o = new JSONObject();
                o.put("ui", st.opt("ui"));
                o.put("schema", st.opt("schema"));
                o.put("settings", st.opt("settings"));
                JSONObject favs = st.optJSONObject("favs");
                o.put("favCount", favs == null ? 0 : favs.length());
                o.put("title", st.opt("title"));
                json(out, 200, o);
                return;
            }
            if (path.equals("/api/backup")) {
                Date d = new Date();
                SimpleDateFormat iso = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US);
                iso.setTimeZone(TimeZone.getTimeZone("UTC"));
                String stamp = new SimpleDateFormat("yyyyMMdd-HHmm", Locale.US).format(d);
                JSONObject src = st.optJSONObject("backup");
                if (src == null) src = new JSONObject();
                JSONObject b = new JSONObject();
                b.put("app", "iptvplayer");
                b.put("v", 1);
                b.put("date", iso.format(d));
                b.put("settings", src.has("settings") ? src.get("settings") : new JSONObject());
                b.put("favs", src.has("favs") ? src.get("favs") : new JSONObject());
                send(out, 200, "application/json; charset=utf-8", b.toString(2).getBytes("UTF-8"),
                        "Content-Disposition: attachment; filename=\"iptvplayer-backup-" + stamp + ".json\"");
                return;
            }
            if ((path.equals("/api/apply") || path.equals("/api/restore")) && method.equals("POST")) {
                JSONObject data;
                try { data = new JSONObject(body); } catch (Exception e) { json(out, 400, err("bad json")); return; }
                if (path.equals("/api/restore")) {
                    String app = data.optString("app");
                    if (!(app.equals("iptvplayer") || app.equals("edemtv")) || data.optJSONObject("settings") == null) {
                        json(out, 400, err("not an IPTVPlayer backup"));
                        return;
                    }
                }
                pushEvent(path.equals("/api/apply") ? "apply" : "restore", data);
                JSONObject ok = new JSONObject();
                ok.put("ok", true);
                json(out, 200, ok);
                return;
            }
        }
        json(out, 404, err("not found"));
    }
}
