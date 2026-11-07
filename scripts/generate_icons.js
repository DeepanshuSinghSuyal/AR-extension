const fs = require('fs');
const zlib = require('zlib');

function crc32(buf) {
  let table = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      if (c & 1) c = 0xedb88320 ^ (c >>> 1);
      else c = c >>> 1;
    }
    table[n] = c;
  }
  let c = 0 ^ (-1);
  for (let i = 0; i < buf.length; i++) {
    c = (c >>> 8) ^ table[(c ^ buf[i]) & 0xff];
  }
  return (c ^ (-1)) >>> 0;
}

function createPNG(size) {
  const width = size;
  const height = size;
  const rows = [];
  
  const cx = width / 2;
  const cy = height / 2;
  const radius = width * 0.44;

  for (let y = 0; y < height; y++) {
    const row = [0]; // filter byte 0
    for (let x = 0; x < width; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist <= radius) {
        // Futuristic cyan/purple gradient with glowing hand wave motif
        const t = (x + y) / (width * 2);
        const r = Math.round(14 + t * 40);
        const g = Math.round(165 - t * 60);
        const b = Math.round(233 + t * 20);
        
        // Inner circle / hand dot
        const innerDist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
        if (innerDist < radius * 0.35) {
          row.push(255, 255, 255, 255);
        } else {
          // Antialiased edge
          const alpha = dist > radius - 1.5 ? Math.round(255 * (radius - dist) / 1.5) : 255;
          row.push(r, g, b, Math.max(0, Math.min(255, alpha)));
        }
      } else {
        row.push(0, 0, 0, 0); // Transparent
      }
    }
    rows.push(Buffer.from(row));
  }

  const rawData = Buffer.concat(rows);
  const compressed = zlib.deflateSync(rawData);

  // PNG Signature
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData.writeUInt8(8, 8); // 8-bit
  ihdrData.writeUInt8(6, 9); // RGBA
  ihdrData.writeUInt8(0, 10); // deflate
  ihdrData.writeUInt8(0, 11); // filter
  ihdrData.writeUInt8(0, 12); // no interlace

  const ihdrChunk = Buffer.concat([
    Buffer.from('IHDR'),
    ihdrData
  ]);
  const ihdr = Buffer.alloc(4 + 4 + 13 + 4);
  ihdr.writeUInt32BE(13, 0);
  ihdrChunk.copy(ihdr, 4);
  ihdr.writeUInt32BE(crc32(ihdrChunk), 21);

  // IDAT
  const idatChunk = Buffer.concat([
    Buffer.from('IDAT'),
    compressed
  ]);
  const idat = Buffer.alloc(4 + 4 + compressed.length + 4);
  idat.writeUInt32BE(compressed.length, 0);
  idatChunk.copy(idat, 4);
  idat.writeUInt32BE(crc32(idatChunk), 8 + compressed.length);

  // IEND
  const iendChunk = Buffer.from('IEND');
  const iend = Buffer.alloc(4 + 4 + 0 + 4);
  iend.writeUInt32BE(0, 0);
  iendChunk.copy(iend, 4);
  iend.writeUInt32BE(crc32(iendChunk), 8);

  return Buffer.concat([sig, ihdr, idat, iend]);
}

[16, 32, 48, 128].forEach(size => {
  const png = createPNG(size);
  fs.writeFileSync(`assets/icons/icon${size}.png`, png);
  console.log(`Generated assets/icons/icon${size}.png (${png.length} bytes)`);
});

