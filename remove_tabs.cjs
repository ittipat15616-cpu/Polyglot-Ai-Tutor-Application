const fs = require('fs');
let code = fs.readFileSync('src/components/LearningPlanModal.tsx', 'utf8');

// Remove Tab Selector block
code = code.replace(/\{\/\* Tab Selector \*\/\}\n\s*\{!isQuestionnaire && \(\n\s*<div className="flex border-b border-gray-200">[\s\S]*?<\/div>\n\s*\)\}/, '');

fs.writeFileSync('src/components/LearningPlanModal.tsx', code);
