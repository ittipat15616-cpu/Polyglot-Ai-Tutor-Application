import { StudyPlanData } from '../services/studyPlanService';

export const getTotalVocab = (lang: string, level: string) => {
  if (lang === 'EN') {
    switch (level) {
      case 'A1': return 898;
      case 'A2': return 1765;
      case 'B1': return 3000;
      case 'B2': return 4000;
      case 'C1': return 5000;
      case 'C2': return 6000;
      default: return 898;
    }
  } else {
    switch (level) {
      case 'HSK1': return 150;
      case 'HSK2': return 300;
      case 'HSK3': return 600;
      case 'HSK4': return 1200;
      case 'HSK5': return 2500;
      case 'HSK6': return 5000;
      default: return 150;
    }
  }
};

export const getVocabPerDay = (lang: string, level: string, months: number) => {
  const total = getTotalVocab(lang, level);
  const days = months * 30 || 30;
  return Math.ceil(total / days);
};

export const getGrammarDesc = (plan: StudyPlanData) => {
  const currentTotalLessonIndex = plan.currentLessonIndex || 1;
  const count = plan.lessonsPerDay || 1;
  const startSub = currentTotalLessonIndex;
  const endSub = startSub + count - 1;
  
  const getChap = (sub: number) => {
    // Just a continuous numbering assuming roughly 20-30 subtopics per level
    // We can simplify by just saying "บทย่อยที่ X" or keep the logic
    const mainChap = Math.floor((sub - 1) / 5) + 1;
    const subChap = ((sub - 1) % 5) + 1;
    return `${mainChap}.${subChap}`;
  };
  
  if (count === 1) {
    return `เรียน Grammar บทที่ ${getChap(startSub)}`;
  }
  return `เรียน Grammar บทที่ ${getChap(startSub)} ถึง ${getChap(endSub)}`;
};

export const getSkillDesc = (plan: StudyPlanData) => {
  const dayInWeek = ((plan.currentDay - 1) % 7) + 1; // 1 to 7
  const skill = plan.enWeeklyPart || 'Reading';
  
  if (skill === 'Reading') {
    const readerPattern = [1, 1, 2, 1, 1, 2, 1];
    const count = readerPattern[dayInWeek - 1];
    let startChap = 1;
    for (let i = 0; i < dayInWeek - 1; i++) {
      startChap += readerPattern[i];
    }
    const endChap = startChap + count - 1;
    return `ฝึกทักษะการอ่าน (Reader Level 1 Chapter ${startChap}${count > 1 ? `-${endChap}` : ''})`;
  } else if (skill === 'Writing') {
    return `ฝึกทักษะการเขียน (Writing Easy บทที่ ${dayInWeek})`;
  } else if (skill === 'Listening') {
    if (['B1', 'B2', 'C1', 'C2'].includes(plan.targetLevel)) {
      if (dayInWeek % 2 !== 0) {
        return `ฝึกฟังระดับกลาง (VOA Learning English Intermediate บทที่ ${Math.ceil(dayInWeek / 2)})`;
      } else {
        return `ฝึกทำข้อสอบฟัง (Listening Intermediate ชุดที่ ${Math.floor(dayInWeek / 2)})`;
      }
    } else {
      return `ฝึกฟังระดับเบื้องต้น (VOA Learning English Beginner บทที่ ${dayInWeek})`;
    }
  } else {
    // Speaking
    return `ฝึกพูดและออกเสียง (Speaking Lesson บทที่ ${dayInWeek})`;
  }
};

export const getLessonDesc = (plan: StudyPlanData) => {
  const weekInMonth = plan.currentWeek; // 1 to 4
  const dayInWeek = ((plan.currentDay - 1) % 7) + 1; // 1 to 7
  
  if (plan.lang === 'EN') {
    return getGrammarDesc(plan); // Fallback for EN, though we will use getGrammarDesc directly in the UI
  } else {
    const levelNum = plan.targetLevel.replace('HSK', '');
    if (weekInMonth === 1) {
      return `เรียน HSK ${levelNum} Textbook บทที่ ${dayInWeek}`;
    } else if (weekInMonth === 2) {
      return `ทำ HSK ${levelNum} Workbook บทที่ ${dayInWeek}`;
    } else if (weekInMonth === 3) {
      return `คัดลายมืออักษรจีน (บทที่ ${dayInWeek})`;
    } else {
      return `ฝึกฟัง HSK ${levelNum} (ชุดที่ ${dayInWeek})`;
    }
  }
};

export const getMonthlyExpectedOutcome = (plan: StudyPlanData) => {
  const vocabCount = (plan.vocabPerDay || 15) * 30;
  
  if (plan.lang === 'EN') {
    return `จดจำคำศัพท์ระดับ ${plan.targetLevel} (และระดับถัดไปหากครบแล้ว) ได้รวม ${vocabCount} คำ, เรียนไวยากรณ์ทุกวัน และเน้นทักษะ ${plan.enWeeklyPart || 'Reading'} ตลอดทั้งเดือน (เพื่อ: ${plan.goal})`;
  } else {
    const levelNum = plan.targetLevel.replace('HSK', '');
    return `จดจำคำศัพท์ HSK ${levelNum} (และระดับถัดไปหากครบแล้ว) ได้รวม ${vocabCount} คำ, ศึกษา Textbook/Workbook พร้อมฝึกคัดและฟัง (เพื่อ: ${plan.goal})`;
  }
};
