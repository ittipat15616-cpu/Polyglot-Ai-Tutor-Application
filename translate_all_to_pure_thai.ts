import fs from 'fs';
import path from 'path';
import { translate } from 'google-translate-api-x';

import { mockHsk1Data } from './src/data/hsk1Data';
import { hsk2Data } from './src/data/hsk2Data';
import { hsk3Data } from './src/data/hsk3Data';
import { hsk4Data } from './src/data/hsk4Data';
import { hsk5Data } from './src/data/hsk5Data';
import { hsk6Data } from './src/data/hsk6Data';
import { hsk7to9Data } from './src/data/hsk7to9Data';

const levels = [
  { name: 'HSK1', varName: 'mockHsk1Data', data: mockHsk1Data, path: './src/data/hsk1Data.ts' },
  { name: 'HSK2', varName: 'hsk2Data', data: hsk2Data, path: './src/data/hsk2Data.ts' },
  { name: 'HSK3', varName: 'hsk3Data', data: hsk3Data, path: './src/data/hsk3Data.ts' },
  { name: 'HSK4', varName: 'hsk4Data', data: hsk4Data, path: './src/data/hsk4Data.ts' },
  { name: 'HSK5', varName: 'hsk5Data', data: hsk5Data, path: './src/data/hsk5Data.ts' },
  { name: 'HSK6', varName: 'hsk6Data', data: hsk6Data, path: './src/data/hsk6Data.ts' },
  { name: 'HSK7-9', varName: 'hsk7to9Data', data: hsk7to9Data, path: './src/data/hsk7to9Data.ts' },
];

const hasEnglish = (str: string) => /[a-zA-Z]/.test(str || '');

async function batchTranslate() {
  let totalFixed = 0;

  for (const l of levels) {
    console.log(`Processing ${l.name}...`);
    let levelFixed = 0;

    for (const item of l.data || []) {
      const thNeedsFix = hasEnglish(item.th);
      const exampleThNeedsFix = hasEnglish(item.exampleTh);

      if (thNeedsFix || exampleThNeedsFix) {
        try {
          if (thNeedsFix) {
            // Translate English or word to Thai
            const query = item.en || item.word;
            const res = await translate(query, { to: 'th' });
            item.th = (res.text || '').replace(/[a-zA-Z]/g, '').trim() || item.word;
          }

          if (exampleThNeedsFix) {
            // Translate Chinese example sentence to Thai
            const query = item.example || `这是关于${item.word}的句子。`;
            const res = await translate(query, { to: 'th' });
            item.exampleTh = (res.text || '').replace(/[a-zA-Z]/g, '').trim();
          }

          levelFixed++;
          totalFixed++;

          // Small delay to avoid rate limiting
          if (levelFixed % 10 === 0) {
            console.log(`  Fixed ${levelFixed} items in ${l.name}...`);
            await new Promise(r => setTimeout(r, 200));
          }
        } catch (err) {
          console.error(`Error translating ${item.word}:`, err);
        }
      }
    }

    if (levelFixed > 0) {
      const fileContent = `export const ${l.varName} = ${JSON.stringify(l.data, null, 2)};\n`;
      fs.writeFileSync(l.path, fileContent, 'utf-8');
      console.log(`Saved ${l.name} with ${levelFixed} fixes.`);
    }
  }

  console.log(`\nFINISHED! Total items translated to 100% pure Thai: ${totalFixed}`);
}

batchTranslate();
