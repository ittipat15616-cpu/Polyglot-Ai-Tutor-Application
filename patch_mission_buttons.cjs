const fs = require('fs');
let code = fs.readFileSync('src/components/LearningPlanModal.tsx', 'utf8');

// Replace MissionItem buttons
const oldMissionButtons = `        {!done ? (
          <>
            <button onClick={onSkip} className="px-3 py-2 text-xs font-bold text-gray-400 hover:text-gray-600 transition-colors">
              ข้าม (ทำแล้ว)
            </button>
            <button onClick={onGo} className="px-4 py-2 bg-indigo-50 text-indigo-700 text-sm font-bold rounded-xl border border-indigo-100 hover:bg-indigo-100 transition-all flex items-center gap-1">
              ไปทำ <ChevronRight size={16} />
            </button>
          </>
        ) : (`;

const newMissionButtons = `        {!done ? (
          <div className="flex gap-2">
            <button onClick={onGo} className="px-4 py-2 bg-gray-900 text-white text-sm font-bold rounded-xl hover:bg-gray-800 transition-all text-center">
              ไปทำ
            </button>
            <button onClick={onSkip} className="px-4 py-2 bg-green-600 text-white text-sm font-bold rounded-xl hover:bg-green-700 transition-all text-center">
              เสร็จสิ้น
            </button>
          </div>
        ) : (`;

code = code.replace(oldMissionButtons, newMissionButtons);

// Also change the weekly mission buttons
const oldWeeklyButtons = `            {!isWeeklyDone ? (
              <div className="flex flex-col gap-2 shrink-0">
                <button onClick={() => onNavigate('mocktests')} className="px-4 py-2 bg-gray-900 text-white text-sm font-bold rounded-xl hover:bg-gray-800 transition-all text-center">
                  ไปยังหน้าสอบ
                </button>
                {plan.lang === 'CN' && (
                  <button onClick={() => onUpdate({...plan, weeklyMissionCompleted: true})} className="px-4 py-1 text-xs text-gray-500 hover:text-gray-800 transition-all text-center">
                    ข้าม (รู้แล้ว)
                  </button>
                )}
              </div>
            ) : (`;

const newWeeklyButtons = `            {!isWeeklyDone ? (
              <div className="flex gap-2 shrink-0">
                <button onClick={() => onNavigate('mocktests')} className="px-4 py-2 bg-gray-900 text-white text-sm font-bold rounded-xl hover:bg-gray-800 transition-all text-center">
                  ไปทำ
                </button>
                <button onClick={() => onUpdate({...plan, weeklyMissionCompleted: true})} className="px-4 py-2 bg-green-600 text-white text-sm font-bold rounded-xl hover:bg-green-700 transition-all text-center">
                  เสร็จสิ้น
                </button>
              </div>
            ) : (`;

code = code.replace(oldWeeklyButtons, newWeeklyButtons);

fs.writeFileSync('src/components/LearningPlanModal.tsx', code);
