import fs from 'fs';
import { translate } from 'google-translate-api-x';
import { hsk7to9Data } from './src/data/hsk7to9Data';

const hasEnglish = (str: string) => /[a-zA-Z]/.test(str || '');

async function run() {
  const needsFix = hsk7to9Data.filter(item => 
    hasEnglish(item.th) || item.th === item.en || 
    hasEnglish(item.exampleTh) || item.exampleTh.includes('นี่คือตัวอย่างเกี่ยวกับ') || item.exampleTh.includes('นี่คือตัวอย่างประโยคของคำว่า')
  );

  console.log(`Total items needing translation: ${needsFix.length}`);

  const CHUNK_SIZE = 50; 
  let processed = 0;

  for (let i = 0; i < needsFix.length; i += CHUNK_SIZE) {
    const chunk = needsFix.slice(i, i + CHUNK_SIZE);
    console.log(`Processing chunk ${Math.floor(i/CHUNK_SIZE)+1} of ${Math.ceil(needsFix.length/CHUNK_SIZE)}...`);

    const texts = [];
    for (const item of chunk) {
      texts.push(item.en || item.word);
      texts.push(item.example || `这是关于“${item.word}”的例子。`);
    }

    try {
      const res = await translate(texts, { to: 'th' });
      for (let j = 0; j < chunk.length; j++) {
        const item = chunk[j];
        const thRes = res[j * 2].text;
        const exRes = res[j * 2 + 1].text;

        item.th = thRes.replace(/[a-zA-Z]/g, '').trim() || item.word;
        item.exampleTh = exRes.replace(/[a-zA-Z]/g, '').trim();
      }
      processed += chunk.length;
      console.log(`Translated ${processed} / ${needsFix.length}`);
      
      // Save progressively
      fs.writeFileSync('./src/data/hsk7to9Data.ts', `export const hsk7to9Data = ${JSON.stringify(hsk7to9Data, null, 2)};\n`, 'utf-8');
    } catch (e) {
      console.error(`Error on chunk ${Math.floor(i/CHUNK_SIZE)+1}:`, e.message);
      // Wait for a few seconds before retrying individually
      await new Promise(r => setTimeout(r, 2000));
      for (let j = 0; j < chunk.length; j++) {
          const item = chunk[j];
          try {
              const resTh = await translate(item.en || item.word, { to: 'th', forceBatch: false });
              item.th = resTh.text.replace(/[a-zA-Z]/g, '').trim() || item.word;
              
              const resEx = await translate(item.example || `这是关于“${item.word}”的例子。`, { to: 'th', forceBatch: false });
              item.exampleTh = resEx.text.replace(/[a-zA-Z]/g, '').trim();
              
              processed++;
          } catch(err) {
              console.error(`Failed individual translate for ${item.word}:`, err.message);
          }
      }
      fs.writeFileSync('./src/data/hsk7to9Data.ts', `export const hsk7to9Data = ${JSON.stringify(hsk7to9Data, null, 2)};\n`, 'utf-8');
    }
  }
  
  console.log("All done super_fast_translate!");
}

run().catch(console.error);
