import { db, auth } from '../firebase';
import { doc, getDoc, setDoc, deleteDoc } from 'firebase/firestore';

export interface StudyPlanData {
  lang: 'EN' | 'CN';
  goal: string;
  timeframe: string;
  level: string;
  strengths: string;
  obstacles: string;

  // Progress
  targetLevel: string;
  vocabPerDay: number;
  lessonsPerDay: number;
  currentVocabIndex: number;
  currentLessonIndex: number;
  enWeeklyPart: string;
  overallProgressPercent: number;
  
  currentMonth: number;
  currentWeek: number; // 1-4
  currentDay: number; // 1-30 within the month

  // Daily missions status (5 missions)
  // 0: Vocab/Flashcard, 1: Write, 2: Game, 3: Exam, 4: Lesson
  dailyMissionsCompleted: boolean[]; 
  
  // Weekly specific mission (Mock test)
  weeklyMissionCompleted: boolean;
  monthlyMissionCompleted?: boolean;
  
  createdAt: number;
  updatedAt: number;
}

export const loadStudyPlan = async (lang: 'EN' | 'CN'): Promise<StudyPlanData | null> => {
  if (!auth.currentUser) return null;
  try {
    const ref = doc(db, 'users', auth.currentUser.uid, 'studyPlans', lang);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      return snap.data() as StudyPlanData;
    }
  } catch (e) {
    console.error(e);
  }
  return null;
};

export const saveStudyPlan = async (plan: StudyPlanData): Promise<void> => {
  if (!auth.currentUser) return;
  try {
    const ref = doc(db, 'users', auth.currentUser.uid, 'studyPlans', plan.lang);
    await setDoc(ref, plan);
  } catch (e) {
    console.error(e);
  }
};


export const deleteStudyPlan = async (lang: 'EN' | 'CN'): Promise<void> => {
  if (!auth.currentUser) return;
  try {
    const ref = doc(db, 'users', auth.currentUser.uid, 'studyPlans', lang);
    await deleteDoc(ref);
  } catch (e) {
    console.error(e);
  }
};
