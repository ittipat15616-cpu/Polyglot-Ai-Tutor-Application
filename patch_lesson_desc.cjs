const fs = require('fs');
let code = fs.readFileSync('src/components/LearningPlanModal.tsx', 'utf8');

// Find the lesson description mapping
const oldLessonDesc = 'desc={`ทำความเข้าใจบทเรียน ${levelText} บทที่ ${lStart} - ${lEnd} (ใช้อย่างน้อย 7 นาที)`}';
const newLessonDesc = 'desc={`${getLessonDesc(plan)} (ใช้อย่างน้อย 7 นาที)`}';

code = code.replace(oldLessonDesc, newLessonDesc);
fs.writeFileSync('src/components/LearningPlanModal.tsx', code);
