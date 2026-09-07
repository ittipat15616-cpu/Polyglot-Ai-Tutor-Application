import { GoogleGenAI } from '@google/genai';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error('GEMINI_API_KEY is missing!');
  process.exit(1);
}

const ai = new GoogleGenAI({ apiKey });

async function analyzeSamples() {
  console.log('--- GEMINI 2.5 FLASH MULTIMODAL PDF IMAGE ANALYSIS ---');

  const files = fs.readdirSync('./scratch_pdf_samples');

  for (const file of files) {
    if (!file.endsWith('.jpg')) continue;
    const filePath = path.join('./scratch_pdf_samples', file);
    const imageBytes = fs.readFileSync(filePath).toString('base64');

    try {
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [
          {
            role: 'user',
            parts: [
              {
                inlineData: {
                  mimeType: 'image/jpeg',
                  data: imageBytes
                }
              },
              {
                text: 'Extract the exact lesson title, topic, unit/part number, and level written on this page image. If it is a VOA Learning English report, specify the title.'
              }
            ]
          }
        ]
      });

      console.log(`\n========================================`);
      console.log(`FILE: ${file}`);
      console.log(`ANALYSIS: ${response.text?.trim()}`);
    } catch (e: any) {
      console.error(`Error analyzing ${file}:`, e.message || e);
    }
  }
}

analyzeSamples();
