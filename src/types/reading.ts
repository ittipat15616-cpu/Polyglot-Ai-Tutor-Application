export type ReadingLang = 'EN' | 'CN';

export type EnReadingLevel = 'A1' | 'A2' | 'B1' | 'B2' | 'C1';
export type CnReadingLevel = 'HSK1' | 'HSK2' | 'HSK3' | 'HSK4' | 'HSK5' | 'HSK6';
export type ReadingLevel = EnReadingLevel | CnReadingLevel;

export type ReadingCategory = 'daily' | 'news' | 'travel' | 'work' | 'culture' | 'science';

export interface ReadingSentence {
  text: string;
  pinyin?: string;
  th: string;
}

export interface ReadingKeyVocab {
  word: string;
  reading?: string;
  pos?: string;
  meaningTh: string;
}

export interface ReadingQuizQuestion {
  questionTh: string;
  options: [string, string, string, string] | string[];
  correctIndex: number;
  explanationTh: string;
}

export interface ReadingStory {
  id: string;
  lang: ReadingLang;
  level: ReadingLevel;
  category: ReadingCategory;
  title: string;
  titlePinyin?: string;
  titleTh: string;
  summaryTh: string;
  estimatedMinutes: number;
  sentences: ReadingSentence[];
  vocab: ReadingKeyVocab[];
  quiz: ReadingQuizQuestion[];
  isCustom?: boolean;
  createdAt?: number;
}

export interface ReadingProgressEntry {
  storyId: string;
  lang: ReadingLang;
  level: string;
  completed: boolean;
  bestQuizScore: number;
  quizTotal: number;
  readCount: number;
  lastReadAt: number;
}

export const EN_READING_LEVELS: { id: EnReadingLevel; label: string; descTh: string }[] = [
  { id: 'A1', label: 'A1', descTh: 'เริ่มต้นพื้นฐาน' },
  { id: 'A2', label: 'A2', descTh: 'สื่อสารทั่วไป' },
  { id: 'B1', label: 'B1', descTh: 'ระดับกลาง' },
  { id: 'B2', label: 'B2', descTh: 'ระดับกลางสูง / ข่าว' },
  { id: 'C1', label: 'C1', descTh: 'ระดับสูง / เชิงลึก' },
];

export const CN_READING_LEVELS: { id: CnReadingLevel; label: string; descTh: string }[] = [
  { id: 'HSK1', label: 'HSK 1', descTh: 'เริ่มต้นพื้นฐาน' },
  { id: 'HSK2', label: 'HSK 2', descTh: 'ชีวิตประจำวัน' },
  { id: 'HSK3', label: 'HSK 3', descTh: 'ระดับกลางต้น' },
  { id: 'HSK4', label: 'HSK 4', descTh: 'ระดับกลางสูง' },
  { id: 'HSK5', label: 'HSK 5', descTh: 'บทความระดับสูงต้น' },
  { id: 'HSK6', label: 'HSK 6', descTh: 'บทความเชิงวิเคราะห์' },
];

export const READING_CATEGORIES: { id: ReadingCategory; labelTh: string }[] = [
  { id: 'daily', labelTh: 'ชีวิตประจำวัน' },
  { id: 'news', labelTh: 'ข่าวสั้น' },
  { id: 'travel', labelTh: 'ท่องเที่ยว' },
  { id: 'work', labelTh: 'งาน & ธุรกิจ' },
  { id: 'culture', labelTh: 'วัฒนธรรม' },
  { id: 'science', labelTh: 'วิทย์ & เทค' },
];

export const READING_TARGET_COUNTS: Record<ReadingLang, number> = {
  EN: 250,
  CN: 250,
};
