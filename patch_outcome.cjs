const fs = require('fs');
let code = fs.readFileSync('src/utils/curriculumHelper.ts', 'utf8');

if (!code.includes('getMonthlyExpectedOutcome')) {
  code += `
export const getMonthlyExpectedOutcome = (plan: StudyPlanData) => {
  const vocabCount = (plan.vocabPerDay || 15) * 30;
  
  if (plan.lang === 'EN') {
    return \`จดจำคำศัพท์ \${plan.targetLevel} ได้ \${vocabCount} คำ, เรียนไวยากรณ์/การอ่าน/เขียน/ฟัง อย่างเป็นระบบ (เพื่อ: \${plan.goal})\`;
  } else {
    const levelNum = plan.targetLevel.replace('HSK', '');
    return \`จดจำคำศัพท์ HSK \${levelNum} ได้ \${vocabCount} คำ, ศึกษา Textbook/Workbook พร้อมฝึกคัดและฟัง (เพื่อ: \${plan.goal})\`;
  }
};
`;
  fs.writeFileSync('src/utils/curriculumHelper.ts', code);
}
