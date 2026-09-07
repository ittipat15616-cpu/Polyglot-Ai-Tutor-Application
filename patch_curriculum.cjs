const fs = require('fs');
let code = fs.readFileSync('src/utils/curriculumHelper.ts', 'utf8');

// Replace getLessonDesc with separate getGrammarDesc and getSkillDesc
const newCode = code.replace(/export const getLessonDesc = [\\s\\S]*?export const getMonthlyExpectedOutcome/, \`export const getGrammarDesc = (plan: StudyPlanData) => {
  if (plan.lang === 'EN') {
    return \\\`เรียน Grammar บทที่ \${plan.currentDay}\\\`; // Simplified for everyday
  }
  return '';
};

export const getSkillDesc = (plan: StudyPlanData) => {
  if (plan.lang === 'EN') {
    const skill = plan.enWeeklyPart || 'Reading';
    return \\\`ฝึกทักษะ \${skill} วันที่ \${plan.currentDay}\\\`; // Simplified for everyday
  }
  return '';
};

export const getLessonDesc = (plan: StudyPlanData) => {
  const weekInMonth = plan.currentWeek; // 1 to 4
  const dayInWeek = ((plan.currentDay - 1) % 7) + 1; // 1 to 7
  
  const levelNum = plan.targetLevel.replace('HSK', '');
  if (weekInMonth === 1) {
    return \\\`เรียน HSK \${levelNum} Textbook บทที่ \${dayInWeek}\\\`;
  } else if (weekInMonth === 2) {
    return \\\`ทำ HSK \${levelNum} Workbook บทที่ \${dayInWeek}\\\`;
  } else if (weekInMonth === 3) {
    return \\\`คัดลายมืออักษรจีน (บทที่ \${dayInWeek})\\\`;
  } else {
    return \\\`ฝึกฟัง HSK \${levelNum} (ชุดที่ \${dayInWeek})\\\`;
  }
};

export const getMonthlyExpectedOutcome\`);

fs.writeFileSync('src/utils/curriculumHelper.ts', newCode);
