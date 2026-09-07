const fs = require('fs');
let code = fs.readFileSync('src/components/LearningPlanModal.tsx', 'utf8');

// Replace the game mission block
const gameMissionRegex = /<MissionItem[\s\S]*?idx=\{2\}[\s\S]*?title="เล่นเกมคำศัพท์"[\s\S]*?\/>/;
code = code.replace(gameMissionRegex, '');

// Update indices for Exam and Lesson
code = code.replace(/idx=\{3\}/g, 'idx={2}');
code = code.replace(/idx=\{4\}/g, 'idx={3}');

// Also change the handleSkipMission and daily missions logic
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

fs.writeFileSync('src/components/LearningPlanModal.tsx', code);
