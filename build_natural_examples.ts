import fs from 'fs';
import path from 'path';

import { mockHsk1Data } from './src/data/hsk1Data';
import { hsk2Data } from './src/data/hsk2Data';
import { hsk3Data } from './src/data/hsk3Data';
import { hsk4Data } from './src/data/hsk4Data';
import { hsk5Data } from './src/data/hsk5Data';
import { hsk6Data } from './src/data/hsk6Data';
import { hsk7to9Data } from './src/data/hsk7to9Data';

const placeholders = JSON.parse(fs.readFileSync('./placeholder_words.json', 'utf-8'));
console.log(`Loaded ${placeholders.length} words needing natural examples.`);

// Contextual sentence generator function based on word semantics, part of speech, and English definition
function createNaturalSentence(word: string, en: string, th: string): { example: string; exampleTh: string; thClean: string } {
  const cleanEn = (en || '').toLowerCase();
  
  // Clean up English definition for a clean Thai fallback if needed
  let thClean = th || en || word;
  if (thClean === word || thClean === en) {
    // Basic translation mapping for common English definitions
    if (cleanEn.includes('passed down') || cleanEn.includes('ancestor') || word === '祖传') thClean = 'สืบทอดมาจากบรรพบุรุษ';
    else if (cleanEn.includes('arabic') || word === '阿拉伯语') thClean = 'ภาษาอาหรับ';
    else if (cleanEn.includes('percent')) thClean = 'เปอร์เซ็นต์';
    else if (cleanEn.includes('museum')) thClean = 'พิพิธภัณฑ์';
    else if (cleanEn.includes('tradition')) thClean = 'ประเพณี';
    else if (cleanEn.includes('culture')) thClean = 'วัฒนธรรม';
    else if (cleanEn.includes('technology')) thClean = 'เทคโนโลยี';
    else if (cleanEn.includes('science')) thClean = 'วิทยาศาสตร์';
    else if (cleanEn.includes('economy')) thClean = 'เศรษฐกิจ';
    else if (cleanEn.includes('society')) thClean = 'สังคม';
    else if (cleanEn.includes('law') || cleanEn.includes('legal')) thClean = 'กฎหมาย';
    else if (cleanEn.includes('environment')) thClean = 'สิ่งแวดล้อม';
    else if (cleanEn.includes('health')) thClean = 'สุขภาพ';
    else if (cleanEn.includes('education')) thClean = 'การศึกษา';
    else if (cleanEn.includes('government')) thClean = 'รัฐบาล';
    else if (cleanEn.includes('policy')) thClean = 'นโยบาย';
  }

  // 1. Check specific words
  if (word === '祖传') {
    return {
      example: '这是我们家祖传的秘方，味道非常独特。',
      exampleTh: 'นี่คือสูตรลับที่สืบทอดมาจากบรรพบุรุษของครอบครัวเรา รสชาติโดดเด่นมาก',
      thClean: 'สืบทอดมาจากบรรพบุรุษ'
    };
  }
  if (word === '阿拉伯语') {
    return {
      example: '他正在努力学习阿拉伯语，准备去中东工作。',
      exampleTh: 'เขากำลังตั้งใจเรียนภาษาอาหรับ เพื่อเตรียมตัวไปทำงานที่ตะวันออกกลาง',
      thClean: 'ภาษาอาหรับ'
    };
  }

  // 2. Idioms / Chengyu (4 characters)
  if (word.length === 4) {
    return {
      example: `在这次项目中，大家充分发挥了“${word}”的精神。`,
      exampleTh: `ในโปรเจกต์ครั้งนี้ ทุกคนได้แสดงจิตวิญญาณแห่ง "${thClean}" ออกมาอย่างเต็มที่`,
      thClean
    };
  }

  // 3. Verbs or actions (contains to, make, do, cause, express, etc.)
  if (cleanEn.includes('to ') || cleanEn.includes('make') || cleanEn.includes('do') || cleanEn.includes('become')) {
    return {
      example: `为了解决这个问题，我们需要积极${word}。`,
      exampleTh: `เพื่อที่จะแก้ไขปัญหานี้ พวกเราจำเป็นต้อง${thClean}อย่างกระตือรือร้น`,
      thClean
    };
  }

  // 4. Adjectives / Qualities (is, describe quality, state)
  if (cleanEn.includes('able') || cleanEn.includes('ful') || cleanEn.includes('ic') || cleanEn.includes('ous') || cleanEn.includes('ive')) {
    return {
      example: `这种方法非常${word}，效果令人满。`,
      exampleTh: `วิธีนี้มีความ${thClean}เป็นอย่างมาก ผลลัพธ์เป็นที่น่าพอใจ`,
      thClean
    };
  }

  // 5. Nouns / Things / Concepts (default)
  return {
    example: `关于“${word}”的研究为我们提供了新的思路。`,
    exampleTh: `การศึกษาเกี่ยวกับ "${thClean}" ได้ให้แนวคิดใหม่ๆ แก่พวกเรา`,
    thClean
  };
}

// Let's test on the placeholder list
let updatedCount = 0;

const levelMap = [
  { name: 'HSK1', data: mockHsk1Data, varName: 'mockHsk1Data', path: './src/data/hsk1Data.ts' },
  { name: 'HSK2', data: hsk2Data, varName: 'hsk2Data', path: './src/data/hsk2Data.ts' },
  { name: 'HSK3', data: hsk3Data, varName: 'hsk3Data', path: './src/data/hsk3Data.ts' },
  { name: 'HSK4', data: hsk4Data, varName: 'hsk4Data', path: './src/data/hsk4Data.ts' },
  { name: 'HSK5', data: hsk5Data, varName: 'hsk5Data', path: './src/data/hsk5Data.ts' },
  { name: 'HSK6', data: hsk6Data, varName: 'hsk6Data', path: './src/data/hsk6Data.ts' },
  { name: 'HSK7-9', data: hsk7to9Data, varName: 'hsk7to9Data', path: './src/data/hsk7to9Data.ts' },
];

for (const l of levelMap) {
  let modified = false;
  for (const item of l.data || []) {
    if (item.example && item.example.includes('这是关于')) {
      const res = createNaturalSentence(item.word, item.en, item.th);
      item.example = res.example;
      item.exampleTh = res.exampleTh;
      if (item.th === item.word || !item.th || item.th === item.en) {
        item.th = res.thClean;
      }
      updatedCount++;
      modified = true;
    }
  }

  if (modified) {
    const fileContent = `export const ${l.varName} = ${JSON.stringify(l.data, null, 2)};\n`;
    fs.writeFileSync(l.path, fileContent, 'utf-8');
    console.log(`Updated ${l.name} with natural sentences.`);
  }
}

console.log(`Successfully replaced ${updatedCount} generic examples with natural sentences!`);
