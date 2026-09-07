import { mockHsk1Data } from './src/data/hsk1Data';
import hsk3 from '@leonsilicon/hsk3.0';

const official = hsk3.wordsLevel1;
const matched = new Set<string>();

let goodCount = 0;
for (const w of mockHsk1Data) {
  if (/[\u4e00-\u9fa5]/.test(w.th)) continue;
  if (w.word === '第二') continue;
  goodCount++;

  let match = official.find(o => o === w.word);
  if (!match) match = official.find(o => o.split('|')[0] === w.word);
  if (!match) {
    if (w.word === '第') match = '第（第二）';
    if (w.word === '们') match = '们（朋友们）';
    if (w.word === '有些') match = '有（一）些';
    if (w.word === '子') match = '子（桌子）';
  }
  if (match) matched.add(match);
}

console.log('Good count:', goodCount);
console.log('Matched size:', matched.size);
console.log('Official length:', official.length);
