// Minimal read-only ASAR extractor: header = pickle(uint32 size) + pickle(json string)
const fs = require('fs'), path = require('path');
const [src, out] = process.argv.slice(2);
const fd = fs.openSync(src, 'r');
const b = Buffer.alloc(16); fs.readSync(fd, b, 0, 16, 0);
const headerSize = b.readUInt32LE(4);
const jsonLen = b.readUInt32LE(12);
const hb = Buffer.alloc(jsonLen); fs.readSync(fd, hb, 0, jsonLen, 16);
const header = JSON.parse(hb.toString('utf8'));
const base = 8 + headerSize;
let n = 0; const skipped = [];
const bad = /[\\/]|^\.\.?$/;
function walk(node, rel) {
  for (const [name, e] of Object.entries(node.files || {})) {
    if (bad.test(name)) { skipped.push(rel + '|' + name); continue; }
    const p = path.join(rel, name), dst = path.join(out, p);
    if (e.files) { fs.mkdirSync(dst, { recursive: true }); walk(e, p); }
    else if (e.unpacked) { skipped.push(p + ' (unpacked)'); }
    else if (e.link) { skipped.push(p + ' (link)'); }
    else {
      const buf = Buffer.alloc(e.size);
      fs.readSync(fd, buf, 0, e.size, base + Number(e.offset));
      fs.mkdirSync(path.dirname(dst), { recursive: true });
      fs.writeFileSync(dst, buf); n++;
    }
  }
}
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(out + '.header.json', JSON.stringify(header, null, 1));
walk(header, '');
console.log('extracted', n, 'files; skipped', skipped);
