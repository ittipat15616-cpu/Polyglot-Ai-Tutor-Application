const fs = require('fs');
let code = fs.readFileSync('src/components/LearningPlanModal.tsx', 'utf8');

const lockOverlay = `{((plan.currentDay < plan.currentWeek * 7) || (plan.currentDay === plan.currentWeek * 7 && !isDailyDone)) && (
                  <div className="absolute inset-0 bg-white/60 backdrop-blur-sm z-10 flex items-center justify-center rounded-2xl">
                    <div className="bg-white px-4 py-2 rounded-xl shadow-sm text-sm font-bold text-gray-500 flex items-center gap-2">
                      <Lock size={16} /> ต้องทำภารกิจรายวันถึงวันที่ {plan.currentWeek * 7} ก่อน
                    </div>
                  </div>
                )}`;

if (code.includes(lockOverlay)) {
  code = code.replace(lockOverlay, '');
  fs.writeFileSync('src/components/LearningPlanModal.tsx', code);
  console.log("Successfully replaced exact string.");
} else {
  console.log("Could not find the exact string.");
}
