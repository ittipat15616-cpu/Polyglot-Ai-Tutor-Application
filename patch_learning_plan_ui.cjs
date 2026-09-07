const fs = require('fs');
let code = fs.readFileSync('src/components/LearningPlanModal.tsx', 'utf8');

// Update Questionnaire Step 1 Goal placeholder
const goalJSX = `            {step === 1 && (
              <div>
                <h3 className="text-2xl font-bold text-gray-800 mb-2">1. เป้าหมายหลักของคุณ</h3>
                <p className="text-gray-500 mb-6">เป้าหมายหลักในการเรียน{isEn ? 'ภาษาอังกฤษ' : 'ภาษาจีน'}ของคุณคืออะไร?</p>
                <textarea 
                  value={form.goal}
                  onChange={(e) => setForm({...form, goal: e.target.value})}
                  className="w-full p-4 bg-gray-50 border border-gray-200 rounded-2xl h-32 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="เช่น อยากสอบผ่าน HSK4 เพื่อไปเรียนต่อ, หรืออยากพูดสื่อสารในที่ทำงานได้คล่องแคล่ว"
                />
              </div>
            )}`;
const newGoalJSX = `            {step === 1 && (
              <div>
                <h3 className="text-2xl font-bold text-gray-800 mb-2">1. เป้าหมายหลักของคุณ</h3>
                <p className="text-gray-500 mb-6">เป้าหมายหลักในการเรียน{isEn ? 'ภาษาอังกฤษ' : 'ภาษาจีน'}ของคุณคืออะไร?</p>
                <textarea 
                  value={form.goal}
                  onChange={(e) => setForm({...form, goal: e.target.value})}
                  className="w-full p-4 bg-gray-50 border border-gray-200 rounded-2xl h-32 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder={isEn ? "เช่น อยากสอบ IELTS band..., พัฒนาทักษะด้าน...เพื่อนำไปใช้..." : "เช่น อยากสอบผ่าน HSK4 เพื่อไปเรียนต่อ, หรืออยากพูดสื่อสารในที่ทำงานได้คล่องแคล่ว"}
                />
              </div>
            )}`;
code = code.replace(goalJSX, newGoalJSX);

// Add Step 4 (Vocab), Step 5 (Grammar), Step 6 (EN Skill)
const step4and5JSX = `            {step === 4 && (
              <div>
                <h3 className="text-2xl font-bold text-gray-800 mb-2">4. คำศัพท์ต่อวัน</h3>
                <p className="text-gray-500 mb-6">คุณต้องการเรียนคำศัพท์วันละกี่คำ? (ปล่อยว่างเพื่อให้ระบบคำนวณให้)</p>
                <input 
                  type="number"
                  value={form.vocabPerDay}
                  onChange={(e) => setForm({...form, vocabPerDay: e.target.value})}
                  className="w-full p-4 bg-gray-50 border border-gray-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="เช่น 15, 30"
                />
              </div>
            )}

            {step === 5 && (
              <div>
                <h3 className="text-2xl font-bold text-gray-800 mb-2">5. ไวยากรณ์ต่อวัน</h3>
                <p className="text-gray-500 mb-6">คุณต้องการเรียนไวยากรณ์ (Grammar) วันละกี่บทย่อย? (ปล่อยว่างเพื่อให้ระบบคำนวณให้)</p>
                <input 
                  type="number"
                  value={form.grammarPerDay}
                  onChange={(e) => setForm({...form, grammarPerDay: e.target.value})}
                  className="w-full p-4 bg-gray-50 border border-gray-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="เช่น 1, 2"
                />
              </div>
            )}

            {step === 6 && isEn && (
              <div>
                <h3 className="text-2xl font-bold text-gray-800 mb-2">6. ทักษะที่ต้องการเน้น (สำหรับเดือนนี้)</h3>
                <p className="text-gray-500 mb-6">เลือก 1 ทักษะที่คุณต้องการพัฒนาเป็นพิเศษในเดือนนี้</p>
                <select
                  value={form.enSkill}
                  onChange={(e) => setForm({...form, enSkill: e.target.value})}
                  className="w-full p-4 bg-gray-50 border border-gray-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="Reading">การอ่าน (Reading)</option>
                  <option value="Writing">การเขียน (Writing)</option>
                  <option value="Listening">การฟัง (Listening)</option>
                  <option value="Speaking">การพูด (Speaking)</option>
                </select>
              </div>
            )}`;

// We need to replace step 4,5 -> 7,8
code = code.replace(
  `{step === 4 && (`,
  `{step === 7 && (`
);
code = code.replace(
  `<h3 className="text-2xl font-bold text-gray-800 mb-2">4. จุดแข็ง / จุดอ่อน</h3>`,
  `<h3 className="text-2xl font-bold text-gray-800 mb-2">7. จุดแข็ง / จุดอ่อน</h3>`
);
code = code.replace(
  `{step === 5 && (`,
  `{step === 8 && (`
);
code = code.replace(
  `<h3 className="text-2xl font-bold text-gray-800 mb-2">5. อุปสรรคในการเรียน</h3>`,
  `<h3 className="text-2xl font-bold text-gray-800 mb-2">8. อุปสรรคในการเรียน</h3>`
);

const insertPoint = code.indexOf(`{step === 7 && (`);
code = code.slice(0, insertPoint) + step4and5JSX + "\n\n            " + code.slice(insertPoint);

// Update step total in navigation buttons
const maxStep = `isEn ? 8 : 7`; // EN has skill selection at step 6, actually let's skip step 6 for CN, meaning CN goes from 5 -> 7. Wait, easier if step 6 is always there but maybe just skip it in logic.
// Better logic for next button
code = code.replace(
  `disabled={(step === 1 && !form.goal) || (step === 2 && !form.timeframe) || (step === 3 && !form.level) || (step === 4 && !form.strengths) || (step === 5 && !form.obstacles)}`,
  `disabled={(step === 1 && !form.goal) || (step === 2 && !form.timeframe) || (step === 3 && !form.level) || (step === 7 && !form.strengths) || (step === 8 && !form.obstacles)}`
);

code = code.replace(
  `                onClick={() => {
                  if (step < 5) setStep(step + 1);
                  else onFinish();
                }}
                className="px-6 py-3 bg-indigo-600 text-white font-bold rounded-xl shadow-md hover:bg-indigo-700 transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {step === 5 ? 'สร้างแผนการเรียน' : 'ถัดไป'} <ChevronRight size={20} />`,
  `                onClick={() => {
                  if (step < 8) {
                    if (step === 5 && !isEn) setStep(7); // Skip step 6 for CN
                    else setStep(step + 1);
                  }
                  else onFinish();
                }}
                className="px-6 py-3 bg-indigo-600 text-white font-bold rounded-xl shadow-md hover:bg-indigo-700 transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {step === 8 ? 'สร้างแผนการเรียน' : 'ถัดไป'} <ChevronRight size={20} />`
);

// Progress bar
code = code.replace(
  `style={{ width: \`\${(step / 5) * 100}%\` }}`,
  `style={{ width: \`\${(step / 8) * 100}%\` }}`
);

fs.writeFileSync('src/components/LearningPlanModal.tsx', code);
