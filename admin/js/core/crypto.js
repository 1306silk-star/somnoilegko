/**
 * Криптография панели управления.
 *
 * Пароль администратора никогда не хранится в открытом виде: сохраняется только
 * PBKDF2-HMAC-SHA256 от пароля вместе со случайной солью и числом итераций.
 *
 * Основной путь — Web Crypto API. Если он недоступен (например, страница
 * открыта по протоколу file://), используется собственная реализация
 * SHA-256 / HMAC / PBKDF2 с уменьшенным числом итераций, чтобы вход
 * оставался быстрым. Такой режим помечается в настройках как ослабленный.
 */

window.Admin = window.Admin || {};

Admin.Crypto = (function () {
  "use strict";

  const subtle =
    typeof window.crypto !== "undefined" && window.crypto.subtle
      ? window.crypto.subtle
      : null;

  const ITERATIONS_STRONG = 210000;
  const ITERATIONS_FALLBACK = 20000;

  /* ───────────────────── Байты и кодирование ───────────────────── */

  function randomBytes(length) {
    const bytes = new Uint8Array(length);
    if (window.crypto && window.crypto.getRandomValues) {
      window.crypto.getRandomValues(bytes);
    } else {
      for (let i = 0; i < length; i += 1) {
        bytes[i] = Math.floor(Math.random() * 256);
      }
    }
    return bytes;
  }

  function toHex(bytes) {
    let out = "";
    for (let i = 0; i < bytes.length; i += 1) {
      out += bytes[i].toString(16).padStart(2, "0");
    }
    return out;
  }

  function fromHex(hex) {
    const clean = String(hex || "");
    const bytes = new Uint8Array(clean.length / 2);
    for (let i = 0; i < bytes.length; i += 1) {
      bytes[i] = parseInt(clean.substr(i * 2, 2), 16);
    }
    return bytes;
  }

  function utf8(text) {
    if (typeof TextEncoder !== "undefined") return new TextEncoder().encode(text);
    const escaped = unescape(encodeURIComponent(String(text)));
    const bytes = new Uint8Array(escaped.length);
    for (let i = 0; i < escaped.length; i += 1) bytes[i] = escaped.charCodeAt(i);
    return bytes;
  }

  function randomToken(byteLength) {
    return toHex(randomBytes(byteLength || 32));
  }

  /* ───────────────────── Резервный SHA-256 ───────────────────── */

  const K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1,
    0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
    0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
    0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
    0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
    0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
    0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
    0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
    0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ];

  function rotr(value, shift) {
    return (value >>> shift) | (value << (32 - shift));
  }

  function sha256(bytes) {
    const H = [
      0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c,
      0x1f83d9ab, 0x5be0cd19,
    ];

    const bitLength = bytes.length * 8;
    const paddedLength = (((bytes.length + 9) >> 6) + 1) << 6;
    const block = new Uint8Array(paddedLength);
    block.set(bytes);
    block[bytes.length] = 0x80;

    const view = new DataView(block.buffer);
    view.setUint32(paddedLength - 8, Math.floor(bitLength / 0x100000000));
    view.setUint32(paddedLength - 4, bitLength >>> 0);

    const w = new Uint32Array(64);

    for (let offset = 0; offset < paddedLength; offset += 64) {
      for (let i = 0; i < 16; i += 1) w[i] = view.getUint32(offset + i * 4);
      for (let i = 16; i < 64; i += 1) {
        const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
        const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
        w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
      }

      let [a, b, c, d, e, f, g, h] = H;

      for (let i = 0; i < 64; i += 1) {
        const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
        const ch = (e & f) ^ (~e & g);
        const temp1 = (h + S1 + ch + K[i] + w[i]) >>> 0;
        const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
        const maj = (a & b) ^ (a & c) ^ (b & c);
        const temp2 = (S0 + maj) >>> 0;

        h = g;
        g = f;
        f = e;
        e = (d + temp1) >>> 0;
        d = c;
        c = b;
        b = a;
        a = (temp1 + temp2) >>> 0;
      }

      H[0] = (H[0] + a) >>> 0;
      H[1] = (H[1] + b) >>> 0;
      H[2] = (H[2] + c) >>> 0;
      H[3] = (H[3] + d) >>> 0;
      H[4] = (H[4] + e) >>> 0;
      H[5] = (H[5] + f) >>> 0;
      H[6] = (H[6] + g) >>> 0;
      H[7] = (H[7] + h) >>> 0;
    }

    const out = new Uint8Array(32);
    const outView = new DataView(out.buffer);
    H.forEach((value, i) => outView.setUint32(i * 4, value));
    return out;
  }

  function hmacSha256(key, message) {
    const blockSize = 64;
    let normalizedKey = key.length > blockSize ? sha256(key) : key;

    const padded = new Uint8Array(blockSize);
    padded.set(normalizedKey);

    const inner = new Uint8Array(blockSize + message.length);
    const outer = new Uint8Array(blockSize + 32);

    for (let i = 0; i < blockSize; i += 1) {
      inner[i] = padded[i] ^ 0x36;
      outer[i] = padded[i] ^ 0x5c;
    }
    inner.set(message, blockSize);
    outer.set(sha256(inner), blockSize);

    return sha256(outer);
  }

  function pbkdf2Fallback(password, salt, iterations, keyLength) {
    const passwordBytes = utf8(password);
    const blocks = Math.ceil(keyLength / 32);
    const output = new Uint8Array(blocks * 32);

    for (let blockIndex = 1; blockIndex <= blocks; blockIndex += 1) {
      const saltBlock = new Uint8Array(salt.length + 4);
      saltBlock.set(salt);
      new DataView(saltBlock.buffer).setUint32(salt.length, blockIndex);

      let u = hmacSha256(passwordBytes, saltBlock);
      const accumulator = u.slice();

      for (let i = 1; i < iterations; i += 1) {
        u = hmacSha256(passwordBytes, u);
        for (let j = 0; j < 32; j += 1) accumulator[j] ^= u[j];
      }

      output.set(accumulator, (blockIndex - 1) * 32);
    }

    return output.slice(0, keyLength);
  }

  /* ───────────────────── Публичный интерфейс ───────────────────── */

  const isStrong = Boolean(subtle);
  const defaultIterations = isStrong ? ITERATIONS_STRONG : ITERATIONS_FALLBACK;

  async function derive(password, saltHex, iterations) {
    const salt = fromHex(saltHex);
    const rounds = iterations || defaultIterations;

    if (subtle) {
      const key = await subtle.importKey("raw", utf8(password), "PBKDF2", false, [
        "deriveBits",
      ]);
      const bits = await subtle.deriveBits(
        { name: "PBKDF2", salt, iterations: rounds, hash: "SHA-256" },
        key,
        256
      );
      return toHex(new Uint8Array(bits));
    }

    return toHex(pbkdf2Fallback(password, salt, rounds, 32));
  }

  async function hashPassword(password) {
    const saltHex = toHex(randomBytes(16));
    const iterations = defaultIterations;
    const hash = await derive(password, saltHex, iterations);
    return { hash, salt: saltHex, iterations, algorithm: "pbkdf2-sha256" };
  }

  async function verifyPassword(password, record) {
    if (!record || !record.hash || !record.salt) return false;
    const candidate = await derive(password, record.salt, record.iterations);
    return timingSafeEqual(candidate, record.hash);
  }

  /** Сравнение за постоянное время — не даёт узнать хеш по времени ответа. */
  function timingSafeEqual(a, b) {
    const left = String(a);
    const right = String(b);
    if (left.length !== right.length) return false;
    let diff = 0;
    for (let i = 0; i < left.length; i += 1) {
      diff |= left.charCodeAt(i) ^ right.charCodeAt(i);
    }
    return diff === 0;
  }

  return {
    isStrong,
    defaultIterations,
    randomToken,
    hashPassword,
    verifyPassword,
    timingSafeEqual,
    sha256Hex: (text) => toHex(sha256(utf8(text))),
  };
})();
