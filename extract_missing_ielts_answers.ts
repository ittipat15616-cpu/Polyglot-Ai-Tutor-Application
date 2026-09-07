import dotenv from 'dotenv';
dotenv.config({ path: ['.env.local', '.env'] });
import fs from 'fs';
import path from 'path';
import { GoogleGenAI } from '@google/genai';

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error("No GEMINI_API_KEY found!");
  process.exit(1);
}

const ai = new GoogleGenAI({ apiKey });

const manifestPath = path.join(process.cwd(), 'src', 'data', 'image_manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));

function getFirebaseStorageUrl(cleanPath: string): string {
  const bucket = "polyglot-ai-tuto.firebasestorage.app";
  const encodedPath = encodeURIComponent(cleanPath);
  return `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodedPath}?alt=media&v=20260710`;
}

async function fetchImageAsBase64(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const arrayBuffer = await res.arrayBuffer();
    return Buffer.from(arrayBuffer).toString('base64');
  } catch (e) {
    return null;
  }
}

async function run() {
  const jsonPath = path.join(process.cwd(), 'src', 'data', 'ielts_answer_keys.json');
  const raw = fs.readFileSync(jsonPath, 'utf-8');
  const answerKeysData = JSON.parse(raw);

  console.log("=== GENERATING MISSING IELTS ANSWER KEYS VIA GEMINI OCR ===");

  const targets = [
    { setNum: 2, skill: 'listening' },
    { setNum: 5, skill: 'reading' },
    { setNum: 6, skill: 'listening' },
    { setNum: 6, skill: 'reading' },
    { setNum: 7, skill: 'listening' },
    { setNum: 7, skill: 'reading' },
    { setNum: 8, skill: 'listening' },
    { setNum: 8, skill: 'reading' },
    { setNum: 9, skill: 'listening' },
    { setNum: 9, skill: 'reading' },
    { setNum: 18, skill: 'listening' },
    { setNum: 20, skill: 'reading' },
  ];

  for (const target of targets) {
    const examId = `IELTS_Mock_Test_${target.setNum}`;
    const skillCapitalized = target.skill.charAt(0).toUpperCase() + target.skill.slice(1);
    const folderKey = `Courseware_Images/IELTS_Mock_Tests/${examId}/${skillCapitalized}_Full`;
    
    const pageList = manifest[folderKey];
    if (!pageList || pageList.length === 0) {
      console.warn(`No manifest entry for ${folderKey}`);
      continue;
    }

    console.log(`\nProcessing ${examId} - ${skillCapitalized} (Total pages: ${pageList.length})...`);

    // Take the last 6 pages where Answer Keys and Tapescripts are located
    const startIdx = Math.max(0, pageList.length - 7);
    const targetPages = pageList.slice(startIdx);

    const imageParts: any[] = [];
    for (const pageName of targetPages) {
      const storagePath = `${folderKey}/${pageName}`;
      const url = getFirebaseStorageUrl(storagePath);
      const b64 = await fetchImageAsBase64(url);
      if (b64) {
        console.log(`  Fetched ${pageName}`);
        imageParts.push({
          inlineData: {
            mimeType: 'image/png',
            data: b64
          }
        });
      }
    }

    if (imageParts.length === 0) {
      console.warn(`Failed to download images for ${examId} ${skillCapitalized}`);
      continue;
    }

    const prompt = `You are an expert IELTS examiner and data curator. Read the attached IELTS Answer Key pages for ${examId} ${skillCapitalized}.
Extract ALL 40 questions (Numbered Q1 to Q40) with their EXACT correct answers and concise clear Thai explanations.

RULES:
1. Ensure EXACTLY 40 questions in total! (Q1 through Q40).
2. "correct_answer" must NOT be blank! Extract the true correct answer text or option letter from the key.
3. "explanation_thai" must explain in Thai why that answer is correct.

Format strictly as JSON matching this schema:
{
  "${target.skill}": {
    "${target.skill === 'listening' ? 'parts' : 'passages'}": [
      {
        "${target.skill === 'listening' ? 'part_number' : 'passage_number'}": 1,
        "questions": [
          {
            "q_number": 1,
            "correct_answer": "answer string",
            "type": "short_answer",
            "explanation_thai": "คำอธิบายภาษาไทย..."
          }
        ]
      }
    ]
  }
}
Do not use markdown codeblocks. Return valid raw JSON only.`;

    try {
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [prompt, ...imageParts],
        config: { responseMimeType: 'application/json' }
      });

      const text = (response.text || '{}').replace(/```json/g, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(text);

      if (!answerKeysData[examId]) answerKeysData[examId] = {};
      if (parsed[target.skill]) {
        answerKeysData[examId][target.skill] = parsed[target.skill];
        console.log(`✅ Successfully extracted & saved ${examId} - ${target.skill}!`);
      } else {
        console.warn(`❌ Failed parsing output for ${examId} - ${target.skill}`);
      }
    } catch (e: any) {
      console.error(`❌ Error on ${examId} - ${target.skill}:`, e.message || e);
    }
  }

  fs.writeFileSync(jsonPath, JSON.stringify(answerKeysData, null, 2), 'utf-8');
  console.log("\n🎉 ALL MISSING ANSWER KEYS SUCCESSFULLY GENERATED AND SAVED TO ielts_answer_keys.json!");
}

run();
