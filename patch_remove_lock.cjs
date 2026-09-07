const fs = require('fs');
let code = fs.readFileSync('src/components/LearningPlanModal.tsx', 'utf8');

const lockOverlayRegex = /\{\(\(plan\.currentDay < plan\.currentWeek \* 7\).*?\}\)\) && \(\s*<div className="absolute inset-0 bg-white\/60 backdrop-blur-sm z-10 flex items-center justify-center rounded-2xl">\s*<div.*?<\/div>\s*<\/div>\s*\)\}/s;
code = code.replace(lockOverlayRegex, '');

fs.writeFileSync('src/components/LearningPlanModal.tsx', code);
