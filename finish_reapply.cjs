const fs = require('fs');
let code = fs.readFileSync('src/components/LearningPlanModal.tsx', 'utf8');

// Weekly Mission Unlock
const lockOverlayRegex = /\{\(\(plan\.currentDay < plan\.currentWeek \* 7\).*?\}\)\) && \(\s*<div className="absolute inset-0 bg-white\/60 backdrop-blur-sm z-10 flex items-center justify-center rounded-2xl">\s*<div.*?<\/div>\s*<\/div>\s*\)\}/s;
code = code.replace(lockOverlayRegex, '');

// Weekly Mission Title
const weeklyTitleRegex = /<h4 className="font-bold text-gray-800">จำลองสอบ.*?<\/h4>/;
const newWeeklyTitle = `
                <h4 className="font-bold text-gray-800">
                  {plan.lang === 'EN' 
                    ? \`จำลองสอบพาร์ท \${plan.enWeeklyPart || 'Reading'} ชุดที่ \${plan.currentWeek}\`
                    : (plan.currentWeek <= 2 ? 'ศึกษาข้อสอบ HSK' : 'ศึกษาข้อสอบ HSKK')} (Mock Test)
                </h4>
`;
code = code.replace(weeklyTitleRegex, newWeeklyTitle);

// Month Completion condition
const oldMonthCompletion = `{plan.currentDay >= 30 && isDailyDone && isWeeklyDone && (
          <div className="bg-indigo-50 rounded-3xl p-6 shadow-sm border border-indigo-100 text-center">
            <GraduationCap size={48} className="mx-auto text-indigo-600 mb-4" />
            <h3 className="text-2xl font-black text-indigo-900 mb-2">ยินดีด้วย! คุณสำเร็จแผนการเรียนเดือนนี้แล้ว</h3>
            <p className="text-indigo-700 mb-6">คุณยอดเยี่ยมมาก! พร้อมสำหรับการเรียนรู้ในเดือนถัดไปหรือยัง?</p>
            <button onClick={handleNextMonth} className="px-6 py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-all inline-flex items-center gap-2">
              <Sparkles size={20} /> วางแผนเดือนถัดไป (ใช้ 1 เครดิต)
            </button>
          </div>
        )}`;

const newMonthCompletion = `{plan.currentDay >= 30 && isDailyDone && isWeeklyDone && (
          <div className="bg-indigo-50 rounded-3xl p-6 shadow-sm border border-indigo-100 text-center">
            <GraduationCap size={48} className="mx-auto text-indigo-600 mb-4" />
            <h3 className="text-2xl font-black text-indigo-900 mb-2">ยินดีด้วย! คุณสำเร็จแผนการเรียนเดือนนี้แล้ว</h3>
            <p className="text-indigo-700 mb-6">คุณยอดเยี่ยมมาก! พร้อมสำหรับการเรียนรู้ในเดือนถัดไปหรือยัง?</p>
            {plan.overallProgressPercent + (100 / (parseInt(plan.timeframe) || 6)) >= 99 ? (
              <button onClick={() => {
                if (window.confirm('คุณเรียนจบตามเป้าหมายหลักแล้ว! ต้องการประเมินเป้าหมายใหม่หรือไม่?')) {
                  onNextGoal();
                }
              }} className="px-6 py-3 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 transition-all inline-flex items-center gap-2">
                <Sparkles size={20} /> ก้าวสู่เป้าหมายถัดไป
              </button>
            ) : (
              <button onClick={handleNextMonth} className="px-6 py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-all inline-flex items-center gap-2">
                <Sparkles size={20} /> วางแผนการเรียนต่อ
              </button>
            )}
          </div>
        )}`;
code = code.replace(oldMonthCompletion, newMonthCompletion);

// MissionItem Buttons
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

// Weekly Mission Buttons
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
