/**
 * Generador de tarjetas PNG sin dependencias nativas (PNG verdadero).
 * Welcome card + rank card para embeds de Discord.
 */
const zlib = require('zlib');
const https = require('https');
const http = require('http');

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = c & 1 ? (0xedb88320 ^ (c >>> 1)) : c >>> 1;
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeB = Buffer.from(type);
  const crcB = Buffer.alloc(4);
  crcB.writeUInt32BE(crc32(Buffer.concat([typeB, data])));
  return Buffer.concat([len, typeB, data, crcB]);
}

/** Crea PNG RGB sólido + rectángulos simples */
function createPng(width, height, paint) {
  const raw = Buffer.alloc((width * 3 + 1) * height);
  // fondo
  for (let y = 0; y < height; y++) {
    raw[y * (width * 3 + 1)] = 0; // filter none
    for (let x = 0; y < height && x < width; x++) {
      const i = y * (width * 3 + 1) + 1 + x * 3;
      raw[i] = 30;
      raw[i + 1] = 20;
      raw[i + 2] = 50;
    }
  }

  function setPixel(x, y, r, g, b) {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const i = y * (width * 3 + 1) + 1 + x * 3;
    raw[i] = r;
    raw[i + 1] = g;
    raw[i + 2] = b;
  }

  function fillRect(x0, y0, w, h, r, g, b) {
    for (let y = y0; y < y0 + h; y++) {
      for (let x = x0; x < x0 + w; x++) setPixel(x, y, r, g, b);
    }
  }

  function fillCircle(cx, cy, rad, r, g, b) {
    for (let y = -rad; y <= rad; y++) {
      for (let x = -rad; x <= rad; x++) {
        if (x * x + y * y <= rad * rad) setPixel(cx + x, cy + y, r, g, b);
      }
    }
  }

  // barra dorada superior
  fillRect(0, 0, width, 8, 255, 215, 0);
  // panel
  fillRect(20, 40, width - 40, height - 60, 45, 30, 70);
  // círculo avatar placeholder
  fillCircle(90, height / 2, 50, 155, 89, 182);
  fillCircle(90, height / 2, 44, 60, 40, 90);

  if (typeof paint === 'function') paint({ setPixel, fillRect, fillCircle, width, height });

  // barra progreso si se pide en paint via global - handled in paint

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2; // RGB
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const compressed = zlib.deflateSync(raw);
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', compressed), chunk('IEND', Buffer.alloc(0))]);
}

function fetchBuffer(url) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    lib
      .get(url, { headers: { 'User-Agent': 'GodBot/3' } }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return fetchBuffer(res.headers.location).then(resolve).catch(reject);
        }
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve(Buffer.concat(chunks)));
      })
      .on('error', reject);
  });
}

/**
 * Welcome card PNG
 */
async function welcomeCard({ username, serverName, memberCount }) {
  const w = 800;
  const h = 280;
  const png = createPng(w, h, ({ fillRect, fillCircle }) => {
    // acento
    fillRect(0, h - 12, w, 12, 255, 215, 0);
    // “texto” simulado con barras (nombres largos se muestran en embed; card es visual branding)
    const nameLen = Math.min(40, (username || 'User').length);
    fillRect(170, 90, nameLen * 10, 18, 255, 215, 0);
    fillRect(170, 130, Math.min(50, (serverName || '').length) * 8, 12, 200, 180, 255);
    fillRect(170, 170, 120, 10, 150, 150, 180);
    // badge count
    fillCircle(720, 80, 36, 46, 204, 113);
  });
  return png;
}

/**
 * Rank card PNG con barra de progreso real
 */
async function rankCard({ username, level, currentXp, needed, rank }) {
  const w = 700;
  const h = 200;
  const pct = needed ? Math.min(1, currentXp / needed) : 0;
  const png = createPng(w, h, ({ fillRect, fillCircle }) => {
    fillRect(0, h - 8, w, 8, 155, 89, 182);
    // progress bg
    fillRect(160, 130, 480, 24, 40, 30, 55);
    // progress fill
    fillRect(160, 130, Math.floor(480 * pct), 24, 255, 215, 0);
    // level badge
    fillCircle(90, 100, 48, 255, 215, 0);
    fillCircle(90, 100, 40, 50, 35, 80);
    // rank strip
    fillRect(160, 60, 80, 16, 100, 200, 255);
    fillRect(160, 90, Math.min(35, (username || '').length) * 9, 16, 230, 220, 255);
  });
  return png;
}

module.exports = { welcomeCard, rankCard, createPng };
