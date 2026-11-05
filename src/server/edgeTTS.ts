import WebSocket from "ws";
import crypto from "crypto";
import path from "path";
import fs from "fs";
import { execSync } from "child_process";

let cachedToken: string | null = null;
let tokenExpiry = 0;

const CACHE_DIR = path.join(process.cwd(), ".cache", "tts_audio");
try {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }
} catch (e) {}

const memoryCache = new Map<string, Buffer>();

function getSecMsGec(): string {
  const now = Date.now();
  if (cachedToken && now < tokenExpiry) {
    return cachedToken;
  }
  try {
    const token = execSync(
      `python3 -c "import sys; sys.path.append('scripts'); from edge_drm import generate_sec_ms_gec_v2; print(generate_sec_ms_gec_v2())"`
    ).toString().trim();
    if (token && token.length > 20) {
      cachedToken = token;
      tokenExpiry = now + 4 * 60 * 1000; // cache for 4 minutes
      return token;
    }
  } catch (err: any) {
    console.error("[EdgeTTS] Failed to generate v2 token via DRM script:", err?.message || err);
  }
  // Return fallback if cached
  return cachedToken || "";
}

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
    const TRUSTED_CLIENT_TOKEN = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
    const CHROMIUM_MAJOR_VERSION = "143";
    const CHROMIUM_FULL_VERSION = "143.0.3650.75";
    const SEC_MS_GEC_VERSION = "2-" + CHROMIUM_FULL_VERSION;
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

    ws.on("unexpected-response", (req, res) => {
      clearTimeout(timeout);
      // Invalidate token cache so next call gets fresh
      cachedToken = null;
      reject(new Error(`EdgeTTS unexpected response: ${res.statusCode}`));
    });
  });

  if (buffer && buffer.length > 0) {
    // Save to memory cache
    memoryCache.set(cacheKey, buffer);
    if (memoryCache.size > 2000) {
      const first = memoryCache.keys().next().value;
      if (first) memoryCache.delete(first);
    }
    // Save to disk cache asynchronously
    fs.writeFile(diskPath, buffer, (err) => {
      if (err) console.warn("[EdgeTTS] Failed to write cache:", err.message);
    });
  }

  return buffer;
}
