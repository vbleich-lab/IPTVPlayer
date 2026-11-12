/* Minimaler ZIP-Schreiber ohne Abhängigkeiten (für .wgt-Pakete). */
var zlib = require('zlib');

var CRC_TABLE = (function () {
  var t = [], c, n, k;
  for (n = 0; n < 256; n++) { c = n; for (k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
function crc32(buf) {
  var c = 0xFFFFFFFF;
  for (var i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

/** entries: [{ name: 'dir/file.js', data: Buffer }] → Buffer mit ZIP-Archiv */
function zip(entries) {
  var local = [], central = [], offset = 0;
  var time = (12 << 11), date = ((2024 - 1980) << 9) | (1 << 5) | 1; // feste Zeit: reproduzierbare Pakete
  entries.forEach(function (e) {
    var name = Buffer.from(e.name, 'utf8');
    var raw = e.data, comp = zlib.deflateRawSync(raw, { level: 9 });
    var stored = comp.length >= raw.length, body = stored ? raw : comp, crc = crc32(raw);
    var h = Buffer.alloc(30);
    h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(0x0800, 6); h.writeUInt16LE(stored ? 0 : 8, 8);
    h.writeUInt16LE(time, 10); h.writeUInt16LE(date, 12); h.writeUInt32LE(crc, 14);
    h.writeUInt32LE(body.length, 18); h.writeUInt32LE(raw.length, 22); h.writeUInt16LE(name.length, 26); h.writeUInt16LE(0, 28);
    local.push(h, name, body);
    var c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(0x0800, 8); c.writeUInt16LE(stored ? 0 : 8, 10);
    c.writeUInt16LE(time, 12); c.writeUInt16LE(date, 14); c.writeUInt32LE(crc, 16);
    c.writeUInt32LE(body.length, 20); c.writeUInt32LE(raw.length, 24); c.writeUInt16LE(name.length, 28);
    c.writeUInt32LE(offset, 42);
    central.push(c, name);
    offset += 30 + name.length + body.length;
  });
  var cd = Buffer.concat(central), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat(local.concat([cd, end]));
}

module.exports = zip;
