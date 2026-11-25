import { WordbookLang } from './wordbook';

export type MistakeSource = 'vocab_exam' | 'exams' | 'mock_test' | 'reading';

export type MistakeStatus = 'active' | 'mastered';

export interface MistakeEntry {
  id: string;
  lang: WordbookLang;
  source: MistakeSource;
  sourceLabel: string; // e.g., "สอบศัพท์ (HSK 2)", "TOEIC Reading", "ข้อสอบ Reading 1"

  prompt: string; // Question text or prompt shown during drill
  reading?: string; // Phonetic or Pinyin when applicable
  options?: string[]; // Multiple choice options if available
  correctOptionIndex?: number; // Index into options if multiple choice

  userWrongAnswer: string;
  correctAnswer: string;
  acceptedAnswers?: string[]; // Additional valid text answers for typing check
  explanationTh?: string;

  // Optional vocab metadata for 1-click "+ สมุดศัพท์ SRS"
  vocabWord?: string;
  vocabMeaningTh?: string;
  vocabExample?: string;

  // 2-Consecutive-Correct Mastery State
  wrongCount: number;
  consecutiveCorrect: number; // Graduates to 'mastered' at >= 2
  status: MistakeStatus;
  masteredAt?: number;
  lastPracticedAt?: number;

  createdAt: number;
  updatedAt: number;
}

export interface LogMistakeInput {
  lang: WordbookLang;
  source: MistakeSource;
  sourceLabel: string;
  prompt: string;
  reading?: string;
  options?: string[];
  correctOptionIndex?: number;
  userWrongAnswer: string;
  correctAnswer: string;
  acceptedAnswers?: string[];
  explanationTh?: string;
  vocabWord?: string;
  vocabMeaningTh?: string;
  vocabExample?: string;
}
