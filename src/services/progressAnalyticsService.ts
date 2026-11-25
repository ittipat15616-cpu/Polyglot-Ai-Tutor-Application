import { collection, getDocs } from 'firebase/firestore';
import { auth, db } from '../firebase';
import {
  loadAllGoodnotesStates,
  loadAllRoleplayProgress,
  loadFlashcardWordStates,
  loadGameStageStars,
  loadMockTestResultsHistory,
  loadVocabTestResultsHistory,
} from './userPersistence';
import { loadKaraokeHistory } from './karaokeService';
import {
  getDueWordCount,
  getLocalReviewLogs,
  getWordMasteryStatus,
  syncWordbookWithFirestore,
} from './wordbookService';
import { syncMistakesWithFirestore } from './mistakeService';
import { loadAllShadowingLogs, ShadowingDailyLog } from './shadowingService';
import { syncReadingProgressWithFirestore } from './readingService';
import { ReadingProgressEntry } from '../types/reading';
import { WordbookDailyReviewLog, WordbookLang } from '../types/wordbook';

export interface SkillMetric {
  id: 'vocab' | 'exam' | 'listening' | 'speaking';
  labelTh: string;
  shortLabelTh: string;
  score: number; // 0..100
  detailTh: string;
  targetTab: string;
}

export interface ActivityDayCell {
  dateKey: string; // YYYY-MM-DD
  dayNum: number;
  weekdayTh: string;
  count: number;
  level: 0 | 1 | 2 | 3;
  isToday: boolean;
}

export interface ScoreTrendPoint {
  id: string;
  dateLabel: string;
  title: string;
  kind: 'vocab' | 'mock';
  pct: number;
  createdAt: number;
}

export interface ProgressDashboardData {
  lang: WordbookLang;
  loadedAt: number;

  // Streak & Consistency
  currentStreakDays: number;
  longestStreakDays: number;
  activeDaysLast28: number;
  calendar28Days: ActivityDayCell[];

  // Core Counters (100% real data)
  srsTotalWords: number;
  srsDueToday: number;
  srsMasteredWords: number;
  srsReviewedTotal: number;
  flashcardMasteredCount: number;

  vocabExamsCount: number;
  mockExamsCount: number;
  totalExamsCount: number;
  avgExamPct: number;
  bestExamPct: number;

  karaokeSongsPlayed: number;
  karaokeTotalPlays: number;

  roleplayCompletedCount: number;
  roleplayTotalStars: number;
  roleplayBestScore: number;

  gameTotalStars: number;

  // Smart Mistake Notebook stats
  mistakesTotal: number;
  mistakesActive: number;
  mistakesMastered: number;
  mistakesMasteryPct: number;

  // Shadowing speaking practice
  shadowingPracticeCount: number;

  // Graded reading stories completed
  readingCompletedCount: number;

  // 4-Skill Breakdown & Trend
  skills: SkillMetric[];
  scoreTrend: ScoreTrendPoint[];
}

const WEEKDAYS_TH = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];

function toLocalDateKey(ts: number): string {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addDaysKey(baseDate: Date, deltaDays: number): { dateKey: string; date: Date } {
  const d = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate() + deltaDays);
  return { dateKey: toLocalDateKey(d.getTime()), date: d };
}

function formatShortDateTh(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
}

async function loadAllWordbookReviewLogs(lang: WordbookLang): Promise<WordbookDailyReviewLog[]> {
  const map = new Map<string, WordbookDailyReviewLog>();
  for (const log of getLocalReviewLogs(lang)) {
    map.set(log.dateKey, log);
  }

  const user = auth.currentUser;
  if (user && db) {
    try {
      const snap = await getDocs(collection(db, 'users', user.uid, 'wordbook_review_logs'));
      snap.forEach((docSnap) => {
        const data = docSnap.data() as WordbookDailyReviewLog;
        if (data && data.lang === lang && data.dateKey) {
          const prev = map.get(data.dateKey);
          if (!prev || data.reviewedCount > prev.reviewedCount) {
            map.set(data.dateKey, data);
          }
        }
      });
    } catch {
      // Fallback to local logs silently
    }
  }

  return Array.from(map.values());
}

function computeStreaks(activityByDay: Map<string, number>): {
  currentStreak: number;
  longestStreak: number;
} {
  const today = new Date();
  const todayKey = toLocalDateKey(today.getTime());
  const yesterdayKey = addDaysKey(today, -1).dateKey;

  // Current streak counts backward from today (or yesterday if user hasn't finished an activity yet today)
  let currentStreak = 0;
  let startOffset = 0;
  if ((activityByDay.get(todayKey) || 0) > 0) {
    startOffset = 0;
  } else if ((activityByDay.get(yesterdayKey) || 0) > 0) {
    startOffset = -1;
  } else {
    startOffset = 1; // no active streak
  }

  if (startOffset <= 0) {
    for (let offset = startOffset; offset >= -365; offset--) {
      const key = addDaysKey(today, offset).dateKey;
      if ((activityByDay.get(key) || 0) > 0) {
        currentStreak += 1;
      } else {
        break;
      }
    }
  }

  // Longest streak across all recorded dates
  const activeDates = Array.from(activityByDay.entries())
    .filter(([, count]) => count > 0)
    .map(([dateKey]) => dateKey)
    .sort();

  let longestStreak = currentStreak;
  let running = 0;
  let prevTime: number | null = null;

  for (const dateKey of activeDates) {
    const [y, m, d] = dateKey.split('-').map(Number);
    const curTime = Date.UTC(y, m - 1, d);
    if (prevTime !== null && curTime - prevTime === 86400000) {
      running += 1;
    } else {
      running = 1;
    }
    if (running > longestStreak) longestStreak = running;
    prevTime = curTime;
  }

  return { currentStreak, longestStreak };
}

/**
 * Load and aggregate 100% real, zero-cost learning progress data for the selected language.
 */
export async function loadProgressDashboardData(
  lang: WordbookLang
): Promise<ProgressDashboardData> {
  const [
    allWordbook,
    reviewLogs,
    vocabExamHistory,
    mockExamHistory,
    roleplayMap,
    karaokeHistory,
    flashcardStates,
    goodnotesStates,
    gameStarsMap,
    allMistakes,
    shadowingLogs,
    readingProgressMap,
  ] = await Promise.all([
    syncWordbookWithFirestore(),
    loadAllWordbookReviewLogs(lang),
    loadVocabTestResultsHistory().catch(() => []),
    loadMockTestResultsHistory().catch(() => []),
    loadAllRoleplayProgress(lang).catch(() => ({})),
    loadKaraokeHistory().catch(() => []),
    loadFlashcardWordStates().catch(() => ({ mastered: {}, review: {} })),
    loadAllGoodnotesStates(lang).catch(() => []),
    loadGameStageStars().catch(() => ({})),
    syncMistakesWithFirestore().catch(() => []),
    loadAllShadowingLogs(lang).catch((): ShadowingDailyLog[] => []),
    syncReadingProgressWithFirestore().catch((): Record<string, ReadingProgressEntry> => ({})),
  ]);

  const now = Date.now();
  const langWordbook = allWordbook.filter((w) => w.lang === lang);
  const srsTotalWords = langWordbook.length;
  const srsDueToday = getDueWordCount(lang, now);
  const srsMasteredWords = langWordbook.filter(
    (w) => getWordMasteryStatus(w, now) === 'mastered'
  ).length;

  const srsReviewedTotal = reviewLogs.reduce((sum, l) => sum + (l.reviewedCount || 0), 0);
  const srsRememberedTotal = reviewLogs.reduce((sum, l) => sum + (l.rememberedCount || 0), 0);

  // Filter flashcard mastered keys loosely by language prefix (HSK vs CEFR/IELTS/EN)
  const flashcardMasteredKeys = Object.keys(flashcardStates.mastered || {}).filter((k) => {
    const isCnKey = k.toUpperCase().includes('HSK');
    return lang === 'CN' ? isCnKey : !isCnKey;
  });
  let goodnotesMastered = 0;
  for (const s of goodnotesStates) {
    if (Array.isArray(s.masteredKeys)) {
      goodnotesMastered += s.masteredKeys.length;
    }
  }
  const flashcardMasteredCount = Math.max(flashcardMasteredKeys.length, goodnotesMastered);

  // Filter exams strictly by language
  const langVocabExams = vocabExamHistory.filter((r) =>
    lang === 'CN' ? r.lang === 'CN' : r.lang !== 'CN'
  );
  const langMockExams = mockExamHistory.filter((r) =>
    lang === 'CN' ? r.lang === 'CN' : r.lang !== 'CN'
  );

  // Build unified score trend (chronological, latest 12)
  const rawTrend: ScoreTrendPoint[] = [];

  for (const v of langVocabExams) {
    const denom = Math.max(1, (v.totalQuestions || 0) * 2);
    const pct = Math.min(
      100,
      Math.round((((v.correctWords || 0) + (v.correctTrans || 0)) / denom) * 100)
    );
    rawTrend.push({
      id: v.id || `v_${v.createdAt}`,
      dateLabel: formatShortDateTh(v.createdAt || now),
      title: `สอบศัพท์ (${v.levelFilter || lang})`,
      kind: 'vocab',
      pct,
      createdAt: v.createdAt || now,
    });
  }

  for (const m of langMockExams) {
    const maxScore = Math.max(1, m.maxScore || 100);
    const pct = Math.min(100, Math.round(((m.score || 0) / maxScore) * 100));
    rawTrend.push({
      id: m.id || `m_${m.createdAt}`,
      dateLabel: formatShortDateTh(m.createdAt || now),
      title: m.title || `${m.level} ${m.part}`,
      kind: 'mock',
      pct,
      createdAt: m.createdAt || now,
    });
  }

  rawTrend.sort((a, b) => a.createdAt - b.createdAt);
  const scoreTrend = rawTrend.slice(-12);

  const totalExamsCount = rawTrend.length;
  const avgExamPct =
    totalExamsCount > 0
      ? Math.round(rawTrend.reduce((sum, p) => sum + p.pct, 0) / totalExamsCount)
      : 0;
  const bestExamPct =
    totalExamsCount > 0 ? Math.max(...rawTrend.map((p) => p.pct)) : 0;

  // Karaoke strictly by language ('zh' for CN, 'en' for EN)
  const targetKaraokeLang = lang === 'CN' ? 'zh' : 'en';
  const langKaraoke = karaokeHistory.filter((k) => k.language === targetKaraokeLang);
  const karaokeSongsPlayed = langKaraoke.length;
  const karaokeTotalPlays = langKaraoke.reduce((sum, k) => sum + (k.playCount || 1), 0);
  const karaokeQuizRatios = langKaraoke
    .filter((k) => typeof k.bestQuizScore === 'number' && (k.bestQuizTotal || 0) > 0)
    .map((k) => Math.min(1, (k.bestQuizScore || 0) / Math.max(1, k.bestQuizTotal || 1)));
  const karaokeAvgQuizPct =
    karaokeQuizRatios.length > 0
      ? Math.round(
          (karaokeQuizRatios.reduce((a, b) => a + b, 0) / karaokeQuizRatios.length) * 100
        )
      : 0;

  // Roleplay speaking strictly by language
  const roleplayList = Object.values(roleplayMap);
  const roleplayCompletedCount = roleplayList.filter((r) => r.completed).length;
  const roleplayTotalStars = roleplayList.reduce((sum, r) => sum + (r.stars || 0), 0);
  const roleplayBestScore =
    roleplayList.length > 0
      ? Math.max(...roleplayList.map((r) => r.bestScore || 0))
      : 0;
  const roleplayAvgScore =
    roleplayList.length > 0
      ? Math.round(
          roleplayList.reduce((sum, r) => sum + (r.bestScore || 0), 0) / roleplayList.length
        )
      : 0;

  // Vocab games stars filtered by language
  const gameRecords = Object.values(gameStarsMap).filter((g) => {
    const isCnGame = (g.subLevel || '').toUpperCase().includes('HSK');
    return lang === 'CN' ? isCnGame : !isCnGame;
  });
  const gameTotalStars = gameRecords.reduce((sum, g) => sum + (g.stars || 0), 0);

  // Build real daily activity map for Streak & 28-Day Calendar
  const activityByDay = new Map<string, number>();
  const bumpDay = (ts?: number, weight = 1) => {
    if (!ts || !Number.isFinite(ts) || ts <= 0) return;
    const key = toLocalDateKey(ts);
    activityByDay.set(key, (activityByDay.get(key) || 0) + weight);
  };

  for (const log of reviewLogs) {
    if (log.dateKey && log.reviewedCount > 0) {
      activityByDay.set(
        log.dateKey,
        (activityByDay.get(log.dateKey) || 0) + Math.min(5, log.reviewedCount)
      );
    }
  }
  for (const w of langWordbook) {
    bumpDay(w.createdAt, 1);
    if (w.lastReviewedAt) bumpDay(w.lastReviewedAt, 1);
  }
  for (const v of langVocabExams) bumpDay(v.createdAt, 3);
  for (const m of langMockExams) bumpDay(m.createdAt, 4);
  for (const k of langKaraoke) bumpDay(k.lastPlayedAt, 2);
  for (const r of roleplayList) bumpDay(r.lastPlayedAt, 3);
  for (const g of goodnotesStates) bumpDay(g.updatedAt, 1);
  for (const gs of gameRecords) bumpDay(gs.updatedAt, 1);

  const langMistakes = allMistakes.filter((m) => m.lang === lang);
  const mistakesTotal = langMistakes.length;
  const mistakesMastered = langMistakes.filter((m) => m.status === 'mastered').length;
  const mistakesActive = mistakesTotal - mistakesMastered;
  const mistakesMasteryPct =
    mistakesTotal > 0 ? Math.round((mistakesMastered / mistakesTotal) * 100) : 0;
  for (const mk of langMistakes) {
    if (mk.lastPracticedAt) bumpDay(mk.lastPracticedAt, 2);
  }

  let shadowingPracticeCount = 0;
  let shadowingAccSum = 0;
  for (const sl of shadowingLogs) {
    const cnt = sl.practiceCount || 0;
    shadowingPracticeCount += cnt;
    shadowingAccSum += sl.totalAccuracySum || 0;
    if (sl.dateKey && cnt > 0) {
      activityByDay.set(
        sl.dateKey,
        (activityByDay.get(sl.dateKey) || 0) + Math.min(4, cnt)
      );
    }
  }
  const shadowingAvgPct =
    shadowingPracticeCount > 0 ? Math.round(shadowingAccSum / shadowingPracticeCount) : 0;

  const langReadingList = Object.values(readingProgressMap).filter((r) => r.lang === lang);
  const readingCompletedCount = langReadingList.filter((r) => r.completed).length;
  for (const rd of langReadingList) {
    if (rd.lastReadAt) bumpDay(rd.lastReadAt, 2);
  }

  const { currentStreak, longestStreak } = computeStreaks(activityByDay);

  const today = new Date();
  const calendar28Days: ActivityDayCell[] = [];
  let activeDaysLast28 = 0;

  for (let offset = -27; offset <= 0; offset++) {
    const { dateKey, date } = addDaysKey(today, offset);
    const count = activityByDay.get(dateKey) || 0;
    if (count > 0) activeDaysLast28 += 1;
    const level: 0 | 1 | 2 | 3 =
      count === 0 ? 0 : count <= 2 ? 1 : count <= 5 ? 2 : 3;
    calendar28Days.push({
      dateKey,
      dayNum: date.getDate(),
      weekdayTh: WEEKDAYS_TH[date.getDay()],
      count,
      level,
      isToday: offset === 0,
    });
  }

  // Compute transparent 4-skill metrics (0..100 grounded 100% in real user records)
  const vocabVolumeScore = Math.min(
    60,
    Math.round(((srsTotalWords * 2 + flashcardMasteredCount) / 80) * 60)
  );
  const vocabQualityScore =
    srsReviewedTotal > 0
      ? Math.round((srsRememberedTotal / srsReviewedTotal) * 40)
      : srsMasteredWords > 0
      ? 30
      : Math.min(20, gameTotalStars * 2);
  const vocabSkillScore = Math.min(100, vocabVolumeScore + vocabQualityScore);

  const examSkillScore =
    totalExamsCount > 0
      ? Math.min(100, Math.round(avgExamPct * 0.8 + Math.min(20, totalExamsCount * 4)))
      : 0;

  const karaokeListeningScore =
    karaokeSongsPlayed > 0
      ? Math.min(
          100,
          Math.round(
            Math.min(60, karaokeSongsPlayed * 12 + karaokeTotalPlays * 3) +
              (karaokeAvgQuizPct > 0 ? karaokeAvgQuizPct * 0.4 : 15)
          )
        )
      : 0;
  const readingSkillBonus =
    readingCompletedCount > 0 ? Math.min(100, readingCompletedCount * 10 + 15) : 0;
  const listeningSkillScore =
    karaokeSongsPlayed > 0 && readingCompletedCount > 0
      ? Math.min(100, Math.round(karaokeListeningScore * 0.65 + readingSkillBonus * 0.35 + 10))
      : Math.max(karaokeListeningScore, readingSkillBonus);

  const listeningParts: string[] = [];
  if (karaokeSongsPlayed > 0) {
    listeningParts.push(
      `คาราโอเกะ ${karaokeSongsPlayed} เพลง (${karaokeTotalPlays} รอบ)${
        karaokeAvgQuizPct > 0 ? ` · Quiz ${karaokeAvgQuizPct}%` : ''
      }`
    );
  }
  if (readingCompletedCount > 0) {
    listeningParts.push(`อ่านเรื่องสั้นจบแล้ว ${readingCompletedCount} เรื่อง`);
  }

  const roleplaySpeakingScore =
    roleplayList.length > 0
      ? Math.min(
          100,
          Math.round(
            Math.min(50, roleplayCompletedCount * 10 + roleplayTotalStars * 3) +
              roleplayAvgScore * 0.5
          )
        )
      : 0;
  const shadowingSpeakingScore =
    shadowingPracticeCount > 0
      ? Math.min(
          100,
          Math.round(Math.min(45, shadowingPracticeCount * 5) + shadowingAvgPct * 0.55)
        )
      : 0;
  const speakingSkillScore =
    roleplayList.length > 0 && shadowingPracticeCount > 0
      ? Math.min(100, Math.round(roleplaySpeakingScore * 0.7 + shadowingSpeakingScore * 0.3 + 10))
      : Math.max(roleplaySpeakingScore, shadowingSpeakingScore);

  const speakingParts: string[] = [];
  if (roleplayList.length > 0) {
    speakingParts.push(
      `Roleplay ${roleplayCompletedCount} ด่าน (${roleplayTotalStars} ดาว · สูงสุด ${roleplayBestScore}%)`
    );
  }
  if (shadowingPracticeCount > 0) {
    speakingParts.push(`ฝึกพูดตาม ${shadowingPracticeCount} รอบ (เฉลี่ย ${shadowingAvgPct}%)`);
  }

  const skills: SkillMetric[] = [
    {
      id: 'vocab',
      labelTh: 'คำศัพท์ & ความจำ SRS',
      shortLabelTh: 'คำศัพท์',
      score: vocabSkillScore,
      detailTh:
        srsTotalWords > 0 || flashcardMasteredCount > 0
          ? `สมุด SRS ${srsTotalWords} คำ (จำแม่น ${srsMasteredWords}) · แฟลชการ์ด ${flashcardMasteredCount} คำ`
          : 'ยังไม่ได้สะสมคำศัพท์ — เริ่มกดบันทึกจากคลังคำศัพท์ได้เลย',
      targetTab: 'lessons',
    },
    {
      id: 'exam',
      labelTh: 'ข้อสอบ & ความแม่นยำ',
      shortLabelTh: 'ข้อสอบ',
      score: examSkillScore,
      detailTh:
        totalExamsCount > 0
          ? `คะแนนเฉลี่ย ${avgExamPct}% (สูงสุด ${bestExamPct}%) จาก ${totalExamsCount} ครั้ง`
          : 'ยังไม่มีประวัติสอบ — ลองทำสอบศัพท์หรือจำลองสอบชุดแรก',
      targetTab: 'vocab_exam',
    },
    {
      id: 'listening',
      labelTh: 'การฟัง การอ่าน & คาราโอเกะ',
      shortLabelTh: 'ฟัง/อ่าน',
      score: listeningSkillScore,
      detailTh:
        listeningParts.length > 0
          ? listeningParts.join(' · ')
          : 'ยังไม่ได้ฝึกฟัง/อ่าน — ลองเปิดหน้าอ่านเรื่องสั้นหรือคาราโอเกะได้เลย',
      targetTab: 'reading',
    },
    {
      id: 'speaking',
      labelTh: 'การพูด & สื่อสารจริง',
      shortLabelTh: 'การพูด',
      score: speakingSkillScore,
      detailTh:
        speakingParts.length > 0
          ? speakingParts.join(' · ')
          : 'ยังไม่ได้ฝึกพูด — ลองฝึกพูดตามในคลังคำศัพท์ หรือเปิดหน้าวิดีโอคอล',
      targetTab: 'call',
    },
  ];

  return {
    lang,
    loadedAt: now,
    currentStreakDays: currentStreak,
    longestStreakDays: longestStreak,
    activeDaysLast28,
    calendar28Days,
    srsTotalWords,
    srsDueToday,
    srsMasteredWords,
    srsReviewedTotal,
    flashcardMasteredCount,
    vocabExamsCount: langVocabExams.length,
    mockExamsCount: langMockExams.length,
    totalExamsCount,
    avgExamPct,
    bestExamPct,
    karaokeSongsPlayed,
    karaokeTotalPlays,
    roleplayCompletedCount,
    roleplayTotalStars,
    roleplayBestScore,
    gameTotalStars,
    mistakesTotal,
    mistakesActive,
    mistakesMastered,
    mistakesMasteryPct,
    shadowingPracticeCount,
    readingCompletedCount,
    skills,
    scoreTrend,
  };
}
