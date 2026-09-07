const fs = require('fs');
let code = fs.readFileSync('src/components/LearningPlanModal.tsx', 'utf8');

const oldMockTitle = `{plan.lang === 'EN' 
                    ? \`จำลองสอบพาร์ท \${plan.enWeeklyPart || 'Reading'} ชุดที่ \${plan.currentWeek}\`
                    : (plan.currentWeek <= 2 ? 'ศึกษาข้อสอบ HSK' : 'ศึกษาข้อสอบ HSKK')} (Mock Test)`;
                    
const newMockTitle = `{plan.lang === 'EN' 
                    ? \`จำลองสอบพาร์ท \${plan.enWeeklyPart || 'Reading'} ชุดที่ \${plan.currentWeek}\`
                    : \`ศึกษาข้อสอบ \${plan.currentWeek <= 2 ? 'HSK' : 'HSKK'} ชุดที่ \${plan.currentWeek}\`} (Mock Test)`;

if (code.includes(oldMockTitle)) {
  code = code.replace(oldMockTitle, newMockTitle);
  fs.writeFileSync('src/components/LearningPlanModal.tsx', code);
  console.log("Mock test title updated");
} else {
  console.log("Mock test title not found");
}
