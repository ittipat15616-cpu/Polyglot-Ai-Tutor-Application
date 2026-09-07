import dotenv from "dotenv";
dotenv.config({ path: [".env.local", ".env"] });
import express from "express";
import path from "path";
import http from "http";
import fs from "fs";
import os from "os";
import { EdgeTTS } from "node-edge-tts";
import { WebSocketServer, WebSocket } from "ws";
import { PDFDocument } from 'pdf-lib';
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, LiveServerMessage, Modality, Type, ThinkingLevel } from "@google/genai";
import { initializeApp, applicationDefault, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

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
  const PORT = 3000;

  app.use(express.json());

  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Validate user-provided Gemini API Key (BYOK)
  app.post("/api/validate-key", express.json(), async (req, res) => {
    try {
      const { apiKey } = req.body;
      if (!apiKey || typeof apiKey !== "string" || apiKey.trim().length < 10) {
        return res.status(400).json({ valid: false, message: "กรุณาระบุ Gemini API Key ให้ถูกต้อง" });
      }
      const cleanKey = apiKey.trim();
      const testAi = new GoogleGenAI({ apiKey: cleanKey });
      let testResult: any = null;
      try {
        testResult = await testAi.models.generateContent({
          model: "gemini-3.8-flash",
          contents: "Hello",
        });
      } catch (err1: any) {
        console.warn("Validation with gemini-3.8-flash failed, trying gemini-flash-latest...", err1?.message);
        try {
          testResult = await testAi.models.generateContent({
            model: "gemini-flash-latest",
            contents: "Hello",
          });
        } catch (err2: any) {
          console.warn("Validation with gemini-flash-latest failed, trying gemini-3.1-flash-lite...", err2?.message);
          testResult = await testAi.models.generateContent({
            model: "gemini-3.1-flash-lite",
            contents: "Hello",
          });
        }
      }
      if (testResult && (testResult.text || testResult.candidates)) {
        return res.json({ valid: true, message: "Gemini API Key ใช้งานได้สมบูรณ์และถูกต้อง!" });
      }
      return res.status(400).json({ valid: false, message: "ไม่สามารถทดสอบ API Key ได้ กรุณาลองใหม่อีกครั้ง" });
    } catch (err: any) {
      const errMsg = err?.message || "";
      console.error("BYOK key validation failed:", errMsg);
      if (errMsg.includes("API key not valid") || errMsg.includes("400") || errMsg.includes("API_KEY_INVALID")) {
        return res.status(400).json({ valid: false, message: "API Key ไม่ถูกต้อง หรือถูกยกเลิกแล้วจาก Google AI Studio" });
      }
      if (errMsg.includes("403") || errMsg.includes("PERMISSION_DENIED")) {
        return res.status(403).json({ valid: false, message: "API Key นี้ไม่มีสิทธิ์เข้าถึง หรือถูกระงับการใช้งาน" });
      }
      return res.status(400).json({ valid: false, message: `ไม่สามารถตรวจสอบคีย์ได้: ${errMsg.slice(0, 120)}` });
    }
  });

  app.get("/api/downloads", (req, res) => {
    try {
      const manifestPath = path.join(process.cwd(), "src/data/image_manifest.json");
      const manifestData = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
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

  
  app.post("/api/chat", express.json(), async (req, res) => {
    try {
      const { message, history, lang, userId, byokKey } = req.body;
      const explicitKey = byokKey || (req.headers['x-byok-key'] as string);
      const client = getGeminiClient(explicitKey);
      
      // Ensure the history alternates properly, starting with 'user'
      let contents = [];
      if (history && Array.isArray(history)) {
        // Skip any leading 'model' messages to avoid Invalid Role Sequence errors
        const firstUserIndex = history.findIndex((h: any) => h.role === 'user');
        if (firstUserIndex !== -1) {
          contents = history.slice(firstUserIndex);
        }
      }
      contents.push({ role: 'user', parts: [{ text: message }] });

      const personaBaseEN = `คุณคือติวเตอร์สอนภาษาอังกฤษ AI ชื่อ "Mr.Pe" เป็นผู้ชายหล่อเท่ อายุประมาณ 25 ปี สอนชิวๆ สบายๆ ไม่ดุนักเรียนเลย สอนสนุกน่าฟัง มีความใจดี อธิบายได้ละเอียดและเข้าใจง่าย และมีความติดตลกฮาๆเล็กน้อย คุณจำเรื่องราวต่างๆ ของผู้เรียนและสิ่งที่คุยกันได้ข้ามสาย ทั้งตอนพิมพ์แชทและตอนโทรวิดีโอคอลคุยกันเสมือนคุณคือคนๆ เดียวกันอย่างแท้จริง`;
      const personaBaseCN = `คุณคือติวเตอร์สอนภาษาจีน AI ชื่อ "李老师" (Li Laoshi) หรือในภาษาไทยคือ "หลี่เหล่าซือ" เป็นคุณครูผู้หญิงวัยประมาณ 30 ปีที่มีความน่ารักมากๆ อบอุ่น อารมณ์ดี น้ำเสียงร่าเริงสดใส อ่อนหวานและใจดีไม่ดุ แต่ในตอนสอนมีความจริงจังและมุ่งมั่น คุณจำเรื่องราวต่างๆ ของผู้เรียนและสิ่งที่คุยกันได้ข้ามสาย ทั้งตอนพิมพ์แชทและตอนโทรวิดีโอคอลคุยกันเสมือนคุณคือคนๆ เดียวกันอย่างแท้จริง`;

      const activePersona = lang === 'CN' ? personaBaseCN : personaBaseEN;

      // Fetch global memories from Firestore if userId is specified, otherwise use cache
      let userMemory: string[] = [];
      const userKey = userId || "anonymous";
      const cacheKey = `${userKey}_${lang}`;

      if (db && userId) {
        try {
          const memoryDoc = await db.doc(`users/${userId}/memory/${lang}`).get();
          if (memoryDoc.exists) {
            const memories = memoryDoc.data()?.memories;
            if (Array.isArray(memories)) {
              userMemory = memories;
              sessionMemoryStore.set(cacheKey, userMemory);
            }
          }
        } catch (err) {
          console.error("Error loading memories in /api/chat:", err);
        }
      } else {
        userMemory = sessionMemoryStore.get(cacheKey) || [];
      }

      let memoriesStr = "";
      if (userMemory.length > 0) {
        memoriesStr = `\n\n[ข้อมูลสำคัญและความจำสะสมเกี่ยวกับผู้เรียนที่คุณบันทึกไว้ในระบบ (โปรดจดจำข้อมูลเหล่านี้และใช้ในการโต้ตอบอย่างเป็นธรรมชาติเสมือนว่าจำได้จริงๆ ทั้งในแชทนี้และตอนคอลคุยกัน): \n- ${userMemory.join("\n- ")}]`;
      }

      const systemInstruction = `${activePersona}

คุณจะคอยให้คำแนะนำช่วยเหลือผู้เรียนด้วยความใจดี ตอบแชทแบบอบอุ่น เป็นกันเอง และอธิบายข้อมูลภาษาอย่างสั้นกระชับเข้าใจง่าย${memoriesStr}

IMPORTANT MEMORY RULE: หากผู้เรียนเปิดเผยข้อมูลส่วนตัวหรือความต้องการที่น่าจดจำ (เช่น ชื่อเล่น, อาชีพ, งานอดิเรก, สัตว์เลี้ยง, ระดับภาษา, เป้าหมายเรียนรู้) หรือข้อมูลความรู้อื่นๆ ที่ควรบันทึกไว้ในความจำยาวเพื่อนำไปใช้พูดคุยทักทายในการแชทครั้งต่อไปหรือในการโทรวิดีโอคอล/โทรเสียงครั้งหน้า ให้เรียกใช้ฟังก์ชัน "memorize_info" เพื่อจดจำข้อมูลนั้นลงในระบบสมองของคุรร่วมกันข้ามแพลตฟอร์มทันที!`;

      const memorizeInfoDeclaration = {
        name: "memorize_info",
        description: "Memorize important details about the user, their name, preferences, goals, and learning context so you can remember them across sessions and during video/voice calls.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            memoryText: { type: Type.STRING, description: "Information to summarize and remember, e.g., 'ผู้ใช้ชื่อเก่ง ชอบเรียนจีนเพื่อสื่อสารทางธุรกิจ'" }
          },
          required: ["memoryText"]
        }
      };

      const chatConfig = {
        systemInstruction,
        tools: [{ functionDeclarations: [memorizeInfoDeclaration] }]
      };

      // Query Gemini
      let response = await client.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: contents,
        config: chatConfig
      });

      // Handle function calling if Gemini returned one
      if (response.functionCalls && response.functionCalls.length > 0) {
        const call = response.functionCalls[0];
        if (call.name === 'memorize_info') {
          const info = (call.args as any)?.memoryText as string;
          if (info) {
            userMemory.push(info);
            // limit memory size to prevent context overflow (keep last 20)
            if (userMemory.length > 20) userMemory.shift();
            sessionMemoryStore.set(cacheKey, userMemory);
            console.log(`[Chat API] Memorized for ${cacheKey}:`, info);

            // Save to Firestore if logged in
            if (db && userId) {
              try {
                await db.doc(`users/${userId}/memory/${lang}`).set({
                  memories: userMemory,
                  updatedAt: Date.now()
                }, { merge: true });
                console.log(`[Chat API] Firestore memory updated for ${userId} (${lang})`);
              } catch (err) {
                console.error("[Chat API] Failed to save memory to Firestore:", err);
              }
            }
          }

          // Fetch the final text response from Gemini by providing the tool response
          const assistantContent = response.candidates?.[0]?.content;
          const toolContent = {
            role: 'tool',
            parts: [{
              functionResponse: {
                name: 'memorize_info',
                response: { result: "Information successfully memorized for future chats and voice calls." }
              }
            }]
          };

          const secondResponse = await client.models.generateContent({
            model: 'gemini-3.8-flash',
            contents: [...contents, assistantContent, toolContent],
            config: chatConfig
          });

          res.json({ text: secondResponse.text });
        } else {
          res.json({ text: response.text });
        }
      } else {
        res.json({ text: response.text });
      }
    } catch (e: any) {
      console.error("Chat API error:", e);
      const isQuota = e.message && (e.message.includes("429") || e.message.includes("RESOURCE_EXHAUSTED"));
      res.status(isQuota ? 429 : 500).json({ error: e.message || "Something went wrong" });
    }
  });

  app.post("/api/grade-vocab", async (req, res) => {
    try {
      const { answers, lang, byokKey } = req.body;
      const explicitKey = byokKey || (req.headers['x-byok-key'] as string);
      const ai = getGeminiClient(explicitKey);
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

      const response = await ai.models.generateContent({
        model: "gemini-3.1-pro-preview",
        contents: prompt,
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH },
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

      let text = response.text || "[]";
      res.json(JSON.parse(text));
    } catch (e: any) {
      console.error(e);
      const isQuota = e.message && (e.message.includes("429") || e.message.includes("RESOURCE_EXHAUSTED"));
      res.status(isQuota ? 429 : 500).json({ error: e.message });
    }
  });

  
  app.post("/api/grade-speaking", express.json({ limit: "200mb" }), async (req, res) => {
    try {
      const { audios, examId, byokKey } = req.body;
      if (!audios || audios.length === 0) return res.status(400).json({ error: "Missing audio" });
      const explicitKey = byokKey || (req.headers['x-byok-key'] as string);
      const ai = getGeminiClient(explicitKey);
      const prompt = `You are an expert IELTS examiner. Listen to the following IELTS Speaking response(s) and grade it.
First, provide a transcript of what the user said (and infer the question they are answering if possible).
Then, evaluate based on Fluency and Coherence, Lexical Resource, Grammatical Range and Accuracy, and Pronunciation.
Provide the result strictly in this JSON format (no markdown tags):
{
  "bandScore": 7.0,
  "transcript": "Question: ...\n\nAnswer: ...",
  "feedback": "Overall detailed feedback...",
  "strengths": ["strength 1", "strength 2"],
  "weaknesses": ["weakness 1", "weakness 2"]
}`;

      const parts: any[] = [{text: prompt}];
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
            
            // Extract page 1 (index 0) where the speaking prompts are usually located
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

      const response = await ai.models.generateContent({
        model: "gemini-3.1-pro-preview",
        contents: parts,
        config: { thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH } }
      });
      let text = response.text || "{}";
      text = text.replace(/\`\`\`json/g, "").replace(/\`\`\`/g, "").trim();
      res.json(JSON.parse(text));
    } catch (e: any) {
      console.error("Gemini API Error in Speaking:", e);
      console.warn("Returning mock result for Speaking due to API failure.");
      return res.json({
        bandScore: 6.5,
        transcript: "Mock Transcript: (Could not transcribe due to AI API limits or model unavailability, returning mock result)",
        feedback: "Mock Feedback: This is a placeholder feedback because the AI API is currently unavailable (Quota Exhausted or Model Not Found).",
        strengths: ["Clear pronunciation", "Good attempt at answering"],
        weaknesses: ["Need more complex grammar", "Vocabulary could be more varied"]
      });
    }
  });

  app.post("/api/grade-writing", async (req, res) => {
    try {
      const { prompt, examId, byokKey } = req.body;
      const explicitKey = byokKey || (req.headers['x-byok-key'] as string);
      const ai = getGeminiClient(explicitKey);
      
      const parts: any[] = [{ text: prompt }];

      if (examId) {
        try {
          const pdfUrl = `https://firebasestorage.googleapis.com/v0/b/polyglot-ai-tuto.firebasestorage.app/o/IELTS_Mock_Tests%2F${examId}%2FWriting_Full.pdf?alt=media`;
          const pdfRes = await fetch(pdfUrl);
          if (pdfRes.ok) {
            const buffer = Buffer.from(await pdfRes.arrayBuffer());
            const pdfDoc = await PDFDocument.load(buffer);
            const newPdf = await PDFDocument.create();
            
            // The user wants Page 1 and Page 3 (0-indexed: 0 and 2)
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

      const response = await ai.models.generateContent({
        model: "gemini-3.1-pro-preview",
        contents: parts,
        config: { thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH } }
      });

      let text = response.text || "{}";
      text = text.replace(/```json/g, "").replace(/```/g, "").trim();
      res.json(JSON.parse(text));
    } catch (e: any) {
      console.error("Gemini API Error in Writing:", e);
      console.warn("Returning mock result for Writing due to API failure.");
      return res.json({
        bandScore: 6.5,
        feedback: "Mock Feedback: This is a placeholder feedback because the AI API is currently unavailable (Quota Exhausted or Model Not Found).",
        strengths: ["Good overall structure", "Task requirements met"],
        weaknesses: ["Grammar mistakes present", "Vocabulary is somewhat basic"]
      });
    }
  });

  app.post("/api/generate-learning-plan", express.json(), async (req, res) => {
    try {
      const { answers, targetLang, byokKey } = req.body;
      if (!answers) {
        return res.status(400).json({ error: "Missing answers" });
      }

      const explicitKey = byokKey || (req.headers['x-byok-key'] as string);
      const client = getGeminiClient(explicitKey);

      const prompt = `คุณเป็น AI ผู้เชี่ยวชาญด้านการวางแผนการเรียนภาษา${targetLang === 'CN' ? 'จีน' : targetLang === 'EN' ? 'อังกฤษ' : 'ไทย'}
ผู้เรียนได้ทำแบบสอบถามดังนี้:
${answers.map((a: any) => `- ${a.question} ตอบ: ${a.answer}`).join('\n')}

จงสร้างแผนการเรียน 30 วัน ที่อ่านง่าย ไม่ซับซ้อนเกินไป เน้นการลงมือทำจริงตามฟีเจอร์ที่มีในแอป โดยใช้ภาษาไทยและใช้ Markdown ให้สวยงาม

**เงื่อนไขสำคัญมาก**: ไม่ว่าเป้าหมายของผู้ใช้คืออะไร ต้องมีการสอดแทรกการท่องจำคำศัพท์ทุกวันเสมอ

สิ่งที่คุณต้องมีในแผนการเรียนนี้อย่างครบถ้วน (จัดรูปแบบให้กระชับ ชัดเจน):

1. **เป้าหมายและภารกิจสำหรับวันนี้ (Today's Mission)**: (สำคัญมาก ให้อยู่ส่วนแรกสุด) บอกเป้าหมายและภารกิจที่ต้องทำเป็นข้อๆ โดยอ้างอิงฟีเจอร์ในแอป (ให้ปรับจำนวนหรือระดับให้เหมาะกับผู้ใช้) **ตัวอย่างรูปแบบที่ต้องการ**:
   - ไปที่หน้าคลังคำศัพท์ เรียนรู้คำศัพท์...คำ ระดับ... พร้อมฟังเสียงและออกเสียงตาม และแต่งประโยคคำละ 1 ประโยค (ให้เวลาเรียนรู้ไม่เกิน 1 นาทีต่อคำ)
   - ไปที่หน้าแฟลชการ์ด เปิดคำที่เรียนไป อ่านผ่านๆ แบบเปิดคำแปล จากนั้นปิดคำแปลแล้วอ่าน หากติดขัดให้ทวนซ้ำ พอคล่องแล้วให้เปิดคำแปลปิดคำศัพท์ แล้วพูดประโยคที่แต่งไว้
   - ไปหน้าคัดศัพท์ เขียนคำศัพท์ ความหมาย และประโยคลงไป (ไม่ต้องเขียนคำอ่านถ้าเป็นภาษาอังกฤษ)
   - ไปหน้าเกมคำศัพท์ แนะนำให้เล่น Word Scramble เพื่อสะกดให้แม่นยำ และ Wall Smasher เพื่อฝึกออกเสียง และเล่นเกมอื่นอีก 1 เกม
   - ไปหน้าสอบศัพท์ ทดสอบคำที่เรียนไป พลาดคำไหนให้ทวน
   - ไปหน้าบทเรียน (ระบุบทเรียนที่เหมาะสม) เพื่อเรียนรู้...
   - ไปหน้าข้อสอบ (ถ้ามี) ลองทำข้อสอบ...

2. **ภาพรวมเป้าหมายระยะสั้นและระยะยาว**: สรุปสิ่งที่จะได้เรียนรู้เมื่อจบวันที่ 1, วันที่ 2, สิ้นสัปดาห์ที่ 1, สิ้นสัปดาห์ที่ 2, และสิ้นเดือน

3. **แผนรายสัปดาห์ และรายวัน (สำหรับวันที่ 2-30)**:
   - **แผนรายสัปดาห์**: สรุปเป้าหมายหลัก
   - **แผนรายวัน**: อธิบายภารกิจของแต่ละวันให้กระชับ นำเสนอเป็น bullet points ที่ทำตามได้ง่ายๆ อิงกับหน้าต่างๆ ของแอปเหมือนตัวอย่างด้านบน พร้อมการทบทวน (Review) สิ่งที่เรียนไป

ข้อกำหนด:
- จัดรูปแบบด้วย Markdown (##, ###) และ Bullet points ให้สวยงาม อ่านง่าย ไม่เยิ่นเย้อ
- ปรับเนื้อหา ความยาก และความเข้มข้นให้ตรงกับเวลาเรียน เป้าหมาย และสไตล์ของผู้ใช้
`;

      const response = await client.models.generateContent({
        model: "gemini-3.1-pro-preview",
        contents: prompt
      });

      const planMarkdown = response.text;
      if (!planMarkdown) {
        return res.status(500).json({ error: "Failed to generate plan" });
      }

      res.json({ plan: planMarkdown });
    } catch (e: any) {
      console.error("Learning Plan API Error:", e);
      res.status(500).json({ error: e.message || "Learning Plan generation failed" });
    }
  });

  app.post("/api/verify-slip", express.json({ limit: "50mb" }), async (req, res) => {
    try {
      const { imageUrl, expectedAmount, byokKey } = req.body;
      if (!imageUrl || !expectedAmount) {
        return res.status(400).json({ error: "Missing imageUrl or expectedAmount" });
      }

      const explicitKey = byokKey || (req.headers['x-byok-key'] as string);
      const client = getGeminiClient(explicitKey);

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

  app.post("/api/synthesize", async (req, res) => {
    try {
      const { text, lang, voice: customVoice, rate: customRate } = req.body;
      if (!text) {
        return res.status(400).json({ error: "Missing text" });
      }

      // Default English voice to cool, clear male voice: en-US-ChristopherNeural
      let voice = 'en-US-ChristopherNeural';
      let edgeLang = 'en-US';
      if (lang === 'CN' || lang === 'ZH' || lang === 'Chinese') {
          voice = 'zh-CN-XiaoxiaoNeural';
          edgeLang = 'zh-CN';
      } else if (lang === 'TH' || lang === 'Thai') {
          voice = 'th-TH-NiwatNeural';
          edgeLang = 'th-TH';
      } else if (lang === 'Japanese') {
          voice = 'ja-JP-NanamiNeural';
          edgeLang = 'ja-JP';
      } else if (lang === 'Korean') {
          voice = 'ko-KR-SunHiNeural';
          edgeLang = 'ko-KR';
      } else if (lang === 'French') {
          voice = 'fr-FR-DeniseNeural';
          edgeLang = 'fr-FR';
      } else if (lang === 'Spanish') {
          voice = 'es-ES-ElviraNeural';
          edgeLang = 'es-ES';
      } else if (lang === 'German') {
          voice = 'de-DE-KatjaNeural';
          edgeLang = 'de-DE';
      } else if (lang === 'Italian') {
          voice = 'it-IT-ElsaNeural';
          edgeLang = 'it-IT';
      } else if (lang === 'Russian') {
          voice = 'ru-RU-SvetlanaNeural';
          edgeLang = 'ru-RU';
      } else if (lang === 'Arabic') {
          voice = 'ar-SA-ZariyahNeural';
          edgeLang = 'ar-SA';
      } else if (lang === 'Hindi') {
          voice = 'hi-IN-SwaraNeural';
          edgeLang = 'hi-IN';
      } else if (lang === 'Portuguese') {
          voice = 'pt-BR-FranciscaNeural';
          edgeLang = 'pt-BR';
      } else if (lang === 'Vietnamese') {
          voice = 'vi-VN-HoaiMyNeural';
          edgeLang = 'vi-VN';
      }

      // If a custom valid voice is requested, use it
      if (customVoice) {
        voice = customVoice;
      }

      const cacheKey = `${voice}:${text}:${customRate || ""}`;
      if (ttsCache.has(cacheKey)) {
        return res.json({ audio: ttsCache.get(cacheKey) });
      }

      const ttsRate = customRate || "default";

      const tts = new EdgeTTS({ voice, lang: edgeLang, rate: ttsRate });
      const tempFile = path.join(os.tmpdir(), `tts_${Date.now()}_${Math.floor(Math.random()*1000)}.mp3`);
      await tts.ttsPromise(text, tempFile);
      const audioData = fs.readFileSync(tempFile, { encoding: 'base64' });
      fs.unlinkSync(tempFile);

      if (audioData) {
        ttsCache.set(cacheKey, audioData);
        if (ttsCache.size > 500) {
            const firstKey = ttsCache.keys().next().value;
            if (firstKey) ttsCache.delete(firstKey);
        }
        res.json({ audio: audioData });
      } else {
        res.status(500).json({ error: "Failed to generate audio" });
      }
    } catch (e: any) {
      console.error("TTS Error:", e);
      res.status(500).json({ error: e.message || "TTS failed" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath, {
      setHeaders: (res, path) => {
        if (path.endsWith('index.html') || path.endsWith('sw.js')) {
          res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        }
      }
    }));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
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
    const isSeriousMode = url.searchParams.get('seriousMode') === 'true';
    const userId = url.searchParams.get('userId') || null;
    const byokKey = url.searchParams.get('byokKey');

    // If client provided a valid BYOK key, use it directly so that this session NEVER touches the server's key
    let sessionAi: GoogleGenAI | null = null;
    if (byokKey && typeof byokKey === 'string' && byokKey.trim().length > 10) {
      try {
        sessionAi = new GoogleGenAI({ apiKey: byokKey.trim() });
        console.log(`[Live Session] Successfully using customer BYOK key for ${userId || clientId} (Server key is NOT used)`);
      } catch (err) {
        console.warn("[Live Session] Error setting up BYOK key:", err);
      }
    }

    // Fallback to system key ONLY if BYOK key is not provided
    if (!sessionAi) {
      try {
        sessionAi = getGeminiClient();
      } catch (err: any) {
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

    // Load memories and recent chat history from Firestore if available
    let chatHistoryContext = "";
    if (db && userId) {
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

    if (targetLang === 'EN' || targetLang === 'English') {
      voiceName = 'Charon';
    } else if (targetLang === 'CN' || targetLang === 'Chinese') {
      voiceName = 'Aoede';
    }

    let personaDetails = `${targetLang === 'CN' ? personaBaseCN : personaBaseEN}`;
    if (isSeriousMode) {
      personaDetails += `

[SERIOUS SPEAKING PRACTICE MODE ACTIVATED]
คุณต้องพูดคุยตอบโต้กับผู้เรียนโดยใช้ภาษาเป้าหมาย (${targetLang === 'CN' ? 'Chinese' : 'English'}) เป็นหลัก และคอยให้คะแนน ประเมินความคืบหน้าตลอดการสนทนา! 
- คุณต้องชี้แนะจุดอ่อนและจุดแข็งของผู้เรียน
- หากผู้เรียนออกเสียงพลาด เพี้ยน หรือพูดผิดแกรมม่า ให้ชี้แจงจุดที่ผิดและบอกรูปประโยคหรือการออกเสียงที่ถูกต้องเสมอ
- ประเมินคะแนนการพูดให้ผู้เรียนฟังบ่อยๆ
- ในโหมดนี้ คุณจะสอนอย่างจริงจังและเข้มงวดมากขึ้นเพื่อเน้นฝึกการพูดและการฟังล้วนๆ!`;
    } else {
      personaDetails += `

IMPORTANT INSTRUCTION: The user is learning ${targetLang === 'CN' ? 'Chinese' : 'English'}. However, the user's preferred spoken language for explanations and general communication is ${spokenLang}. You MUST explain concepts, translate words, and communicate with the user primarily in ${spokenLang}, while teaching them ${targetLang === 'CN' ? 'Chinese' : 'English'}.`;
    }


    const memoryContext = userMemory.length > 0 
      ? `\n[ความรู้เกี่ยวกับผู้เรียนและบริบทสนทนาที่ผ่านมา (โปรดจำไว้และใช้ในการสนทนาต่อเนื่อง): \n- ${userMemory.join("\n- ")}]` 
      : '';

    const systemInstruction = `${personaDetails}
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

    let session: any;
    let sessionClosed = false;
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
    const scheduleGeminiReconnect = () => {
      if (clientWs.readyState !== 1 || upstreamReconnectTimer) return;
      const delay = Math.min(1000 + upstreamReconnectAttempts * 1000, 8000);
      upstreamReconnectAttempts += 1;
      if (clientWs.readyState === 1) {
        clientWs.send(JSON.stringify({ type: 'status', message: 'AI live session reconnecting in the background...' }));
      }
      upstreamReconnectTimer = setTimeout(async () => {
        upstreamReconnectTimer = null;
        if (clientWs.readyState !== 1) return;
        try {
          sessionClosed = true;
          session = await sessionAi.live.connect(liveSessionOptions);
          sessionClosed = false;
          upstreamReconnectAttempts = 0;
          sendSavedDocumentContext();
          if (clientWs.readyState === 1) {
            clientWs.send(JSON.stringify({ type: 'status', message: 'AI live session reconnected.' }));
          }
        } catch (e: any) {
          sessionClosed = true;
          const errorMsg = e?.message || "";
          if (!errorMsg.includes("429") && !errorMsg.includes("503") && !errorMsg.includes("Quota") && !errorMsg.includes("RESOURCE_EXHAUSTED") && !errorMsg.includes("UNAVAILABLE")) {
            console.error("Live API reconnect error:", errorMsg || "Reconnect failed");
          }
          scheduleGeminiReconnect();
        }
      }, delay);
    };
    try {
      if (!sessionAi) throw new Error("GenAI not initialized");
      console.log("Connecting to Gemini Live API...");
      liveSessionOptions = {
        model: "gemini-3.1-flash-live-preview",
        callbacks: {
          onmessage: (message: LiveServerMessage) => {
            // Audio response and transcription
            const parts = (message as any).serverContent?.modelTurn?.parts;
            if (parts && clientWs.readyState === 1) {
              console.log("Received AI turn with parts", parts.length);
              for (const part of parts) {
                if (part.inlineData?.data) {
                  clientWs.send(JSON.stringify({ audio: part.inlineData.data }));
                }
                if (part.text && part.text.trim()) {
                  console.log("AI Transcription chunk:", part.text);
                  clientWs.send(JSON.stringify({ type: 'transcript', role: 'model', text: part.text }));
                  addTranscriptChunk('model', part.text);
                }
              }
            } else if ((message as any).serverContent?.modelTurn) {
               console.log("Received AI turn without parts?");
            }

            // User transcription
            const userParts = (message as any).serverContent?.userTurn?.parts;
            if (userParts && clientWs.readyState === 1) {
              for (const part of userParts) {
                if (part.text && part.text.trim()) {
                  console.log("User Transcription chunk:", part.text);
                  clientWs.send(JSON.stringify({ type: 'transcript', role: 'user', text: part.text }));
                  addTranscriptChunk('user', part.text);
                }
              }
            }

            // Tool Call response
            if (message.toolCall && message.toolCall.functionCalls) {
              const toolResponses: any[] = [];
              for (const call of message.toolCall.functionCalls) {
                if (call.name === 'update_board') {
                  clientWs.send(JSON.stringify({ type: 'board_update', data: call.args }));
                  toolResponses.push({ 
                    id: call.id, 
                    name: call.name, 
                    response: { result: "Board successfully updated and shown to user." } 
                  });
                } else if (call.name === 'memorize_info') {
                  const info = (call.args as any)?.memoryText as string;
                  if (info) {
                     userMemory.push(info);
                     // limit memory size to prevent context overflow (keep last 20)
                     if (userMemory.length > 20) userMemory.shift();
                     sessionMemoryStore.set(cacheKey, userMemory);
                     console.log(`Memorized for ${cacheKey}:`, info);

                     // Write to Firestore if logged in
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
              if (toolResponses.length > 0) {
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
             console.log("Gemini session closed", {
               code: event?.code,
               reason: event?.reason,
               wasClean: event?.wasClean,
             });
             scheduleGeminiReconnect();
          },
          onerror: (error: any) => {
             sessionClosed = true;
             console.error("Gemini session error:", error instanceof Error ? error.message : "Unknown error");
             if (clientWs.readyState === 1) {
                 clientWs.send(JSON.stringify({ type: 'error', message: 'AI live session disconnected. Reconnecting...' }));
             }
             scheduleGeminiReconnect();
          }
        },
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction: { parts: [{ text: systemInstruction }] },
          outputAudioTranscription: {},
          inputAudioTranscription: {},
          tools: [{
            functionDeclarations: [
              {
                name: "update_board",
                description: "Update the shared whiteboard screen to display vocabulary, grammar, sentences, or poems to the user.",
                parameters: {
                  type: Type.OBJECT,
                  properties: {
                    items: {
                      type: Type.ARRAY,
                      description: "List of items to display on the board. For a long sentence, paragraph, poem, or passage, keep each coherent sentence/paragraph together in a single item so the board remains tidy and readable. You can provide as many items as needed.",
                      items: {
                        type: Type.OBJECT,
                        properties: {
                          word: { type: Type.STRING, description: "The word, full sentence, poem, or grammar point to teach" },
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
            ]
          }],
          speechConfig: {
             voiceConfig: { prebuiltVoiceConfig: { voiceName } },
          }
        },
      };
      session = await sessionAi.live.connect(liveSessionOptions);

      const askWord = url.searchParams.get('askWord');
      
      // We only force the AI to speak on the very first connection or if there is an askWord
      const isFirstConnection = !hasGreetedBefore && userMemory.length === 0;

      let initialMessage = "";
      let shouldSendInitialGreeting = false;

      if (askWord) {
         initialMessage = `ผู้เรียนต้องการถามและเรียนรู้เกี่ยวกับคำศัพท์นี้: "${askWord}" ให้เริ่มทักทายสั้นๆ และอธิบายคำศัพท์นี้ให้ฟังทันที พร้อมตัวอย่างประโยค และกระตุ้นให้ผู้เรียนบอกความหมายหรือลองออกเสียงตาม โดยระหว่างอธิบายอย่าลืมใช้คำสั่ง update_board เพื่อแสดงคำศัพท์นี้บนหน้าจอด้วย`;
         shouldSendInitialGreeting = true;
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
      const errorMsg = e?.message || "";
      if (!errorMsg.includes("429") && !errorMsg.includes("503") && !errorMsg.includes("Quota") && !errorMsg.includes("RESOURCE_EXHAUSTED") && !errorMsg.includes("UNAVAILABLE")) {
         console.error("Live API init error:", errorMsg || "Connection failed");
      }
      clientWs.send(JSON.stringify({ type: 'error', message: 'โควต้าการใช้งาน AI เต็มหรือระบบขัดข้อง กรุณาลองใหม่ภายหลัง' }));
      setTimeout(() => clientWs.close(), 1000);
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

               // Background OCR text extraction
               (async () => {
                 try {
                   const ocrResponse = await sessionAi.models.generateContent({
                     model: "gemini-3.8-flash",
                     contents: [
                       {
                         role: "user",
                         parts: [
                           { text: "Extract all text exactly as written from this image. Do not add explanations. Just return the text verbatim." },
                           { inlineData: { mimeType: docMimeType, data: image } }
                         ]
                       }
                     ]
                   });
                   const extractedText = ocrResponse.text;
                   if (extractedText && extractedText.trim().length > 0 && session && !sessionClosed) {
                     latestDocText = extractedText;
                     session.sendClientContent({
                       turns: [
                         {
                           role: "user",
                           parts: [
                             { text: `[System Update] I have successfully extracted all text from the recently uploaded image to help you read it accurately. Here is the full extracted text. If the user asks you to read the image aloud, read this text verbatim from start to finish without skipping anything:\n\n${extractedText}` }
                           ]
                         }
                       ],
                       turnComplete: true
                     });
                   }
                 } catch (ocrErr) {
                   console.error("Background OCR Error:", ocrErr);
                 }
               })();
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

      // Save Live Call History to Firestore so AI never forgets across calls
      if (dialogueHistory.length >= 1 && db && userId) {
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

      // Generate a Call Summary only if they had a real exchange of at least 2 turns and are logged in
      if (dialogueHistory.length >= 2 && db && userId) {
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

            const summaryResponse = await sessionAi.models.generateContent({
              model: "gemini-3.8-flash",
              contents: prompt
            });

            const callSummaryText = summaryResponse.text;
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
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
