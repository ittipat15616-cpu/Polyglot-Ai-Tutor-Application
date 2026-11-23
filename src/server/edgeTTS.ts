import WebSocket from "ws";
import crypto from "crypto";
import path from "path";
import fs from "fs";
import os from "os";

const TRUSTED_CLIENT_TOKEN = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
const CHROMIUM_MAJOR_VERSION = "143";
const CHROMIUM_FULL_VERSION = "143.0.3650.75";
const SEC_MS_GEC_VERSION = "2-" + CHROMIUM_FULL_VERSION;
const WIN_EPOCH = 11644473600;

// ---------------------------------------------------------------------------
// Pure TypeScript Microsoft Edge TTS v2 DRM (Sec-MS-GEC) Implementation
// Zero Python / external script dependencies — works identically in Cloud Run
// and local development.
// ---------------------------------------------------------------------------

const SHA256_INITIAL = [
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
  0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
] as const;

const SHA256_STATE = [
  0xfd9fbea2, 0x91243ce7, 0xbe499094, 0xcd2e1e0a,
  0x6c006f49, 0x04bd35ab, 0xfeb0a7e4, 0x03effbd2,
] as const;

const SHA256_SCHEDULE = [
  0xeb24bf9e, 0x1558691f, 0xa0c09ee2, 0x0cfa32ba,
  0xa622ee8c, 0xd1dd9491, 0xc0dd25a0, 0xf9e70ab6,
  0xf0c31573, 0x7058ce4e, 0x7188e606, 0x00e5ab33,
  0xd258b060, 0x72766564,
] as const;

const SHA256_ROUND_CONSTANTS = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5,
  0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc,
  0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7,
  0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3,
  0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5,
  0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
] as const;

const SHA256_ADJUSTMENT = 0xc9dc06a7;
const SHA256_BLOCK_CONSTANTS = [
  ...SHA256_ROUND_CONSTANTS.slice(0, 14),
  SHA256_ADJUSTMENT,
  ...SHA256_ROUND_CONSTANTS.slice(15),
];
const SHA256_SIGMA0_ADJUSTMENT = 0x059c0b80;
const SHA256_SIGMA1_ADJUSTMENT = 0x000b92c0;

const CS64_COEFFICIENTS: ReadonlyArray<readonly [number, number]> = [
  [0xe82e91b1, 0xb32700d0],
  [0x44de24c6, 0x88dff51d],
  [0x3beb65bc, 0x29514038],
  [0xc89c5933, 0xb328cbdf],
  [0x8d1ec211, 0xd405b4d5],
  [0x314ef5d5, 0x26e55f3c],
  [0xe92491b1, 0x607801c6],
  [0xf0a5b9d5, 0x82b2c1fb],
  [0x06064cf3, 0xfa51a3da],
  [0xda79fa60, 0x207cc464],
  [0xbed20560, 0x3c3c74f3],
  [0x89f9c9f8, 0xd2d14b61],
  [0x35fa38c6, 0xbb04a2c1],
  [0xcb49e3c6, 0xc5626167],
];
const CS64_FACTOR = 0x82893933;
const CS64_ADJUSTMENT0 = 0xf2f90b1a;
const CS64_ADJUSTMENT1 = 0x0b1a0000;

function rotr32(v: number, n: number): number {
  return ((v >>> n) | (v << (32 - n))) >>> 0;
}

function rol16(v: number): number {
  return (((v << 16) | (v >>> 16)) >>> 0);
}

function sigma0(v: number): number {
  return (rotr32(v, 7) ^ rotr32(v, 18) ^ (v >>> 3)) >>> 0;
}

function sigma1(v: number): number {
  return (rotr32(v, 17) ^ rotr32(v, 19) ^ (v >>> 10)) >>> 0;
}

function wordsLe4Even(data: Buffer): number[] {
  const padLen = (4 - (data.length % 4)) % 4;
  const padded = padLen > 0 ? Buffer.concat([data, Buffer.alloc(padLen)]) : data;
  if (padded.length === 0) return [];
  const words: number[] = [];
  for (let i = 0; i < padded.length; i += 4) {
    words.push(padded.readUInt32LE(i));
  }
  if (words.length % 2 === 1) {
    words.push(0);
  }
  return words;
}

function expandSha256Schedule(words: number[], firstWord = 16): void {
  for (let i = firstWord; i < 64; i++) {
    const s1 = sigma1(words[i - 2]);
    const s0 = sigma0(words[i - 15]);
    words[i] = (s1 + words[i - 7] + s0 + words[i - 16]) >>> 0;
  }
}

function sha256Rounds(state: ReadonlyArray<number>, words: number[], firstRound = 0): number[] {
  let [a, b, c, d, e, f, g, h] = state;
  const constants = firstRound === 14 ? SHA256_BLOCK_CONSTANTS : SHA256_ROUND_CONSTANTS;

  for (let i = firstRound; i < 64; i++) {
    const bigSigma1 = (rotr32(e, 6) ^ rotr32(e, 11) ^ rotr32(e, 25)) >>> 0;
    const ch = (g ^ (e & (f ^ g))) >>> 0;
    const t1 = (h + bigSigma1 + ch + constants[i] + words[i]) >>> 0;
    const bigSigma0 = (rotr32(a, 2) ^ rotr32(a, 13) ^ rotr32(a, 22)) >>> 0;
    const maj = ((a & b) | (c & (a | b))) >>> 0;
    const t2 = (bigSigma0 + maj) >>> 0;

    h = g;
    g = f;
    f = e;
    e = (d + t1) >>> 0;
    d = c;
    c = b;
    b = a;
    a = (t1 + t2) >>> 0;
  }

  return [a, b, c, d, e, f, g, h];
}

function sha256Init(prefix7: Buffer): number[] {
  const words = new Array<number>(64).fill(0);
  words[14] = ((prefix7[0] << 16) | (prefix7[1] << 8) | prefix7[2]) >>> 0;
  words[15] = prefix7.readUInt32BE(3);

  for (let i = 16; i < 30; i++) {
    let value = SHA256_SCHEDULE[i - 16];
    if (i - 2 >= 14) {
      const s1 = sigma1(words[i - 2]);
      value = (value + (i === 16 ? (s1 ^ SHA256_SIGMA1_ADJUSTMENT) >>> 0 : s1)) >>> 0;
    }
    if (i - 7 >= 14) {
      value = (value + words[i - 7]) >>> 0;
    }
    if (i - 15 >= 14) {
      const s0 = sigma0(words[i - 15]);
      value = (value + (i === 29 ? (s0 ^ SHA256_SIGMA0_ADJUSTMENT) >>> 0 : s0)) >>> 0;
    }
    words[i] = value >>> 0;
  }

  words[30] =
    (sigma1(words[28]) +
      words[23] +
      sigma0(words[15]) +
      words[14] +
      SHA256_ADJUSTMENT -
      SHA256_ROUND_CONSTANTS[14]) >>>
    0;

  expandSha256Schedule(words, 31);
  const working = sha256Rounds(SHA256_STATE, words, 14);
  return SHA256_INITIAL.map((x, idx) => (x + working[idx]) >>> 0);
}

function sha256Digest(data: Buffer): Buffer {
  if (data.length < 7) {
    throw new Error("Token salt must contain at least seven bytes");
  }
  const length = 57 + data.length;
  const zeroPadLen = (((55 - length) % 64) + 64) % 64;
  const lenBuf = Buffer.alloc(8);
  lenBuf.writeBigUInt64BE(BigInt(length) * 8n, 0);
  const padded = Buffer.concat([
    data.subarray(7),
    Buffer.from([0x80]),
    Buffer.alloc(zeroPadLen),
    lenBuf,
  ]);

  let state = sha256Init(data.subarray(0, 7));
  for (let offset = 0; offset < padded.length; offset += 64) {
    const words = new Array<number>(64);
    for (let i = 0; i < 16; i++) {
      words[i] = padded.readUInt32BE(offset + i * 4);
    }
    expandSha256Schedule(words, 16);
    const working = sha256Rounds(state, words, 0);
    state = state.map((x, idx) => (x + working[idx]) >>> 0);
  }

  const out = Buffer.alloc(32);
  for (let i = 0; i < 8; i++) {
    out.writeUInt32BE(state[i], i * 4);
  }
  return out;
}

function cs64Digest(data: Buffer, digest: Buffer): [number, number] {
  const keyA = (digest.readUInt32LE(0) | 1) >>> 0;
  const keyB = (digest.readUInt32LE(4) | 1) >>> 0;
  const factorA = Math.imul(keyA, CS64_FACTOR) >>> 0;
  const factorB = Math.imul(keyB, CS64_FACTOR) >>> 0;

  const terms: number[] = [];
  const offsets: number[] = [];

  for (let i = 0; i < CS64_COEFFICIENTS.length; i++) {
    const [coeff, off] = CS64_COEFFICIENTS[i];
    terms.push(Math.imul(coeff, i % 2 === 0 ? factorA : factorB) >>> 0);
    offsets.push(off >>> 0);
  }

  const leWords = wordsLe4Even(Buffer.concat([Buffer.from([0x00]), data]));
  for (let i = 0; i < leWords.length; i++) {
    const word = leWords[i];
    let term = Math.imul(word, i % 2 === 0 ? keyA : keyB) >>> 0;
    let offset = Math.imul(rol16(word), i % 2 === 0 ? 0xef0569fb : 0xc31713db) >>> 0;
    if (i === 0) {
      term = (term + (Math.imul(CS64_ADJUSTMENT0, factorA) >>> 0)) >>> 0;
      offset = (offset + CS64_ADJUSTMENT1) >>> 0;
    }
    terms.push(term);
    offsets.push(offset);
  }

  let swapAcc = 0;
  let swapLast = 0;
  let state = 0;
  let acc = 0;

  for (let i = 0; i < terms.length; i += 2) {
    const x = terms[i];
    const y = terms[i + 1];

    let t = rol16((offsets[i] + x) >>> 0);
    let q = Math.imul(t, 0x76f50f34) >>> 0;
    swapAcc = (swapAcc + (((Math.imul(rol16(q), 0xc3efea97) >>> 0) + q) >>> 0)) >>> 0;

    t = rol16((offsets[i + 1] + y) >>> 0);
    q = Math.imul(t, 0x1881ce3c) >>> 0;
    swapLast = ((Math.imul(rol16(q), 0x35bd1ec9) >>> 0) + q) >>> 0;
    swapAcc = (swapAcc + swapLast) >>> 0;

    state = ((Math.imul(state, keyA) >>> 0) + x) >>> 0;
    state = Math.imul(rol16(state), 0xcf98b111) >>> 0;
    state = Math.imul(rol16(state), 0x87085b9f) >>> 0;
    state = Math.imul(rol16(state), 0x12ceb96d) >>> 0;
    state = Math.imul(rol16(state), 0x257e1d83) >>> 0;
    acc = (acc + state) >>> 0;

    t = ((Math.imul(state, keyB) >>> 0) + y) >>> 0;
    t = Math.imul(rol16(t), 0xa27416f5) >>> 0;
    t = Math.imul(rol16(t), 0xd38396ff) >>> 0;
    state = Math.imul(rol16(Math.imul(rol16(t), 0x7c932b89) >>> 0), 0xbfa49f69) >>> 0;
    acc = (acc + state) >>> 0;
  }

  return [(swapLast ^ state) >>> 0, (swapAcc ^ acc) >>> 0];
}

let clockSkewSeconds = 0;

export function generateSecMsGecV2(unixTimestampSec?: number): string {
  let ticks =
    typeof unixTimestampSec === "number"
      ? unixTimestampSec
      : Date.now() / 1000 + clockSkewSeconds;
  ticks += WIN_EPOCH;
  ticks -= ticks % 300;
  const ticks100ns = BigInt(Math.round(ticks)) * 10_000_000n;
  const data = Buffer.from(`${ticks100ns.toString()}${TRUSTED_CLIENT_TOKEN}`, "ascii");

  const digest = sha256Digest(data);
  const [cs0, cs1] = cs64Digest(data, digest);
  const csBuf = Buffer.alloc(8);
  csBuf.writeUInt32LE(cs0, 0);
  csBuf.writeUInt32LE(cs1, 4);

  return `${csBuf.toString("hex").toUpperCase()}-${digest.toString("hex").toUpperCase()}`;
}

let cachedToken: string | null = null;
let tokenExpiry = 0;

function getSecMsGec(): string {
  const now = Date.now();
  if (cachedToken && now < tokenExpiry) {
    return cachedToken;
  }
  const token = generateSecMsGecV2();
  cachedToken = token;
  tokenExpiry = now + 4 * 60 * 1000; // cache for 4 minutes
  return token;
}

const CACHE_DIR = path.join(os.tmpdir(), "polyglot_tts_audio");
try {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }
} catch (e) {}

const memoryCache = new Map<string, Buffer>();

function getCacheKey(text: string, voice: string, rate: string): string {
  return crypto.createHash("md5").update(`${voice}:${rate}:${text}`).digest("hex");
}

export async function synthesizeEdgeTTS(
  text: string,
  voice: string = "th-TH-NiwatNeural",
  rate: string = "+0%"
): Promise<Buffer> {
  const cleanText = text.trim();
  if (!cleanText) {
    return Buffer.alloc(0);
  }

  const cacheKey = getCacheKey(cleanText, voice, rate);

  // 1. Check memory cache
  if (memoryCache.has(cacheKey)) {
    return memoryCache.get(cacheKey)!;
  }

  // 2. Check disk cache
  const diskPath = path.join(CACHE_DIR, `${cacheKey}.mp3`);
  if (fs.existsSync(diskPath)) {
    try {
      const buf = fs.readFileSync(diskPath);
      if (buf.length > 0) {
        memoryCache.set(cacheKey, buf);
        return buf;
      }
    } catch (e) {}
  }

  // 3. Connect to Microsoft Edge Read Aloud WebSocket
  const buffer = await new Promise<Buffer>((resolve, reject) => {
    const token = getSecMsGec();
    const connectId = crypto.randomBytes(16).toString("hex").toLowerCase();
    const url = `wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=${TRUSTED_CLIENT_TOKEN}&Sec-MS-GEC=${token}&Sec-MS-GEC-Version=${SEC_MS_GEC_VERSION}&ConnectionId=${connectId}`;

    const ws = new WebSocket(url, {
      headers: {
        Pragma: "no-cache",
        "Cache-Control": "no-cache",
        "User-Agent": `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${CHROMIUM_MAJOR_VERSION}.0.0.0 Safari/537.36 Edg/${CHROMIUM_MAJOR_VERSION}.0.0.0`,
        Origin: "chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold",
        "Accept-Encoding": "gzip, deflate, br, zstd",
        "Accept-Language": "en-US,en;q=0.9",
        Cookie: `muid=${crypto.randomBytes(16).toString("hex").toUpperCase()};`,
      },
    });

    const chunks: Buffer[] = [];
    const timeout = setTimeout(() => {
      try {
        ws.close();
      } catch (e) {}
      reject(new Error("EdgeTTS connection timeout"));
    }, 15000);

    ws.on("open", () => {
      const dateStr = new Date().toUTCString();
      ws.send(
        `X-Timestamp:${dateStr}\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n{"context":{"synthesis":{"audio":{"metadataoptions":{"sentenceBoundaryEnabled":"false","wordBoundaryEnabled":"true"},"outputFormat":"audio-24khz-48kbitrate-mono-mp3"}}}}\r\n`
      );

      const escaped = cleanText
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
      const parts = voice.split("-");
      const voiceShort = parts.length >= 2 ? `${parts[0]}-${parts[1]}` : "th-TH";
      const voiceName = parts.length >= 3 ? parts.slice(2).join("-") : "NiwatNeural";
      const fullVoiceName = `Microsoft Server Speech Text to Speech Voice (${voiceShort}, ${voiceName})`;

      const ssml = `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='${voiceShort}'><voice name='${fullVoiceName}'><prosody pitch='+0Hz' rate='${rate}' volume='+0%'>${escaped}</prosody></voice></speak>`;
      const reqId = crypto.randomBytes(16).toString("hex").toLowerCase();
      ws.send(
        `X-RequestId:${reqId}\r\nX-Timestamp:${dateStr}\r\nContent-Type:application/ssml+xml\r\nPath:ssml\r\n\r\n${ssml}`
      );
    });

    ws.on("message", (data: Buffer, isBinary: boolean) => {
      if (isBinary) {
        if (data.length > 2) {
          const headerLen = data.readUInt16BE(0);
          if (data.length > 2 + headerLen) {
            chunks.push(data.slice(2 + headerLen));
          }
        }
      } else {
        const str = data.toString();
        if (str.includes("turn.end")) {
          clearTimeout(timeout);
          try {
            ws.close();
          } catch (e) {}
          resolve(Buffer.concat(chunks));
        }
      }
    });

    ws.on("error", (err) => {
      clearTimeout(timeout);
      reject(err);
    });

    ws.on("unexpected-response", (_req, res) => {
      clearTimeout(timeout);
      // Adjust clock skew if Microsoft returned a Date header on 403
      const serverDateHeader = res.headers?.date;
      if (typeof serverDateHeader === "string") {
        const serverMs = Date.parse(serverDateHeader);
        if (!Number.isNaN(serverMs)) {
          clockSkewSeconds += (serverMs - Date.now()) / 1000;
        }
      }
      // Invalidate token cache so retry immediately regenerates a fresh token
      cachedToken = null;
      tokenExpiry = 0;
      reject(new Error(`EdgeTTS unexpected response: ${res.statusCode}`));
    });
  });

  if (buffer && buffer.length > 0) {
    memoryCache.set(cacheKey, buffer);
    if (memoryCache.size > 2000) {
      const first = memoryCache.keys().next().value;
      if (first) memoryCache.delete(first);
    }
    fs.writeFile(diskPath, buffer, (err) => {
      if (err) console.warn("[EdgeTTS] Failed to write cache:", err.message);
    });
  }

  return buffer;
}
