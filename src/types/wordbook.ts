export type WordbookLang = 'EN' | 'CN';

export type WordbookSource = 'lessons' | 'flashcards' | 'karaoke' | 'reading' | 'translator' | 'manual';

export type SrsRating = 'again' | 'hard' | 'good';

export type WordMasteryStatus = 'new' | 'due' | 'learning' | 'mastered';

export interface WordbookEntry {
  id: string;
  lang: WordbookLang;
  word: string;
  reading?: string; // Phonetic (EN) or Pinyin (CN)
  meaningTh: string;
  partOfSpeech?: string;
  example?: string;
  exampleTh?: string;
  note?: string;
  source: WordbookSource;
  sourceLabel?: string; // e.g., "HSK 2 - บทที่ 1" or Song Title

  // Spaced Repetition (SRS) state
  stage: number; // 0 = new/reset, 1..6 = spaced intervals [1, 3, 7, 14, 30, 60]
  intervalDays: number;
  repetitions: number;
  lapses: number;
  nextReviewAt: number; // epoch ms
  lastReviewedAt?: number; // epoch ms

  createdAt: number;
  updatedAt: number;
}

export interface SaveWordbookInput {
  lang: WordbookLang;
  word: string;
  reading?: string;
  meaningTh: string;
  partOfSpeech?: string;
  example?: string;
  exampleTh?: string;
  note?: string;
  source: WordbookSource;
  sourceLabel?: string;
}

export interface WordbookDailyReviewLog {
  dateKey: string; // YYYY-MM-DD local date
  lang: WordbookLang;
  reviewedCount: number;
  rememberedCount: number;
  updatedAt: number;
}
