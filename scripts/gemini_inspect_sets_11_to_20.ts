import { GoogleGenAI } from '@google/genai';
import { storage } from '../src/firebase';
import { ref, getDownloadURL } from 'firebase/storage';
import manifest from '../src/data/image_manifest.json';
import dotenv from 'dotenv';
import axios from 'axios';

dotenv.config({ path: '.env.local' });

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error('Missing GEMINI_API_KEY');
  process.exit(1);
}

const ai = new GoogleGenAI({ apiKey });

async function inspectSets11to20() {
  console.log('--- INSPECTING SETS 11 TO 20 PAGE 1 WITH GEMINI VISION ---');

  for (let i = 11; i <= 20; i++) {
    const key = `Courseware_Images/IELTS_Mock_Tests/IELTS_Mock_Test_${i}/Reading_Full`;
    const files = (manifest as any)[key] || [];
    const firstPage = files.find((f: string) => f === 'page1.jpg' || f === 'page_1.jpg') || files[0];

    if (!firstPage) {
      console.log(`Set ${i}: No first page found!`);
      continue;
    }

    try {
      const fullPath = `${key}/${firstPage}`;
      const url = await getDownloadURL(ref(storage, fullPath));
      const imgRes = await axios.get(url, { responseType: 'arraybuffer', timeout: 8000 });
      const imageBytes = Buffer.from(imgRes.data).toString('base64');

      const res = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [
          {
            role: 'user',
            parts: [
              { inlineData: { mimeType: 'image/jpeg', data: imageBytes } },
              { text: 'Describe what is shown on this page image. What question numbers or passage numbers start on this page?' }
            ]
          }
        ]
      });

      console.log(`\n========================================`);
      console.log(`SET ${i} (First Page: ${firstPage}):`);
      console.log(res.text?.trim());
    } catch (e: any) {
      console.error(`Error analyzing Set ${i}:`, e.message || e);
    }
  }
}

inspectSets11to20();
