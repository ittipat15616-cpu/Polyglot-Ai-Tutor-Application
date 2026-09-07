import { GoogleGenAI, Type } from '@google/genai';
import fs from 'fs';
import { hsk7to9Data } from './src/data/hsk7to9Data';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function run() {
  const untranslated = hsk7to9Data.filter(w => w.th === w.en || /^[a-zA-Z\s,;\.\-\(\)'"\d]+$/.test(w.th) || w.th === "นี่คือตัวอย่างเกี่ยวกับ" || w.exampleTh.includes("นี่คือตัวอย่างเกี่ยวกับ"));
  console.log(`Need to translate: ${untranslated.length}`);

  const CHUNK_SIZE = 200;
  const chunks = [];
  for (let i = 0; i < untranslated.length; i += CHUNK_SIZE) {
    chunks.push(untranslated.slice(i, i + CHUNK_SIZE));
  }

  let completed = 0;
  const CONCURRENCY = 4;
  
  async function processChunk(chunk, index) {
    console.log(`Processing chunk ${index + 1} of ${chunks.length}...`);
    const payload = chunk.map(w => ({
      word: w.word,
      pinyin: w.pinyin,
      en: w.en,
      example: w.example
    }));

    try {
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: `Translate these Chinese words to short, simple Thai meanings. Also translate the example sentence to Thai. The output must be valid JSON array.\n\nInput:\n${JSON.stringify(payload)}`,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                word: { type: Type.STRING },
                th: { type: Type.STRING, description: 'Short and simple Thai meaning' },
                exampleTh: { type: Type.STRING, description: 'Thai translation of the example' }
              },
              required: ['word', 'th', 'exampleTh']
            }
          }
        }
      });
      
      const translatedChunk = JSON.parse(response.text);
      
      for (const t of translatedChunk) {
        const item = hsk7to9Data.find(x => x.word === t.word);
        if (item) {
          item.th = t.th;
          item.exampleTh = t.exampleTh;
        }
      }
      completed++;
      console.log(`Chunk ${index + 1} done! (${completed}/${chunks.length})`);
    } catch (e) {
      console.error(`Chunk ${index + 1} failed:`, e.message);
      throw e;
    }
  }

  // Run with concurrency
  for (let i = 0; i < chunks.length; i += CONCURRENCY) {
    const batch = chunks.slice(i, i + CONCURRENCY);
    await Promise.all(batch.map((chunk, j) => processChunk(chunk, i + j)));
    saveData(hsk7to9Data); // Save after each batch
  }

  // Final Sort
  const getSortKey = (str) => {
    if (!str) return '';
    return str.replace(/[üǖǘǚǜ]/g, 'v').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  };
  hsk7to9Data.sort((a, b) => {
    const pinyinA = getSortKey(a.pinyin);
    const pinyinB = getSortKey(b.pinyin);
    const isAlphaA = /^[a-z]/i.test(pinyinA);
    const isAlphaB = /^[a-z]/i.test(pinyinB);
    if (isAlphaA && !isAlphaB) return -1;
    if (!isAlphaA && isAlphaB) return 1;
    if (pinyinA !== pinyinB) {
      return pinyinA.localeCompare(pinyinB);
    }
    return a.word.localeCompare(b.word);
  });
  saveData(hsk7to9Data);
  console.log('Finished translation and sorting!');
}

function saveData(data) {
  const content = `export const hsk7to9Data = ${JSON.stringify(data, null, 2)};\n`;
  fs.writeFileSync('./src/data/hsk7to9Data.ts', content, 'utf-8');
}

run().catch(console.error);
