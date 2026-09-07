import { mockHsk1Data } from './src/data/hsk1Data';
import hsk3 from '@leonsilicon/hsk3.0';

const words = mockHsk1Data.map(x => x.word.replace('｜', '|').trim());
const official = hsk3.wordsLevel1;

const missing = official.filter(w => {
  // try to match with or without '|'
  return !words.includes(w) && !words.includes(w.split('|')[0]);
});

console.log('Missing official words:', missing);

// Also let's check what extra words we have in mockHsk1Data that are NOT in official
const extra = mockHsk1Data.filter(x => {
  const w = x.word.replace('｜', '|').trim();
  return !official.includes(w) && !official.find(ow => ow.split('|')[0] === w);
});
console.log('Extra in mock:', extra.map(x => x.word));
