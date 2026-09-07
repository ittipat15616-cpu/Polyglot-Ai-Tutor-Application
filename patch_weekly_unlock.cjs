const fs = require('fs');
let code = fs.readFileSync('src/components/LearningPlanModal.tsx', 'utf8');

// Remove the lock overlay
const lockOverlayRegex = /\{\(\(plan\.currentDay < plan\.currentWeek \* 7\).*?\}\)\) && \(\s*<div className="absolute inset-0 bg-white\/60 backdrop-blur-sm z-10 flex items-center justify-center rounded-2xl">\s*<div.*?<\/div>\s*<\/div>\s*\)\}/s;
code = code.replace(lockOverlayRegex, '');

// Update the onGo for Vocab mission (idx 0)
// Currently it is: onGo={() => onNavigate('exercises')} or onNavigate('vocab')? Let's check what it was.
code = code.replace(
  /onGo=\{\(\) => onNavigate\('exercises'\)\}/,
  `onGo={() => {
    if (window.confirm("คุณต้องการเปิดหน้า 'คลังคำศัพท์' (กด OK) หรือ 'แฟลชการ์ด' (กด Cancel) ?")) {
      onNavigate('vocab');
    } else {
      onNavigate('flashcards');
    }
  }}`
);

fs.writeFileSync('src/components/LearningPlanModal.tsx', code);
