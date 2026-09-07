import { mockHsk1Data } from './hsk1Data';
import { hsk2Data } from './hsk2Data';
import { hsk3Data } from './hsk3Data';
import { hsk4Data } from './hsk4Data';
import { hsk5Data } from './hsk5Data';
import { hsk6Data } from './hsk6Data';
import { hsk7to9Data } from './hsk7to9Data';
import { cefrVocab } from './cefrVocab';
import { cefrC2Vocab } from './cefrC2Vocab';
import { ieltsData } from './ieltsData';

export interface VocabWord {
  id: string;
  word: string;
  pinyin?: string; // For Chinese
  phonetic?: string; // For English
  translations: string[];
  level: string;
}

// Helper to clean part of speech markers (e.g. "น. ", "adj. ", "v.t. ")
const cleanTranslation = (s: string) => {
  return s.trim().replace(/^([a-zA-Zก-๙]+\.)+\s*/g, '');
};

// Convert HSK data
const buildCNData = () => {
  const result: VocabWord[] = [];
  const datasets = [
    { data: mockHsk1Data, level: 'HSK1' },
    { data: hsk2Data, level: 'HSK2' },
    { data: hsk3Data, level: 'HSK3' },
    { data: hsk4Data, level: 'HSK4' },
    { data: hsk5Data, level: 'HSK5' },
    { data: hsk6Data, level: 'HSK6' },
    { data: hsk7to9Data, level: 'HSK7-9' }
  ];

  let idCounter = 1;
  for (const ds of datasets) {
    if (ds.data && Array.isArray(ds.data)) {
      for (const item of ds.data) {
        // Some items have `th` string, we split by comma
        const thString = item.th || '';
        const transList = thString.split(/[,、/]/)
          .map(cleanTranslation)
          .filter(Boolean);
          
        result.push({
          id: `cn_${idCounter++}`,
          word: item.word,
          pinyin: item.pinyin,
          translations: transList.length > 0 ? transList : ['(ไม่มีคำแปล)'],
          level: ds.level
        });
      }
    }
  }
  return result;
};

// Convert English data
const buildENData = () => {
  const result: VocabWord[] = [];
  let idCounter = 1;

  // Process CEFR Vocab (A1 - C1)
  for (const level in cefrVocab) {
    const list = cefrVocab[level];
    if (Array.isArray(list)) {
      for (const item of list) {
        const thString = item.th || '';
        const transList = thString.split(/[,/]/)
          .map(cleanTranslation)
          .filter(Boolean);
          
        result.push({
          id: `en_${idCounter++}`,
          word: item.word,
          phonetic: item.phonetic,
          translations: transList.length > 0 ? transList : ['(ไม่มีคำแปล)'],
          level: level
        });
      }
    }
  }

  // Process C2 if it's a Record (since it seems to be exported as an object)
  for (const level in cefrC2Vocab) {
    const list = (cefrC2Vocab as Record<string, any[]>)[level];
    if (Array.isArray(list)) {
      for (const item of list) {
        const thString = item.th || '';
        const transList = thString.split(/[,/]/)
          .map(cleanTranslation)
          .filter(Boolean);
          
        result.push({
          id: `en_${idCounter++}`,
          word: item.word,
          phonetic: item.phonetic,
          translations: transList.length > 0 ? transList : ['(ไม่มีคำแปล)'],
          level: 'C2'
        });
      }
    }
  }

  // Process IELTS if ieltsData is configured
  if (ieltsData && typeof ieltsData === 'object') {
    for (const lessonName in ieltsData) {
      const list = (ieltsData as Record<string, any[]>)[lessonName];
      if (Array.isArray(list)) {
        for (const item of list) {
          const thString = item.th || '';
          const transList = thString.split(/[,/]/)
            .map(cleanTranslation)
            .filter(Boolean);
            
          result.push({
            id: `en_ielts_${idCounter++}`,
            word: item.word,
            phonetic: item.phonetic,
            translations: transList.length > 0 ? transList : ['(ไม่มีคำแปล)'],
            level: 'IELTS'
          });
        }
      }
    }
  }

  return result;
};

export const allCNVocab = buildCNData();
export const allENVocab = buildENData();
