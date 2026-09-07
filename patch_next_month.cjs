const fs = require('fs');
let code = fs.readFileSync('src/components/LearningPlanModal.tsx', 'utf8');

// Replace the Month Completion section
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
                  // handleFullDelete logic inline if not accessible, or just call handleFullDelete
                  // Wait, handleFullDelete is defined in LearningPlanModal, so we can call it.
                  handleFullDelete();
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
fs.writeFileSync('src/components/LearningPlanModal.tsx', code);
