const fs = require('fs');
let code = fs.readFileSync('src/components/LearningPlanModal.tsx', 'utf8');

// 6. HandleNextDay update
const oldHandleNextDay = `  const handleNextDay = () => {
    let nextDay = plan.currentDay + 1;
    let nextWeek = plan.currentWeek;
    if (nextDay > 7 && nextDay <= 14) nextWeek = 2;
    else if (nextDay > 14 && nextDay <= 21) nextWeek = 3;
    else if (nextDay > 21) nextWeek = 4;

    onUpdate({
      ...plan,
      currentDay: nextDay,
      currentWeek: nextWeek,
      dailyMissionsCompleted: [false, false, false, false, false]
    });
  };`;
const newHandleNextDay = `  const handleNextDay = () => {
    onUpdate({
      ...plan,
      currentDay: plan.currentDay + 1,
      currentVocabIndex: (plan.currentVocabIndex || 1) + (plan.vocabPerDay || 15),
      currentLessonIndex: (plan.currentLessonIndex || 1) + (plan.lessonsPerDay || 1),
      dailyMissionsCompleted: [false, false, false, false, false]
    });
  };`;
code = code.replace(oldHandleNextDay, newHandleNextDay);

// 7. HandleNextMonth
const oldHandleNextMonth = `  const handleNextMonth = () => {
    onUpdate({
      ...plan,
      currentMonth: plan.currentMonth + 1,
      currentWeek: 1,
      currentDay: 1,
      dailyMissionsCompleted: [false, false, false, false, false],
      weeklyMissionCompleted: false,
    });
  };`;
const newHandleNextMonth = `  const handleNextMonth = () => {
    const increment = 100 / (parseInt(plan.timeframe) || 6);
    const newOverall = Math.min(100, plan.overallProgressPercent + increment);
    const parts = ['Reading', 'Listening', 'Writing', 'Speaking'];
    const nextPart = parts[(parts.indexOf(plan.enWeeklyPart || 'Reading') + 1) % 4];
    
    onUpdate({
      ...plan,
      currentMonth: plan.currentMonth + 1,
      currentWeek: 1,
      currentDay: 1,
      dailyMissionsCompleted: [false, false, false, false, false],
      weeklyMissionCompleted: false,
      overallProgressPercent: newOverall,
      enWeeklyPart: nextPart
    });
  };`;
code = code.replace(oldHandleNextMonth, newHandleNextMonth);

// 8. Remove Game Mission
const gameMissionRegex = /<MissionItem\s*idx=\{2\}\s*title="เล่นเกมคำศัพท์"[\s\S]*?\/>/;
code = code.replace(gameMissionRegex, '');

code = code.replace(/idx=\{3\}/g, 'idx={2}');
code = code.replace(/idx=\{4\}/g, 'idx={3}');

code = code.replace(
  'const dailyDoneCount = plan.dailyMissionsCompleted.filter(Boolean).length;',
  'const dailyDoneCount = [0,1,2,3].filter(i => plan.dailyMissionsCompleted[i]).length;'
);

code = code.replace(
  'const isDailyDone = dailyDoneCount === 5;',
  'const isDailyDone = dailyDoneCount === 4;'
);

code = code.replace(
  'animate={{ width: `${(dailyDoneCount / 5) * 100}%` }}',
  'animate={{ width: `${(dailyDoneCount / 4) * 100}%` }}'
);

code = code.replace(
  '{progressView === \'DAILY\' && `${(dailyDoneCount / 5) * 100}%`}',
  '{progressView === \'DAILY\' && `${(dailyDoneCount / 4) * 100}%`}'
);

// 9. Mission texts and Vocab Prompt
code = code.replace(
  'desc={`ระดับ ${levelText} คำที่ ${vStart} - ${vEnd} (ปักหมุดคำสุดท้าย หรือ บันทึกศัพท์เพื่อจบภารกิจ)`}',
  'desc={`จำและทำความเข้าใจศัพท์ระดับ ${levelText} คำที่ ${vStart} - ${vEnd} (ปักหมุดคำสุดท้าย หรือ บันทึกศัพท์เพื่อจบภารกิจ)`}'
);

code = code.replace(
  'desc={`พาร์ท ${levelText} บทที่ ${lStart} - ${lEnd} (ใช้อย่างน้อย 7 นาที)`}',
  'desc={`${getLessonDesc(plan)} (ใช้อย่างน้อย 7 นาที)`}'
);

// We need to replace the onGo for Vocab
code = code.replace(
  'onGo={() => onNavigate(\'exercises\')}',
  `onGo={() => {
    if (window.confirm("คุณต้องการเปิดหน้า 'คลังคำศัพท์' (กด OK) หรือ 'แฟลชการ์ด' (กด Cancel) ?")) {
      onNavigate('vocab');
    } else {
      onNavigate('flashcards');
    }
  }}`
);

fs.writeFileSync('src/components/LearningPlanModal.tsx', code);
