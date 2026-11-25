export type RoleplayCategoryId =
  | 'travel'
  | 'daily'
  | 'work'
  | 'social'
  | 'study_emergency';

export type RoleplayDifficulty = 'easy' | 'medium' | 'hard';

export type RoleplayCorrectionStyle = 'after_call' | 'realtime';

export interface SurvivalPhrase {
  en: string;
  cn: string;
  pinyin: string;
  th: string;
}

export interface RoleplayMission {
  id: string;
  number: number; // 1..60 within its category
  category: RoleplayCategoryId;
  difficulty: RoleplayDifficulty;
  titleTh: string;
  titleEn: string;
  location: string;
  aiRoleName: string;
  aiRoleTitleTh: string;
  aiRoleTitleEn: string;
  aiVoiceGender: 'male' | 'female';
  userRoleTh: string;
  scenarioTh: string;
  objectives: [string, string, string];
  objectivesEn: [string, string, string];
  openingLineEn: string;
  openingLineCn: string;
  twistTh?: string;
  twistEn?: string;
  survivalKit: SurvivalPhrase[];
  isCustom?: boolean;
}

export interface RoleplayCategoryMeta {
  id: RoleplayCategoryId;
  nameTh: string;
  shortNameTh: string;
  descriptionTh: string;
}

export interface RoleplayProgressRecord {
  missionId: string;
  lang: 'EN' | 'CN';
  completed: boolean;
  stars: number; // 0..3
  bestScore: number; // 0..100
  objectivesCompletedCount: number; // 0..3
  playCount: number;
  lastPlayedAt: number;
}

export interface RoleplayImprovementItem {
  said: string;
  better: string;
  pinyin?: string;
  explanationTh: string;
}

export interface RoleplayVocabItem {
  word: string;
  pinyin?: string;
  meaningTh: string;
}

export interface RoleplayReportData {
  missionId: string;
  missionTitle: string;
  lang: 'EN' | 'CN';
  durationSeconds: number;
  completedObjectives: [boolean, boolean, boolean];
  objectivesText: [string, string, string];
  stars: number; // 0..3
  overallScore: number; // 0..100
  metrics: {
    fluency: number;
    grammar: number;
    vocabulary: number;
    naturalness: number;
  };
  summaryTh: string;
  improvements: RoleplayImprovementItem[];
  keyVocab: RoleplayVocabItem[];
  usedAiAnalysis: boolean;
}

export interface RoleplayCallConfig {
  mission: RoleplayMission;
  assistMode: boolean;
  correctionStyle: RoleplayCorrectionStyle;
}
