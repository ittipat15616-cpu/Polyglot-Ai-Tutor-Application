const fs = require('fs');
let code = fs.readFileSync('src/components/LearningPlanModal.tsx', 'utf8');

// Update handleNextDay
code = code.replace(
  'dailyMissionsCompleted: [false, false, false, false, false]',
  'currentVocabIndex: (plan.currentVocabIndex || 1) + (plan.vocabPerDay || 15),\n      currentLessonIndex: (plan.currentLessonIndex || 1) + (plan.lessonsPerDay || 1),\n      dailyMissionsCompleted: [false, false, false, false, false]'
);

// We need to inject variables for the render
const dailyVars = `
  const vStart = plan.currentVocabIndex || 1;
  const vEnd = vStart + (plan.vocabPerDay || 15) - 1;
  const lStart = plan.currentLessonIndex || 1;
  const lEnd = lStart + (plan.lessonsPerDay || 1) - 1;
  const levelText = plan.targetLevel || 'Beginner';
  const completedDaysThisMonth = (plan.currentDay - 1) + (isDailyDone ? 1 : 0);
  const completedDaysThisWeek = completedDaysThisMonth % 7;
  const weeklyPercent = Math.min(100, (completedDaysThisWeek / 7) * 100);
  const monthlyPercent = Math.min(100, (completedDaysThisMonth / 30) * 100);
`;

code = code.replace(
  'const isWeeklyDone = plan.weeklyMissionCompleted;',
  'const isWeeklyDone = plan.weeklyMissionCompleted;\n' + dailyVars
);

// Update Vocab MissionItem desc
code = code.replace(
  /desc="จำและทำความเข้าใจศัพท์ .*?"/,
  'desc={`ระดับ ${levelText} คำที่ ${vStart} - ${vEnd} (ปักหมุดคำสุดท้าย หรือ บันทึกศัพท์เพื่อจบภารกิจ)`}'
);

// Update Lesson MissionItem desc
code = code.replace(
  /desc="ทำความเข้าใจบทเรียน \(ใช้อย่างน้อย 7 นาที\)"/,
  'desc={`พาร์ท ${levelText} บทที่ ${lStart} - ${lEnd} (ใช้อย่างน้อย 7 นาที)`}'
);

// Update progress bars
code = code.replace(
  /animate={{ width: \`\${\(\(plan\.currentDay % 7\) \/ 7\) \* 100}%\` }}/,
  'animate={{ width: `${weeklyPercent}%` }}'
);
code = code.replace(
  /animate={{ width: \`\${\(plan\.currentDay \/ 30\) \* 100}%\` }}/,
  'animate={{ width: `${monthlyPercent}%` }}'
);

// Update progress text
code = code.replace(
  /{progressView === 'WEEKLY' && \`\${Math\.round\(\(\(plan\.currentDay % 7\) \/ 7\) \* 100\)}%\`}/,
  "{progressView === 'WEEKLY' && `${Math.round(weeklyPercent)}%`}"
);
code = code.replace(
  /{progressView === 'MONTHLY' && \`\${Math\.round\(\(plan\.currentDay \/ 30\) \* 100\)}%\`}/,
  "{progressView === 'MONTHLY' && `${Math.round(monthlyPercent)}%`}"
);

// Remove Lock on Mock Test (we injected it earlier, we can remove it by finding the block)
// The block looks like: {((plan.currentDay < plan.currentWeek * 7) || (plan.currentDay === plan.currentWeek * 7 && !isDailyDone)) && ( <div className="absolute inset-0 ...
const lockRegex = /\{\(\(\(plan\.currentDay < plan\.currentWeek \* 7\).*?\}\)/s;
code = code.replace(lockRegex, '');

fs.writeFileSync('src/components/LearningPlanModal.tsx', code);
