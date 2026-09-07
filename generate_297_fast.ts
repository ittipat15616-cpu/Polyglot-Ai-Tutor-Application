import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
dotenv.config({ path: ['.env.local', '.env'] });
import { GoogleGenAI } from '@google/genai';
import { hsk7to9Data } from './src/data/hsk7to9Data';

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error('Missing GEMINI_API_KEY');
  process.exit(1);
}

const ai = new GoogleGenAI({ apiKey });

async function generateBatch(wordsSlice: any[]) {
  const prompt = `You are a native Chinese & Thai lexicographer. Generate highly natural, realistic, authentic Chinese example sentences for these HSK 7-9 vocabulary words, along with pure, natural Thai translations for both the word definition and the sentence.

DO NOT use any repetitive templates or placeholders like "这是关于...". Each sentence must be unique, contextually realistic, and sound like a real native Chinese speaker writing or speaking.

Return ONLY a valid JSON array of objects with the exact format:
[
  {
    "word": "<word>",
    "th": "<pure natural Thai translation of the word>",
    "example": "<natural Chinese example sentence>",
    "exampleTh": "<pure natural Thai translation of the example sentence>"
  }
]

Words to process:
${wordsSlice.map((w, idx) => `${idx + 1}. ${w.word} (${w.en || w.th || ''})`).join('\n')}
`;

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
  const total = hsk7to9Data.length;
  const countToFix = 297;
  const startIndex = total - countToFix;

  const targetItems = hsk7to9Data.slice(startIndex);
  console.log(`Parallel processing last ${targetItems.length} items...`);

  const batchSize = 25;
  const batches: any[][] = [];
  for (let i = 0; i < targetItems.length; i += batchSize) {
    batches.push(targetItems.slice(i, i + batchSize));
  }

  const allBatchResults = await Promise.all(batches.map(b => generateBatch(b)));

  let updatedCount = 0;
  for (const results of allBatchResults) {
    for (const gen of (results || [])) {
      const itemIndex = hsk7to9Data.findIndex(x => x.word === gen.word);
      if (itemIndex >= startIndex && gen.word) {
        if (gen.th) hsk7to9Data[itemIndex].th = gen.th;
        if (gen.example) hsk7to9Data[itemIndex].example = gen.example;
        if (gen.exampleTh) hsk7to9Data[itemIndex].exampleTh = gen.exampleTh;
        updatedCount++;
      }
    }
  }

  console.log(`Updated ${updatedCount} words with Gemini native sentences.`);

  // Save file
  const filePath = path.join(process.cwd(), 'src/data/hsk7to9Data.ts');
  const fileContent = `export const hsk7to9Data = ${JSON.stringify(hsk7to9Data, null, 2)};\n`;
  fs.writeFileSync(filePath, fileContent, 'utf-8');
  console.log('SUCCESSFULLY SAVED hsk7to9Data.ts!');
}

run();
