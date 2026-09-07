import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
dotenv.config({ path: ['.env.local', '.env'] });

import { GoogleGenAI } from '@google/genai';
import { hsk3Data } from './src/data/hsk3Data';

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error('Missing GEMINI_API_KEY');
  process.exit(1);
}

const ai = new GoogleGenAI({ apiKey });

async function generateBatch(wordsSlice: any[]) {
  const prompt = `You are a native Chinese & Thai lexicographer. Generate short, simple, concise Thai translations (คำแปลภาษาไทย สั้นๆ ง่ายๆ ได้ใจความ) for these HSK 3 vocabulary words. 
Also generate a highly natural Chinese example sentence and its Thai translation.

Return ONLY a valid JSON array of objects with the exact format:
[
  {
    "word": "<word>",
    "th": "<short simple Thai translation>",
    "example": "<natural Chinese example sentence>",
    "exampleTh": "<Thai translation of the example sentence>"
  }
]

Words to process:
${wordsSlice.map((w, idx) => `${idx + 1}. ${w.word} (${w.en || ''})`).join('\n')}`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
      }
    });
    const text = response.text || '[]';
    return JSON.parse(text);
  } catch (e) {
    console.error('Error generating batch:', e);
    return [];
  }
}

async function run() {
  // 1. Fix the last word at index 972
  const lastItem = hsk3Data[hsk3Data.length - 1];
  if (lastItem.word.includes('初')) {
    lastItem.word = '初一';
    lastItem.pinyin = 'chū yī';
    lastItem.en = 'first day of lunar month / New Year\'s Day';
    lastItem.th = 'วันแรกของปีใหม่ตามจันทรคติ/วันเที่ยว';
    lastItem.example = '大年初一我们去拜年。';
    lastItem.exampleTh = 'วันแรกของปีใหม่พวกเราไปอวยพรปีใหม่';
  }

  // 2. Generate TH for indices 899 to 971 (length 73)
  const targetItems = hsk3Data.slice(899, 972);
  console.log(`Processing ${targetItems.length} items...`);
  
  const batchSize = 25;
  const batches: any[][] = [];
  for (let i = 0; i < targetItems.length; i += batchSize) {
    batches.push(targetItems.slice(i, i + batchSize));
  }

  const allBatchResults = await Promise.all(batches.map(b => generateBatch(b)));

  let updatedCount = 0;
  for (const results of allBatchResults) {
    for (const gen of (results || [])) {
      const itemIndex = hsk3Data.findIndex(x => x.word === gen.word);
      if (itemIndex >= 899 && itemIndex <= 971 && gen.word) {
        if (gen.th) hsk3Data[itemIndex].th = gen.th;
        if (gen.example) hsk3Data[itemIndex].example = gen.example;
        if (gen.exampleTh) hsk3Data[itemIndex].exampleTh = gen.exampleTh;
        updatedCount++;
      }
    }
  }

  console.log(`Updated ${updatedCount} words with short Thai translations.`);

  // 3. Re-sort the entire array by pinyin
  hsk3Data.sort((a, b) => {
    const normalize = (str) => (str || '').normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    return normalize(a.pinyin).localeCompare(normalize(b.pinyin));
  });

  // 4. Save file
  const filePath = path.join(process.cwd(), 'src/data/hsk3Data.ts');
  const fileContent = `export const hsk3Data = ${JSON.stringify(hsk3Data, null, 2)};\n`;
  fs.writeFileSync(filePath, fileContent, 'utf-8');
  console.log('SUCCESSFULLY SAVED hsk3Data.ts!');
}

run();
