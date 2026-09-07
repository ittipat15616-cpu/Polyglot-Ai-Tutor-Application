import fs from 'fs';
import { hsk7to9Data } from './src/data/hsk7to9Data';

console.log(`Total HSK 7-9 words: ${hsk7to9Data.length}`);
const last297 = hsk7to9Data.slice(-297);
console.log(`Extracted last 297 words from HSK 7-9. First 5:`, last297.slice(0, 5).map(x => x.word));
console.log(`Last 5:`, last297.slice(-5).map(x => x.word));

fs.writeFileSync('./last297_words.json', JSON.stringify(last297, null, 2), 'utf-8');
