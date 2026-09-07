const fs = require('fs');
let code = fs.readFileSync('src/components/LearningPlanModal.tsx', 'utf8');

if (!code.includes('getMonthlyExpectedOutcome')) {
  code = code.replace(
    "import { getVocabPerDay, getLessonDesc } from '../utils/curriculumHelper';",
    "import { getVocabPerDay, getLessonDesc, getMonthlyExpectedOutcome } from '../utils/curriculumHelper';"
  );
  
  code = code.replace(
    /<p className="text-sm text-indigo-600 font-medium mt-2">สิ่งที่คาดว่าจะได้รับในเดือนนี้: เข้าใจคำศัพท์ใหม่ 150 คำ, รู้ไวยากรณ์พื้นฐาน 10 บท, และทำคะแนนจำลองสอบเพิ่มขึ้น 10%<\/p>/,
    `<p className="text-sm text-indigo-600 font-medium mt-2">สิ่งที่คาดว่าจะได้รับในเดือนนี้: {getMonthlyExpectedOutcome(plan)}</p>`
  );
  
  fs.writeFileSync('src/components/LearningPlanModal.tsx', code);
}
