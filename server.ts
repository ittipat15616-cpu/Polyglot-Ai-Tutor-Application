import dotenv from "dotenv";
dotenv.config({ path: [".env.local", ".env"] });
import express from "express";
import path from "path";
import http from "http";
import https from "https";
import fs from "fs";
import os from "os";
import { synthesizeEdgeTTS } from "./src/server/edgeTTS";
import { registerKaraokeRoutes } from "./src/server/karaokeRoutes";
import {
  BYOK_FLASH_MODEL_CHAIN,
  ByokInvalidKeyError,
  ByokQuotaExhaustedError,
  LIVE_PRIMARY_MODEL,
  LIVE_TPM_FALLBACK_MODELS,
  createClientFromKey,
  createLiveClientFromKey,
  generateContentWithByokFallback,
  isInvalidKeyError,
  isModelNotFoundOrUnsupportedError,
  isQuotaOrRateLimitError,
  safeParseGeminiJson,
} from "./src/server/byokGeminiHelper";
import {
  requireFirebaseAuth,
  verifyFirebaseIdToken,
} from "./src/server/authMiddleware";
import { WebSocketServer, WebSocket } from "ws";
import { PDFDocument } from 'pdf-lib';
import { GoogleGenAI, LiveServerMessage, Modality, Type, ThinkingLevel } from "@google/genai";
import { initializeApp, applicationDefault, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import imageManifest from "./src/data/image_manifest.json";

process.on('uncaughtException', (err: any) => {
  console.error('Unhandled Exception:', err?.message || err);
});
process.on('unhandledRejection', (reason: any, promise) => {
  console.error('Unhandled Rejection:', reason?.message || reason);
});

// Initialize Firebase Admin (with fallback to memory if not configured)
let db: FirebaseFirestore.Firestore | null = null;
try {
  if (process.env.FIREBASE_PROJECT_ID || process.env.FIREBASE_CONFIG) {
    if (getApps().length === 0) {
      initializeApp({
        credential: applicationDefault()
      });
    }
    db = getFirestore();
    console.log("Firebase Admin initialized successfully.");
  } else {
    console.warn("Firebase config not found, falling back to in-memory store.");
  }
} catch (e) {
  console.warn("Firebase Admin init failed:", e);
}

// Initialize Gemini lazily to avoid crash on startup when GEMINI_API_KEY is not set yet
// Server-only paid API key client: strictly ignores any user BYOK key (used for grading, subtitles, learning plan, slip verification, chat)
export function getServerGeminiClient(): GoogleGenAI {
  const apiKey =
    process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim().length > 10
      ? process.env.GEMINI_API_KEY.trim()
      : null;

  if (!apiKey) {
    throw new Error("ระบบ AI ของเซิร์ฟเวอร์ยังไม่พร้อมใช้งานในขณะนี้ กรุณาติดต่อผู้ดูแลระบบ");
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      }
    }
  });
}

// Server-only Live API client: explicitly uses v1beta/v1alpha because @google/genai 3.x defaults to v1 (no BidiGenerateContent).
export function getServerLiveGeminiClient(apiVersion: "v1beta" | "v1alpha" = "v1beta"): GoogleGenAI {
  const apiKey =
    process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim().length > 10
      ? process.env.GEMINI_API_KEY.trim()
      : null;

  if (!apiKey) {
    throw new Error("ระบบ AI ของเซิร์ฟเวอร์ยังไม่พร้อมใช้งานในขณะนี้ กรุณาติดต่อผู้ดูแลระบบ");
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      apiVersion,
      headers: {
        'User-Agent': 'aistudio-build',
      }
    }
  });
}

// Live Call client helper (allows explicit BYOK key for AI Voice/Video Calls only, otherwise falls back to server key)
export function getGeminiClient(explicitKey?: string | null): GoogleGenAI {
  const apiKey = (explicitKey && typeof explicitKey === 'string' && explicitKey.trim().length > 10)
    ? explicitKey.trim()
    : (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim().length > 10)
    ? process.env.GEMINI_API_KEY.trim()
    : null;

  if (!apiKey) {
    throw new Error("กรุณาใส่ Gemini API Key ส่วนตัว (BYOK) ที่ปุ่มมุมบนขวา เพื่อเริ่มใช้งาน AI");
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      }
    }
  });
}

// Keep a fallback 'ai' variable for compatibility, initialized lazily on first access
const aiProxyHandler = {
  get(target: any, prop: string | symbol) {
    const client = getGeminiClient();
    const value = (client as any)[prop];
    if (typeof value === 'function') {
      return value.bind(client);
    }
    return value;
  }
};
const ai: GoogleGenAI = new Proxy({}, aiProxyHandler) as any;

// Add a simple in-memory session store for tracking conversation history across reconnects
const sessionMemoryStore = new Map<string, string[]>();
const greetedClientStore = new Set<string>();

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json({ limit: "60mb" }));
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (err && req.path.startsWith("/api/")) {
      const status = err.status || err.statusCode || 400;
      const msg =
        err.type === "entity.too.large"
          ? "ไฟล์เสียงมีขนาดใหญ่เกินกำหนด (สูงสุด 60 MB) กรุณาตัดหรืออัดคลิปให้สั้นลงครับ"
          : err.message || "คำขอไม่ถูกต้อง";
      return res.status(status).json({ error: msg });
    }
    next(err);
  });

  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Register Karaoke Studio routes (YouTube search, LRCLIB synced lyrics, Gemini Thai/Pinyin/Vocab translator & Global Cache)
  registerKaraokeRoutes(app, {
    getServerGeminiClient,
    firestoreAdmin: db,
  });

  // Validate user-provided Gemini API Key (BYOK) — requires signed-in Google account
  app.post("/api/validate-key", express.json(), requireFirebaseAuth, async (req, res) => {
    try {
      const { apiKey } = req.body;
      if (!apiKey || typeof apiKey !== "string" || apiKey.trim().length < 15) {
        return res.status(400).json({ valid: false, message: "กรุณาระบุ Gemini API Key ให้ถูกต้อง" });
      }
      const cleanKey = apiKey.trim();
      const testAi = createClientFromKey(cleanKey);
      let lastErr: any = null;
      let sawQuota = false;

      for (const model of BYOK_FLASH_MODEL_CHAIN) {
        try {
          const testResult = await testAi.models.generateContent({
            model,
            contents: "Reply with OK",
          });
          if (testResult && (testResult.text || testResult.candidates)) {
            return res.json({
              valid: true,
              modelTested: model,
              message: `Gemini API Key ใช้งานได้สมบูรณ์และถูกต้อง! (ทดสอบผ่าน ${model})`,
            });
          }
        } catch (err: any) {
          lastErr = err;
          if (isInvalidKeyError(err)) {
            throw err;
          }
          if (isQuotaOrRateLimitError(err)) {
            sawQuota = true;
          }
          console.warn(`[BYOK Validate] Model ${model} failed (${String(err?.message || err).slice(0, 120)}), trying next...`);
        }
      }

      if (sawQuota) {
        return res.status(429).json({
          valid: false,
          message: "API Key ถูกต้องแต่กำลังติดขีดจำกัดโควตาชั่วคราวจาก Google (429) กรุณารอสักครู่แล้วลองใหม่อีกครั้ง",
        });
      }
      if (lastErr) throw lastErr;
      return res.status(400).json({ valid: false, message: "ไม่สามารถทดสอบ API Key ได้ กรุณาลองใหม่อีกครั้ง" });
    } catch (err: any) {
      const errMsg = err?.message || "";
      console.error("BYOK key validation failed:", errMsg);
      if (isInvalidKeyError(err)) {
        return res.status(400).json({ valid: false, message: "API Key ไม่ถูกต้อง หมดอายุ หรือถูกยกเลิกแล้วจาก Google AI Studio" });
      }
      return res.status(400).json({ valid: false, message: `ไม่สามารถตรวจสอบคีย์ได้: ${errMsg.slice(0, 140)}` });
    }
  });

  app.get("/api/downloads", (req, res) => {
    try {
      const manifestData = imageManifest as Record<string, string[]>;
      const result: Record<string, string[]> = {};
      for (let i = 1; i <= 6; i++) {
        const key = `HSK_Images/H${i}`;
        if (manifestData[key]) {
          result[`H${i}`] = manifestData[key];
        }
      }
      res.json(result);
    } catch (err) {
      console.error("Failed to load downloads manifest:", err);
      res.status(500).json({ error: "Failed to load downloads manifest" });
    }
  });


  const ttsCache = new Map<string, string>();

  app.post("/api/generate-subtitles", requireFirebaseAuth, express.json({ limit: "60mb" }), async (req, res) => {
    try {
      const { audioBase64, mimeType, durationSec, useByokQuota, byokKey } = req.body;
      if (!audioBase64 || typeof audioBase64 !== "string") {
        return res.status(400).json({ error: "ไม่พบข้อมูลเสียงสำหรับสร้างซับไตเติ้ล" });
      }

      const isByokMode = Boolean(useByokQuota && typeof byokKey === "string" && byokKey.trim().length > 10);
      const numericDuration = Number(durationSec || 0);

      // Strict server-side safety guard for BYOK Free Tier (max 5 minutes + 5s rounding grace, max 18MB base64 < 20MB inlineData cap)
      if (isByokMode) {
        if (numericDuration > 305) {
          return res.status(400).json({
            byokDurationExceeded: true,
            maxDurationSec: 300,
            error: "สิทธิ์ฟรี BYOK รองรับคลิปความยาวไม่เกิน 5 นาที กรุณาเลือกใช้ 5 เครดิต หรือโหมดฟรีบนเครื่องแทนครับ",
          });
        }
        if (audioBase64.length > 18 * 1024 * 1024) {
          return res.status(413).json({
            byokSizeExceeded: true,
            error: "ไฟล์เสียงมีขนาดใหญ่เกินเกณฑ์สิทธิ์ฟรี BYOK (สูงสุด 18 MB) กรุณาเลือกใช้ 5 เครดิต หรือโหมดฟรีบนเครื่องแทนครับ",
          });
        }
      }

      const prompt = `You are a professional Thai/English/Chinese video editor creating real-time burn-in subtitles for a Polyglot AI Tutor product demo / language learning video.
Total audio duration is approximately ${numericDuration.toFixed(1)} seconds.

Listen carefully to the entire audio track and produce accurate, tightly timed subtitle cues.

CRITICAL RULES:
1. SPEAKER DIARIZATION (YOU vs AI):
   - Label speaker as "YOU" for the human presenter/user speaking naturally into the microphone (explaining features, greeting viewers, practicing speaking).
   - Label speaker as "AI" for any AI voice, Polyglot AI Tutor voice (male/female neural TTS voices, AI Tutor conversation replies, vocabulary pronunciation audio, or automated tutorial voiceovers).
2. TIMESTAMPS:
   - Provide accurate "startSec" and "endSec" in seconds (numbers, e.g. 0.5, 3.8).
   - Ensure endSec > startSec and cues are in strict chronological order without overlapping.
   - Keep every cue concise and natural like a professional CapCut/YouTube editor (roughly 1.5 to 4.5 seconds per cue, max ~12-16 words or ~45 Thai characters per cue so it reads cleanly in 1-2 lines).
3. TRANSCRIPTION ACCURACY:
   - Keep spoken languages exact: Thai in natural Thai spelling, English in English, Chinese in Chinese characters (with pinyin only if spoken).
   - Do NOT include speaker prefixes like "AI:" or "You:" inside the "text" field — put the speaker strictly in the "speaker" field.
   - Skip long silent gaps with no speech. If there is no intelligible speech at all, return an empty array [].`;

      const audioPart = {
        inlineData: {
          mimeType: mimeType || "audio/wav",
          data: audioBase64,
        },
      };

      const subtitleSchema = {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            startSec: { type: Type.NUMBER, description: "Start time in seconds" },
            endSec: { type: Type.NUMBER, description: "End time in seconds" },
            speaker: {
              type: Type.STRING,
              description: "Either YOU for human speaker or AI for AI tutor/TTS voice",
            },
            text: { type: Type.STRING, description: "Concise subtitle text without speaker prefix" },
          },
          required: ["startSec", "endSec", "speaker", "text"],
        },
      };

      const aiResult = await generateContentWithByokFallback({
        contents: { parts: [audioPart, { text: prompt }] },
        config: {
          responseMimeType: "application/json",
          responseSchema: subtitleSchema,
        },
        useByokQuota: isByokMode,
        byokKey: isByokMode ? byokKey.trim() : null,
        byokProfile: "hydrogen",
        serverDefaultModel: "gemini-3.8-flash",
        serverThinkingLevel: ThinkingLevel.LOW,
        getServerClient: getServerGeminiClient,
      });

      const parsedRaw = safeParseGeminiJson<any>(aiResult.text || "[]", []);
      const parsed: any[] = Array.isArray(parsedRaw) ? parsedRaw : [];

      const cues = parsed
        .filter((item) => item && typeof item.text === "string" && item.text.trim().length > 0)
        .map((item, index) => {
          const start = Math.max(0, Number(item.startSec) || 0);
          const end = Math.max(start + 0.4, Number(item.endSec) || start + 2);
          const rawSpeaker = String(item.speaker || "YOU").toUpperCase();
          const speaker = rawSpeaker.includes("AI") ? "AI" : "YOU";
          const cleanText = item.text
            .trim()
            .replace(/^(AI|You|YOU|ผู้พูด|เอไอ)\s*[:：]\s*/i, "");
          return {
            id: `sub_${index}_${Math.round(start * 10)}`,
            startSec: Number(start.toFixed(2)),
            endSec: Number(end.toFixed(2)),
            speaker,
            text: cleanText,
          };
        })
        .sort((a, b) => a.startSec - b.startSec);

      return res.json({ subtitles: cues, usedByok: isByokMode, modelUsed: aiResult.modelUsed });
    } catch (e: any) {
      if (e instanceof ByokInvalidKeyError) {
        return res.status(400).json({
          byokInvalidKey: true,
          error: e.message,
        });
      }
      if (e instanceof ByokQuotaExhaustedError) {
        return res.status(429).json({
          byokQuotaExhausted: true,
          error: "API Key ส่วนตัว (BYOK) ติดขีดจำกัดโควตาของ Google ชั่วคราว (429) คุณสามารถใช้ 5 เครดิตในแอป หรือโหมดฟรีบนเครื่องแทนได้ทันที",
        });
      }
      console.error("[Subtitles] Error:", e?.message || e);
      const isQuota = isQuotaOrRateLimitError(e);
      return res.status(isQuota ? 429 : 500).json({
        byokQuotaExhausted: Boolean(isQuota && req.body?.useByokQuota),
        error: e?.message || "ไม่สามารถสร้างซับไตเติ้ลอัตโนมัติได้ กรุณาลองใหม่อีกครั้ง",
      });
    }
  });

  app.post("/api/chat", requireFirebaseAuth, express.json(), async (_req, res) => {
    // Disabled legacy endpoint so unbilled direct calls can never consume the owner's server API key
    return res.status(410).json({
      error: "ช่องทางแชทเก่ายกเลิกการใช้งานแล้ว กรุณาใช้งานผ่านโหมดคอลสด AI ในแอปครับ",
    });
  });

  app.post("/api/grade-vocab", requireFirebaseAuth, async (req, res) => {
    try {
      const { answers, lang, useByokQuota, byokKey } = req.body;
      const prompt = `You are an extremely encouraging, highly flexible, and intelligent language evaluator for a language learning app.
The student has translated several vocabulary words from ${lang} to another language (usually Thai).

YOUR MAIN GOAL:
Evaluate whether the student actually understands the correct meaning of the word. Be super flexible, extremely lenient, and encouraging.

CRITICAL GRADING PRINCIPLES & GUIDELINES:
1. ANY VALID MEANING IS CORRECT: The student only needs to write ANY single correct meaning, synonym, or close definition of the word. They do NOT need to match the official translations exactly.
2. SIMPLIFIED ANSWERS ARE CORRECT: If the student writes a shortened or simplified version of the word (e.g., writing "ทิ้ง" instead of "ละทิ้ง", "เรียน" instead of "การเรียน", "ชอบ" instead of "ความรัก"), mark it as CORRECT (true).
3. NO STRICT WORD FORMS: Be extremely lenient with word forms (e.g. noun vs. verb forms of the same root meaning in Thai), typos, informal or conversational speech, and phrasing.
4. SYNONYMS & RELATED CONCEPTS: If the student writes a valid synonym, a closely related phrase, or correctly captures the central idea/definition of the word, mark it as CORRECT (true).
5. DIFFERENT NUANCES: Words often have multiple meanings in different contexts. If the student's translation is valid for ANY of the word's common or situational meanings, mark it as CORRECT (true).
6. PREFIX & SUFFIX OMISSION: Ignore formal prefixes like "การ", "ความ", "ที่", "ความสามารถในการ" or suffixes like "ขึ้น", "ลง", "ไป", "มา". If the core meaning is correct, mark it as CORRECT (true).
7. ONLY MARK FALSE IF COMPLETELY WRONG: Only set "isTranslationCorrect" to false if the student's answer is completely unrelated, represents a totally different concept, or is a wild guess.

EXAMPLES:
   - "abandon" (official: "ละทิ้ง", "ยกเลิก"): if student writes "ทิ้ง", "ปล่อย", "ล้มเลิก", "จากไป", "ละเลย" -> CORRECT (true).
   - "essential" (official: "จำเป็นที่สุด", "สำคัญที่สุด"): if student writes "สำคัญ", "จำเป็น", "ต้องมี", "ขาดไม่ได้", "เน้นย้ำ" -> CORRECT (true).
   - "evaluate" (official: "ประเมินผล", "หาค่า"): if student writes "ประเมิน", "ตรวจ", "วัดผล", "หาคำตอบ" -> CORRECT (true).
   - "ability" (official: "ความสามารถ"): if student writes "ความเก่ง", "สามารถ", "เก่ง", "ทำได้" -> CORRECT (true).

Input Data to grade:
${JSON.stringify(answers, null, 2)}`;

      const aiRes = await generateContentWithByokFallback({
        contents: prompt,
        useByokQuota: Boolean(useByokQuota),
        byokKey: byokKey || null,
        byokProfile: "flash_lite",
        serverDefaultModel: "gemini-3.1-pro-preview",
        serverThinkingLevel: ThinkingLevel.HIGH,
        getServerClient: getServerGeminiClient,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                wordId: { type: Type.STRING },
                isTranslationCorrect: { type: Type.BOOLEAN }
              },
              required: ["wordId", "isTranslationCorrect"]
            }
          }
        }
      });

      const parsed = safeParseGeminiJson(aiRes.text || "[]");
      res.json(Array.isArray(parsed) ? parsed : []);
    } catch (e: any) {
      console.error("Vocab Grade Error:", e);
      if (e instanceof ByokInvalidKeyError) {
        return res.status(400).json({ error: e.message, byokInvalidKey: true });
      }
      if (e instanceof ByokQuotaExhaustedError) {
        return res.status(429).json({ error: e.message, byokQuotaExhausted: true });
      }
      const isQuota = isQuotaOrRateLimitError(e);
      res.status(isQuota ? 429 : 500).json({
        error: e?.message || "Grading failed",
        byokQuotaExhausted: Boolean(isQuota && req.body?.useByokQuota),
      });
    }
  });

  app.post("/api/grade-speaking", requireFirebaseAuth, express.json({ limit: "200mb" }), async (req, res) => {
    try {
      const { audios, examId, useByokQuota, byokKey } = req.body;
      if (!audios || audios.length === 0) return res.status(400).json({ error: "Missing audio" });
      const prompt = `You are an expert IELTS examiner. Listen to the following IELTS Speaking response(s) and grade it.
First, provide a transcript of what the user said (and infer the question they are answering if possible).
Then, evaluate based on Fluency and Coherence, Lexical Resource, Grammatical Range and Accuracy, and Pronunciation.
Provide the result strictly in this JSON format (no markdown tags):
{
  "bandScore": 7.0,
  "transcript": "Question: ...\\n\\nAnswer: ...",
  "feedback": "Overall detailed feedback...",
  "strengths": ["strength 1", "strength 2"],
  "weaknesses": ["weakness 1", "weakness 2"]
}`;

      const parts: any[] = [{ text: prompt }];
      for (const audio of audios) {
        parts.push({ inlineData: { data: audio.base64, mimeType: audio.mimeType || "audio/webm" } });
      }

      if (examId) {
        try {
          const pdfUrl = `https://firebasestorage.googleapis.com/v0/b/polyglot-ai-tuto.firebasestorage.app/o/IELTS_Mock_Tests%2F${examId}%2FSpeaking_Full.pdf?alt=media`;
          const pdfRes = await fetch(pdfUrl);
          if (pdfRes.ok) {
            const buffer = Buffer.from(await pdfRes.arrayBuffer());
            const pdfDoc = await PDFDocument.load(buffer);
            const newPdf = await PDFDocument.create();

            if (pdfDoc.getPageCount() > 0) {
              const [copiedPage] = await newPdf.copyPages(pdfDoc, [0]);
              newPdf.addPage(copiedPage);
              const newPdfBytes = await newPdf.save();

              parts.push({
                inlineData: {
                  data: Buffer.from(newPdfBytes).toString('base64'),
                  mimeType: 'application/pdf'
                }
              });
              parts.push({ text: "Please look at the attached PDF page which contains the Speaking Part 1, 2, and 3 prompts. Grade the user's spoken answer accurately against these specific prompts." });
            }
          }
        } catch (pdfErr) {
          console.error("Failed to load PDF for Speaking Grading:", pdfErr);
        }
      }

      if (Boolean(useByokQuota)) {
        const totalAudioBytes = audios.reduce((sum: number, a: any) => sum + String(a?.base64 || "").length, 0);
        if (totalAudioBytes > 18 * 1024 * 1024) {
          return res.status(413).json({
            error: "ไฟล์เสียงสอบพูดมีขนาดรวมเกินเกณฑ์ Free Tier (18 MB) กรุณาอัดเสียงให้กระชับขึ้นหรือเลือกใช้เครดิตในแอปครับ",
          });
        }
      }

      const aiRes = await generateContentWithByokFallback({
        contents: parts,
        useByokQuota: Boolean(useByokQuota),
        byokKey: byokKey || null,
        byokProfile: "hydrogen",
        serverDefaultModel: "gemini-3.1-pro-preview",
        serverThinkingLevel: ThinkingLevel.HIGH,
        getServerClient: getServerGeminiClient,
        config: {
          responseMimeType: "application/json",
        },
      });

      res.json(safeParseGeminiJson(aiRes.text || "{}"));
    } catch (e: any) {
      console.error("Gemini API Error in Speaking:", e);
      if (e instanceof ByokInvalidKeyError) {
        return res.status(400).json({ error: e.message, byokInvalidKey: true });
      }
      if (e instanceof ByokQuotaExhaustedError || (req.body?.useByokQuota && isQuotaOrRateLimitError(e))) {
        return res.status(429).json({
          error: e?.message || "Google API Key ส่วนตัวติดขีดจำกัดชั่วคราว (429)",
          byokQuotaExhausted: true,
        });
      }
      return res.status(500).json({ error: e?.message || "ไม่สามารถตรวจข้อสอบการพูดได้ในขณะนี้" });
    }
  });

  app.post("/api/grade-writing", requireFirebaseAuth, async (req, res) => {
    try {
      const { prompt, examId, useByokQuota, byokKey } = req.body;
      const parts: any[] = [{ text: prompt }];

      if (examId) {
        try {
          const pdfUrl = `https://firebasestorage.googleapis.com/v0/b/polyglot-ai-tuto.firebasestorage.app/o/IELTS_Mock_Tests%2F${examId}%2FWriting_Full.pdf?alt=media`;
          const pdfRes = await fetch(pdfUrl);
          if (pdfRes.ok) {
            const buffer = Buffer.from(await pdfRes.arrayBuffer());
            const pdfDoc = await PDFDocument.load(buffer);
            const newPdf = await PDFDocument.create();

            const pageIndices = [];
            if (pdfDoc.getPageCount() > 0) pageIndices.push(0);
            if (pdfDoc.getPageCount() > 2) pageIndices.push(2);

            if (pageIndices.length > 0) {
              const copiedPages = await newPdf.copyPages(pdfDoc, pageIndices);
              copiedPages.forEach((page: any) => newPdf.addPage(page));
              const newPdfBytes = await newPdf.save();

              parts.push({
                inlineData: {
                  data: Buffer.from(newPdfBytes).toString('base64'),
                  mimeType: 'application/pdf'
                }
              });
              parts.push({ text: "Please look at the attached PDF pages which contain the Writing Task 1 and Task 2 prompts. Grade the user's written answer accurately against these specific prompts." });
            }
          }
        } catch (pdfErr) {
          console.error("Failed to load PDF for Writing Grading:", pdfErr);
        }
      }

      const aiRes = await generateContentWithByokFallback({
        contents: parts,
        useByokQuota: Boolean(useByokQuota),
        byokKey: byokKey || null,
        byokProfile: "hydrogen",
        serverDefaultModel: "gemini-3.1-pro-preview",
        serverThinkingLevel: ThinkingLevel.HIGH,
        getServerClient: getServerGeminiClient,
        config: {
          responseMimeType: "application/json",
        },
      });

      res.json(safeParseGeminiJson(aiRes.text || "{}"));
    } catch (e: any) {
      console.error("Gemini API Error in Writing:", e);
      if (e instanceof ByokInvalidKeyError) {
        return res.status(400).json({ error: e.message, byokInvalidKey: true });
      }
      if (e instanceof ByokQuotaExhaustedError || (req.body?.useByokQuota && isQuotaOrRateLimitError(e))) {
        return res.status(429).json({
          error: e?.message || "Google API Key ส่วนตัวติดขีดจำกัดชั่วคราว (429)",
          byokQuotaExhausted: true,
        });
      }
      return res.status(500).json({ error: e?.message || "ไม่สามารถตรวจข้อสอบการเขียนได้ในขณะนี้" });
    }
  });

  // Batch writing grader for HSK4 (Q96-100) and HSK5 (Q99-100): grades all writing items in ONE single AI request (huge RPM/RPD saver for BYOK free keys!)
  app.post("/api/grade-writing-batch", requireFirebaseAuth, async (req, res) => {
    try {
      const { level, items, useByokQuota, byokKey } = req.body;
      if (!Array.isArray(items) || items.length === 0) {
        return res.json({ results: [] });
      }

      const batchPrompt = `คุณคือผู้ตรวจข้อสอบ ${level} พาร์ทการเขียนที่มีความแม่นยำและให้คำแนะนำภาษาไทยชัดเจน
จงตรวจคำตอบทุกข้อในรายการ "items" ด้านล่างนี้ตามคะแนนเต็ม (maxScore) และโจทย์ (instruction) ของแต่ละข้อ
หากได้คะแนนเต็ม ให้ feedback เป็น "ได้คะแนนเต็ม" หากถูกหักคะแนน ให้อธิบายข้อผิดพลาดและเหตุผลสั้นๆ เป็นภาษาไทย

คืนค่าเป็น JSON เท่านั้นตามโครงสร้าง:
{
  "results": [
    { "questionNumber": "96", "score": 8, "feedback": "ได้คะแนนเต็ม" }
  ]
}

items:
${JSON.stringify(items, null, 2)}`;

      const aiRes = await generateContentWithByokFallback({
        contents: batchPrompt,
        useByokQuota: Boolean(useByokQuota),
        byokKey: byokKey || null,
        byokProfile: "hydrogen",
        serverDefaultModel: "gemini-3.1-pro-preview",
        serverThinkingLevel: ThinkingLevel.HIGH,
        getServerClient: getServerGeminiClient,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              results: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    questionNumber: { type: Type.STRING },
                    score: { type: Type.NUMBER },
                    feedback: { type: Type.STRING },
                  },
                  required: ["questionNumber", "score", "feedback"],
                },
              },
            },
            required: ["results"],
          },
        },
      });

      res.json(safeParseGeminiJson(aiRes.text || "{}"));
    } catch (e: any) {
      console.error("Gemini API Error in Batch Writing:", e);
      if (e instanceof ByokInvalidKeyError) {
        return res.status(400).json({ error: e.message, byokInvalidKey: true });
      }
      if (e instanceof ByokQuotaExhaustedError || (req.body?.useByokQuota && isQuotaOrRateLimitError(e))) {
        return res.status(429).json({
          error: e?.message || "Google API Key ส่วนตัวติดขีดจำกัดชั่วคราว (429)",
          byokQuotaExhausted: true,
        });
      }
      return res.status(500).json({ error: e?.message || "ไม่สามารถตรวจข้อสอบการเขียนได้ในขณะนี้" });
    }
  });

  app.post("/api/generate-learning-plan", requireFirebaseAuth, express.json(), async (_req, res) => {
    // Disabled legacy AI endpoint: Study Plan now generates 100% offline at 0 cost
    return res.status(410).json({
      error: "ระบบวางแผนการเรียนทำงานออฟไลน์ฟรีบนอุปกรณ์แล้ว ไม่ต้องเรียกใช้เซิร์ฟเวอร์ AI",
    });
  });

  app.post("/api/verify-slip", requireFirebaseAuth, express.json({ limit: "50mb" }), async (req, res) => {
    try {
      const { imageUrl, expectedAmount } = req.body;
      if (!imageUrl || !expectedAmount) {
        return res.status(400).json({ error: "Missing imageUrl or expectedAmount" });
      }

      // Strictly use Owner's paid server API key (BYOK is only for AI Voice/Video Calls)
      const client = getServerGeminiClient();

      // Extract base64 data from Data URI
      const base64Data = imageUrl.includes(',') ? imageUrl.split(',')[1] : imageUrl;
      
      const now = new Date();
      const threeHoursAgo = new Date(now.getTime() - 3 * 60 * 60 * 1000);
      const currentDateTimeTh = now.toLocaleString("th-TH", { timeZone: "Asia/Bangkok", dateStyle: "short", timeStyle: "medium" });
      const threeHoursAgoTh = threeHoursAgo.toLocaleString("th-TH", { timeZone: "Asia/Bangkok", dateStyle: "short", timeStyle: "medium" });

      const prompt = `You are an expert fraud detection AI. You are given an image that a user uploaded as a bank transfer slip (สลิปโอนเงิน).
The expected transfer amount is ${expectedAmount} THB.
The current time of upload is: ${currentDateTimeTh} (Timezone: Asia/Bangkok).
The time 3 hours ago was: ${threeHoursAgoTh} (Timezone: Asia/Bangkok).

Please verify the following STRICTLY. If ANY rule fails, the slip is invalid:
1. Authenticity: Is the image a legitimate Thai bank transfer slip?
2. Amount: Does the slip clearly show a transfer amount exactly equal to ${expectedAmount} THB?
3. Status: Does the slip show a "successful" status (e.g. โอนเงินสำเร็จ, รายการสำเร็จ, Successful)?
4. Receiver Name: Is the receiver's name "นาย อิทธิพัทธ์ ธีรโรจน์วิทย์" or "อิทธิพัทธ์ ธีรโรจน์วิทย์" (or similar spelling in English if applicable)?
5. Payment Method: Is the payment sent via PromptPay (พร้อมเพย์) or to a phone number/national ID?
6. Receiver Account: Does the receiver's PromptPay number or account number end with "8459"?
7. Date & Time: Extract the date and time of the transfer from the slip.
   - The transfer time MUST NOT be in the future compared to ${currentDateTimeTh} (it can be exactly the same time, but not later).
   - The transfer time MUST NOT be older than ${threeHoursAgoTh} (must be within the last 3 hours).

If ALL conditions 1-7 are met perfectly, respond with a JSON object: {"isValid": true, "reason": "ตรวจสอบสลิปถูกต้องเรียบร้อย"}
If ANY condition fails, respond with a JSON object: {"isValid": false, "reason": "ระบุเหตุผลที่ชัดเจนเป็นภาษาไทยว่าทำไมถึงไม่ผ่านการตรวจสอบ เช่น ชื่อผู้รับไม่ใช่ อิทธิพัทธ์ ธีรโรจน์วิทย์, เวลาโอนในสลิปอยู่ในอนาคต, สลิปเก่าเกิน 3 ชั่วโมง, จำนวนเงินไม่ตรง, หรือไม่ใช่เบอร์พร้อมเพย์ที่ลงท้ายด้วย 8459"}

Return ONLY the raw JSON object. Do not use Markdown formatting.`;

      const response = await client.models.generateContent({
        model: "gemini-3.8-flash",
        contents: [
          prompt,
          {
            inlineData: {
              data: base64Data,
              mimeType: "image/jpeg"
            }
          }
        ]
      });

      const responseText = response.text || "{}";
      const cleanJson = responseText.replace(/\`\`\`json|\`\`\`/g, '').trim();
      let result;
      try {
        result = JSON.parse(cleanJson);
      } catch (parseErr) {
        result = { isValid: false, reason: "ไม่สามารถอ่านข้อมูลจากภาพได้ชัดเจน โปรดถ่ายภาพให้ชัดขึ้น" };
      }
      
      res.json(result);
    } catch (e: any) {
      console.error("Verify Slip API Error:", e);
      res.status(500).json({ error: e.message || "Slip verification failed" });
    }
  });

  function fetchGoogleTTSChunk(text: string, langCode: string): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(text)}&tl=${encodeURIComponent(langCode)}&client=tw-ob`;
      const req = https.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      }, res => {
        if (res.statusCode !== 200) {
          return reject(new Error(`Google TTS HTTP ${res.statusCode}`));
        }
        const chunks: Buffer[] = [];
        res.on('data', d => chunks.push(d));
        res.on('end', () => resolve(Buffer.concat(chunks)));
      });
      req.on('error', reject);
      req.setTimeout(8000, () => {
        req.destroy();
        reject(new Error('Google TTS request timeout'));
      });
    });
  }

  async function synthesizeWithGoogleTTS(text: string, langCode: string): Promise<Buffer> {
    const clean = text.trim();
    if (!clean) return Buffer.alloc(0);

    if (clean.length <= 180) {
      return await fetchGoogleTTSChunk(clean, langCode);
    }

    const parts = clean.split(/([.,!?;:\n。！？；：\s]+)/);
    const chunks: string[] = [];
    let current = '';

    for (const part of parts) {
      if ((current + part).length > 180) {
        if (current.trim()) chunks.push(current.trim());
        current = part;
      } else {
        current += part;
      }
    }
    if (current.trim()) chunks.push(current.trim());
    if (chunks.length === 0) chunks.push(clean.slice(0, 180));

    const buffers: Buffer[] = [];
    for (const chunk of chunks) {
      buffers.push(await fetchGoogleTTSChunk(chunk, langCode));
    }
    return Buffer.concat(buffers);
  }

  app.post("/api/synthesize", async (req, res) => {
    try {
      const { text, lang, voice: customVoice, rate: customRate } = req.body;
      if (!text) {
        return res.status(400).json({ error: "Missing text" });
      }

      // Default English voice to cool, clear male voice: en-US-ChristopherNeural
      let voice = 'en-US-ChristopherNeural';
      let edgeLang = 'en-US';
      let googleLang = 'en';

      if (lang === 'CN' || lang === 'ZH' || lang === 'Chinese') {
          voice = 'zh-CN-XiaoxiaoNeural';
          edgeLang = 'zh-CN';
          googleLang = 'zh-CN';
      } else if (lang === 'TH' || lang === 'Thai') {
          voice = 'th-TH-NiwatNeural';
          edgeLang = 'th-TH';
          googleLang = 'th';
      } else if (lang === 'JP' || lang === 'JA' || lang === 'Japanese') {
          voice = 'ja-JP-NanamiNeural';
          edgeLang = 'ja-JP';
          googleLang = 'ja';
      } else if (lang === 'KR' || lang === 'KO' || lang === 'Korean') {
          voice = 'ko-KR-SunHiNeural';
          edgeLang = 'ko-KR';
          googleLang = 'ko';
      } else if (lang === 'French') {
          voice = 'fr-FR-DeniseNeural';
          edgeLang = 'fr-FR';
          googleLang = 'fr';
      } else if (lang === 'Spanish') {
          voice = 'es-ES-ElviraNeural';
          edgeLang = 'es-ES';
          googleLang = 'es';
      } else if (lang === 'German') {
          voice = 'de-DE-KatjaNeural';
          edgeLang = 'de-DE';
          googleLang = 'de';
      } else if (lang === 'Italian') {
          voice = 'it-IT-ElsaNeural';
          edgeLang = 'it-IT';
          googleLang = 'it';
      } else if (lang === 'Russian') {
          voice = 'ru-RU-SvetlanaNeural';
          edgeLang = 'ru-RU';
          googleLang = 'ru';
      } else if (lang === 'Arabic') {
          voice = 'ar-SA-ZariyahNeural';
          edgeLang = 'ar-SA';
          googleLang = 'ar';
      } else if (lang === 'Hindi') {
          voice = 'hi-IN-SwaraNeural';
          edgeLang = 'hi-IN';
          googleLang = 'hi';
      } else if (lang === 'Portuguese') {
          voice = 'pt-BR-FranciscaNeural';
          edgeLang = 'pt-BR';
          googleLang = 'pt';
      } else if (lang === 'Vietnamese') {
          voice = 'vi-VN-HoaiMyNeural';
          edgeLang = 'vi-VN';
          googleLang = 'vi';
      }

      // If a custom valid voice is requested, use it
      if (customVoice) {
        voice = customVoice;
      }

      const cacheKey = `${voice}:${text}:${customRate || ""}`;
      if (ttsCache.has(cacheKey)) {
        return res.json({ audio: ttsCache.get(cacheKey) });
      }

      let audioData: string | null = null;
      let isEdgeVoice = false;

      // 1. Synthesize with Microsoft Edge TTS v2 engine (Niwat for Thai male AI voice, Christopher for English male, etc.)
      try {
        const edgeRate = customRate || "+0%";
        const buf = await synthesizeEdgeTTS(text, voice, edgeRate);
        if (buf && buf.length > 0) {
          audioData = buf.toString('base64');
          isEdgeVoice = true;
        }
      } catch (edgeErr: any) {
        console.warn(`[TTS] EdgeTTS attempt 1 failed (${edgeErr?.message || edgeErr}), retrying...`);
        try {
          const buf = await synthesizeEdgeTTS(text, voice, customRate || "+0%");
          if (buf && buf.length > 0) {
            audioData = buf.toString('base64');
            isEdgeVoice = true;
          }
        } catch (retryErr: any) {
          console.warn(`[TTS] EdgeTTS retry failed (${retryErr?.message || retryErr}), falling back to Google TTS engine...`);
        }
      }

      // 2. Seamless fallback to Google TTS engine
      if (!audioData) {
        try {
          const googleBuf = await synthesizeWithGoogleTTS(text, googleLang);
          if (googleBuf && googleBuf.length > 0) {
            audioData = googleBuf.toString('base64');
          }
        } catch (googleErr: any) {
          console.warn("[TTS] Google TTS fallback error:", googleErr?.message || googleErr);
        }
      }

      if (audioData) {
        // Only cache if generated by the authentic Edge voice (so temporary fallback audio is not permanently stored)
        if (isEdgeVoice) {
          ttsCache.set(cacheKey, audioData);
          if (ttsCache.size > 500) {
              const firstKey = ttsCache.keys().next().value;
              if (firstKey) ttsCache.delete(firstKey);
          }
        }
        return res.json({ audio: audioData });
      } else {
        return res.status(500).json({ error: "Failed to generate audio" });
      }
    } catch (e: any) {
      console.error("TTS General Error:", e);
      res.status(500).json({ error: e.message || "TTS failed" });
    }
  });

  // =========================================================================
  // REAL-LIFE ROLEPLAY MISSIONS API (STRICT ZERO-OWNER-COST ISOLATION)
  // - BYOK calls: strictly use customer BYOK key on Flash-Lite bucket (1,000 RPD)
  // - Credit calls: only use server key when paidWithCredits / paidCallWithCredits is true
  // =========================================================================
  app.post("/api/roleplay-report", requireFirebaseAuth, async (req, res) => {
    try {
      const {
        mission,
        lang = "EN",
        transcript = [],
        completedObjectives = [false, false, false],
        durationSeconds = 0,
        useByokQuota = false,
        byokKey,
        paidCallWithCredits = false,
        paidWithCredits = false,
      } = req.body || {};

      if (!mission || !mission.id) {
        return res.status(400).json({ error: "Missing mission payload" });
      }

      const targetLang: "EN" | "CN" = lang === "CN" ? "CN" : "EN";
      const safeTranscript: Array<{ role: "user" | "model"; text: string }> = Array.isArray(transcript)
        ? transcript
            .filter((t: any) => t && typeof t.text === "string" && t.text.trim().length > 0)
            .map((t: any) => ({
              role: t.role === "user" ? "user" : "model",
              text: t.text.trim(),
            }))
        : [];

      const liveCompleted: [boolean, boolean, boolean] = [
        Boolean(completedObjectives?.[0]),
        Boolean(completedObjectives?.[1]),
        Boolean(completedObjectives?.[2]),
      ];

      const userTurns = safeTranscript.filter((t) => t.role === "user");
      const userJoinedText = userTurns.map((t) => t.text).join(" ").trim();
      const userTokenCount =
        targetLang === "CN"
          ? userJoinedText.replace(/\s+/g, "").length
          : userJoinedText.split(/\s+/).filter(Boolean).length;

      const objectivesText: [string, string, string] = [
        String(mission.objectives?.[0] || "ภารกิจที่ 1"),
        String(mission.objectives?.[1] || "ภารกิจที่ 2"),
        String(mission.objectives?.[2] || "ภารกิจที่ 3"),
      ];

      const buildLocalSummary = (summaryTh: string) => {
        const objCount = liveCompleted.filter(Boolean).length;
        const fallbackScore = objCount === 3 ? 85 : objCount === 2 ? 70 : objCount === 1 ? 55 : 40;
        const stars = objCount === 3 ? 3 : objCount === 2 ? 2 : objCount === 1 ? 1 : 0;
        return {
          missionId: mission.id,
          missionTitle: mission.titleTh || mission.titleEn || "Roleplay Mission",
          lang: targetLang,
          durationSeconds: Number(durationSeconds) || 0,
          completedObjectives: liveCompleted,
          objectivesText,
          stars,
          overallScore: fallbackScore,
          metrics: {
            fluency: fallbackScore,
            grammar: fallbackScore,
            vocabulary: fallbackScore,
            naturalness: fallbackScore,
          },
          summaryTh,
          improvements: [],
          keyVocab: Array.isArray(mission.survivalKit)
            ? mission.survivalKit.slice(0, 4).map((p: any) => ({
                word: targetLang === "CN" ? p.cn : p.en,
                pinyin: targetLang === "CN" ? p.pinyin : undefined,
                meaningTh: p.th,
              }))
            : [],
          usedAiAnalysis: false,
        };
      };

      // Zero-waste short-circuit: if user barely spoke (< 4 words/chars), return an instant free local report
      if (userTurns.length === 0 || userTokenCount < 4) {
        const objCount = liveCompleted.filter(Boolean).length;
        const stars = objCount >= 2 ? 1 : 0;
        const baseScore = objCount > 0 ? Math.min(45, objCount * 20) : 0;
        const fallbackVocab = Array.isArray(mission.survivalKit)
          ? mission.survivalKit.slice(0, 3).map((p: any) => ({
              word: targetLang === "CN" ? p.cn : p.en,
              pinyin: targetLang === "CN" ? p.pinyin : undefined,
              meaningTh: p.th,
            }))
          : [];

        return res.json({
          missionId: mission.id,
          missionTitle: mission.titleTh || mission.titleEn || "Roleplay Mission",
          lang: targetLang,
          durationSeconds: Number(durationSeconds) || 0,
          completedObjectives: liveCompleted,
          objectivesText,
          stars,
          overallScore: baseScore,
          metrics: {
            fluency: baseScore,
            grammar: baseScore,
            vocabulary: baseScore,
            naturalness: baseScore,
          },
          summaryTh:
            "รอบนี้คุณยังพูดโต้ตอบน้อยไปนิดนึงครับ ลองกดฟังประโยคตัวช่วยใน 'การ์ดภารกิจ' แล้วลองโทรใหม่อีกรอบนะ พูดสั้นๆ ทีละประโยคได้เลย AI พร้อมรับส่งบทให้เต็มที่ครับ!",
          improvements: [],
          keyVocab: fallbackVocab,
          usedAiAnalysis: false,
        });
      }

      const cleanByok = typeof byokKey === "string" && byokKey.trim().length > 15 ? byokKey.trim() : null;
      const isCreditPaid = Boolean(paidCallWithCredits || paidWithCredits);
      const shouldUseByok = Boolean(useByokQuota && !isCreditPaid && cleanByok);
      const canUseServerKey = !shouldUseByok && isCreditPaid;

      // STRICT 0-COST GUARD: If neither BYOK nor a credit-paid call, NEVER call owner's server key!
      if (!shouldUseByok && !canUseServerKey) {
        return res.json(
          buildLocalSummary(
            "สรุปผลตามภารกิจเรียบร้อยครับ! เลือก \"วิเคราะห์เจาะลึกด้วย AI\" เพื่อดูคำแนะนำละเอียดและประโยคอัพเกรด (ใช้ BYOK ฟรี 100 ครั้ง/วัน หรือ 1 เครดิต)"
          )
        );
      }

      const dialogueText = safeTranscript
        .slice(-40)
        .map((t) => `${t.role === "user" ? "Learner" : mission.aiRoleName || "AI"}: ${t.text}`)
        .join("\n");

      const reportSchema = {
        type: Type.OBJECT,
        properties: {
          verifiedObjectives: {
            type: Type.ARRAY,
            items: { type: Type.BOOLEAN },
            description: "Exactly 3 booleans indicating whether the learner genuinely achieved Objective 1, 2, and 3 in the conversation.",
          },
          overallScore: { type: Type.INTEGER, description: "Overall score from 0 to 100" },
          metrics: {
            type: Type.OBJECT,
            properties: {
              fluency: { type: Type.INTEGER },
              grammar: { type: Type.INTEGER },
              vocabulary: { type: Type.INTEGER },
              naturalness: { type: Type.INTEGER },
            },
            required: ["fluency", "grammar", "vocabulary", "naturalness"],
          },
          summaryTh: {
            type: Type.STRING,
            description: "Warm, encouraging, concrete 2-3 sentence Thai coach feedback summarizing strengths and next focus.",
          },
          improvements: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                said: { type: Type.STRING, description: "What the learner actually said" },
                better: { type: Type.STRING, description: "More natural/accurate way to say it in target language" },
                pinyin: { type: Type.STRING, description: "Pinyin with tone marks if target language is Chinese, else empty string" },
                explanationTh: { type: Type.STRING, description: "Short clear Thai explanation of why this sounds better" },
              },
              required: ["said", "better", "explanationTh"],
            },
          },
          keyVocab: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                word: { type: Type.STRING },
                pinyin: { type: Type.STRING },
                meaningTh: { type: Type.STRING },
              },
              required: ["word", "meaningTh"],
            },
          },
        },
        required: [
          "verifiedObjectives",
          "overallScore",
          "metrics",
          "summaryTh",
          "improvements",
          "keyVocab",
        ],
      };

      const analysisPrompt = `You are a supportive, accurate ${targetLang === "CN" ? "Mandarin Chinese" : "English"} speaking coach evaluating a Thai learner's Real-Life Roleplay call.

MISSION:
- Title: ${mission.titleTh} (${mission.titleEn})
- Difficulty: ${mission.difficulty}
- Learner Role: ${mission.userRoleTh}
- AI Role: ${mission.aiRoleName} (${mission.aiRoleTitleEn})
- Objective 1: ${mission.objectives?.[0]} (${mission.objectivesEn?.[0] || ""})
- Objective 2: ${mission.objectives?.[1]} (${mission.objectivesEn?.[1] || ""})
- Objective 3: ${mission.objectives?.[2]} (${mission.objectivesEn?.[2] || ""})
- Objectives already ticked live during call: ${JSON.stringify(liveCompleted)}

TRANSCRIPT:
${dialogueText}

INSTRUCTIONS:
1. Verify all 3 objectives fairly based on the transcript (if the learner clearly communicated an objective, mark true).
2. Score 0-100 for overallScore and the 4 metrics (fluency, grammar, vocabulary, naturalness) calibrated to "${mission.difficulty}" difficulty. Be fair and encouraging.
3. Write summaryTh in warm, practical Thai (2-3 sentences).
4. Provide 1-3 concrete "improvements" quoting actual things the learner said ("said") and showing a more natural native version ("better") in ${targetLang === "CN" ? "simplified Chinese characters (with pinyin in pinyin field)" : "English"} plus concise Thai explanation ("explanationTh").
5. Provide 3-5 useful "keyVocab" phrases from this scenario (${targetLang === "CN" ? "Chinese + pinyin + Thai meaning" : "English + Thai meaning"}).
Return strict JSON matching the schema.`;

      const aiRes = await generateContentWithByokFallback({
        contents: analysisPrompt,
        useByokQuota: shouldUseByok,
        strictByokOnly: shouldUseByok,
        byokKey: shouldUseByok ? cleanByok : null,
        byokProfile: "flash_lite",
        serverDefaultModel: "gemini-3.8-flash",
        getServerClient: canUseServerKey ? getServerGeminiClient : undefined,
        config: {
          responseMimeType: "application/json",
          responseSchema: reportSchema,
        },
      });
      const aiResult = safeParseGeminiJson(aiRes.text || "{}");

      const finalCompleted: [boolean, boolean, boolean] = [
        liveCompleted[0] || Boolean(aiResult?.verifiedObjectives?.[0]),
        liveCompleted[1] || Boolean(aiResult?.verifiedObjectives?.[1]),
        liveCompleted[2] || Boolean(aiResult?.verifiedObjectives?.[2]),
      ];

      const clamp = (n: any, fallback = 65) => {
        const v = Number(n);
        return Number.isFinite(v) ? Math.max(0, Math.min(100, Math.round(v))) : fallback;
      };

      const overallScore = clamp(aiResult?.overallScore, 70);
      const objCount = finalCompleted.filter(Boolean).length;

      let stars = 0;
      if (objCount === 3 && overallScore >= 80) stars = 3;
      else if (objCount >= 2 && overallScore >= 60) stars = 2;
      else if (objCount >= 1 || overallScore >= 45) stars = 1;

      return res.json({
        missionId: mission.id,
        missionTitle: mission.titleTh || mission.titleEn || "Roleplay Mission",
        lang: targetLang,
        durationSeconds: Number(durationSeconds) || 0,
        completedObjectives: finalCompleted,
        objectivesText,
        stars,
        overallScore,
        metrics: {
          fluency: clamp(aiResult?.metrics?.fluency, overallScore),
          grammar: clamp(aiResult?.metrics?.grammar, overallScore),
          vocabulary: clamp(aiResult?.metrics?.vocabulary, overallScore),
          naturalness: clamp(aiResult?.metrics?.naturalness, overallScore),
        },
        summaryTh:
          typeof aiResult?.summaryTh === "string" && aiResult.summaryTh.trim()
            ? aiResult.summaryTh.trim()
            : "ทำได้ดีมากครับ! คุณกล้าสื่อสารและโต้ตอบตามสถานการณ์ได้เป็นธรรมชาติ ลองฝึกซ้ำเพื่อเก็บ 3 ดาวเต็มได้เลยครับ",
        improvements: Array.isArray(aiResult?.improvements)
          ? aiResult.improvements.slice(0, 3)
          : [],
        keyVocab: Array.isArray(aiResult?.keyVocab) ? aiResult.keyVocab.slice(0, 5) : [],
        usedAiAnalysis: true,
      });
    } catch (e: any) {
      console.error("[Roleplay Report API Error]:", e?.message || e);
      const isByok429 = Boolean(
        req.body?.useByokQuota &&
          !req.body?.paidWithCredits &&
          !req.body?.paidCallWithCredits &&
          (e instanceof ByokQuotaExhaustedError || isQuotaOrRateLimitError(e))
      );
      const isByokBadKey = Boolean(e instanceof ByokInvalidKeyError);
      // Graceful local fallback so the user ALWAYS gets a Report Card without crashing
      const {
        mission = {},
        lang = "EN",
        completedObjectives = [false, false, false],
        durationSeconds = 0,
      } = req.body || {};
      const finalCompleted: [boolean, boolean, boolean] = [
        Boolean(completedObjectives?.[0]),
        Boolean(completedObjectives?.[1]),
        Boolean(completedObjectives?.[2]),
      ];
      const objCount = finalCompleted.filter(Boolean).length;
      const fallbackScore = objCount === 3 ? 85 : objCount === 2 ? 70 : objCount === 1 ? 55 : 40;
      const stars = objCount === 3 ? 3 : objCount === 2 ? 2 : objCount === 1 ? 1 : 0;
      return res.json({
        missionId: mission.id || "unknown",
        missionTitle: mission.titleTh || "Roleplay Mission",
        lang: lang === "CN" ? "CN" : "EN",
        durationSeconds: Number(durationSeconds) || 0,
        completedObjectives: finalCompleted,
        objectivesText: mission.objectives || ["ภารกิจที่ 1", "ภารกิจที่ 2", "ภารกิจที่ 3"],
        stars,
        overallScore: fallbackScore,
        metrics: {
          fluency: fallbackScore,
          grammar: fallbackScore,
          vocabulary: fallbackScore,
          naturalness: fallbackScore,
        },
        summaryTh: isByok429
          ? "คีย์ฟรี BYOK ติดขีดจำกัดชั่วคราว (429) จึงแสดงสรุปผลแบบพื้นฐานให้ก่อน คุณสามารถกดวิเคราะห์ด้วย AI อีกครั้งหรือใช้ 1 เครดิตเพื่อดูคำแนะนำเชิงลึกได้ครับ"
          : "บันทึกผลการทำภารกิจเรียบร้อยแล้วครับ! ระบบวิเคราะห์ AI ช่วงนี้หนาแน่นจึงสรุปผลจากภารกิจที่คุณทำสำเร็จให้ก่อน สามารถฝึกซ้ำเพื่อพัฒนาความคล่องแคล่วได้ตลอดเลยครับ",
        improvements: [],
        keyVocab: Array.isArray(mission.survivalKit)
          ? mission.survivalKit.slice(0, 4).map((p: any) => ({
              word: lang === "CN" ? p.cn : p.en,
              pinyin: lang === "CN" ? p.pinyin : undefined,
              meaningTh: p.th,
            }))
          : [],
        usedAiAnalysis: false,
        byokQuotaExhausted: isByok429,
        byokInvalidKey: isByokBadKey,
      });
    }
  });

  app.post("/api/roleplay-custom-mission", requireFirebaseAuth, async (req, res) => {
    try {
      const {
        prompt,
        difficulty = "medium",
        lang = "EN",
        useByokQuota = false,
        byokKey,
        paidWithCredits = false,
      } = req.body || {};
      if (!prompt || typeof prompt !== "string" || prompt.trim().length < 4) {
        return res.status(400).json({ error: "กรุณาระบุสถานการณ์ที่อยากซ้อมพูดให้ชัดเจนอย่างน้อย 4 ตัวอักษรครับ" });
      }

      const safeDiff = ["easy", "medium", "hard"].includes(difficulty) ? difficulty : "medium";
      const cleanByok = typeof byokKey === "string" && byokKey.trim().length > 15 ? byokKey.trim() : null;
      const shouldUseByok = Boolean(useByokQuota && cleanByok);

      // STRICT 0-COST GUARD: Never touch owner's server API key unless user paid credits!
      if (!shouldUseByok && !paidWithCredits) {
        return res.status(402).json({
          creditRequired: true,
          error: "กรุณาเชื่อมคีย์ฟรี BYOK (ฟรี 30 ด่าน/วัน) หรือยืนยันใช้ 1 เครดิตเพื่อสร้างด่านจำลองสถานการณ์เองครับ",
        });
      }

      const customSchema = {
        type: Type.OBJECT,
        properties: {
          titleTh: { type: Type.STRING },
          titleEn: { type: Type.STRING },
          location: { type: Type.STRING },
          aiRoleName: { type: Type.STRING },
          aiRoleTitleTh: { type: Type.STRING },
          aiRoleTitleEn: { type: Type.STRING },
          aiVoiceGender: { type: Type.STRING, enum: ["male", "female"] },
          userRoleTh: { type: Type.STRING },
          scenarioTh: { type: Type.STRING },
          objectives: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: "Exactly 3 concrete, actionable objectives in Thai",
          },
          objectivesEn: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: "Exactly 3 matching concrete objectives in English",
          },
          openingLineEn: { type: Type.STRING, description: "Natural first line the AI character speaks in English" },
          openingLineCn: { type: Type.STRING, description: "Natural first line the AI character speaks in pure Simplified Chinese characters (NO pinyin, NO English letters)" },
          twistTh: { type: Type.STRING, description: "Optional short realistic complication in Thai (for medium/hard, or empty for easy)" },
          twistEn: { type: Type.STRING, description: "Optional matching complication in English" },
          survivalKit: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                en: { type: Type.STRING },
                cn: { type: Type.STRING },
                pinyin: { type: Type.STRING },
                th: { type: Type.STRING },
              },
              required: ["en", "cn", "pinyin", "th"],
            },
          },
        },
        required: [
          "titleTh",
          "titleEn",
          "location",
          "aiRoleName",
          "aiRoleTitleTh",
          "aiRoleTitleEn",
          "aiVoiceGender",
          "userRoleTh",
          "scenarioTh",
          "objectives",
          "objectivesEn",
          "openingLineEn",
          "openingLineCn",
          "survivalKit",
        ],
      };

      const genPrompt = `Create a realistic, engaging Real-Life Speaking Roleplay Mission for a Thai language learner (currently practicing ${lang === "CN" ? "Mandarin Chinese" : "English"}, difficulty: ${safeDiff}).
User's custom scenario request: "${prompt.trim().slice(0, 400)}"

Requirements:
- Keep all Thai descriptions natural, clear, and concise.
- Exactly 3 concrete, achievable objectives (objectives in Thai, objectivesEn in English).
- openingLineCn MUST use pure Simplified Chinese characters ONLY (no English letters, no Pinyin).
- Exactly 4 practical Survival Kit phrases (each with en, cn, pinyin with tone marks, and th).
- For medium or hard difficulty, include a realistic twist (twistTh & twistEn); for easy, leave twistTh/twistEn empty.
Return strict JSON matching the schema.`;

      const aiRes = await generateContentWithByokFallback({
        contents: genPrompt,
        useByokQuota: shouldUseByok,
        strictByokOnly: shouldUseByok,
        byokKey: shouldUseByok ? cleanByok : null,
        byokProfile: "flash_lite",
        serverDefaultModel: "gemini-3.8-flash",
        getServerClient: paidWithCredits ? getServerGeminiClient : undefined,
        config: {
          responseMimeType: "application/json",
          responseSchema: customSchema,
        },
      });
      const generated = safeParseGeminiJson(aiRes.text || "{}");

      const customMission = {
        id: `custom_${Date.now()}`,
        number: 0,
        category: "daily",
        difficulty: safeDiff,
        titleTh: generated.titleTh || prompt.trim().slice(0, 40),
        titleEn: generated.titleEn || "Custom Roleplay",
        location: generated.location || "Custom Scenario",
        aiRoleName: generated.aiRoleName || "Alex",
        aiRoleTitleTh: generated.aiRoleTitleTh || "คู่สนทนา AI",
        aiRoleTitleEn: generated.aiRoleTitleEn || "Conversation Partner",
        aiVoiceGender: generated.aiVoiceGender === "female" ? "female" : "male",
        userRoleTh: generated.userRoleTh || "ตัวคุณเอง",
        scenarioTh: generated.scenarioTh || prompt.trim(),
        objectives: [
          generated.objectives?.[0] || "ทักทายและเปิดประเด็นตามสถานการณ์",
          generated.objectives?.[1] || "สื่อสารรายละเอียดหรือความต้องการหลัก",
          generated.objectives?.[2] || "สรุปข้อตกลงและกล่าวลาอย่างสุภาพ",
        ],
        objectivesEn: [
          generated.objectivesEn?.[0] || "Greet and introduce the situation",
          generated.objectivesEn?.[1] || "Communicate your main request or point clearly",
          generated.objectivesEn?.[2] || "Confirm the outcome and wrap up politely",
        ],
        openingLineEn: generated.openingLineEn || "Hi there! How can I help you today?",
        openingLineCn: generated.openingLineCn || "你好！请问今天有什么可以帮你的？",
        twistTh: generated.twistTh || undefined,
        twistEn: generated.twistEn || undefined,
        survivalKit: Array.isArray(generated.survivalKit) ? generated.survivalKit.slice(0, 4) : [],
        isCustom: true,
      };

      return res.json({ mission: customMission, usedByok: aiRes.usedByok, modelUsed: aiRes.modelUsed });
    } catch (e: any) {
      console.error("[Custom Roleplay API Error]:", e?.message || e);
      if (e instanceof ByokInvalidKeyError) {
        return res.status(400).json({ byokInvalidKey: true, error: e.message });
      }
      if (e instanceof ByokQuotaExhaustedError || (req.body?.useByokQuota && isQuotaOrRateLimitError(e))) {
        return res.status(429).json({
          byokQuotaExhausted: true,
          error: e?.message || "Google API Key ส่วนตัวติดขีดจำกัดชั่วคราว (429)",
        });
      }
      return res.status(500).json({
        error: e?.message || "ไม่สามารถสร้างด่านจำลองได้ในขณะนี้ กรุณาลองใหม่อีกครั้งครับ",
      });
    }
  });

  // =========================================================================
  // GRADED READING STUDIO — CUSTOM ARTICLE ANALYSIS API (BYOK / 2 CREDITS)
  // =========================================================================
  app.post("/api/shadowing/analyze", requireFirebaseAuth, express.json({ limit: "8mb" }), async (req, res) => {
    const reqPaidWithCredits = Boolean(req.body?.paidWithCredits);
    const reqByok = typeof req.body?.byokKey === "string" && req.body.byokKey.trim().length > 15 ? req.body.byokKey.trim() : null;
    const wasByokRequest = Boolean(!reqPaidWithCredits && reqByok);
    try {
      const { audioBase64, mimeType, sentence, lang = "EN" } = req.body || {};

      if (!sentence || typeof sentence !== "string" || sentence.trim().length < 1 || sentence.trim().length > 500) {
        return res.status(400).json({ error: "ประโยคต้นแบบไม่ถูกต้อง" });
      }
      if (!audioBase64 || typeof audioBase64 !== "string" || audioBase64.length < 100) {
        return res.status(400).json({ error: "ไม่พบข้อมูลเสียงที่บันทึกไว้ กรุณาลองอัดเสียงใหม่อีกครั้ง" });
      }
      if (audioBase64.length > 6 * 1024 * 1024) {
        return res.status(400).json({ error: "ไฟล์เสียงยาวเกินไป กรุณาพูดให้กระชับภายใน 20 วินาที" });
      }

      const shouldUseByok = wasByokRequest;
      const canUseServerKey = reqPaidWithCredits;
      if (!shouldUseByok && !canUseServerKey) {
        return res.status(400).json({
          byokRequired: true,
          error: "ต้องเชื่อมคีย์ฟรี BYOK (100 ครั้ง/วัน) หรือใช้ 1 เครดิตในแอปเพื่อใช้ AI วิเคราะห์เสียงพูด",
        });
      }

      const safeLang: "EN" | "CN" = lang === "CN" ? "CN" : "EN";
      const rawBaseMime =
        typeof mimeType === "string" ? mimeType.split(";")[0].trim().toLowerCase() : "audio/webm";
      const ALLOWED_AUDIO_MIMES: Record<string, string> = {
        "audio/webm": "audio/webm",
        "audio/mp4": "audio/mp4",
        "audio/m4a": "audio/mp4",
        "audio/x-m4a": "audio/mp4",
        "audio/ogg": "audio/ogg",
        "audio/wav": "audio/wav",
        "audio/x-wav": "audio/wav",
        "audio/mpeg": "audio/mpeg",
        "audio/mp3": "audio/mpeg",
        "audio/aac": "audio/aac",
      };
      const cleanMime = ALLOWED_AUDIO_MIMES[rawBaseMime] || "audio/webm";

      const shadowingSchema = {
        type: Type.OBJECT,
        properties: {
          heardSpeech: {
            type: Type.BOOLEAN,
            description: "True if human speech is audible in the clip; false ONLY if completely silent or pure background noise.",
          },
          transcript: {
            type: Type.STRING,
            description:
              safeLang === "CN"
                ? "Literal Simplified Chinese transcription of what the speaker actually said (no pinyin, no English, do not invent words they skipped)."
                : "Literal English transcription of what the speaker actually said (do not invent words they skipped).",
          },
          pronunciationScore: {
            type: Type.INTEGER,
            description: "Overall pronunciation & delivery score from 0 to 100 based on clarity, natural rhythm/tones, and accuracy vs target sentence.",
          },
          feedbackTh: {
            type: Type.STRING,
            description: "Short, warm, specific coaching feedback in natural Thai (1-2 concise sentences).",
          },
          tipsTh: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: "1 to 3 concrete, actionable pronunciation/tone tips in Thai pointing out specific words or sounds to improve (empty if score >= 95).",
          },
        },
        required: ["heardSpeech", "transcript", "pronunciationScore", "feedbackTh", "tipsTh"],
      };

      const targetClean = sentence.trim();
      const promptText = `You are a supportive, accurate ${
        safeLang === "CN" ? "Mandarin Chinese" : "English"
      } pronunciation coach for a Thai learner practicing sentence shadowing.

Target sentence: "${targetClean}"

Listen carefully to the attached audio recording and return strict JSON:
1. heardSpeech: true if you can hear the learner speaking; false ONLY if the audio is completely silent or pure noise with zero speech.
2. transcript: Write literally what the learner actually spoke in ${
        safeLang === "CN" ? "Simplified Chinese characters ONLY (no Pinyin)" : "English"
      }. If they skipped a word or mispronounced it as a different word, reflect what they actually said rather than copying the target sentence blindly.
3. pronunciationScore: Integer 0-100 grading overall clarity, ${
        safeLang === "CN" ? "Mandarin tones (เสียงวรรณยุกต์ 1-4), initials/finals," : "word stress, ending sounds (-s, -ed, -t), rhythm,"
      } and match to the target sentence.
4. feedbackTh: 1-2 encouraging, specific sentences in natural Thai summarizing what sounded good and what to polish.
5. tipsTh: 1-3 short bullet tips in Thai (e.g., pointing out a specific word's ending sound or a Chinese tone pair). Keep each tip under 18 words.`;

      // Uses BYOK key when active OR server key ONLY when paidWithCredits is explicitly true
      const aiRes = await generateContentWithByokFallback({
        contents: {
          parts: [
            {
              inlineData: {
                mimeType: cleanMime,
                data: audioBase64,
              },
            },
            { text: promptText },
          ],
        },
        useByokQuota: wasByokRequest,
        strictByokOnly: wasByokRequest,
        byokKey: wasByokRequest ? reqByok : null,
        byokProfile: "flash_lite",
        serverDefaultModel: "gemini-3.8-flash",
        getServerClient: reqPaidWithCredits ? getServerGeminiClient : undefined,
        config: {
          responseMimeType: "application/json",
          responseSchema: shadowingSchema,
        },
      });

      const parsed = safeParseGeminiJson<{
        heardSpeech?: boolean;
        transcript?: string;
        pronunciationScore?: number;
        feedbackTh?: string;
        tipsTh?: string[];
      }>(aiRes.text || "{}", {
        heardSpeech: false,
        transcript: "",
        pronunciationScore: 0,
        feedbackTh: "",
        tipsTh: [],
      });

      const transcript = typeof parsed.transcript === "string" ? parsed.transcript.trim() : "";
      const heardSpeech = Boolean(parsed.heardSpeech && transcript.length > 0);
      const rawScore = Number(parsed.pronunciationScore);
      const pronunciationScore = Number.isFinite(rawScore)
        ? Math.max(0, Math.min(100, Math.round(rawScore)))
        : 0;
      const feedbackTh = typeof parsed.feedbackTh === "string" ? parsed.feedbackTh.trim() : "";
      const tipsTh = Array.isArray(parsed.tipsTh)
        ? parsed.tipsTh.filter((t): t is string => typeof t === "string" && t.trim().length > 0).slice(0, 3)
        : [];

      return res.json({
        heardSpeech,
        transcript,
        pronunciationScore,
        feedbackTh,
        tipsTh,
        usedByok: aiRes.usedByok,
        modelUsed: aiRes.modelUsed,
      });
    } catch (error: any) {
      console.error("[/api/shadowing/analyze] Error:", error?.message || error);
      if (error instanceof ByokInvalidKeyError) {
        return res.status(401).json({
          byokInvalidKey: true,
          error: error.message,
        });
      }
      if (wasByokRequest && (error instanceof ByokQuotaExhaustedError || isQuotaOrRateLimitError(error))) {
        return res.status(429).json({
          byokQuotaExhausted: true,
          error: "คีย์ฟรี BYOK ติดลิมิตชั่วคราว (429) คุณสามารถใช้ 1 เครดิตในแอปเพื่อตรวจเสียงต่อ หรือกดฟังเทียบต้นฉบับได้ฟรีทันที",
        });
      }
      if (isQuotaOrRateLimitError(error)) {
        return res.status(429).json({
          error: "เซิร์ฟเวอร์ AI หนาแน่นชั่วคราว กรุณาลองใหม่อีกครั้งในอีกสักครู่ครับ",
        });
      }
      return res.status(500).json({
        error: "ไม่สามารถวิเคราะห์เสียงด้วย AI ได้ชั่วคราว แต่คุณยังกดฟังเสียงที่อัดเทียบต้นฉบับได้ปกติครับ",
      });
    }
  });

  // =========================================================================
  // SMART TRANSLATOR STUDIO — FREE BASIC PROXY (0 BAHT) + STRICT BYOK AI
  // =========================================================================
  const basicTranslateCache = new Map<string, {
    translatedText: string;
    reading?: string;
    sourceReading?: string;
    detectedSourceLang: "TH" | "EN" | "CN" | "JP" | "KR";
    engine: "google_free" | "bing_free" | "simply_free" | "mymemory_free";
    ts: number;
  }>();

  const TRANSLATOR_LANG_TO_GOOGLE: Record<string, string> = {
    AUTO: "auto",
    TH: "th",
    EN: "en",
    CN: "zh-CN",
    JP: "ja",
    KR: "ko",
  };

  const TRANSLATOR_LANG_TO_BING: Record<string, string> = {
    AUTO: "auto-detect",
    TH: "th",
    EN: "en",
    CN: "zh-Hans",
    JP: "ja",
    KR: "ko",
  };

  const TRANSLATOR_LANG_TO_ICIBA: Record<string, string> = {
    TH: "th",
    EN: "en",
    CN: "zh-cn",
    JP: "ja",
    KR: "ko",
  };

  const TRANSLATOR_LANG_FULL_NAME: Record<"TH" | "EN" | "CN" | "JP" | "KR", string> = {
    TH: "Thai (ภาษาไทย)",
    EN: "English",
    CN: "Mandarin Chinese (Simplified Chinese 简体中文)",
    JP: "Japanese (日本語)",
    KR: "Korean (한국어)",
  };

  const normalizeDetectedTranslatorLang = (raw?: string): "TH" | "EN" | "CN" | "JP" | "KR" => {
    const code = String(raw || "").toLowerCase();
    if (code.startsWith("th")) return "TH";
    if (code.startsWith("zh") || code === "cn") return "CN";
    if (code.startsWith("ja") || code === "jp") return "JP";
    if (code.startsWith("ko") || code === "kr") return "KR";
    return "EN";
  };

  const normalizeTargetTranslatorLang = (raw?: string): "TH" | "EN" | "CN" | "JP" | "KR" => {
    if (raw === "TH" || raw === "EN" || raw === "CN" || raw === "JP" || raw === "KR") return raw;
    return "TH";
  };

  const detectLangHeuristic = (text: string): "TH" | "EN" | "CN" | "JP" | "KR" => {
    if (/[\u0E00-\u0E7F]/.test(text)) return "TH";
    if (/[\u3040-\u30FF]/.test(text)) return "JP";
    if (/[\uAC00-\uD7AF\u1100-\u11FF]/.test(text)) return "KR";
    if (/[\u4E00-\u9FFF]/.test(text)) return "CN";
    return "EN";
  };

  let googleBlockedUntil = 0;

  interface BingSession {
    ua: string;
    cookies: string;
    ig: string;
    key: string;
    token: string;
    iid: string;
    expiresAt: number;
  }
  let cachedBingSession: BingSession | null = null;
  let bingSessionPromise: Promise<BingSession | null> | null = null;

  const getBingTranslatorSession = async (forceRefresh = false): Promise<BingSession | null> => {
    if (!forceRefresh && cachedBingSession && Date.now() < cachedBingSession.expiresAt) {
      return cachedBingSession;
    }
    if (!forceRefresh && bingSessionPromise) {
      return bingSessionPromise;
    }
    bingSessionPromise = (async () => {
      try {
        const ua =
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 7000);
        const page = await fetch("https://www.bing.com/translator", {
          headers: { "User-Agent": ua },
          signal: controller.signal,
        });
        clearTimeout(timeout);
        if (!page.ok) return null;

        const setCookiesFn = (page.headers as any).getSetCookie;
        const cookies =
          typeof setCookiesFn === "function"
            ? (setCookiesFn.call(page.headers) as string[])
                .map((c) => c.split(";")[0])
                .join("; ")
            : "";
        const html = await page.text();
        const ig = html.match(/IG:"([^"]+)"/)?.[1];
        const paramsMatch = html.match(/params_AbusePreventionHelper\s*=\s*\[(\d+),"([^"]+)",(\d+)\]/);
        const iid = html.match(/data-iid="([^"]+)"/)?.[1] || "translator.5023";
        if (!ig || !paramsMatch) return null;

        const session: BingSession = {
          ua,
          cookies,
          ig,
          key: paramsMatch[1],
          token: paramsMatch[2],
          iid,
          expiresAt: Date.now() + 8 * 60 * 1000,
        };
        cachedBingSession = session;
        return session;
      } catch (err: any) {
        console.warn("[Bing Translator] Session fetch error:", err?.message || err);
        return null;
      } finally {
        bingSessionPromise = null;
      }
    })();
    return bingSessionPromise;
  };

  const splitTextChunks = (text: string, maxLen = 450): string[] => {
    if (text.length <= maxLen) return [text];
    const chunks: string[] = [];
    let remaining = text;
    while (remaining.length > maxLen) {
      let splitAt = remaining.lastIndexOf("\n", maxLen);
      if (splitAt < maxLen * 0.4) splitAt = remaining.lastIndexOf(". ", maxLen);
      if (splitAt < maxLen * 0.4) splitAt = remaining.lastIndexOf(" ", maxLen);
      if (splitAt < maxLen * 0.4) splitAt = maxLen;
      chunks.push(remaining.slice(0, splitAt + 1).trim());
      remaining = remaining.slice(splitAt + 1).trim();
    }
    if (remaining) chunks.push(remaining);
    return chunks.filter(Boolean);
  };

  const translateViaBingChunk = async (
    chunk: string,
    fromLang: string,
    toLang: string,
    allowRetry = true
  ): Promise<{
    text: string;
    reading?: string;
    sourceReading?: string;
    detectedLanguage?: string;
  } | null> => {
    const session = await getBingTranslatorSession(!allowRetry);
    if (!session) return null;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 7000);
      const res = await fetch(
        `https://www.bing.com/ttranslatev3?isVertical=1&&IG=${encodeURIComponent(
          session.ig
        )}&IID=${encodeURIComponent(session.iid)}.1`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "User-Agent": session.ua,
            Referer: "https://www.bing.com/translator",
            Origin: "https://www.bing.com",
            ...(session.cookies ? { Cookie: session.cookies } : {}),
          },
          body: new URLSearchParams({
            fromLang,
            text: chunk,
            to: toLang,
            token: session.token,
            key: session.key,
          }).toString(),
          signal: controller.signal,
        }
      );
      clearTimeout(timeout);

      if (!res.ok) {
        cachedBingSession = null;
        if (allowRetry) return translateViaBingChunk(chunk, fromLang, toLang, false);
        return null;
      }

      const data = await res.json();
      if (!Array.isArray(data) || !data[0] || !Array.isArray(data[0].translations) || !data[0].translations[0]) {
        cachedBingSession = null;
        if (allowRetry) return translateViaBingChunk(chunk, fromLang, toLang, false);
        return null;
      }

      const first = data[0];
      const tr = first.translations[0];
      const translated = typeof tr?.text === "string" ? tr.text.trim() : "";
      if (!translated) return null;

      const reading =
        typeof tr?.transliteration?.text === "string" ? tr.transliteration.text.trim() : undefined;
      const sourceReading =
        typeof data[1]?.inputTransliteration === "string"
          ? data[1].inputTransliteration.trim()
          : typeof first?.inputTransliteration === "string"
          ? first.inputTransliteration.trim()
          : undefined;
      const detectedLanguage =
        typeof first?.detectedLanguage?.language === "string"
          ? first.detectedLanguage.language
          : undefined;

      return { text: translated, reading, sourceReading, detectedLanguage };
    } catch (err: any) {
      cachedBingSession = null;
      if (allowRetry) return translateViaBingChunk(chunk, fromLang, toLang, false);
      console.warn("[Bing Translator] Request error:", err?.message || err);
      return null;
    }
  };

  app.post("/api/translate/basic", express.json({ limit: "256kb" }), async (req, res) => {
    try {
      const { text = "", sourceLang = "AUTO", targetLang = "EN" } = req.body || {};
      const cleanText = String(text || "").trim();
      if (!cleanText) {
        return res.status(400).json({ error: "กรุณาพิมพ์ข้อความที่ต้องการแปล" });
      }
      if (cleanText.length > 2000) {
        return res.status(400).json({ error: "ข้อความยาวเกิน 2,000 ตัวอักษร กรุณาแบ่งแปลทีละส่วน" });
      }

      const safeSource =
        sourceLang === "AUTO" || sourceLang === "TH" || sourceLang === "EN" || sourceLang === "CN" || sourceLang === "JP" || sourceLang === "KR"
          ? sourceLang
          : "AUTO";
      const safeTarget = normalizeTargetTranslatorLang(targetLang);

      // Short-circuit identical source & target
      if (safeSource !== "AUTO" && safeSource === safeTarget) {
        return res.json({
          translatedText: cleanText,
          detectedSourceLang: safeSource,
          engine: "bing_free",
        });
      }

      const cacheKey = `${safeSource}:${safeTarget}:${cleanText}`;
      const cached = basicTranslateCache.get(cacheKey);
      if (cached && Date.now() - cached.ts < 1000 * 60 * 60 * 6) {
        return res.json({
          translatedText: cached.translatedText,
          reading: cached.reading,
          sourceReading: cached.sourceReading,
          detectedSourceLang: cached.detectedSourceLang,
          engine: cached.engine,
        });
      }

      const sl = TRANSLATOR_LANG_TO_GOOGLE[safeSource] || "auto";
      const tl = TRANSLATOR_LANG_TO_GOOGLE[safeTarget] || "en";

      let translatedText = "";
      let reading = "";
      let sourceReading = "";
      let detectedSourceLang: "TH" | "EN" | "CN" | "JP" | "KR" =
        safeSource === "AUTO" ? detectLangHeuristic(cleanText) : safeSource;
      let engine: "google_free" | "bing_free" | "simply_free" | "mymemory_free" = "bing_free";

      // Engine 1: Keyless Google Translate web endpoint (auto-skipped during 10-min cooldown if rate-limited)
      if (Date.now() > googleBlockedUntil) {
        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 4500);
          const bodyParams = new URLSearchParams({ q: cleanText });
          const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${encodeURIComponent(
            sl
          )}&tl=${encodeURIComponent(tl)}&dt=t&dt=rm`;

          const gRes = await fetch(url, {
            method: "POST",
            headers: {
              "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
              "User-Agent": "Mozilla/5.0",
            },
            body: bodyParams.toString(),
            signal: controller.signal,
          });
          clearTimeout(timeout);

          const ct = gRes.headers.get("content-type") || "";
          if (gRes.ok && ct.includes("json")) {
            const gData = await gRes.json();
            if (Array.isArray(gData) && Array.isArray(gData[0])) {
              const segs: string[] = [];
              const readingSegs: string[] = [];
              const srcReadingSegs: string[] = [];
              for (const item of gData[0]) {
                if (Array.isArray(item)) {
                  if (typeof item[0] === "string" && item[0].length > 0) {
                    segs.push(item[0]);
                  }
                  if (typeof item[2] === "string" && item[2].trim()) {
                    readingSegs.push(item[2].trim());
                  }
                  if (typeof item[3] === "string" && item[3].trim()) {
                    srcReadingSegs.push(item[3].trim());
                  }
                }
              }
              translatedText = segs.join("").trim();
              reading = readingSegs.join(" ").trim();
              sourceReading = srcReadingSegs.join(" ").trim();
              engine = "google_free";
              if (typeof gData[2] === "string" && gData[2]) {
                detectedSourceLang = normalizeDetectedTranslatorLang(gData[2]);
              }
            }
          } else {
            googleBlockedUntil = Date.now() + 10 * 60 * 1000;
          }
        } catch (primaryErr: any) {
          googleBlockedUntil = Date.now() + 5 * 60 * 1000;
          console.warn("[/api/translate/basic] Google web fallback:", primaryErr?.message || primaryErr);
        }
      }

      // Engine 2: Free Bing / Microsoft Neural Translator (0 Baht, includes transliteration + auto-detect)
      if (!translatedText) {
        try {
          const bingFrom = TRANSLATOR_LANG_TO_BING[safeSource] || "auto-detect";
          const bingTo = TRANSLATOR_LANG_TO_BING[safeTarget] || "th";
          const chunks = splitTextChunks(cleanText, 850);
          const translatedParts: string[] = [];
          const readingParts: string[] = [];
          const srcReadingParts: string[] = [];
          for (const chunk of chunks) {
            const part = await translateViaBingChunk(chunk, bingFrom, bingTo);
            if (!part) {
              translatedParts.length = 0;
              break;
            }
            translatedParts.push(part.text);
            if (part.reading) readingParts.push(part.reading);
            if (part.sourceReading) srcReadingParts.push(part.sourceReading);
            if (part.detectedLanguage && safeSource === "AUTO") {
              detectedSourceLang = normalizeDetectedTranslatorLang(part.detectedLanguage);
            }
          }
          if (translatedParts.length > 0) {
            translatedText = translatedParts.join(safeTarget === "CN" || safeTarget === "JP" ? "" : " ").trim();
            reading = readingParts.join(" ").trim();
            sourceReading = srcReadingParts.join(" ").trim();
            engine = "bing_free";
          }
        } catch (bingErr: any) {
          console.warn("[/api/translate/basic] Bing fallback failed:", bingErr?.message || bingErr);
        }
      }

      // Engine 3: SimplyTranslate (iciba engine, 0 Baht)
      if (!translatedText) {
        try {
          const effectiveSource = safeSource === "AUTO" ? detectLangHeuristic(cleanText) : safeSource;
          detectedSourceLang = effectiveSource;
          if (effectiveSource === safeTarget) {
            translatedText = cleanText;
            engine = "simply_free";
          } else {
            const icibaFrom = TRANSLATOR_LANG_TO_ICIBA[effectiveSource] || "en";
            const icibaTo = TRANSLATOR_LANG_TO_ICIBA[safeTarget] || "th";
            const chunks = splitTextChunks(cleanText, 450);
            const translatedParts: string[] = [];
            for (const chunk of chunks) {
              const controller = new AbortController();
              const timeout = setTimeout(() => controller.abort(), 7000);
              const stRes = await fetch(
                `https://simplytranslate.org/api/translate/?engine=iciba&from=${encodeURIComponent(
                  icibaFrom
                )}&to=${encodeURIComponent(icibaTo)}&text=${encodeURIComponent(chunk)}`,
                { signal: controller.signal }
              );
              clearTimeout(timeout);
              if (stRes.ok) {
                const stData = await stRes.json();
                const cand = stData?.translated_text;
                if (typeof cand === "string" && cand.trim()) {
                  translatedParts.push(cand.trim());
                }
              }
            }
            if (translatedParts.length > 0) {
              translatedText = translatedParts.join(safeTarget === "CN" || safeTarget === "JP" ? "" : " ").trim();
              engine = "simply_free";
            }
          }
        } catch (stErr: any) {
          console.warn("[/api/translate/basic] SimplyTranslate fallback failed:", stErr?.message || stErr);
        }
      }

      // Engine 4: Free MyMemory API (0 Baht cost, chunked cleanly for up to 2,000 chars)
      if (!translatedText) {
        try {
          const effectiveSource = safeSource === "AUTO" ? detectLangHeuristic(cleanText) : safeSource;
          detectedSourceLang = effectiveSource;
          if (effectiveSource === safeTarget) {
            translatedText = cleanText;
            engine = "mymemory_free";
          } else {
            const mmSl = TRANSLATOR_LANG_TO_GOOGLE[effectiveSource] || "en";
            const chunks = splitTextChunks(cleanText, 450);
            const translatedParts: string[] = [];
            for (const chunk of chunks) {
              const controller = new AbortController();
              const timeout = setTimeout(() => controller.abort(), 8000);
              const mmUrl = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(
                chunk
              )}&langpair=${encodeURIComponent(`${mmSl}|${tl}`)}`;
              const mmRes = await fetch(mmUrl, { signal: controller.signal });
              clearTimeout(timeout);
              if (mmRes.ok) {
                const mmData = await mmRes.json();
                const candidate = mmData?.responseData?.translatedText;
                if (
                  typeof candidate === "string" &&
                  candidate.trim() &&
                  !candidate.toUpperCase().includes("MYMEMORY WARNING")
                ) {
                  translatedParts.push(candidate.trim());
                }
              }
            }
            if (translatedParts.length > 0) {
              translatedText = translatedParts.join(safeTarget === "CN" || safeTarget === "JP" ? "" : " ").trim();
              engine = "mymemory_free";
            }
          }
        } catch (mmErr: any) {
          console.warn("[/api/translate/basic] MyMemory fallback failed:", mmErr?.message || mmErr);
        }
      }

      if (!translatedText) {
        return res.status(503).json({
          error: "บริการแปลพื้นฐานกำลังยุ่งชั่วคราว กรุณาลองกดแปลอีกครั้ง หรือสลับใช้โหมด AI เจาะลึก (BYOK)",
        });
      }

      if (basicTranslateCache.size >= 500) {
        const firstKey = basicTranslateCache.keys().next().value;
        if (firstKey) basicTranslateCache.delete(firstKey);
      }
      basicTranslateCache.set(cacheKey, {
        translatedText,
        reading: reading || undefined,
        sourceReading: sourceReading || undefined,
        detectedSourceLang,
        engine,
        ts: Date.now(),
      });

      return res.json({
        translatedText,
        reading: reading || undefined,
        sourceReading: sourceReading || undefined,
        detectedSourceLang,
        engine,
      });
    } catch (error: any) {
      console.error("[/api/translate/basic] Error:", error?.message || error);
      return res.status(500).json({ error: "เกิดข้อผิดพลาดระหว่างการแปลข้อความ กรุณาลองใหม่อีกครั้ง" });
    }
  });

  app.post("/api/translate/ai", requireFirebaseAuth, express.json({ limit: "256kb" }), async (req, res) => {
    const reqPaidWithCredits = Boolean(req.body?.paidWithCredits);
    const reqByok = typeof req.body?.byokKey === "string" && req.body.byokKey.trim().length > 15 ? req.body.byokKey.trim() : null;
    const wasByokRequest = Boolean(!reqPaidWithCredits && reqByok);
    try {
      const {
        mode = "deep",
        text = "",
        sourceLang = "AUTO",
        targetLang = "EN",
        tone = "polite",
        situation = "general",
      } = req.body || {};

      const cleanText = String(text || "").trim();
      if (!cleanText) {
        return res.status(400).json({ error: "กรุณาพิมพ์ข้อความที่ต้องการวิเคราะห์" });
      }
      if (cleanText.length > 2000) {
        return res.status(400).json({ error: "ข้อความยาวเกิน 2,000 ตัวอักษร กรุณาย่อข้อความก่อนส่ง" });
      }

      if (!wasByokRequest && !reqPaidWithCredits) {
        return res.status(400).json({
          byokRequired: true,
          error: "ต้องเชื่อมคีย์ฟรี BYOK (150 ครั้ง/วัน) หรือใช้ 1 เครดิตในแอปเพื่อใช้งานโหมด AI เจาะลึก (โหมดแปลพื้นฐานใช้ฟรีไม่อั้นได้ทันที)",
        });
      }

      const safeTarget = normalizeTargetTranslatorLang(targetLang);
      const safeTone =
        tone === "polite" || tone === "formal" || tone === "casual" || tone === "chat"
          ? tone
          : "polite";

      const toneGuideMap: Record<string, string> = {
        polite: "Polite, courteous, warm, and universally appropriate (สุภาพ ใช้ได้ทุกสถานการณ์)",
        formal: "Formal, professional, suitable for business emails, official requests, or respectful address (ทางการ)",
        casual: "Friendly, relaxed everyday spoken style for friends and peers (เป็นกันเอง)",
        chat: "Natural modern messaging/chat phrasing, concise and idiomatic like a real native speaker texting (แชทธรรมชาติ)",
      };

      if (mode === "polish") {
        const situationMap: Record<string, string> = {
          general: "General everyday communication",
          work_email: "Workplace email or professional message",
          friend_chat: "Casual chat with friends or social media",
          travel_service: "Travel, restaurant ordering, hotel, or customer service",
        };
        const safeSituation = situationMap[String(situation)] || situationMap.general;

        const polishSchema = {
          type: Type.OBJECT,
          properties: {
            polishedText: { type: Type.STRING },
            reading: { type: Type.STRING, description: "Pinyin with tone marks for CN, Romaji for JP, Revised Romanization for KR, IPA/stress tip for EN, empty for TH." },
            thaiPhonetic: { type: Type.STRING, description: "Natural Thai phonetic pronunciation guide if language is EN/CN/JP/KR, empty if TH." },
            meaningTh: { type: Type.STRING, description: "Natural Thai translation of the polished sentence." },
            overallFeedbackTh: { type: Type.STRING, description: "1-2 encouraging sentences in Thai explaining why the polished version sounds more natural." },
            changes: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  original: { type: Type.STRING },
                  improved: { type: Type.STRING },
                  reasonTh: { type: Type.STRING },
                },
                required: ["original", "improved", "reasonTh"],
              },
            },
            alternatives: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  toneLabelTh: { type: Type.STRING },
                  text: { type: Type.STRING },
                  reading: { type: Type.STRING },
                  nuanceTh: { type: Type.STRING },
                },
                required: ["toneLabelTh", "text", "nuanceTh"],
              },
            },
          },
          required: ["polishedText", "meaningTh", "overallFeedbackTh", "changes", "alternatives"],
        };

        const polishPrompt = `You are a native-level ${TRANSLATOR_LANG_FULL_NAME[safeTarget]} language editor coaching a Thai learner.
Rewrite and polish the learner's text so it sounds completely natural like a native speaker in ${TRANSLATOR_LANG_FULL_NAME[safeTarget]}.

Target Tone: ${toneGuideMap[safeTone]}
Context/Situation: ${safeSituation}
Learner's text:
"""
${cleanText}
"""

Return strict JSON:
- polishedText: Natural, idiomatic rewrite in ${TRANSLATOR_LANG_FULL_NAME[safeTarget]}.
- reading: Accurate Pinyin with tone marks (CN) / Romaji (JP) / Romanization (KR) / brief key pronunciation guide (EN) / empty string (TH).
- thaiPhonetic: Readable Thai phonetic transcription (คำอ่านไทย) for EN/CN/JP/KR (empty if TH).
- meaningTh: Clear, natural Thai meaning of the polished text.
- overallFeedbackTh: Warm, concise 1-2 sentences in Thai explaining what improved.
- changes: 1 to 4 concise before-and-after edits with short Thai explanations (if already near-perfect, include 1 subtle stylistic polish).
- alternatives: Exactly 2 alternative natural phrasings (e.g., slightly more polite and slightly more casual) with Thai nuance notes.`;

        const aiRes = await generateContentWithByokFallback({
          contents: polishPrompt,
          useByokQuota: wasByokRequest,
          strictByokOnly: wasByokRequest,
          byokKey: wasByokRequest ? reqByok : null,
          byokProfile: "flash_lite",
          serverDefaultModel: "gemini-3.8-flash",
          getServerClient: reqPaidWithCredits ? getServerGeminiClient : undefined,
          config: {
            responseMimeType: "application/json",
            responseSchema: polishSchema,
          },
        });

        const parsed = safeParseGeminiJson<any>(aiRes.text || "{}", {});
        return res.json({
          polishedText: String(parsed.polishedText || cleanText).trim(),
          reading: typeof parsed.reading === "string" ? parsed.reading.trim() : "",
          thaiPhonetic: typeof parsed.thaiPhonetic === "string" ? parsed.thaiPhonetic.trim() : "",
          meaningTh: String(parsed.meaningTh || "").trim(),
          overallFeedbackTh: String(parsed.overallFeedbackTh || "เกลาประโยคให้เป็นธรรมชาติมากขึ้นแล้วครับ").trim(),
          changes: Array.isArray(parsed.changes) ? parsed.changes.slice(0, 5) : [],
          alternatives: Array.isArray(parsed.alternatives) ? parsed.alternatives.slice(0, 2) : [],
          usedByok: aiRes.usedByok,
          modelUsed: aiRes.modelUsed,
        });
      }

      // Default mode === "deep": Deep Translate + Tone + Vocab Breakdown + Grammar + Alternatives
      const safeSource =
        sourceLang === "AUTO" || sourceLang === "TH" || sourceLang === "EN" || sourceLang === "CN" || sourceLang === "JP" || sourceLang === "KR"
          ? sourceLang
          : "AUTO";

      const detectedHint = safeSource === "AUTO" ? detectLangHeuristic(cleanText) : safeSource;
      const vocabLangTarget: "TH" | "EN" | "CN" | "JP" | "KR" =
        safeTarget !== "TH" ? safeTarget : detectedHint !== "TH" ? detectedHint : "EN";

      const deepSchema = {
        type: Type.OBJECT,
        properties: {
          detectedSourceLang: { type: Type.STRING, enum: ["TH", "EN", "CN", "JP", "KR"] },
          translatedText: { type: Type.STRING },
          reading: {
            type: Type.STRING,
            description: "Pinyin with tone marks for CN, Romaji for JP, Romanization for KR, natural pronunciation/stress guide for EN, empty if TH.",
          },
          thaiPhonetic: {
            type: Type.STRING,
            description: "Clear Thai phonetic approximation (คำอ่านเทียบเสียงไทย) when target is EN/CN/JP/KR; empty if target is TH.",
          },
          toneNoteTh: {
            type: Type.STRING,
            description: "One short sentence in Thai explaining why this wording fits the chosen tone.",
          },
          breakdown: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                word: { type: Type.STRING },
                reading: { type: Type.STRING },
                meaningTh: { type: Type.STRING },
                partOfSpeech: { type: Type.STRING },
                noteTh: { type: Type.STRING },
              },
              required: ["word", "meaningTh"],
            },
          },
          grammarNotes: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                pattern: { type: Type.STRING },
                explanationTh: { type: Type.STRING },
                example: { type: Type.STRING },
              },
              required: ["pattern", "explanationTh"],
            },
          },
          alternatives: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                toneLabelTh: { type: Type.STRING },
                text: { type: Type.STRING },
                reading: { type: Type.STRING },
                nuanceTh: { type: Type.STRING },
              },
              required: ["toneLabelTh", "text", "nuanceTh"],
            },
          },
        },
        required: ["detectedSourceLang", "translatedText", "breakdown", "grammarNotes", "alternatives"],
      };

      const deepPrompt = `You are a master polyglot translator and language coach for Thai learners (deep specialty in Thai, English, Mandarin Chinese, plus Japanese and Korean).

Source language: ${safeSource === "AUTO" ? "Auto-detect (one of TH, EN, CN, JP, KR)" : TRANSLATOR_LANG_FULL_NAME[safeSource]}
Target language: ${TRANSLATOR_LANG_FULL_NAME[safeTarget]}
Requested tone: ${toneGuideMap[safeTone]}

Input text:
"""
${cleanText}
"""

Return strict JSON:
1. detectedSourceLang: "TH" | "EN" | "CN" | "JP" | "KR".
2. translatedText: Idiomatic, accurate translation in ${TRANSLATOR_LANG_FULL_NAME[safeTarget]} matching the requested tone.
3. reading: For CN give full Pinyin with tone marks; for JP give Romaji (and hiragana reading in parentheses if helpful); for KR give Revised Romanization; for EN give brief pronunciation/stress guide for key phrase; for TH leave empty string.
4. thaiPhonetic: Natural Thai phonetic reading (คำอ่านภาษาไทย) if target is EN/CN/JP/KR (especially helpful for CN/JP/KR learners); leave empty if target is TH.
5. toneNoteTh: 1 concise Thai sentence describing the tone/register used.
6. breakdown: Extract 3 to 7 most useful vocabulary words or expressions in ${TRANSLATOR_LANG_FULL_NAME[vocabLangTarget]} from the text/translation so the Thai learner can save them into their wordbook. Include word, reading (pinyin/romaji/phonetic), concise meaningTh, partOfSpeech (e.g. "กริยา", "คำนาม", "สำนวน"), and optional brief noteTh.
7. grammarNotes: 1 to 3 concise grammar/structure patterns from the sentence with clear Thai explanations (under 25 words each) and a short example.
8. alternatives: Exactly 2 natural alternative translations in ${TRANSLATOR_LANG_FULL_NAME[safeTarget]} with different tones/registers (e.g., อีกระดับความสุภาพหรือแบบใช้พูดจริง) plus short Thai nuance notes.`;

      // Uses BYOK key when active OR server key ONLY when paidWithCredits is explicitly true
      const aiRes = await generateContentWithByokFallback({
        contents: deepPrompt,
        useByokQuota: wasByokRequest,
        strictByokOnly: wasByokRequest,
        byokKey: wasByokRequest ? reqByok : null,
        byokProfile: "flash_lite",
        serverDefaultModel: "gemini-3.8-flash",
        getServerClient: reqPaidWithCredits ? getServerGeminiClient : undefined,
        config: {
          responseMimeType: "application/json",
          responseSchema: deepSchema,
        },
      });

      const parsed = safeParseGeminiJson<any>(aiRes.text || "{}", {});
      const detectedLang = normalizeDetectedTranslatorLang(parsed.detectedSourceLang || detectedHint);
      const effectiveVocabLang: "TH" | "EN" | "CN" | "JP" | "KR" =
        safeTarget !== "TH" ? safeTarget : detectedLang !== "TH" ? detectedLang : "EN";

      const breakdown = Array.isArray(parsed.breakdown)
        ? parsed.breakdown
            .filter((b: any) => b && typeof b.word === "string" && b.word.trim())
            .slice(0, 8)
            .map((b: any) => ({
              word: String(b.word).trim(),
              reading: typeof b.reading === "string" ? b.reading.trim() : "",
              meaningTh: String(b.meaningTh || "").trim(),
              partOfSpeech: typeof b.partOfSpeech === "string" ? b.partOfSpeech.trim() : "",
              noteTh: typeof b.noteTh === "string" ? b.noteTh.trim() : "",
              wordLang: effectiveVocabLang,
            }))
        : [];

      const grammarNotes = Array.isArray(parsed.grammarNotes)
        ? parsed.grammarNotes
            .filter((g: any) => g && typeof g.pattern === "string" && g.pattern.trim())
            .slice(0, 3)
            .map((g: any) => ({
              pattern: String(g.pattern).trim(),
              explanationTh: String(g.explanationTh || "").trim(),
              example: typeof g.example === "string" ? g.example.trim() : "",
            }))
        : [];

      const alternatives = Array.isArray(parsed.alternatives)
        ? parsed.alternatives
            .filter((a: any) => a && typeof a.text === "string" && a.text.trim())
            .slice(0, 2)
            .map((a: any) => ({
              toneLabelTh: String(a.toneLabelTh || "ทางเลือก").trim(),
              text: String(a.text).trim(),
              reading: typeof a.reading === "string" ? a.reading.trim() : "",
              nuanceTh: String(a.nuanceTh || "").trim(),
            }))
        : [];

      return res.json({
        detectedSourceLang: detectedLang,
        translatedText: String(parsed.translatedText || "").trim(),
        reading: typeof parsed.reading === "string" ? parsed.reading.trim() : "",
        thaiPhonetic: typeof parsed.thaiPhonetic === "string" ? parsed.thaiPhonetic.trim() : "",
        toneNoteTh: typeof parsed.toneNoteTh === "string" ? parsed.toneNoteTh.trim() : "",
        breakdown,
        grammarNotes,
        alternatives,
        usedByok: aiRes.usedByok,
        modelUsed: aiRes.modelUsed,
      });
    } catch (error: any) {
      console.error("[/api/translate/ai] Error:", error?.message || error);
      if (error instanceof ByokInvalidKeyError) {
        return res.status(401).json({ byokInvalidKey: true, error: error.message });
      }
      if (wasByokRequest && (error instanceof ByokQuotaExhaustedError || isQuotaOrRateLimitError(error))) {
        return res.status(429).json({
          byokQuotaExhausted: true,
          error: "คีย์ฟรี BYOK ติดลิมิตชั่วคราว (429) คุณสามารถใช้ 1 เครดิตในแอปทำต่อ หรือสลับใช้โหมดแปลพื้นฐานฟรีไม่อั้น",
        });
      }
      if (isQuotaOrRateLimitError(error)) {
        return res.status(429).json({
          error: "เซิร์ฟเวอร์ AI หนาแน่นชั่วคราว กรุณาลองใหม่อีกครั้งในอีกสักครู่ครับ",
        });
      }
      return res.status(500).json({
        error: "ไม่สามารถประมวลผลโหมด AI เจาะลึกได้ชั่วคราว กรุณาลองใหม่อีกครั้ง",
      });
    }
  });

  app.post("/api/translate/image", requireFirebaseAuth, express.json({ limit: "10mb" }), async (req, res) => {
    const reqPaidWithCredits = Boolean(req.body?.paidWithCredits);
    const reqByok = typeof req.body?.byokKey === "string" && req.body.byokKey.trim().length > 15 ? req.body.byokKey.trim() : null;
    const wasByokRequest = Boolean(!reqPaidWithCredits && reqByok);
    try {
      const {
        imageBase64,
        mimeType = "image/jpeg",
        targetLang = "TH",
        imageContext = "general",
      } = req.body || {};

      if (!imageBase64 || typeof imageBase64 !== "string" || imageBase64.length < 100) {
        return res.status(400).json({ error: "ไม่พบไฟล์รูปภาพ กรุณาเลือกรูปภาพหรือถ่ายรูปใหม่อีกครั้ง" });
      }
      if (imageBase64.length > 7 * 1024 * 1024) {
        return res.status(400).json({ error: "ไฟล์รูปภาพมีขนาดใหญ่เกินไป กรุณาเลือกรูปภาพขนาดเล็กลง" });
      }

      if (!wasByokRequest && !reqPaidWithCredits) {
        return res.status(400).json({
          byokRequired: true,
          error: "ต้องเชื่อมคีย์ฟรี BYOK (150 ครั้ง/วัน) หรือใช้ 1 เครดิตในแอปเพื่อใช้ฟีเจอร์แปลจากรูปภาพ",
        });
      }

      const rawBaseMime = String(mimeType || "image/jpeg").split(";")[0].trim().toLowerCase();
      const ALLOWED_IMAGE_MIMES: Record<string, string> = {
        "image/jpeg": "image/jpeg",
        "image/jpg": "image/jpeg",
        "image/png": "image/png",
        "image/webp": "image/webp",
      };
      const cleanMime = ALLOWED_IMAGE_MIMES[rawBaseMime];
      if (!cleanMime) {
        return res.status(400).json({ error: "รองรับเฉพาะไฟล์รูปภาพ JPG, PNG หรือ WebP เท่านั้น" });
      }

      const safeTarget = normalizeTargetTranslatorLang(targetLang);
      const contextInstructions: Record<string, string> = {
        general: "Extract and translate all visible readable text cleanly.",
        menu: "This is a restaurant menu or food label. List each dish/item clearly with price if shown, translate dish names naturally, and mention key ingredients or spiciness in noteTh/culturalNoteTh.",
        sign: "This is a street sign, notice, or instruction board. Clearly highlight rules, warnings, directions, or opening hours.",
        document: "This is a document, receipt, or chat screenshot. Preserve logical paragraph/line flow cleanly.",
      };
      const ctxGuide = contextInstructions[String(imageContext)] || contextInstructions.general;

      const imageSchema = {
        type: Type.OBJECT,
        properties: {
          detectedSourceLang: { type: Type.STRING, enum: ["TH", "EN", "CN", "JP", "KR"] },
          extractedText: { type: Type.STRING, description: "All visible text extracted from the image." },
          translatedSummary: { type: Type.STRING, description: "Clean full translation in the requested target language." },
          culturalNoteTh: { type: Type.STRING, description: "Helpful practical/cultural tip in Thai (e.g. menu ingredients, sign meaning, etiquette)." },
          items: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                original: { type: Type.STRING },
                reading: { type: Type.STRING },
                translated: { type: Type.STRING },
                noteTh: { type: Type.STRING },
              },
              required: ["original", "translated"],
            },
          },
          keyVocab: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                word: { type: Type.STRING },
                reading: { type: Type.STRING },
                meaningTh: { type: Type.STRING },
                partOfSpeech: { type: Type.STRING },
              },
              required: ["word", "meaningTh"],
            },
          },
        },
        required: ["detectedSourceLang", "extractedText", "translatedSummary", "items", "keyVocab"],
      };

      const promptText = `You are a precise multilingual OCR translator helping a Thai user understand photos of signs, menus, labels, and documents.
Target translation language: ${TRANSLATOR_LANG_FULL_NAME[safeTarget]}
Image context: ${ctxGuide}

Inspect the attached image carefully and return strict JSON:
1. detectedSourceLang: Primary language visible in the image ("TH" | "EN" | "CN" | "JP" | "KR").
2. extractedText: Clean transcription of the visible text (if no text is visible, write an empty string).
3. translatedSummary: Complete, natural translation into ${TRANSLATOR_LANG_FULL_NAME[safeTarget]}.
4. culturalNoteTh: 1-2 short, practical sentences in Thai adding helpful context (e.g., dish ingredients, warning details, or usage tip).
5. items: Up to 12 distinct lines/menu dishes/sections with original text, pronunciation reading (Pinyin for CN, Romaji for JP, Romanization for KR), translation in ${TRANSLATOR_LANG_FULL_NAME[safeTarget]}, and optional brief noteTh.
6. keyVocab: Up to 6 useful vocabulary words found in the image (in the image's foreign language) with reading and concise Thai meaning so the learner can save them.`;

      const aiRes = await generateContentWithByokFallback({
        contents: {
          parts: [
            { inlineData: { mimeType: cleanMime, data: imageBase64 } },
            { text: promptText },
          ],
        },
        useByokQuota: wasByokRequest,
        strictByokOnly: wasByokRequest,
        byokKey: wasByokRequest ? reqByok : null,
        byokProfile: "flash_lite",
        serverDefaultModel: "gemini-3.8-flash",
        getServerClient: reqPaidWithCredits ? getServerGeminiClient : undefined,
        config: {
          responseMimeType: "application/json",
          responseSchema: imageSchema,
        },
      });

      const parsed = safeParseGeminiJson<any>(aiRes.text || "{}", {});
      const detectedLang = normalizeDetectedTranslatorLang(parsed.detectedSourceLang);
      const vocabLang: "TH" | "EN" | "CN" | "JP" | "KR" =
        detectedLang !== "TH" ? detectedLang : safeTarget !== "TH" ? safeTarget : "EN";

      return res.json({
        detectedSourceLang: detectedLang,
        extractedText: String(parsed.extractedText || "").trim(),
        translatedSummary: String(parsed.translatedSummary || "").trim(),
        culturalNoteTh: typeof parsed.culturalNoteTh === "string" ? parsed.culturalNoteTh.trim() : "",
        items: Array.isArray(parsed.items) ? parsed.items.slice(0, 12) : [],
        keyVocab: Array.isArray(parsed.keyVocab)
          ? parsed.keyVocab
              .filter((v: any) => v && typeof v.word === "string" && v.word.trim())
              .slice(0, 6)
              .map((v: any) => ({
                word: String(v.word).trim(),
                reading: typeof v.reading === "string" ? v.reading.trim() : "",
                meaningTh: String(v.meaningTh || "").trim(),
                partOfSpeech: typeof v.partOfSpeech === "string" ? v.partOfSpeech.trim() : "",
                wordLang: vocabLang,
              }))
          : [],
        usedByok: aiRes.usedByok,
        modelUsed: aiRes.modelUsed,
      });
    } catch (error: any) {
      console.error("[/api/translate/image] Error:", error?.message || error);
      if (error instanceof ByokInvalidKeyError) {
        return res.status(401).json({ byokInvalidKey: true, error: error.message });
      }
      if (wasByokRequest && (error instanceof ByokQuotaExhaustedError || isQuotaOrRateLimitError(error))) {
        return res.status(429).json({
          byokQuotaExhausted: true,
          error: "คีย์ฟรี BYOK ติดลิมิตชั่วคราว (429) คุณสามารถใช้ 1 เครดิตในแอปเพื่อแปลรูปต่อได้ทันที",
        });
      }
      if (isQuotaOrRateLimitError(error)) {
        return res.status(429).json({
          error: "เซิร์ฟเวอร์ AI หนาแน่นชั่วคราว กรุณาลองใหม่อีกครั้งในอีกสักครู่ครับ",
        });
      }
      return res.status(500).json({ error: "ไม่สามารถอ่านข้อความจากรูปภาพได้ในขณะนี้ กรุณาลองใหม่อีกครั้ง" });
    }
  });

  app.post("/api/translate/transcribe", requireFirebaseAuth, express.json({ limit: "6mb" }), async (req, res) => {
    const reqPaidWithCredits = Boolean(req.body?.paidWithCredits);
    const reqByok = typeof req.body?.byokKey === "string" && req.body.byokKey.trim().length > 15 ? req.body.byokKey.trim() : null;
    const wasByokRequest = Boolean(!reqPaidWithCredits && reqByok);
    try {
      const { audioBase64, mimeType = "audio/webm", lang = "TH" } = req.body || {};
      if (!audioBase64 || typeof audioBase64 !== "string" || audioBase64.length < 100) {
        return res.status(400).json({ error: "ไม่พบเสียงพูดที่บันทึกไว้ กรุณาลองพูดใหม่อีกครั้ง" });
      }
      if (audioBase64.length > 5 * 1024 * 1024) {
        return res.status(400).json({ error: "ไฟล์เสียงยาวเกินไป กรุณาพูดให้กระชับขึ้น" });
      }
      if (!wasByokRequest && !reqPaidWithCredits) {
        return res.status(400).json({
          byokRequired: true,
          error: "เบราว์เซอร์นี้ไม่รองรับการพิมพ์ด้วยเสียงอัตโนมัติ กรุณาเชื่อมคีย์ฟรี BYOK หรือใช้ 1 เครดิตเพื่อใช้ระบบถอดเสียง AI สำรอง",
        });
      }

      const safeLang = normalizeTargetTranslatorLang(lang);
      const rawBaseMime = String(mimeType || "audio/webm").split(";")[0].trim().toLowerCase();
      const ALLOWED_AUDIO_MIMES: Record<string, string> = {
        "audio/webm": "audio/webm",
        "audio/mp4": "audio/mp4",
        "audio/m4a": "audio/mp4",
        "audio/x-m4a": "audio/mp4",
        "audio/ogg": "audio/ogg",
        "audio/wav": "audio/wav",
        "audio/mpeg": "audio/mpeg",
        "audio/aac": "audio/aac",
      };
      const cleanMime = ALLOWED_AUDIO_MIMES[rawBaseMime] || "audio/webm";

      const transcribeSchema = {
        type: Type.OBJECT,
        properties: {
          transcript: { type: Type.STRING },
        },
        required: ["transcript"],
      };

      const aiRes = await generateContentWithByokFallback({
        contents: {
          parts: [
            { inlineData: { mimeType: cleanMime, data: audioBase64 } },
            {
              text: `Transcribe literally what the speaker said in ${TRANSLATOR_LANG_FULL_NAME[safeLang]}. Return only the spoken text in JSON field "transcript". If silent or unintelligible, return an empty string.`,
            },
          ],
        },
        useByokQuota: wasByokRequest,
        strictByokOnly: wasByokRequest,
        byokKey: wasByokRequest ? reqByok : null,
        byokProfile: "flash_lite",
        serverDefaultModel: "gemini-3.8-flash",
        getServerClient: reqPaidWithCredits ? getServerGeminiClient : undefined,
        config: {
          responseMimeType: "application/json",
          responseSchema: transcribeSchema,
        },
      });

      const parsed = safeParseGeminiJson<{ transcript?: string }>(aiRes.text || "{}", { transcript: "" });
      return res.json({
        transcript: typeof parsed.transcript === "string" ? parsed.transcript.trim() : "",
        usedByok: aiRes.usedByok,
        modelUsed: aiRes.modelUsed,
      });
    } catch (error: any) {
      console.error("[/api/translate/transcribe] Error:", error?.message || error);
      if (error instanceof ByokInvalidKeyError) {
        return res.status(401).json({ byokInvalidKey: true, error: error.message });
      }
      if (wasByokRequest && (error instanceof ByokQuotaExhaustedError || isQuotaOrRateLimitError(error))) {
        return res.status(429).json({
          byokQuotaExhausted: true,
          error: "คีย์ฟรี BYOK ติดลิมิตชั่วคราว (429) คุณสามารถใช้ 1 เครดิตในแอปเพื่อถอดเสียงต่อได้ทันที",
        });
      }
      if (isQuotaOrRateLimitError(error)) {
        return res.status(429).json({
          error: "เซิร์ฟเวอร์ AI หนาแน่นชั่วคราว กรุณาลองใหม่อีกครั้งในอีกสักครู่ครับ",
        });
      }
      return res.status(500).json({ error: "ไม่สามารถถอดเสียงได้ในขณะนี้ กรุณาลองใหม่อีกครั้ง" });
    }
  });

  app.post("/api/reading/analyze", requireFirebaseAuth, express.json({ limit: "1mb" }), async (req, res) => {
    try {
      const { text = "", lang = "EN", title = "", byokKey } = req.body || {};
      const cleanText = String(text || "").trim();
      if (cleanText.length < 30) {
        return res.status(400).json({ error: "กรุณาวางบทความอย่างน้อย 30 ตัวอักษร" });
      }
      if (cleanText.length > 3500) {
        return res.status(400).json({ error: "บทความยาวเกิน 3,500 ตัวอักษร กรุณาตัดให้กระชับขึ้น" });
      }

      const targetLang: "EN" | "CN" = lang === "CN" ? "CN" : "EN";
      const hasByok = typeof byokKey === "string" && byokKey.trim().length > 15;

      const responseSchema = {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          titlePinyin: { type: Type.STRING },
          titleTh: { type: Type.STRING },
          summaryTh: { type: Type.STRING },
          level: { type: Type.STRING },
          category: { type: Type.STRING },
          sentences: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                text: { type: Type.STRING },
                pinyin: { type: Type.STRING },
                th: { type: Type.STRING },
              },
              required: ["text", "th"],
            },
          },
          vocab: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                word: { type: Type.STRING },
                reading: { type: Type.STRING },
                pos: { type: Type.STRING },
                meaningTh: { type: Type.STRING },
              },
              required: ["word", "meaningTh"],
            },
          },
          quiz: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                questionTh: { type: Type.STRING },
                options: { type: Type.ARRAY, items: { type: Type.STRING } },
                correctIndex: { type: Type.INTEGER },
                explanationTh: { type: Type.STRING },
              },
              required: ["questionTh", "options", "correctIndex", "explanationTh"],
            },
          },
        },
        required: ["title", "titleTh", "summaryTh", "level", "category", "sentences", "vocab", "quiz"],
      };

      const validLevels =
        targetLang === "CN" ? "HSK1, HSK2, HSK3, HSK4, HSK5, or HSK6" : "A1, A2, B1, B2, or C1";

      const prompt = `You are a bilingual language curriculum editor for Thai learners studying ${
        targetLang === "CN" ? "Mandarin Chinese (Simplified)" : "English"
      }.
Analyze the following user-provided article and return structured JSON:
- Split the text cleanly into 4 to 14 natural sentences preserving the original wording.
- For each sentence, provide a natural Thai translation ("th")${
        targetLang === "CN" ? ' and accurate tone-marked Pinyin ("pinyin")' : ' (set "pinyin" to empty string)'
      }.
- Estimate the proficiency level using strictly one of: ${validLevels}.
- Pick one category from: daily, news, travel, work, culture, science.
- Provide a concise title in the target language${
        title ? ` (user suggested title: "${String(title).trim()}")` : ""
      }${targetLang === "CN" ? ', "titlePinyin" with tone marks,' : ""} "titleTh" in Thai, and a 1-sentence "summaryTh" in Thai.
- Extract 5 to 8 useful key vocabulary words appearing in the text with ${
        targetLang === "CN" ? "tone-marked Pinyin" : "IPA pronunciation"
      } in "reading", part of speech in "pos", and clear Thai meaning in "meaningTh".
- Create exactly 3 reading comprehension multiple-choice questions in Thai ("questionTh"), each with 4 Thai options ("options"), 0-based "correctIndex" (0..3), and a clear Thai "explanationTh".

Article text:
"""
${cleanText}
"""`;

      const aiRes = await generateContentWithByokFallback({
        contents: prompt,
        useByokQuota: hasByok,
        byokKey: hasByok ? byokKey.trim() : null,
        byokProfile: "flash36",
        serverDefaultModel: "gemini-4-hydrogen",
        serverThinkingLevel: ThinkingLevel.LOW,
        getServerClient: getServerGeminiClient,
        config: {
          responseMimeType: "application/json",
          responseSchema,
        },
      });
      const parsed = safeParseGeminiJson(aiRes.text || "{}");

      const allowedEnLevels = new Set(["A1", "A2", "B1", "B2", "C1"]);
      const allowedCnLevels = new Set(["HSK1", "HSK2", "HSK3", "HSK4", "HSK5", "HSK6"]);
      const allowedCats = new Set(["daily", "news", "travel", "work", "culture", "science"]);

      const rawLevel = String(parsed.level || "").toUpperCase().replace(/\s+/g, "");
      const safeLevel =
        targetLang === "CN"
          ? allowedCnLevels.has(rawLevel)
            ? rawLevel
            : "HSK3"
          : allowedEnLevels.has(rawLevel)
          ? rawLevel
          : "B1";

      const rawCat = String(parsed.category || "").toLowerCase().trim();
      const safeCat = allowedCats.has(rawCat) ? rawCat : "news";

      const safeSentences = Array.isArray(parsed.sentences)
        ? parsed.sentences
            .filter((s: any) => s && typeof s.text === "string" && s.text.trim())
            .map((s: any) => ({
              text: String(s.text).trim(),
              pinyin: targetLang === "CN" && s.pinyin ? String(s.pinyin).trim() : undefined,
              th: String(s.th || "").trim(),
            }))
        : [];

      if (safeSentences.length === 0) {
        return res.status(500).json({ error: "ไม่สามารถแบ่งประโยคจากบทความนี้ได้ กรุณาลองใหม่" });
      }

      const safeVocab = Array.isArray(parsed.vocab)
        ? parsed.vocab
            .filter((v: any) => v && v.word && v.meaningTh)
            .slice(0, 10)
            .map((v: any) => ({
              word: String(v.word).trim(),
              reading: v.reading ? String(v.reading).trim() : undefined,
              pos: v.pos ? String(v.pos).trim() : undefined,
              meaningTh: String(v.meaningTh).trim(),
            }))
        : [];

      const safeQuiz = Array.isArray(parsed.quiz)
        ? parsed.quiz
            .filter((q: any) => q && q.questionTh && Array.isArray(q.options) && q.options.length >= 2)
            .slice(0, 3)
            .map((q: any) => {
              const opts = q.options.slice(0, 4).map((o: any) => String(o).trim());
              const cIdx = Math.max(0, Math.min(opts.length - 1, Number(q.correctIndex) || 0));
              return {
                questionTh: String(q.questionTh).trim(),
                options: opts,
                correctIndex: cIdx,
                explanationTh: String(q.explanationTh || "").trim(),
              };
            })
        : [];

      const story = {
        id: `custom_${targetLang.toLowerCase()}_${Date.now()}`,
        lang: targetLang,
        level: safeLevel,
        category: safeCat,
        title: String(parsed.title || title || "Custom Article").trim(),
        titlePinyin:
          targetLang === "CN" && parsed.titlePinyin ? String(parsed.titlePinyin).trim() : undefined,
        titleTh: String(parsed.titleTh || parsed.title || "บทความส่วนตัว").trim(),
        summaryTh: String(parsed.summaryTh || "บทความที่นำเข้าและวิเคราะห์ด้วย AI").trim(),
        estimatedMinutes: Math.max(2, Math.min(8, Math.ceil(safeSentences.length / 3))),
        sentences: safeSentences,
        vocab: safeVocab,
        quiz: safeQuiz,
        isCustom: true,
        createdAt: Date.now(),
      };

      return res.json({ story });
    } catch (e: any) {
      if (e instanceof ByokInvalidKeyError) {
        return res.status(400).json({
          byokInvalidKey: true,
          error: e.message,
        });
      }
      if (e instanceof ByokQuotaExhaustedError) {
        return res.status(429).json({
          byokQuotaExhausted: true,
          error: e.message,
        });
      }
      const msg = String(e?.message || e || "");
      const status = isQuotaOrRateLimitError(e) ? 429 : 500;
      console.error("[Reading Analyze API Error]:", msg);
      return res.status(status).json({
        byokQuotaExhausted: Boolean(status === 429 && req.body?.byokKey),
        error: msg || "ไม่สามารถวิเคราะห์บทความได้ในขณะนี้ กรุณาลองใหม่อีกครั้ง",
      });
    }
  });

  // Serve built static assets in production (or whenever running compiled dist/server.cjs)
  const distPath = path.join(process.cwd(), 'dist');
  const distIndexPath = path.join(distPath, 'index.html');
  const entryScript = process.argv[1] || '';
  const isProdMode =
    process.env.NODE_ENV === "production" ||
    entryScript.endsWith("server.cjs") ||
    (fs.existsSync(distIndexPath) && !entryScript.endsWith("server.ts"));

  if (!isProdMode) {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(distPath, {
      setHeaders: (res, filePath) => {
        if (filePath.endsWith('index.html') || filePath.endsWith('sw.js')) {
          res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        }
      }
    }));
    app.get('*', (req, res) => {
      res.sendFile(distIndexPath);
    });
  }

  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/live' });

  wss.on("connection", async (clientWs, req) => {
    // Ping to keep connection alive through proxies
    const pingInterval = setInterval(() => {
      if (clientWs.readyState === 1) {
        clientWs.ping();
      }
    }, 15000);

    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    let targetLang = url.searchParams.get('targetLang') || url.searchParams.get('lang') || 'EN';
    if (targetLang === 'Chinese') targetLang = 'CN';
    if (targetLang === 'Thai') targetLang = 'TH';
    if (targetLang === 'English') targetLang = 'EN';
    
    const spokenLang = url.searchParams.get('spokenLang') || 'Thai';
    const clientId = url.searchParams.get('clientId') || 'defaultClient';
    let isSeriousMode = url.searchParams.get('seriousMode') === 'true';
    const isRoleplayMode = url.searchParams.get('roleplayMode') === 'true';
    const roleplayVoiceGenderParam = url.searchParams.get('voiceGender') || '';
    const idToken = url.searchParams.get('idToken');
    const byokKey = url.searchParams.get('byokKey');

    // Enforce Google sign-in strictly before opening any Live Gemini session (BYOK or Server key)
    const verifiedUser = await verifyFirebaseIdToken(idToken);
    if (!verifiedUser) {
      clearInterval(pingInterval);
      if (clientWs.readyState === 1) {
        clientWs.send(
          JSON.stringify({
            type: 'error',
            authRequired: true,
            message: 'กรุณาเข้าสู่ระบบด้วยบัญชี Google ก่อนใช้งานการคอลกับ AI และ BYOK',
          })
        );
        clientWs.close();
      }
      return;
    }
    const userId: string | null = verifiedUser.uid;

    // In Roleplay mode, attach an immediate one-shot listener BEFORE any awaits so we never miss init_roleplay
    let roleplayInitData: {
      mission: any;
      assistMode: boolean;
      correctionStyle: 'after_call' | 'realtime';
    } | null = null;

    if (isRoleplayMode) {
      roleplayInitData = await new Promise((resolve) => {
        let settled = false;
        const finish = (val: any) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          clientWs.off('message', onInitMsg);
          clientWs.off('close', onEarlyClose);
          resolve(val);
        };
        const onInitMsg = (raw: any) => {
          try {
            const msg = JSON.parse(raw.toString());
            if (msg?.type === 'init_roleplay' && msg?.mission) {
              finish({
                mission: msg.mission,
                assistMode: Boolean(msg.assistMode),
                correctionStyle: msg.correctionStyle === 'realtime' ? 'realtime' : 'after_call',
              });
            }
          } catch {}
        };
        const onEarlyClose = () => finish(null);
        const timer = setTimeout(() => finish(null), 8000);
        clientWs.on('message', onInitMsg);
        clientWs.on('close', onEarlyClose);
      });

      if (!roleplayInitData || clientWs.readyState !== 1) {
        clearInterval(pingInterval);
        if (clientWs.readyState === 1) {
          clientWs.send(JSON.stringify({ type: 'error', message: 'ไม่สามารถโหลดข้อมูลภารกิจได้ กรุณากดเริ่มใหม่อีกครั้ง' }));
          clientWs.close();
        }
        return;
      }
    }

    // If client provided a valid BYOK key, use it directly so that this session NEVER touches the server's key
    const cleanLiveByokKey =
      byokKey && typeof byokKey === 'string' && byokKey.trim().length > 15 ? byokKey.trim() : null;
    const isByokLiveSession = Boolean(cleanLiveByokKey);
    const getLiveClientForVersion = (apiVersion: "v1beta" | "v1alpha" = "v1beta"): GoogleGenAI => {
      if (isByokLiveSession) {
        return createLiveClientFromKey(cleanLiveByokKey!, apiVersion);
      }
      return getServerLiveGeminiClient(apiVersion);
    };

    let activeLiveApiVersion: "v1beta" | "v1alpha" = "v1beta";
    let sessionAi: GoogleGenAI | null = null;
    if (cleanLiveByokKey) {
      try {
        sessionAi = getLiveClientForVersion("v1beta");
        console.log(`[Live Session] Successfully using customer BYOK key for ${userId || clientId} (Server key is NOT used)`);
      } catch (err) {
        console.warn("[Live Session] Error setting up BYOK key:", err);
      }
    }

    // STRICT 0-COST GUARD: If BYOK key was supplied, NEVER fall back to owner's server key!
    if (isByokLiveSession && !sessionAi) {
      clearInterval(pingInterval);
      if (clientWs.readyState === 1) {
        clientWs.send(JSON.stringify({
          type: 'error',
          message: 'API Key ส่วนตัว (BYOK) ไม่ถูกต้อง กรุณาตรวจสอบคีย์ในหน้าตั้งค่า BYOK ครับ'
        }));
        clientWs.close();
      }
      return;
    }

    // Fallback to system key ONLY when NOT in BYOK mode (credit-paid live call)
    if (!sessionAi) {
      try {
        sessionAi = getLiveClientForVersion("v1beta");
      } catch (err: any) {
        clearInterval(pingInterval);
        console.warn("[Live Session] No BYOK key and server GEMINI_API_KEY is not available:", err?.message);
        if (clientWs.readyState === 1) {
          clientWs.send(JSON.stringify({
            type: 'error',
            message: 'กรุณาใส่ Gemini API Key ส่วนตัว (BYOK) ที่ปุ่มมุมบนขวา เพื่อเริ่มคุยสายกับ AI ติวเตอร์'
          }));
          clientWs.close();
        }
        return;
      }
    }

    const userToQuery = userId || clientId;
    const cacheKey = `${userToQuery}_${targetLang}`;

    if (!sessionMemoryStore.has(cacheKey)) {
      sessionMemoryStore.set(cacheKey, []);
    }
    let userMemory = sessionMemoryStore.get(cacheKey) || [];

    // For tracking transcript chunks and compiling a summary upon disconnect
    const dialogueHistory: { role: 'user' | 'model'; text: string }[] = [];
    let currentSpeaker: 'user' | 'model' | null = null;
    let currentSpeakerText = "";

    function addTranscriptChunk(role: 'user' | 'model', text: string) {
      if (currentSpeaker === role) {
        currentSpeakerText += " " + text;
      } else {
        if (currentSpeaker && currentSpeakerText.trim()) {
          dialogueHistory.push({ role: currentSpeaker, text: currentSpeakerText.trim() });
        }
        currentSpeaker = role;
        currentSpeakerText = text;
      }
    }

    // Load memories and recent chat history from Firestore if available (Free Talk mode only)
    let chatHistoryContext = "";
    if (!isRoleplayMode && db && userId) {
      try {
        // Fetch memories
        const memoryDoc = await db.doc(`users/${userId}/memory/${targetLang}`).get();
        if (memoryDoc.exists) {
          const memories = memoryDoc.data()?.memories;
          if (Array.isArray(memories)) {
            userMemory = memories;
            sessionMemoryStore.set(cacheKey, userMemory);
          }
        } else if (userMemory.length > 0) {
          await db.doc(`users/${userId}/memory/${targetLang}`).set({
            memories: userMemory,
            updatedAt: Date.now()
          });
        }

        // Fetch latest text chat session for targetLang to provide rich context
        const chatSnap = await db.collection(`users/${userId}/chat_sessions`)
          .where('lang', '==', targetLang)
          .orderBy('createdAt', 'desc')
          .limit(1)
          .get();
          
        if (!chatSnap.empty) {
          const latestChat = chatSnap.docs[0].data();
          const messages = latestChat.messages;
          if (Array.isArray(messages) && messages.length > 0) {
            const recentMsgs = messages.slice(-10).map((m: any) => 
              `${m.role === 'user' ? 'ผู้เรียน' : 'ติวเตอร์ (คุณ)'}: ${m.text}`
            ).join('\n');
            chatHistoryContext = `\n\n[ประวัติการพิมพ์แชทล่าสุดในช่องแชทข้อความที่คุณสนทนากับผู้เรียนล่าสุด (โปรดรู้ว่าผู้เรียนเพิ่งแชทเรื่องเหล่านี้มา และหากเขาพูดถึงให้รับทราบและพูดคุยต่อได้ทันทีเพื่อความรื่นไหลในการเรียนรู้): \n${recentMsgs}]`;
          }
        }

        // Fetch latest live call history
        const liveHistDoc = await db.doc(`users/${userId}/live_history/${targetLang}`).get();
        if (liveHistDoc.exists) {
           const historyData = liveHistDoc.data();
           if (historyData?.dialogue && historyData.dialogue.length > 0) {
             const recentLiveMsgs = historyData.dialogue.slice(-40).map((m: any) => 
               `${m.role === 'user' ? 'ผู้เรียน' : 'ติวเตอร์ (คุณ)'}: ${m.text}`
             ).join('\n');
             chatHistoryContext += `\n\n[ประวัติบทสนทนาในสายวิดีโอคอลก่อนหน้านี้ที่คุณเพิ่งคุยกับผู้เรียน (ให้คุณจดจำ 100% ว่าคุยอะไรไปบ้างหรือผู้เรียนเคยให้ดูอะไรผ่านกล้อง เพื่อให้สานต่อการคุยครั้งนี้ได้อย่างไร้รอยต่อที่สุด ห้ามทำเหมือนเพิ่งเจอกันครั้งแรก): \n${recentLiveMsgs}]`;
           }
        }
      } catch (err) {
        console.error("Error loading user data from Firestore in /live:", err);
      }
    }

    const hasGreetedBefore = greetedClientStore.has(userToQuery);
    greetedClientStore.add(userToQuery);

    let voiceName = 'Aoede'; 
    const personaBaseEN = `คุณคือติวเตอร์สอนภาษาอังกฤษ AI ชื่อ "Mr.Pe" เป็นผู้ชายหล่อเท่ อายุประมาณ 25 ปี สอนชิวๆ สบายๆ ไม่ดุนักเรียนเลย สอนสนุกน่าฟัง มีความใจดี อธิบายได้ละเอียดและเข้าใจง่าย และมีความติดตลกฮาๆเล็กน้อย`;
    const personaBaseCN = `คุณคือติวเตอร์สอนภาษาจีน AI ชื่อ "李老师" (Li Laoshi) เป็นคุณครูผู้หญิงวัยประมาณ 30 ปีที่มีความน่ารักมากๆ อบอุ่น อารมณ์ดี น้ำเสียงร่าเริงสดใส อ่อนหวานและใจดีไม่ดุ แต่ในตอนสอนมีความจริงจังและมุ่งมั่น`;

    if (isRoleplayMode && roleplayInitData?.mission) {
      const gender = roleplayInitData.mission.aiVoiceGender || roleplayVoiceGenderParam;
      voiceName = gender === 'male' ? 'Charon' : 'Aoede';
    } else if (targetLang === 'EN' || targetLang === 'English') {
      voiceName = 'Charon';
    } else if (targetLang === 'CN' || targetLang === 'Chinese') {
      voiceName = 'Aoede';
    }

    let systemInstruction = "";

    if (isRoleplayMode && roleplayInitData?.mission) {
      const m = roleplayInitData.mission;
      const diffGuide =
        m.difficulty === 'easy'
          ? 'Speak slowly, clearly, and warmly using simple A1-A2 / HSK 1-2 vocabulary and short 1-2 sentence turns. Be very patient and encouraging.'
          : m.difficulty === 'hard'
          ? 'Speak at authentic native conversational speed using rich, realistic C1+ / HSK 5-6 vocabulary and natural nuances. Keep turns crisp (2-3 sentences).'
          : 'Speak at a comfortable natural speed using everyday B1-B2 / HSK 3-4 vocabulary in concise 2-sentence turns.';

      const langDirective =
        targetLang === 'CN'
          ? `LANGUAGE RULE (STRICT): Speak 100% in natural native Mandarin Chinese (中文). NEVER speak Thai or English in your spoken voice. EXTREMELY IMPORTANT: Output ONLY pure Simplified Chinese characters (汉字) in your speech — NEVER output English letters or Pinyin in your spoken text so the voice engine produces native Beijing Mandarin with accurate 4 tones.`
          : `LANGUAGE RULE (STRICT): Speak 100% in natural native English (American/British accent). NEVER speak Thai or break character.`;

      const twistDirective = m.twistEn
        ? `\nPLOT TWIST TO INTRODUCE NATURALLY MID-CONVERSATION: ${m.twistEn}`
        : '';

      const correctionDirective =
        roleplayInitData.correctionStyle === 'realtime'
          ? `\nREALTIME COACHING MODE (QUIET BOARD): Stay 100% in character in your spoken voice (do NOT lecture out loud), BUT whenever the learner makes a noticeable grammar/vocabulary mistake, quietly call "update_board" with 1 concise correction item (word: better natural phrasing, pinyin: pronunciation/pinyin if Chinese, meaning: short Thai explanation of the fix).`
          : `\nIMMERSIVE MODE: Do NOT correct grammar or pronunciation during the conversation. Stay 100% immersed in the real-life roleplay; all feedback will happen after the call.`;

      const assistDirective = roleplayInitData.assistMode
        ? `\nASSIST MODE ENABLED: If the learner gets stuck or the system sends a hint request, immediately call "update_board" with 2 short, practical suggested next replies (word: reply in target language, pinyin: pinyin if Chinese, meaning: Thai meaning) so they can read and try saying one.`
        : '';

      systemInstruction = `[REAL-LIFE ROLEPLAY SIMULATION — STRICT CHARACTER IMMERSION]
You are NOT an AI language tutor right now. You are strictly playing a real-life character in an immersive voice roleplay!
- Your Character Name: ${m.aiRoleName}
- Your Role: ${m.aiRoleTitleEn} (${m.aiRoleTitleTh})
- Setting / Location: ${m.location}
- Learner's Role: ${m.userRoleTh}
- Scenario: ${m.scenarioTh}
- Difficulty & Pacing: ${diffGuide}
${langDirective}${twistDirective}${correctionDirective}${assistDirective}

LEARNER'S 3 MISSION OBJECTIVES (TRACK THESE LIVE):
1. ${m.objectivesEn?.[0] || m.objectives?.[0]} (TH: ${m.objectives?.[0]})
2. ${m.objectivesEn?.[1] || m.objectives?.[1]} (TH: ${m.objectives?.[1]})
3. ${m.objectivesEn?.[2] || m.objectives?.[2]} (TH: ${m.objectives?.[2]})

CRITICAL TOOL CALLING RULE FOR OBJECTIVES:
- The moment the learner successfully communicates, asks, or resolves Objective 1, 2, or 3, IMMEDIATELY call the function "complete_mission_objective" with { objectiveIndex: 1 | 2 | 3, reason: "short note" } while continuing your natural in-character reply!
- Be fair and generous when the learner gets their point across (even with minor accent or grammar imperfections, if the communicative goal is met, tick it off!).
- Each objective index (1, 2, 3) only needs to be called once.
- When all 3 objectives are completed, naturally wrap up the conversation in character with a warm, realistic closing remark so the learner knows the scene has reached a satisfying end.
- Keep your spoken replies concise (1-3 natural sentences) so the learner gets maximum speaking time. Stop immediately if the learner interrupts.`;
    } else {
      let personaDetails = `${targetLang === 'CN' ? personaBaseCN : personaBaseEN}`;
      if (isSeriousMode) {
        personaDetails += `

[SERIOUS SPEAKING PRACTICE MODE ACTIVATED]
คุณต้องพูดคุยตอบโต้และสอนผู้เรียนโดยใช้ภาษาเป้าหมาย (${targetLang === 'CN' ? 'Mandarin Chinese' : 'English'}) เป็นหลัก 100%!
- อธิบายคำศัพท์ ไวยากรณ์ และชวนคุยเป็นภาษา${targetLang === 'CN' ? 'จีน (Chinese)' : 'อังกฤษ (English)'}
- ชี้แนะจุดอ่อนและจุดแข็งของผู้เรียน
- หากผู้เรียนออกเสียงพลาด เพี้ยน หรือพูดผิดแกรมม่า ให้ชี้แจงจุดที่ผิดและบอกรูปประโยคหรือการออกเสียงที่ถูกต้องเสมอ
- ประเมินคะแนนการพูดให้ผู้เรียนฟังบ่อยๆ
- ในโหมดนี้ คุณจะสอนอย่างจริงจังและเข้มงวดมากขึ้นเพื่อเน้นฝึกการพูดและการฟังล้วนๆ!`;
      } else {
        personaDetails += `

[CRITICAL INSTRUCTION - NORMAL LEARNING MODE]
- ผู้เรียนกำลังเรียน${targetLang === 'CN' ? 'ภาษาจีน' : 'ภาษาอังกฤษ'}
- กฎเหล็ก: คุณต้องใช้ "ภาษาไทยเป็นหลักในการสอนและอธิบาย 100%" (ยกเว้นตัวคำศัพท์เป้าหมายหรือตัวอย่างประโยคภาษาต่างประเทศที่กำลังสอน)
- คำอธิบายความหมาย ไวยากรณ์ การแปล การพูดคุยทักทาย และการตอบโต้ทั่วไป ให้พูดภาษาไทยเป็นหลักเสมอ ชัดเจน เป็นกันเองและเข้าใจง่าย
- อย่าอธิบายเป็นภาษาอังกฤษล้วนหรือจีนล้วนเด็ดขาด เว้นแต่ผู้เรียนจะบอกหรือขอให้คุณพูดกับเขาเป็นภาษาที่เขาต้องการ`;
      }

      const memoryContext = userMemory.length > 0 
        ? `\n[ความรู้เกี่ยวกับผู้เรียนและบริบทสนทนาที่ผ่านมา (โปรดจำไว้และใช้ในการสนทนาต่อเนื่อง): \n- ${userMemory.join("\n- ")}]` 
        : '';

      systemInstruction = `${personaDetails}
[CRITICAL SYSTEM DIRECTIVE: PRONUNCIATION, TONES & ACCENT]
You are a Native Speaker. Your text-to-speech voice engine MUST perfectly match the native accent, tones, and phonology of the language you are speaking.
- For Mandarin Chinese (中文): You MUST output native-level Mandarin. EXTREMELY IMPORTANT: When speaking Chinese, DO NOT include ANY English letters, Pinyin, or English alphabets in your spoken text generation. You MUST use ONLY pure Chinese characters (汉字) to represent Chinese words. This forces the voice engine to read native Chinese instead of falling back to English phonetics (e.g., never use English letter "b", "d", "p", "t", always use real Hanzi). Ensure all 4 tones are perfectly accurate. Speak like a native Chinese teacher from Beijing.
- For Thai (ภาษาไทย): You MUST speak clearly with proper Thai tones and native cadence. Do NOT use a foreign accent.
- For English: You MUST use a standard Native English accent (e.g., American or British).
- When mixing languages in one sentence (e.g., explaining a Chinese word in Thai), you MUST strictly switch your accent for each word to its native pronunciation. Do not apply English phonetic rules to Chinese or Thai words.

คุณมีความรอบรู้และมีฐานข้อมูลของแอปนี้อย่างละเอียด รวมถึงข้อสอบ HSK, บทเรียนต่างๆ, เอกสาร, และไฟล์คำศัพท์ 
คุณสามารถมองเห็นผู้เรียนได้ผ่านกล้องวิดีโออย่างละเอียดและคมชัด (ถ้าเปิดกล้อง) ตอบสนองต่อหน้าตา ท่าทางของผู้เรียน ชูนิ้ว สิ่งของ หรือสีหน้าได้อย่างถูกต้องแม่นยำ
หากผู้เรียนพูดแทรกในขณะที่คุณกำลังพูดอยู่ ให้หยุดพูดทันทีและตั้งใจฟังสิ่งที่ผู้เรียนพูด (ระบบจะจัดการเรื่องการหยุดพูดอัตโนมัติ ให้คุณหยุดการให้ข้อมูลต่อ)
เวลาสอนอธิบายไวยากรณ์ บทสนทนา หรือเรื่องราวยาวๆ หรือเมื่อผู้เรียนสั่งให้อ่านบทความยาวๆ นิทาน บทกวี หรืออ่านข้อความจากรูปภาพ คุณต้องอ่าน "ทุกตัวอักษรตั้งแต่ต้นจนจบอย่างละเอียด" ห้ามข้าม ห้ามสรุปความ ห้ามพูดว่า 'อ่านแล้ว' โดยไม่ออกเสียง คุณสามารถพูดหรืออ่านออกเสียงต่อเนื่องได้ยาวอย่างไร้ขีดจำกัด (Unlimited Speech Length) จนกว่าจะจบเนื้อหา หรือจนกว่าผู้เรียนจะขัดจังหวะ

คุณมีหน้าจอแสดงผล "กระดาน" ให้ผู้เรียนดูตลอดเวลา ดังนั้นเวลาอธิบายคำศัพท์ ไวยากรณ์ หรือยกตัวอย่างประโยค คุณต้องเรียกใช้ function/tool ชื่อ "update_board" เสมอเพื่อให้การสอนเห็นภาพชัดเจน
สำคัญเกี่ยวกับการจัดเรียงหน้าจอ update_board (สามารถแสดงได้ไม่จำกัดจำนวนคำ):
- ถ้าสอนภาษาจีน: ตัวจีนต้องส่งเข้าไปใน field 'word' (ระบบจะจัดการทำอนิเมชั่นให้ตัวจีนใหญ่และเด่นชัดที่สุด), ใส่พินอินใน field 'pinyin' (จะแสดงด้านบนตัวจีน), และคำแปลไทย/อังกฤษใน field 'meaning' (แสดงด้านล่างตัวจีน ค่าเริ่มต้นถ้าผู้เรียนไม่ระบุคือภาษาไทย) ถ้ามีตัวอย่างประโยคให้ใส่ in field 'example'
- ถ้าสอนภาษาอังกฤษ: คำภาษาอังกฤษใส่ 'word', ใส่ phonetic (สัทอักษร) ใน 'pinyin', และคำแปลใน 'meaning' รูปแบบเหมือนจีนแต่ไม่มีอนิเมชั่น

นอกจากนี้ ผู้เรียนสามารถอัปโหลดรูปภาพหรือเอกสารลงใน "Doc Board" ซึ่งคุณจะเห็นภาพกระดานนี้ชัดเจน 
ผู้ใช้คาดหวังให้คุณอ่านรูปภาพหรือไฟล์ที่อัปโหลดได้แม่นยำมากที่สุด
กระดานของผู้ใช้เป็นส่วนที่ให้คุณอ่านเท่านั้น (Read-only) คุณไม่มีสิทธิในการแก้ไขหรือเขียนทับบนกระดานนั้น
หากผู้เรียนสั่งให้อ่านสิ่งที่อัปโหลด คุณจะต้องอ่านออกเสียงทุกประโยคตั้งแต่ต้นจนจบแบบห้ามย่อความ ห้ามข้ามเด็ดขาด
หากคุณต้องการอธิบายสิ่งใด ให้ใช้การอธิบายด้วยเสียง หรือพิมพ์แสดงบนกระดานหลักของคุณ (update_board) เท่านั้น

ในขณะที่สนทนา หากคุณได้รับข้อมูลใหม่ที่สำคัญเกี่ยวกับผู้เรียน ให้เรียกใช้ "memorize_info" เพื่อบันทึกข้อมูลนั้นไว้เสมอ${memoryContext}${chatHistoryContext}`;
    }

    let session: any;
    let sessionClosed = false;
    let clientClosed = false;
    let isInitialConnecting = true;
    let lastImageInputAt = 0;
    let upstreamReconnectTimer: NodeJS.Timeout | null = null;
    let upstreamReconnectAttempts = 0;
    let latestDocText = "";
    let latestDocImage = "";
    let latestDocMimeType = "image/jpeg";
    let liveSessionOptions: any;
    const sendSavedDocumentContext = () => {
      if (!session || sessionClosed || !session.sendClientContent) return;
      try {
        if (latestDocText) {
          session.sendClientContent({
            turns: [{ role: "user", parts: [{ text: `The learner already uploaded this document text as lesson context. Remember it silently and continue the same lesson without greeting again:\n\n${latestDocText}` }] }],
            turnComplete: true
          });
        }
        if (latestDocImage) {
          session.sendClientContent({
            turns: [{
              role: "user",
              parts: [
                { text: "The learner already uploaded this image/PDF page. Read it carefully as continuing lesson context. Do not greet or announce reconnecting. If the learner asks you to read it out loud, you MUST read the ENTIRE text visible in the image word-for-word from start to finish without summarizing or skipping anything." },
                { inlineData: { mimeType: latestDocMimeType, data: latestDocImage } }
              ]
            }],
            turnComplete: true
          });
        }
      } catch (e) {
        console.error("Error replaying document context:", e);
      }
    };
    // Live-only model switcher: always use gemini-3.8-live as primary;
    // if 65K TPM is hit, temporarily switch to gemini-3-flash-live until the next minute boundary resets TPM.
    // If primary model returns 404/unsupported on a user's BYOK key, fall back through official Live-only audio models.
    let tpmFallbackUntilMs = 0;
    let primaryModelUnavailableForSession = false;
    let liveFallbackIdx = 0;
    const getActiveLiveModel = (): string => {
      if (primaryModelUnavailableForSession || Date.now() < tpmFallbackUntilMs) {
        return LIVE_TPM_FALLBACK_MODELS[liveFallbackIdx] || LIVE_TPM_FALLBACK_MODELS[0];
      }
      return LIVE_PRIMARY_MODEL;
    };
    const triggerLiveTpmFallback = (reasonText?: string) => {
      // Switch to Gemini 3 Flash Live until start of next minute (+2s grace) when 3.8 Live TPM resets
      const nextMinuteResetMs = Math.ceil(Date.now() / 60000) * 60000 + 2000;
      tpmFallbackUntilMs = Math.max(tpmFallbackUntilMs, nextMinuteResetMs);
      if (!primaryModelUnavailableForSession) {
        liveFallbackIdx = 0;
      }
      if (liveSessionOptions) {
        liveSessionOptions.model = getActiveLiveModel();
      }
      console.warn(
        `[Live TPM Switch] Switching temporarily to ${getActiveLiveModel()} until ${new Date(tpmFallbackUntilMs).toISOString()} (${reasonText || "TPM limit"})`
      );
      if (!isInitialConnecting && clientWs.readyState === 1) {
        clientWs.send(JSON.stringify({
          type: 'status',
          message: 'กำลังสลับไปใช้โหมด Live สำรองชั่วคราวจนกว่าโควตานาทีถัดไปจะรีเซ็ต...'
        }));
      }
    };

    const isLiveModelCompatError = (errOrText: any): boolean => {
      const msg = String(errOrText?.message || errOrText || "").toLowerCase();
      return (
        isModelNotFoundOrUnsupportedError(errOrText) ||
        msg.includes("1008") ||
        msg.includes("bidigeneratecontent") ||
        msg.includes("not supported for") ||
        msg.includes("publisher model")
      );
    };

    const buildLiveConnectConfig = () => ({
      responseModalities: [Modality.AUDIO],
      systemInstruction,
      outputAudioTranscription: {},
      inputAudioTranscription: {},
      tools: [{
        functionDeclarations: [
          {
            name: "update_board",
            description: "Update the shared whiteboard screen to display vocabulary, grammar, sentences, helpful reply hints, or gentle corrections to the user.",
            parameters: {
              type: Type.OBJECT,
              properties: {
                items: {
                  type: Type.ARRAY,
                  description: "List of items to display on the board. Keep each coherent sentence/phrase together in a single item so the board remains tidy and readable.",
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      word: { type: Type.STRING, description: "The word, full sentence, reply hint, or grammar point" },
                      pinyin: { type: Type.STRING, description: "Pronunciation or pinyin (if applicable, separate with spaces for sentences)" },
                      meaning: { type: Type.STRING, description: "Translation or meaning in Thai and/or English" },
                      example: { type: Type.STRING, description: "Example sentence (optional)" }
                    },
                    required: ["word", "meaning"]
                  }
                }
              },
              required: ["items"]
            }
          },
          ...(isRoleplayMode
            ? [
                {
                  name: "complete_mission_objective",
                  description: "Mark one of the learner's 3 Roleplay Mission objectives (1, 2, or 3) as completed in real time as soon as the learner achieves it in the conversation.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      objectiveIndex: {
                        type: Type.INTEGER,
                        description: "The objective number completed: 1, 2, or 3"
                      },
                      reason: {
                        type: Type.STRING,
                        description: "Brief note on how the learner completed this objective"
                      }
                    },
                    required: ["objectiveIndex"]
                  }
                }
              ]
            : [
                {
                  name: "memorize_info",
                  description: "Memorize important details about the user, their name, what they are wearing/showing via the camera, their preferences, and the conversation details.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      memoryText: { type: Type.STRING, description: "Information to summarize and remember, e.g., 'ผู้ใช้ชื่อออฟ มีแมว 1 ตัว ชอบเรียนเรื่องสถานที่'" }
                    },
                    required: ["memoryText"]
                  }
                }
              ])
        ]
      }],
      speechConfig: {
        voiceConfig: { prebuiltVoiceConfig: { voiceName } },
      }
    });

    const liveCallbacks = {
      onmessage: (message: LiveServerMessage) => {
        const serverContent = (message as any).serverContent;
        
        // 1. Audio Output
        const parts = serverContent?.modelTurn?.parts;
        if (parts && clientWs.readyState === 1) {
          for (const part of parts) {
            if (part.inlineData?.data) {
              clientWs.send(JSON.stringify({ audio: part.inlineData.data }));
            }
          }
        }

        // 2. Output Transcription (AI's speech to text)
        const outTrans = serverContent?.outputTranscription;
        if (outTrans?.text && outTrans.text.trim() && clientWs.readyState === 1) {
          console.log("AI Transcription:", outTrans.text);
          clientWs.send(JSON.stringify({ type: 'transcript', role: 'model', text: outTrans.text }));
          addTranscriptChunk('model', outTrans.text);
        }

        // 3. Input Transcription (User's speech to text)
        const inTrans = serverContent?.inputTranscription;
        if (inTrans?.text && inTrans.text.trim() && clientWs.readyState === 1) {
          console.log("User Transcription:", inTrans.text);
          clientWs.send(JSON.stringify({ type: 'transcript', role: 'user', text: inTrans.text }));
          addTranscriptChunk('user', inTrans.text);
        }

        // Tool Call response
        if (message.toolCall && message.toolCall.functionCalls) {
          const toolResponses: any[] = [];
          for (const call of message.toolCall.functionCalls) {
            if (call.name === 'update_board') {
              if (clientWs.readyState === 1) {
                clientWs.send(JSON.stringify({ type: 'board_update', data: call.args }));
              }
              toolResponses.push({ 
                id: call.id, 
                name: call.name, 
                response: { result: "Board successfully updated and shown to user." } 
              });
            } else if (call.name === 'complete_mission_objective') {
              const objIdx = Number((call.args as any)?.objectiveIndex);
              const reason = String((call.args as any)?.reason || '');
              if (objIdx >= 1 && objIdx <= 3 && clientWs.readyState === 1) {
                console.log(`[Roleplay] Objective #${objIdx} completed: ${reason}`);
                clientWs.send(JSON.stringify({
                  type: 'roleplay_objective_completed',
                  objectiveIndex: objIdx,
                  reason
                }));
              }
              toolResponses.push({
                id: call.id,
                name: call.name,
                response: { result: `Objective ${objIdx} marked as completed on the learner's checklist. Continue staying in character naturally.` }
              });
            } else if (call.name === 'memorize_info') {
              const info = (call.args as any)?.memoryText as string;
              if (info && !isRoleplayMode) {
                 userMemory.push(info);
                 if (userMemory.length > 20) userMemory.shift();
                 sessionMemoryStore.set(cacheKey, userMemory);
                 console.log(`Memorized for ${cacheKey}:`, info);

                 if (db && userId) {
                   db.doc(`users/${userId}/memory/${targetLang}`).set({
                     memories: userMemory,
                     updatedAt: Date.now()
                   }, { merge: true }).catch(err => {
                     console.error("Failed to save memory to Firestore:", err);
                   });
                 }
              }
              toolResponses.push({ 
                id: call.id, 
                name: call.name, 
                response: { result: "Information memorized successfully." } 
              });
            }
          }
          if (toolResponses.length > 0 && session) {
             try {
               session.sendToolResponse({ functionResponses: toolResponses });
             } catch (e) {
               console.error("Error sending tool response:", e);
             }
          }
        }

        if (message.serverContent?.interrupted && clientWs.readyState === 1) {
           clientWs.send(JSON.stringify({ interrupted: true }));
        }
      },
      onclose: (event: any) => {
         sessionClosed = true;
         const closeCode = Number(event?.code || 0);
         const closeReason = String(event?.reason || "");
         console.log("Gemini session closed", {
           model: liveSessionOptions?.model,
           apiVersion: activeLiveApiVersion,
           code: closeCode,
           reason: closeReason,
           wasClean: event?.wasClean,
         });
         if (!isInitialConnecting && !clientClosed) {
           scheduleGeminiReconnect(closeReason, closeCode);
         }
      },
      onerror: (error: any) => {
         sessionClosed = true;
         const errText = error instanceof Error ? error.message : String(error?.message || error || "Unknown error");
         console.error("Gemini session error:", liveSessionOptions?.model, activeLiveApiVersion, errText);
         if (isInitialConnecting || clientClosed) return;
         if (clientWs.readyState === 1) {
           if (isInvalidKeyError(errText)) {
             clientWs.send(JSON.stringify({
               type: 'error',
               message: 'API Key ส่วนตัว (BYOK) ไม่ถูกต้องหรือหมดอายุ กรุณาตรวจสอบคีย์ในหน้าตั้งค่า BYOK ครับ'
             }));
             setTimeout(() => { try { clientWs.close(); } catch {} }, 300);
             return;
           }
           clientWs.send(JSON.stringify({ type: 'status', message: 'สาย AI หลุดชั่วคราว กำลังเชื่อมต่อใหม่...' }));
         }
         scheduleGeminiReconnect(errText);
      }
    };

    const scheduleGeminiReconnect = (errReason?: string, closeCode?: number) => {
      if (isInitialConnecting || clientClosed || clientWs.readyState !== 1 || upstreamReconnectTimer) return;

      if (errReason && isInvalidKeyError(errReason)) {
        clientWs.send(JSON.stringify({
          type: 'error',
          message: 'API Key ส่วนตัว (BYOK) ไม่ถูกต้อง หมดอายุ หรือถูกยกเลิกแล้ว กรุณาตรวจสอบคีย์ในหน้าตั้งค่า BYOK ครับ'
        }));
        setTimeout(() => { try { clientWs.close(); } catch {} }, 300);
        return;
      }

      if (upstreamReconnectAttempts >= 6) {
        clientWs.send(JSON.stringify({
          type: 'error',
          message: 'การเชื่อมต่อสาย AI ถูกตัดชั่วคราว กรุณากดเริ่มสนทนาใหม่อีกครั้งครับ'
        }));
        setTimeout(() => { try { clientWs.close(); } catch {} }, 300);
        return;
      }

      if (errReason && isQuotaOrRateLimitError(errReason)) {
        triggerLiveTpmFallback(errReason);
      } else if (
        closeCode === 1008 ||
        (errReason && isLiveModelCompatError(errReason))
      ) {
        if (!primaryModelUnavailableForSession && liveSessionOptions?.model === LIVE_PRIMARY_MODEL) {
          primaryModelUnavailableForSession = true;
          liveFallbackIdx = 0;
        } else if (liveFallbackIdx + 1 < LIVE_TPM_FALLBACK_MODELS.length) {
          liveFallbackIdx += 1;
        }
        if (liveSessionOptions) {
          liveSessionOptions.model = getActiveLiveModel();
        }
      } else if (liveSessionOptions) {
        liveSessionOptions.model = getActiveLiveModel();
      }

      const delay = Math.min(1000 + upstreamReconnectAttempts * 1000, 6000);
      upstreamReconnectAttempts += 1;
      if (clientWs.readyState === 1) {
        clientWs.send(JSON.stringify({ type: 'status', message: 'กำลังเชื่อมต่อสาย AI ใหม่อัตโนมัติ...' }));
      }
      upstreamReconnectTimer = setTimeout(async () => {
        upstreamReconnectTimer = null;
        if (clientClosed || clientWs.readyState !== 1) return;
        try {
          sessionClosed = true;
          const activeModel = getActiveLiveModel();
          liveSessionOptions = {
            model: activeModel,
            callbacks: liveCallbacks,
            config: buildLiveConnectConfig(),
          };
          sessionAi = getLiveClientForVersion(activeLiveApiVersion);
          session = await sessionAi.live.connect(liveSessionOptions);
          if (clientClosed || clientWs.readyState !== 1) {
            try { session.close(); } catch {}
            return;
          }
          sessionClosed = false;
          upstreamReconnectAttempts = 0;
          sendSavedDocumentContext();
          if (clientWs.readyState === 1) {
            clientWs.send(JSON.stringify({ type: 'ready', model: activeModel }));
            clientWs.send(JSON.stringify({ type: 'status', message: 'เชื่อมต่อสาย AI กลับมาสำเร็จแล้ว' }));
          }
        } catch (e: any) {
          sessionClosed = true;
          const errorMsg = String(e?.message || e || "");
          if (isInvalidKeyError(e)) {
            if (clientWs.readyState === 1) {
              clientWs.send(JSON.stringify({
                type: 'error',
                message: 'API Key ส่วนตัว (BYOK) ไม่ถูกต้องหรือหมดอายุ กรุณาตรวจสอบคีย์ในหน้าตั้งค่า BYOK ครับ'
              }));
              setTimeout(() => { try { clientWs.close(); } catch {} }, 300);
            }
            return;
          }
          if (isQuotaOrRateLimitError(e)) {
            triggerLiveTpmFallback(errorMsg);
          } else if (isLiveModelCompatError(e)) {
            if (!primaryModelUnavailableForSession && liveSessionOptions?.model === LIVE_PRIMARY_MODEL) {
              primaryModelUnavailableForSession = true;
              liveFallbackIdx = 0;
            } else if (liveFallbackIdx + 1 < LIVE_TPM_FALLBACK_MODELS.length) {
              liveFallbackIdx += 1;
            }
            liveSessionOptions.model = getActiveLiveModel();
          } else if (!errorMsg.includes("503") && !errorMsg.includes("UNAVAILABLE")) {
            console.error("Live API reconnect error:", errorMsg || "Reconnect failed");
          }
          scheduleGeminiReconnect(errorMsg);
        }
      }, delay);
    };
    try {
      if (!sessionAi) throw new Error("GenAI not initialized");

      // Try Live-only models on v1beta first (then v1alpha if needed).
      // STRICT 0-COST GUARD: getLiveClientForVersion uses ONLY the customer's BYOK key when isByokLiveSession === true.
      const liveModelsToTry = Array.from(
        new Set<string>([LIVE_PRIMARY_MODEL, ...LIVE_TPM_FALLBACK_MODELS])
      );
      const connectionAttempts: Array<{ model: string; apiVersion: "v1beta" | "v1alpha" }> = [
        ...liveModelsToTry.map((model) => ({ model, apiVersion: "v1beta" as const })),
        { model: LIVE_PRIMARY_MODEL, apiVersion: "v1alpha" as const },
        { model: LIVE_TPM_FALLBACK_MODELS[0], apiVersion: "v1alpha" as const },
      ];

      let connectedSession: any = null;
      let lastConnectErr: any = null;

      for (let i = 0; i < connectionAttempts.length; i++) {
        if (clientClosed || clientWs.readyState !== 1) break;
        const { model: candidateModel, apiVersion: candidateVersion } = connectionAttempts[i];
        activeLiveApiVersion = candidateVersion;
        sessionAi = getLiveClientForVersion(candidateVersion);
        liveSessionOptions = {
          model: candidateModel,
          callbacks: liveCallbacks,
          config: buildLiveConnectConfig(),
        };
        try {
          console.log(`[Live Connect] Trying ${candidateModel} (${candidateVersion}, BYOK: ${isByokLiveSession})...`);
          connectedSession = await sessionAi.live.connect(liveSessionOptions);
          if (candidateModel !== LIVE_PRIMARY_MODEL) {
            const fbIndex = LIVE_TPM_FALLBACK_MODELS.indexOf(candidateModel as any);
            if (fbIndex >= 0) liveFallbackIdx = fbIndex;
          }
          console.log(`[Live Connect] Connected successfully with ${candidateModel} (${candidateVersion})`);
          break;
        } catch (connectErr: any) {
          lastConnectErr = connectErr;
          const errStr = String(connectErr?.message || connectErr || "");
          console.warn(`[Live Connect] ${candidateModel} (${candidateVersion}) failed: ${errStr}`);
          if (isInvalidKeyError(connectErr)) {
            throw connectErr;
          }
          if (isQuotaOrRateLimitError(connectErr)) {
            triggerLiveTpmFallback(errStr);
            continue;
          }
          if (isLiveModelCompatError(connectErr) && candidateModel === LIVE_PRIMARY_MODEL && candidateVersion === "v1beta") {
            primaryModelUnavailableForSession = true;
            continue;
          }
          continue;
        }
      }

      if (!connectedSession) {
        throw lastConnectErr || new Error("ไม่สามารถเชื่อมต่อ Gemini Live API ได้");
      }

      if (clientClosed || clientWs.readyState !== 1) {
        try { connectedSession.close(); } catch {}
        return;
      }

      isInitialConnecting = false;
      session = connectedSession;
      sessionClosed = false;
      clientWs.send(JSON.stringify({ type: 'ready', model: liveSessionOptions.model }));

      const askWord = url.searchParams.get('askWord');
      
      // We only force the AI to speak on the very first connection, in Roleplay mode, or if there is an askWord
      const isFirstConnection = !hasGreetedBefore && userMemory.length === 0;

      let initialMessage = "";
      let shouldSendInitialGreeting = false;

      if (isRoleplayMode && roleplayInitData?.mission) {
        shouldSendInitialGreeting = true;
        const m = roleplayInitData.mission;
        const openingLine = targetLang === 'CN' ? m.openingLineCn : m.openingLineEn;
        initialMessage = targetLang === 'CN'
          ? `[角色扮演开始] 你现在是${m.aiRoleName} (${m.aiRoleTitleEn})，场景在${m.location}。请立刻自然地用中文说出开场白开始对话（不要解释规则，直接入戏）："${openingLine}"`
          : `[ROLEPLAY START] You are now ${m.aiRoleName} (${m.aiRoleTitleEn}) at ${m.location}. Immediately begin the scene in character by speaking your natural opening line (do not explain rules, jump straight into the role): "${openingLine}"`;
      } else if (askWord) {
         shouldSendInitialGreeting = true;
         if (isSeriousMode) {
           if (targetLang === 'CN') {
             initialMessage = `ผู้เรียนได้กดเลือกคำศัพท์นี้เพื่อให้คุณสอน: "${askWord}"
[ขณะนี้เปิด: โหมดฝึกพูดจริงจัง (Serious Mode)]
คำสั่งสำคัญ:
1. ทักทายสั้นๆ และเริ่มอธิบายคำศัพท์นี้ให้ผู้เรียนฟังทันที โดยใช้ "ภาษาจีน (Mandarin Chinese)" ในการสอนและสนทนาเป็นหลัก 100%!
2. อธิบายความหมาย วิธีใช้ ยกตัวอย่างประโยคเป็นภาษาจีน และชวนผู้เรียนฝึกออกเสียงหรือแต่งประโยคตาม
3. ชี้แนะและประเมินการออกเสียงและแกรมม่าของผู้เรียนอย่างจริงจัง
4. อย่าลืมเรียกใช้คำสั่ง update_board เพื่อแสดงคำศัพท์ "${askWord}", พินอิน และคำแปลบนหน้าจอกระดานด้วย`;
           } else {
             initialMessage = `The learner selected this vocabulary word for you to teach: "${askWord}"
[ACTIVE: Serious Speaking Practice Mode]
CRITICAL INSTRUCTIONS:
1. Greet briefly and immediately start teaching and explaining this vocabulary word primarily in ENGLISH (100% English immersion)!
2. Explain its definition, nuances, how to use it, and provide clear example sentences in English.
3. Prompt the learner to pronounce the word and try making their own sentence.
4. Strictly assess and correct any pronunciation or grammar mistakes.
5. Remember to call update_board to display "${askWord}", phonetic, and meaning on the user's whiteboard.`;
           }
         } else {
           // Normal Mode (โหมดปกติ): ALWAYS USE THAI AS THE PRIMARY TEACHING LANGUAGE
           initialMessage = `ผู้เรียนได้กดเลือกคำศัพท์นี้เพื่อให้คุณสอน: "${askWord}" (ภาษาเป้าหมายที่เรียน: ${targetLang === 'CN' ? 'ภาษาจีน' : 'ภาษาอังกฤษ'})
[ขณะนี้เปิด: โหมดปกติ (Normal Mode)]
กฎเหล็กและคำสั่งสำคัญ:
1. คุณต้องสอนและอธิบายคำศัพท์นี้ให้ผู้เรียนฟังทันที โดยใช้ "ภาษาไทยเป็นหลักในการสอนและสื่อสาร 100%"
2. ออกเสียงคำศัพท์เป้าหมาย "${askWord}" ให้ผู้เรียนฟังอย่างชัดเจน แล้วแปลความหมาย อธิบายวิธีการนำไปใช้ และยกตัวอย่างประโยคโดยอธิบายเป็น "ภาษาไทย" ทั้งหมดอย่างละเอียด เข้าใจง่าย และเป็นกันเอง
3. กระตุ้นและชวนให้ผู้เรียนลองออกเสียงตาม หรือถามความเข้าใจ
4. ห้ามอธิบายเป็นภาษาอังกฤษล้วนหรือภาษาจีนล้วนเด็ดขาด! ต้องอธิบายด้วยภาษาไทยเป็นหลัก เว้นแต่ผู้เรียนจะขอให้คุณพูดเป็นภาษาอื่น
5. อย่าลืมเรียกใช้คำสั่ง update_board เพื่อแสดงคำศัพท์ "${askWord}", พินอิน/phonetic, และคำแปลภาษาไทยบนหน้าจอกระดานของผู้เรียนด้วยเสมอ`;
         }
      }

      // Send initial text prompt to trigger the AI greeting ONLY if needed
      if (shouldSendInitialGreeting) {
        try {
          if (session.sendClientContent) {
            session.sendClientContent({
              turns: [
                {
                  role: "user",
                  parts: [{ text: initialMessage }]
                }
              ],
              turnComplete: true
            });
          }
        } catch (e: any) {
           console.error("send failed:", e.message);
        }
      }

    } catch (e: any) {
      isInitialConnecting = false;
      const errorMsg = String(e?.message || e || "");
      const sanitizedDetail = errorMsg.replace(/AIza[0-9A-Za-z_-]+/g, '[KEY]').slice(0, 140);
      console.error("[Live API init error]:", sanitizedDetail || "Connection failed");
      let friendlyMsg = `ไม่สามารถเชื่อมต่อสาย AI ได้ในขณะนี้ (${sanitizedDetail || 'Connection failed'}) กรุณาลองกดเริ่มสนทนาใหม่อีกครั้ง`;
      if (isInvalidKeyError(e)) {
        friendlyMsg = isByokLiveSession
          ? "API Key ส่วนตัว (BYOK) ไม่ถูกต้อง หมดอายุ หรือถูกยกเลิกแล้ว กรุณาตรวจสอบคีย์ในหน้าตั้งค่า BYOK ครับ"
          : "ระบบ AI ของเซิร์ฟเวอร์มีปัญหาเรื่อง API Key กรุณาติดต่อผู้ดูแลระบบ";
      } else if (isQuotaOrRateLimitError(e)) {
        friendlyMsg = isByokLiveSession
          ? "Google API Key ส่วนตัว (BYOK) ใช้งานครบโควตา Live API ชั่วคราวแล้ว กรุณารอสัก 1 นาทีแล้วลองคอลใหม่ครับ"
          : "โควตาการใช้งาน AI เต็มชั่วคราว กรุณารอสักครู่แล้วลองใหม่ครับ";
      }
      if (clientWs.readyState === 1) {
        clientWs.send(JSON.stringify({ type: 'error', message: friendlyMsg }));
        setTimeout(() => { try { clientWs.close(); } catch {} }, 500);
      }
      return;
    }

    clientWs.on("error", (err) => {
      console.error("Client WS Error:", err?.message || "Unknown error");
    });

    clientWs.on("message", (data) => {
      try {
        const parsed = JSON.parse(data.toString());
        let { audio, image, type, text, mimeType } = parsed;
        if (typeof text === 'string' && text.length > 12000) {
          text = `${text.slice(0, 12000)}\n\n[Document text truncated for live context]`;
        }
        
        if (type === 'doc_image' && image) {
           const docMimeType = typeof mimeType === 'string' && mimeType.startsWith('image/')
             ? mimeType
             : 'image/jpeg';
           latestDocImage = image;
           latestDocMimeType = docMimeType;
           if (!session || sessionClosed) return;
           try {
             if (session.sendClientContent) {
               session.sendClientContent({
                 turns: [
                   {
                     role: "user",
                     parts: [
                       { text: "The learner uploaded this image or PDF page as lesson context. Read it carefully, remember the visible text and layout, and use it when the learner asks. Do not read it aloud immediately unless asked. If the learner asks you to read it out loud, you MUST read the ENTIRE text visible in the image word-for-word from start to finish without summarizing or skipping anything." },
                       { inlineData: { mimeType: docMimeType, data: image } }
                     ]
                   }
                 ],
                 turnComplete: true
               });
             }
           } catch (e) {
             console.error("Error sending doc image to Gemini:", e);
           }
           return;
        }
        
        if (type === 'doc_context' && text) {
           latestDocText = text;
           if (!session || sessionClosed) return;
           try {
             if (session.sendClientContent) {
               session.sendClientContent({
                 turns: [
                   {
                     role: "user",
                     parts: [{ text: `ผู้เรียนได้เปิดหรืออัปโหลดเอกสารบทเรียนให้คุณดู นี่คือเนื้อหาทั้งหมดในเอกสารเพื่อเป็นบริบท (ห้ามอ่านออกเสียงเนื้อหานี้ทันที ให้รับรู้ไว้เฉยๆ และนำไปใช้สอนเมื่อผู้เรียนถามหรือเข้าสู่บทเรียน แต่ถ้าผู้เรียนสั่งให้อ่าน คุณจะต้องอ่านออกเสียงทุกตัวอักษรทุกบรรทัดตั้งแต่ต้นจนจบอย่างละเอียด ห้ามข้ามหรือสรุปความเด็ดขาด): \n\n${text}` }]
                   }
                 ],
                 turnComplete: true
               });
             }
           } catch (e) {
             console.error("Error sending doc context to Gemini:", e);
           }
        }
        
        if (type === 'ask_word' && typeof parsed.word === 'string' && parsed.word.trim()) {
           const targetWord = parsed.word.trim();
           console.log(`[Live Session] Received dynamic ask_word: ${targetWord}, isSeriousMode: ${isSeriousMode}, targetLang: ${targetLang}`);
           let promptMsg = "";
           if (isSeriousMode) {
             if (targetLang === 'CN') {
               promptMsg = `ผู้เรียนได้กดเลือกคำศัพท์ใหม่เพื่อให้คุณสอน: "${targetWord}"
[ขณะนี้เปิด: โหมดฝึกพูดจริงจัง]
คำสั่ง: เริ่มอธิบายคำศัพท์นี้ทันทีเป็นภาษาจีน (Mandarin Chinese) เป็นหลัก 100% ทั้งความหมาย วิธีใช้ และตัวอย่างประโยค พร้อมชวนผู้เรียนฝึกออกเสียงตาม และอย่าลืมเรียกใช้คำสั่ง update_board เพื่อขึ้นคำศัพท์บนกระดาน`;
             } else {
               promptMsg = `The learner selected a new vocabulary word to learn: "${targetWord}"
[ACTIVE: Serious Speaking Practice Mode]
CRITICAL: Immediately explain this word primarily in ENGLISH! Provide English definitions, usage, example sentences, and prompt the learner to pronounce it. Call update_board to update the whiteboard.`;
             }
           } else {
             promptMsg = `ผู้เรียนได้กดเลือกคำศัพท์ใหม่เพื่อให้คุณสอน: "${targetWord}" (ภาษาเป้าหมายที่เรียน: ${targetLang === 'CN' ? 'ภาษาจีน' : 'ภาษาอังกฤษ'})
[ขณะนี้เปิด: โหมดปกติ]
กฎเหล็ก: ให้เริ่มสอนคำศัพท์นี้ทันทีโดยใช้ "ภาษาไทยเป็นหลักในการสอนและอธิบาย 100%" ออกเสียงคำศัพท์ แปลความหมาย อธิบายวิธีใช้ และยกตัวอย่างประโยคเป็นภาษาไทยอย่างชัดเจน ชวนผู้เรียนลองออกเสียงตาม ห้ามอธิบายเป็นภาษาต่างประเทศล้วน เว้นแต่ผู้เรียนขอ และอย่าลืมเรียกใช้คำสั่ง update_board เพื่อแสดงคำศัพท์และคำแปลบนกระดานด้วย`;
           }
           if (session && !sessionClosed && session.sendClientContent) {
             try {
               session.sendClientContent({
                 turns: [{
                   role: "user",
                   parts: [{ text: promptMsg }]
                 }],
                 turnComplete: true
               });
             } catch (e: any) {
               console.error("Error sending dynamic ask_word to Gemini:", e?.message);
             }
           }
           return;
        }

        if (type === 'roleplay_request_hint' && isRoleplayMode) {
           const remaining = Array.isArray(parsed.remainingObjectives) && parsed.remainingObjectives.length > 0
             ? parsed.remainingObjectives.join('; ')
             : 'continue the conversation naturally';
           const hintPrompt = targetLang === 'CN'
             ? `[系统提示 - 求助模式] 学习者现在需要一句参考回复来完成接下来的任务 (${remaining})。请立刻调用 "update_board" 工具，在白板上显示 2 句自然实用的中文参考回复（word 填纯汉字句子，pinyin 填带声调拼音，meaning 填泰语翻译）。同时在语音中只需要保持角色温柔简短地等对方开口，不要长篇大论。`
             : `[SYSTEM HINT REQUEST] The learner requested a quick reply hint to advance their remaining mission objective(s): ${remaining}. Immediately call "update_board" with 2 natural, practical English reply options (word: suggested English sentence, pinyin: optional pronunciation tip or blank, meaning: concise Thai translation). Keep your spoken voice very brief and encouraging in character (e.g., "Take your time!"), without lecturing.`;
           if (session && !sessionClosed && session.sendClientContent) {
             try {
               session.sendClientContent({
                 turns: [{ role: "user", parts: [{ text: hintPrompt }] }],
                 turnComplete: true
               });
             } catch (e: any) {}
           }
           return;
        }

        if (type === 'roleplay_speak_slower' && isRoleplayMode) {
           const slowerPrompt = targetLang === 'CN'
             ? `[系统提示] 请保持角色，用更慢、更清晰、更简单的中文再说一遍刚才那句话，方便学习者听懂。`
             : `[SYSTEM NOTICE] Stay in character and repeat your last question or statement noticeably slower, clearer, and slightly simpler so the learner can easily catch every word.`;
           if (session && !sessionClosed && session.sendClientContent) {
             try {
               session.sendClientContent({
                 turns: [{ role: "user", parts: [{ text: slowerPrompt }] }],
                 turnComplete: true
               });
             } catch (e: any) {}
           }
           return;
        }

        if (type === 'toggle_serious_mode') {
           isSeriousMode = Boolean(parsed.seriousMode);
           console.log(`[Live Session] User dynamically toggled seriousMode to: ${isSeriousMode}`);
           let promptMsg = isSeriousMode
             ? (targetLang === 'CN'
                 ? `[ระบบแจ้งเตือน]: ผู้เรียนได้เปิด "โหมดฝึกพูดจริงจัง (Serious Mode)" แล้ว จากนี้เป็นต้นไปให้คุณสอนและสนทนาโดยใช้ภาษาจีน (Chinese) เป็นหลัก 100% คอยชี้แนะจุดออกเสียงผิดและให้คะแนนตลอดเวลา`
                 : `[SYSTEM NOTICE]: The learner switched ON "Serious Speaking Practice Mode". From now on, teach and communicate purely in English (100% immersive English), correct pronunciation and grammar strictly, and assess their speech!`)
             : `[ระบบแจ้งเตือน]: ผู้เรียนได้กลับสู่ "โหมดปกติ (Normal Mode)" แล้ว จากนี้เป็นต้นไป คุณต้องกลับมาใช้ "ภาษาไทยเป็นหลักในการสอนและสื่อสาร" เป็นกันเอง ใจดี อธิบายเข้าใจง่าย`;
           if (session && !sessionClosed && session.sendClientContent) {
             try {
               session.sendClientContent({
                 turns: [{
                   role: "user",
                   parts: [{ text: promptMsg }]
                 }],
                 turnComplete: true
               });
             } catch (e: any) {}
           }
           return;
        }

        if (audio && session && !sessionClosed) {
          try {
            session.sendRealtimeInput({
              audio: { mimeType: "audio/pcm;rate=16000", data: audio }
            });
          } catch (e) {
            console.error("Error sending audio to Gemini:", e);
          }
        }
        if (image && session && !sessionClosed) {
          try {
            const now = Date.now();
            if (now - lastImageInputAt < 1200) return;
            lastImageInputAt = now;
            session.sendRealtimeInput({
              video: { mimeType: "image/jpeg", data: image }
            });
          } catch (e) {
            console.error("Error sending image to Gemini:", e);
          }
        }
      } catch (e) {
        console.error("WS message error", e);
      }
    });

    clientWs.on("close", (code, reason) => {
      clientClosed = true;
      clearInterval(pingInterval);
      if (upstreamReconnectTimer) {
        clearTimeout(upstreamReconnectTimer);
        upstreamReconnectTimer = null;
      }
      console.log(`Client disconnected with code ${code} and reason ${reason}`);
      if (session) {
        try {
          session.close();
        } catch(e) {
          console.error("Error closing session", e);
        }
      }

      // Flush any pending speaker turn
      if (currentSpeaker && currentSpeakerText.trim()) {
        dialogueHistory.push({ role: currentSpeaker, text: currentSpeakerText.trim() });
      }

      // Save Live Call History to Firestore so AI never forgets across calls (Free Talk mode only)
      if (!isRoleplayMode && dialogueHistory.length >= 1 && db && userId) {
         (async () => {
           try {
              const docRef = db.doc(`users/${userId}/live_history/${targetLang}`);
              const docSnap = await docRef.get();
              let existingDialogue: any[] = [];
              if (docSnap.exists) {
                 existingDialogue = docSnap.data()?.dialogue || [];
              }
              // Append new dialogue and keep the last 100 turns
              let merged = [...existingDialogue, ...dialogueHistory];
              if (merged.length > 100) merged = merged.slice(-100);
              await docRef.set({
                 lang: targetLang,
                 updatedAt: Date.now(),
                 dialogue: merged
              });
              console.log(`[Live Session] Saved live history for user ${userId} (${targetLang}).`);
           } catch(e) {
              console.error("Failed to save live history", e);
           }
         })();
      }

      // Generate a Call Summary only if they had a real exchange of at least 2 turns and are logged in (Free Talk mode only)
      if (!isRoleplayMode && dialogueHistory.length >= 2 && db && userId) {
        (async () => {
          try {
            console.log(`[Live Session Summary] Generating recap for user ${userId} and target language ${targetLang}...`);
            const tutorPersona = targetLang === 'CN' ? personaBaseCN : personaBaseEN;
            const prompt = `นี่คือประวัติบทสนทนา (dialogue transcript) จากสายวิดีโอคอลล่าสุดระหว่างติวเตอร์ AI กับผู้เรียน:
${dialogueHistory.map(line => `${line.role === 'user' ? 'ผู้เรียน' : 'ติวเตอร์'}: ${line.text}`).join('\n')}

โปรดสวมบทบาทเป็นติวเตอร์คนเดียวกันนี้ (${tutorPersona}) เพื่อเขียนโน้ตสรุปส่งท้ายการคุยสายสั้นๆ อย่างอบอุ่น เป็นกันเอง และให้ความรู้ดีๆ (เช่น ทบทวนคำศัพท์ภาษา${targetLang === 'CN' ? 'จีน' : 'อังกฤษ'}ที่พูดถึงในสาย, จุดที่ออกเสียงได้ดี, จุดที่ควรฝึกฝนเพิ่ม) เป็นภาษาไทย เพื่อบันทึกไว้ในช่องแชทข้อความ ให้ผู้เรียนสามารถนำไปทบทวนได้ในภายหลัง

คำแนะนำ:
- สรุปอย่างเป็นธรรมชาติ อบอุ่น และน่ารักเสมือนเพิ่งวางสายคุยกันจริงๆ
- ใช้ภาษาไทยในการอธิบายเป็นหลัก และเขียนภาษา${targetLang === 'CN' ? 'จีนหรืออังกฤษ' : 'อังกฤษหรือจีน'}เป็นตัวอย่างคำศัพท์ที่ได้เรียน
- ห้ามเกริ่นคำอธิบายอื่นๆ ให้ตอบเฉพาะตัวข้อความโน้ตสรุปที่คุณจะส่งให้ผู้เรียนเท่านั้น`;

            const summaryRes = await generateContentWithByokFallback({
              contents: prompt,
              useByokQuota: isByokLiveSession,
              strictByokOnly: isByokLiveSession,
              byokKey: isByokLiveSession ? cleanLiveByokKey : null,
              byokProfile: "flash_lite",
              serverDefaultModel: "gemini-3.8-flash",
              getServerClient: isByokLiveSession ? undefined : getServerGeminiClient,
            });

            const callSummaryText = summaryRes.text;
            if (callSummaryText && callSummaryText.trim()) {
              // Fetch latest text chat session for targetLang
              const chatSnap = await db.collection(`users/${userId}/chat_sessions`)
                .where('lang', '==', targetLang)
                .orderBy('createdAt', 'desc')
                .limit(1)
                .get();

              if (!chatSnap.empty) {
                const latestChatDoc = chatSnap.docs[0];
                const latestChat = latestChatDoc.data();
                const messages = latestChat.messages || [];
                
                // Append the call summary message
                const updatedMessages = [
                  ...messages,
                  {
                    id: `call_summary_${Date.now()}`,
                    role: 'model',
                    text: callSummaryText.trim(),
                    createdAt: Date.now(),
                    isCallSummary: true
                  }
                ];

                await latestChatDoc.ref.update({
                  messages: updatedMessages,
                  updatedAt: Date.now()
                });
                console.log(`[Live Session Summary] Successfully posted call summary to chat session: ${latestChatDoc.id}`);
              }
            }
          } catch (summaryErr) {
            console.error("[Live Session Summary] Failed to generate/save summary:", summaryErr);
          }
        })();
      }
    });
  });

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT} (mode: ${isProdMode ? 'production' : 'development'})`);
  });
}

startServer();
