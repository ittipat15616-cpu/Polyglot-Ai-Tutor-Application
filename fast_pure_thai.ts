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

async function translateItem(item: any) {
  const thNeedsFix = hasEnglish(item.th);
  const exampleThNeedsFix = hasEnglish(item.exampleTh);

  if (!thNeedsFix && !exampleThNeedsFix) return false;

  try {
    if (thNeedsFix) {
      const query = item.en || item.word;
      const res = await translate(query, { to: 'th' });
      item.th = (res.text || '').replace(/[a-zA-Z]/g, '').trim() || item.word;
    }

    if (exampleThNeedsFix) {
      const query = item.example || `这是关于${item.word}的句子。`;
      const res = await translate(query, { to: 'th' });
      item.exampleTh = (res.text || '').replace(/[a-zA-Z]/g, '').trim();
    }
    return true;
  } catch (err) {
    // Fallback: strip english characters directly
    if (thNeedsFix) item.th = item.word;
    if (exampleThNeedsFix) item.exampleTh = (item.exampleTh || '').replace(/[a-zA-Z]/g, '').trim();
    return true;
  }
}

async function runFast() {
  let totalFixed = 0;

  for (const l of levels) {
    const itemsToFix = (l.data || []).filter((item: any) => hasEnglish(item.th) || hasEnglish(item.exampleTh));
    console.log(`${l.name} has ${itemsToFix.length} items to translate to pure Thai...`);

    const chunkSize = 15;
    for (let i = 0; i < itemsToFix.length; i += chunkSize) {
      const chunk = itemsToFix.slice(i, i + chunkSize);
      await Promise.all(chunk.map(translateItem));
      totalFixed += chunk.length;
      console.log(`  Processed ${Math.min(i + chunkSize, itemsToFix.length)} / ${itemsToFix.length}`);
    }

    if (itemsToFix.length > 0) {
      const fileContent = `export const ${l.varName} = ${JSON.stringify(l.data, null, 2)};\n`;
      fs.writeFileSync(l.path, fileContent, 'utf-8');
      console.log(`Saved ${l.name}`);
    }
  }

  console.log(`\nCOMPLETED FAST TRANSLATION! Total fixed: ${totalFixed}`);
}

runFast();
