import { mockHsk1Data } from './hsk1Data';
import { hsk2Data as mockHsk2Data } from './hsk2Data';
import { hsk3Data as mockHsk3Data } from './hsk3Data';
import { hsk4Data as mockHsk4Data } from './hsk4Data';
import { hsk5Data as mockHsk5Data } from './hsk5Data';
import { hsk6Data as mockHsk6Data } from './hsk6Data';
import { hsk7to9Data as mockHsk7to9Data } from './hsk7to9Data';
import { cefrVocab } from './cefrVocab';
import { cefrC2Vocab } from './cefrC2Vocab';
import { ieltsData } from './ieltsData';

export const thaiAlphabetData = [
  { char: 'ก', name: 'ก ไก่', meaning: 'Chicken', class: 'อักษรกลาง (Mid)', audio: 'gor gai' },
  { char: 'ข', name: 'ข ไข่', meaning: 'Egg', class: 'อักษรสูง (High)', audio: 'khor khai' },
  { char: 'ค', name: 'ค ควาย', meaning: 'Buffalo', class: 'อักษรต่ำ (Low)', audio: 'khor kwai' },
  { char: 'ง', name: 'ง งู', meaning: 'Snake', class: 'อักษรต่ำ (Low)', audio: 'ngor ngu' },
  { char: 'จ', name: 'จ จาน', meaning: 'Plate', class: 'อักษรกลาง (Mid)', audio: 'jor jan' },
  { char: 'ช', name: 'ช ช้าง', meaning: 'Elephant', class: 'อักษรต่ำ (Low)', audio: 'chor chang' },
  { char: 'ท', name: 'ท ทหาร', meaning: 'Soldier', class: 'อักษรต่ำ (Low)', audio: 'thor ta-han' },
  { char: 'ม', name: 'ม ม้า', meaning: 'Horse', class: 'อักษรต่ำ (Low)', audio: 'mor ma' }
];

export const mockVocabDB: Record<string, any[]> = {
  // --- CHINESE HSK ---
  'CN_HSK Level 1': mockHsk1Data,
  'CN_HSK Level 2': mockHsk2Data,
  'CN_HSK Level 3': mockHsk3Data,
  'CN_HSK Level 4': mockHsk4Data,
  'CN_HSK Level 5': mockHsk5Data,
  'CN_HSK Level 6': mockHsk6Data,
  'CN_HSK Level 7-9': mockHsk7to9Data,
};

export const getMockVocab = (lang: string, category: string, part?: number | string) => {
  if (lang === 'TH') {
    return thaiAlphabetData;
  }
  
  let result: any[] = [];
  
  if (lang === 'CN') {
    const key = category.startsWith('CN_') ? category : `CN_${category}`;
    result = mockVocabDB[key] || [];
  } else if (lang === 'EN_CEFR' || category.includes('CEFR')) {
    if (category.includes('C2')) {
      if (part !== undefined && typeof part === 'string' && isNaN(Number(part))) {
        return (cefrC2Vocab as any)["TH_" + part] || [];
      }
      return Object.values(cefrC2Vocab).flat();
    } else {
      const levelCode = category.replace('EN_CEFR Level ', '').replace('CEFR Level ', '').trim() as keyof typeof cefrVocab;
      result = cefrVocab[levelCode] || [];
    }
  } else if (category.includes('IELTS')) {
    const ieltsKey = category.replace('EN_', '');
    result = (ieltsData as any)[ieltsKey] || [];
  } else {
    // Backup for generic lists (Grammar etc.)
    result = Array.from({ length: 50 }).map((_, i) => ({
      id: i,
      word: `${category} Word ${i + 1}`,
      th: `คำแปลที่ ${i + 1}`,
      type: 'n.',
      example: `This is an example for ${category} word ${i + 1}.`,
      example_th: `นี่คือตัวอย่างสำหรับคำศัพท์ ${i + 1}`
    }));
  }

  if (part !== undefined && !category.includes('IELTS')) {
    let pNum = typeof part === 'number' ? part : parseInt(String(part).replace(/[^0-9]/g, ''));
    if (!isNaN(pNum)) {
      const numLessons = category.includes('7-9') ? 57 : 10;
      const wordsPerLesson = Math.ceil(result.length / numLessons);
      const start = (pNum - 1) * wordsPerLesson;
      const end = Math.min(start + wordsPerLesson, result.length);
      return result.slice(start, end);
    }
  }

  return result;
};

export const getVocabData = getMockVocab;
