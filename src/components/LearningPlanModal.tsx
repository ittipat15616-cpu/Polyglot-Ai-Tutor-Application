import React, { useState, useEffect } from 'react';
import { X, Library, Calendar, Target, Trophy, BrainCircuit, Sparkles, ChevronRight, ChevronLeft, Loader2, BookOpen, CheckCircle, Lock, FastForward, Play, RefreshCw, GraduationCap } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { auth } from '../firebase';
import { deductCredit } from '../services/subscriptionService';
import { loadStudyPlan, saveStudyPlan, deleteStudyPlan, StudyPlanData } from '../services/studyPlanService';
import { getVocabPerDay, getLessonDesc, getGrammarDesc, getSkillDesc, getMonthlyExpectedOutcome } from '../utils/curriculumHelper';

interface LearningPlanModalProps {
  onClose: () => void;
  activeLang: 'EN' | 'CN' | 'TH';
  onNavigate: (tab: string) => void;
}

export default function LearningPlanModal({ onClose, activeLang, onNavigate }: LearningPlanModalProps) {
  const [tab, setTab] = useState<'EN' | 'CN'>(activeLang === 'CN' ? 'CN' : 'EN');
  const [planEN, setPlanEN] = useState<StudyPlanData | null>(null);
  const [planCN, setPlanCN] = useState<StudyPlanData | null>(null);
  const [loading, setLoading] = useState(true);

  // Questionnaire state
  const [isQuestionnaire, setIsQuestionnaire] = useState(false);
  const [qStep, setQStep] = useState(0);
  const [qForm, setQForm] = useState({
    goal: '',
    timeframe: '',
    level: '',
    vocabPerDay: '',
    grammarPerDay: '',
    enSkill: 'Reading',
    strengths: '',
    obstacles: ''
  });
  
  useEffect(() => {
    const fetchPlans = async () => {
      setLoading(true);
      const en = await loadStudyPlan('EN');
      const cn = await loadStudyPlan('CN');
      setPlanEN(en);
      setPlanCN(cn);
      setLoading(false);
    };
    fetchPlans();
  }, []);

  
  const handleResetPlan = async () => {
    if (window.confirm('คุณต้องการรีเซตแผนการเรียนทั้งหมดใช่หรือไม่?')) {
      setLoading(true);
      const en = await loadStudyPlan('EN');
      const cn = await loadStudyPlan('CN');
      if (en) await saveStudyPlan({ ...en, currentDay: 1, currentWeek: 1, currentMonth: 1, dailyMissionsCompleted: [false,false,false,false,false], weeklyMissionCompleted: false, monthlyMissionCompleted: false, overallProgressPercent: 0, enWeeklyPart: 'Reading', currentVocabIndex: 1, currentLessonIndex: 1 });
      if (cn) await saveStudyPlan({ ...cn, currentDay: 1, currentWeek: 1, currentMonth: 1, dailyMissionsCompleted: [false,false,false,false,false], weeklyMissionCompleted: false, monthlyMissionCompleted: false, overallProgressPercent: 0, currentVocabIndex: 1, currentLessonIndex: 1 });
      
      const newEn = await loadStudyPlan('EN');
      const newCn = await loadStudyPlan('CN');
      setPlanEN(newEn);
      setPlanCN(newCn);
      setLoading(false);
    }
  };

  const handleFullDelete = async () => {
    if (window.confirm('ลบแผนทั้งหมดแล้วประเมินใหม่?')) {
        setLoading(true);
        await deleteStudyPlan('EN');
        await deleteStudyPlan('CN');
        setPlanEN(null);
        setPlanCN(null);
        setIsQuestionnaire(true);
        setQStep(1);
        setLoading(false);
    }
  };
const currentPlan = tab === 'EN' ? planEN : planCN;

  const startQuestionnaire = () => {
    setQStep(1);
    setQForm({ goal: '', timeframe: '', level: '', vocabPerDay: '', grammarPerDay: '', enSkill: 'Reading', strengths: '', obstacles: '' });
    setIsQuestionnaire(true);
  };

  const submitQuestionnaire = async () => {
    setLoading(true);
    // Determine overall percentage based on timeframe? Just start at 0
    const newPlan: StudyPlanData = {
      lang: tab,
      goal: qForm.goal,
      timeframe: qForm.timeframe,
      level: qForm.level,
      strengths: qForm.strengths,
      obstacles: qForm.obstacles,
      targetLevel: qForm.level,
      enWeeklyPart: "Reading",
      vocabPerDay: getVocabPerDay(tab, qForm.level, parseInt(qForm.timeframe) || 6),
      lessonsPerDay: 1,
      currentVocabIndex: 1,
      currentLessonIndex: 1,
      overallProgressPercent: 0,
      currentMonth: 1,
      currentWeek: 1,
      currentDay: 1,


      dailyMissionsCompleted: [false, false, false, false, false, false],

      weeklyMissionCompleted: false, monthlyMissionCompleted: false,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    
    await saveStudyPlan(newPlan);
    
    if (tab === 'EN') setPlanEN(newPlan);
    else setPlanCN(newPlan);
    
    setIsQuestionnaire(false);
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 z-[100] bg-slate-950/60 backdrop-blur-md flex items-center justify-center p-2 sm:p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-5xl h-[95vh] md:h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200">
        
        {/* Header */}
        <div className="p-4 sm:p-6 border-b border-gray-100 flex items-center justify-between bg-indigo-50/50">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-indigo-600 text-white rounded-2xl">
              <Calendar size={24} />
            </div>
            <div>
              <h3 className="text-xl font-extrabold text-slate-900">วางแผนการเรียน (Study Plan)</h3>
              <p className="text-xs text-slate-500">ระบบวางแผนและติดตามความก้าวหน้า</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-full transition-all">
            <X size={20} />
          
          {auth.currentUser?.email === 'ittipat15616@gmail.com' && (
             <div className="flex gap-2 mr-4">
                <button onClick={handleResetPlan} className="px-3 py-1 bg-rose-100 text-rose-600 text-xs font-bold rounded-xl hover:bg-rose-200">รีเซตความคืบหน้า</button>
                <button onClick={handleFullDelete} className="px-3 py-1 bg-rose-600 text-white text-xs font-bold rounded-xl hover:bg-rose-700">ลบแผนทิ้ง</button>
             </div>
          )}
</button>
        </div>

        

        <div className="flex-1 overflow-y-auto bg-slate-50 relative">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-full text-indigo-600">
              <Loader2 size={40} className="animate-spin mb-4" />
              <p className="font-bold">กำลังโหลดข้อมูลแผนการเรียน...</p>
            </div>
          ) : isQuestionnaire ? (
             <Questionnaire 
               lang={tab} 
               step={qStep} 
               setStep={setQStep} 
               form={qForm} 
               setForm={setQForm} 
               onFinish={submitQuestionnaire}
               onCancel={() => setIsQuestionnaire(false)}
             />
          ) : !currentPlan ? (
             <div className="flex flex-col items-center justify-center h-full max-w-md mx-auto text-center p-6">
                <Target size={64} className="text-indigo-300 mb-6" />
                <h2 className="text-2xl font-black text-gray-800 mb-3">คุณยังไม่มีแผนการเรียนสำหรับ{tab === 'EN' ? 'ภาษาอังกฤษ' : 'ภาษาจีน'}</h2>
                <p className="text-gray-500 mb-8">
                  เริ่มต้นสร้างแผนการเรียนของคุณเพื่อไปให้ถึงเป้าหมาย ระบบจะประเมินและสร้างภารกิจรายวัน รายสัปดาห์ และรายเดือนให้คุณ
                </p>
                <button 
                  onClick={startQuestionnaire}
                  className="px-8 py-3 bg-indigo-600 text-white font-bold rounded-2xl shadow-lg hover:bg-indigo-700 hover:scale-105 transition-all flex items-center gap-2"
                >
                  <Sparkles size={20} /> เริ่มประเมินเป้าหมาย
                </button>
             </div>
          ) : (
             <PlanDashboard 
               plan={currentPlan} 
               onUpdate={(p) => {
                 saveStudyPlan(p);
                 if (tab === 'EN') setPlanEN(p);
                 else setPlanCN(p);
               }} 
               onNavigate={(t) => {
                 onClose();
                 onNavigate(t);
               }}
               onNextGoal={handleFullDelete}
             />
          )}
        </div>
      </div>
    </div>
  );
}

// Questionnaire Component
function Questionnaire({ lang, step, setStep, form, setForm, onFinish, onCancel }: any) {
  const isEn = lang === 'EN';

  return (
    <div className="max-w-2xl mx-auto p-6 md:p-10 min-h-full flex flex-col justify-center">
       <button onClick={onCancel} className="absolute top-6 left-6 text-gray-400 hover:text-gray-700">
         <ChevronLeft size={24} /> ยกเลิก
       </button>
       
       <div className="w-full bg-gray-200 h-2 rounded-full mb-10 overflow-hidden">
         <div className="h-full bg-indigo-600 transition-all duration-300" style={{ width: `${(step / 8) * 100}%` }} />
       </div>

       <AnimatePresence mode="wait">
         <motion.div 
           key={step}
           initial={{ opacity: 0, x: 20 }}
           animate={{ opacity: 1, x: 0 }}
           exit={{ opacity: 0, x: -20 }}
           className="bg-white p-8 rounded-3xl shadow-sm border border-gray-100"
         >
            {step === 1 && (
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
            )}
            
            {step === 2 && (
              <div>
                <h3 className="text-2xl font-bold text-gray-800 mb-2">2. ระยะเวลาสู่เป้าหมาย</h3>
                <p className="text-gray-500 mb-6">คุณต้องการไปถึงเป้าหมายที่กล่าวไว้ภายในเวลาเท่าใด?</p>
                <input 
                  type="text"
                  value={form.timeframe}
                  onChange={(e) => setForm({...form, timeframe: e.target.value})}
                  className="w-full p-4 bg-gray-50 border border-gray-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="เช่น 3 เดือน, 6 เดือน, 1 ปี"
                />
              </div>
            )}

            {step === 3 && (
              <div>
                <h3 className="text-2xl font-bold text-gray-800 mb-2">3. ระดับภาษาปัจจุบัน</h3>
                <p className="text-gray-500 mb-6">ระดับ{isEn ? 'ภาษาอังกฤษ' : 'ภาษาจีน'}ของคุณตอนนี้อยู่ในระดับใด?</p>
                <select
                  value={form.level}
                  onChange={(e) => setForm({...form, level: e.target.value})}
                  className="w-full p-4 bg-gray-50 border border-gray-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">-- เลือกระดับ --</option>
                  {!isEn ? (
                    <>
                      <option value="Beginner">เริ่มต้น (ไม่มีพื้นฐาน)</option>
                      <option value="HSK1">HSK 1</option>
                      <option value="HSK2">HSK 2</option>
                      <option value="HSK3">HSK 3</option>
                      <option value="HSK4">HSK 4</option>
                      <option value="HSK5">HSK 5</option>
                      <option value="HSK6">HSK 6</option>
                    </>
                  ) : (
                    <>
                      <option value="Beginner">เริ่มต้น (ไม่มีพื้นฐาน)</option>
                      <option value="A1">A1 (IELTS 1.0 - 2.5)</option>
                      <option value="A2">A2 (IELTS 3.0 - 3.5)</option>
                      <option value="B1">B1 (IELTS 4.0 - 5.0)</option>
                      <option value="B2">B2 (IELTS 5.5 - 6.5)</option>
                      <option value="C1">C1 (IELTS 7.0 - 8.0)</option>
                      <option value="C2">C2 (IELTS 8.5 - 9.0)</option>
                    </>
                  )}
                </select>
              </div>
            )}

                        {step === 4 && (
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
            )}

            {step === 7 && (
              <div>
                <h3 className="text-2xl font-bold text-gray-800 mb-2">7. จุดแข็ง / จุดอ่อน</h3>
                <p className="text-gray-500 mb-6">จุดแข็งและจุดอ่อนของคุณคืออะไร และต้องการพัฒนาทักษะใดเป็นพิเศษ?</p>
                <textarea 
                  value={form.strengths}
                  onChange={(e) => setForm({...form, strengths: e.target.value})}
                  className="w-full p-4 bg-gray-50 border border-gray-200 rounded-2xl h-32 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="เช่น อ่านเก่งแต่ฟังไม่ทัน อยากเน้นฝึกพูดและฟัง"
                />
              </div>
            )}

            {step === 8 && (
              <div>
                <h3 className="text-2xl font-bold text-gray-800 mb-2">8. อุปสรรคในการเรียน</h3>
                <p className="text-gray-500 mb-6">อะไรที่เป็นปัญหาหรืออุปสรรคที่คุณมักพบเจอในการเรียนภาษา?</p>
                <textarea 
                  value={form.obstacles}
                  onChange={(e) => setForm({...form, obstacles: e.target.value})}
                  className="w-full p-4 bg-gray-50 border border-gray-200 rounded-2xl h-32 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="เช่น จำศัพท์ไม่ได้ จำแล้วก็ลืม ไม่มีเวลาทบทวน"
                />
              </div>
            )}

            <div className="flex justify-end mt-8">
              <button
                disabled={(step === 1 && !form.goal) || (step === 2 && !form.timeframe) || (step === 3 && !form.level) || (step === 7 && !form.strengths) || (step === 8 && !form.obstacles)}
                onClick={() => {
                  if (step < 8) {
                    if (step === 5 && !isEn) setStep(7); // Skip step 6 for CN
                    else setStep(step + 1);
                  }
                  else onFinish();
                }}
                className="px-6 py-3 bg-indigo-600 text-white font-bold rounded-xl shadow-md hover:bg-indigo-700 transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {step === 8 ? 'สร้างแผนการเรียน' : 'ถัดไป'} <ChevronRight size={20} />
              </button>
            </div>
         </motion.div>
       </AnimatePresence>
    </div>
  );
}

// Will write PlanDashboard next

function PlanDashboard({ plan, onUpdate, onNavigate, onNextGoal }: { plan: StudyPlanData, onUpdate: (p: StudyPlanData) => void, onNavigate: (tab: string) => void, onNextGoal: () => void }) {
  const [progressView, setProgressView] = useState<'DAILY' | 'WEEKLY' | 'MONTHLY' | 'OVERALL'>('DAILY');
  const [showVocabChoice, setShowVocabChoice] = useState(false);
  
  const dailyCount = plan.lang === 'EN' ? 5 : 4;
  const dailyDoneCount = Array.from({length: dailyCount}, (_, i) => i).filter(i => plan.dailyMissionsCompleted[i]).length;
  const isDailyDone = dailyDoneCount === dailyCount;
  const isWeeklyDone = plan.weeklyMissionCompleted;
  const isMonthlyDone = !!plan.monthlyMissionCompleted;

  const vStart = plan.currentVocabIndex || 1;
  const vEnd = vStart + (plan.vocabPerDay || 15) - 1;
  const lStart = plan.currentLessonIndex || 1;
  const lEnd = lStart + (plan.lessonsPerDay || 1) - 1;
  const levelText = plan.targetLevel || 'Beginner';
  const completedDaysThisMonth = (plan.currentDay - 1) + (isDailyDone ? 1 : 0);
  const completedDaysThisWeek = completedDaysThisMonth % 7;
  const weeklyPercent = Math.min(100, (completedDaysThisWeek / 7) * 100);
  const monthlyPercent = Math.min(100, (completedDaysThisMonth / 30) * 100);


  const handleSkipMission = (index: number) => {
    const newMissions = [...plan.dailyMissionsCompleted];
    newMissions[index] = true;
    onUpdate({ ...plan, dailyMissionsCompleted: newMissions });
  };

  const handleNextDay = () => {
    let nextDay = plan.currentDay + 1;
    let nextWeek = plan.currentWeek;
    if (nextDay > 7 && nextDay <= 14) nextWeek = 2;
    else if (nextDay > 14 && nextDay <= 21) nextWeek = 3;
    else if (nextDay > 21) nextWeek = 4;

    onUpdate({
      ...plan,
      currentDay: nextDay,
      currentWeek: nextWeek,
      currentVocabIndex: (plan.currentVocabIndex || 1) + (plan.vocabPerDay || 15),
      currentLessonIndex: (plan.currentLessonIndex || 1) + (plan.lessonsPerDay || 1),
      dailyMissionsCompleted: [false, false, false, false, false, false]
    });
  };

  const handleNextWeek = () => {
    onUpdate({
      ...plan,
      currentWeek: plan.currentWeek < 4 ? plan.currentWeek + 1 : plan.currentWeek,
      weeklyMissionCompleted: false, monthlyMissionCompleted: false,
    });
  };

  const handleNextMonth = () => {
    // Increment overall progress
    const increment = 100 / (parseInt(plan.timeframe) || 6); // default to 6 if parsing fails
    const newOverall = Math.min(100, plan.overallProgressPercent + increment);
    
    onUpdate({
      ...plan,
      currentMonth: plan.currentMonth + 1,
      currentWeek: 1,
      currentDay: 1,
      dailyMissionsCompleted: [false, false, false, false, false, false],

      weeklyMissionCompleted: false, monthlyMissionCompleted: false,
      overallProgressPercent: newOverall
    });
  };

  return (
    <div className="h-full relative flex flex-col md:flex-row p-4 md:p-8 gap-6 max-w-7xl mx-auto">
      
      {/* Left Column: Missions */}
      <div className="flex-1 flex flex-col gap-6 overflow-y-auto pb-32">
        
        {/* Month Info */}
        <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100 flex items-start gap-4">
          <div className="p-4 bg-indigo-50 text-indigo-600 rounded-2xl">
            <Target size={32} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-800">แผนการเรียนเดือนที่ {plan.currentMonth}</h2>
            <p className="text-gray-500 mt-1">เป้าหมายหลัก: {plan.goal}</p>
            <p className="text-sm text-indigo-600 font-medium mt-2">สิ่งที่คาดว่าจะได้รับในเดือนนี้: {getMonthlyExpectedOutcome(plan)}</p>
          </div>
        </div>

        {/* Daily Missions */}
        <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
              <Calendar className="text-indigo-500" />
              ภารกิจรายวัน (วันที่ {plan.currentDay} / 30)
            </h3>
            {isDailyDone && plan.currentDay < 30 && (
              <button onClick={handleNextDay} className="px-4 py-2 bg-indigo-600 text-white text-sm font-bold rounded-xl hover:bg-indigo-700 transition-all flex items-center gap-2 animate-pulse">
                ถัดไป <ChevronRight size={16} />
              </button>
            )}
          </div>
          
                    <div className="space-y-3">
            <MissionItem 
              idx={0}
              title="คลังคำศัพท์ หรือ แฟลชการ์ด"
              desc={`จำและทำความเข้าใจศัพท์ระดับ ${levelText} คำที่ ${vStart} - ${vEnd} (ปักหมุดคำสุดท้าย หรือ บันทึกศัพท์เพื่อจบภารกิจ)`}
              done={plan.dailyMissionsCompleted[0]}
              onSkip={() => handleSkipMission(0)}
              onGo={() => setShowVocabChoice(true)}
            />
            <MissionItem 
              idx={1}
              title="คัดศัพท์"
              desc={plan.lang === 'EN' ? "ลองเขียนทุกอย่างที่จำได้ลงไป" : "ลองเขียนทุกอย่างที่จำได้ลงไป (สำคัญมากสำหรับอักษรจีน)"}
              done={plan.dailyMissionsCompleted[1]}
              onSkip={() => handleSkipMission(1)}
              onGo={() => onNavigate('vocab')}
            />
            
            <MissionItem 
              idx={2}
              title="สอบศัพท์"
              desc="ทำแบบทดสอบศัพท์โดยผิดไม่เกิน 2 ข้อ"
              done={plan.dailyMissionsCompleted[2]}
              onSkip={() => handleSkipMission(2)}
              onGo={() => onNavigate('vocab_exam')}
            />
            {plan.lang === 'EN' ? (
              <>
                <MissionItem 
                  idx={3}
                  title="เรียน Grammar"
                  desc={`${getGrammarDesc(plan)} (ใช้อย่างน้อย 7 นาที)`}
                  done={plan.dailyMissionsCompleted[3]}
                  onSkip={() => handleSkipMission(3)}
                  onGo={() => onNavigate('exercises')}
                />
                <MissionItem 
                  idx={4}
                  title="ฝึกทักษะประจำเดือน"
                  desc={`${getSkillDesc(plan)} (ใช้อย่างน้อย 7 นาที)`}
                  done={plan.dailyMissionsCompleted[4]}
                  onSkip={() => handleSkipMission(4)}
                  onGo={() => onNavigate('exercises')}
                />
              </>
            ) : (
              <MissionItem 
                idx={3}
                title="อ่านบทเรียน"
                desc={`${getLessonDesc(plan)} (ใช้อย่างน้อย 7 นาที)`}
                done={plan.dailyMissionsCompleted[3]}
                onSkip={() => handleSkipMission(3)}
                onGo={() => onNavigate('exercises')}
              />
            )}
          </div>
        </div>

        {/* Weekly Specific Mission */}
        <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
              <Sparkles className="text-amber-500" />
              ภารกิจเฉพาะรายสัปดาห์ (สัปดาห์ที่ {plan.currentWeek} / 4)
            </h3>
            {isWeeklyDone && plan.currentWeek < 4 && (
              <button onClick={handleNextWeek} className="px-4 py-2 bg-amber-500 text-white text-sm font-bold rounded-xl hover:bg-amber-600 transition-all flex items-center gap-2">
                สัปดาห์ถัดไป <ChevronRight size={16} />
              </button>
            )}
          </div>
          <div className="relative p-4 rounded-2xl border-2 border-amber-100 bg-amber-50/30 flex items-center justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-amber-100 text-amber-600 rounded-xl">
                <BookOpen size={24} />
              </div>
              <div>
                
                
                <h4 className="font-bold text-gray-800">
                  {plan.lang === 'EN' 
                    ? `จำลองสอบพาร์ท ${plan.enWeeklyPart || 'Reading'} ชุดที่ ${plan.currentWeek}`
                    : `ศึกษาข้อสอบ ${plan.currentWeek <= 2 ? 'HSK' : 'HSKK'} ชุดที่ ${plan.currentWeek}`} (Mock Test)
                </h4>

                <p className="text-sm text-gray-500 mt-1">เข้าไปศึกษาโจทย์และเฉลยในหน้าข้อสอบ เพื่อทำความคุ้นเคยกับแนวข้อสอบจริง</p>
              </div>
            </div>
            {!isWeeklyDone ? (
              <div className="flex gap-2 shrink-0">
                <button onClick={() => onNavigate('mocktests')} className="px-4 py-2 bg-gray-900 text-white text-sm font-bold rounded-xl hover:bg-gray-800 transition-all text-center">
                  ไปทำ
                </button>
                <button onClick={() => onUpdate({...plan, weeklyMissionCompleted: true})} className="px-4 py-2 bg-green-600 text-white text-sm font-bold rounded-xl hover:bg-green-700 transition-all text-center">
                  เสร็จสิ้น
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-green-600 font-bold px-4 py-2 bg-green-50 rounded-xl">
                <CheckCircle size={20} /> เสร็จสิ้น
              </div>
            )}
          </div>
        </div>

        
        {/* Monthly Specific Mission */}
        <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100 mb-6 mt-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
              <Trophy className="text-rose-500" />
              ภารกิจวัดผลประจำเดือน (จำลองสอบจริง)
            </h3>
          </div>
          <div className="relative p-4 rounded-2xl border-2 border-rose-100 bg-rose-50/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-rose-100 text-rose-600 rounded-xl shrink-0">
                <Target size={24} />
              </div>
              <div>
                <h4 className="font-bold text-gray-800">
                  สอบจำลองเสมือนจริง (Mock Test)
                </h4>
                <p className="text-sm text-gray-500 mt-1">
                  ทำข้อสอบแบบจับเวลาจริง เป้าหมาย: <strong>ทำคะแนนให้เพิ่มขึ้นอย่างน้อย 10-15%</strong> จากเดิมเพื่อพิสูจน์ความก้าวหน้า
                </p>
              </div>
            </div>
            {!isMonthlyDone ? (
              <div className="flex gap-2 shrink-0">
                <button onClick={() => onNavigate('mocktests')} className="px-4 py-2 bg-gray-900 text-white text-sm font-bold rounded-xl hover:bg-gray-800 transition-all text-center">
                  ไปสอบ
                </button>
                <button onClick={() => onUpdate({...plan, monthlyMissionCompleted: true})} className="px-4 py-2 bg-green-600 text-white text-sm font-bold rounded-xl hover:bg-green-700 transition-all text-center">
                  เสร็จสิ้น
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-green-600 font-bold px-4 py-2 bg-green-50 rounded-xl shrink-0">
                <CheckCircle size={20} /> สอบผ่านแล้ว
              </div>
            )}
          </div>
        </div>
        {/* Month Completion */}
        {plan.currentDay >= 30 && isDailyDone && isWeeklyDone && isMonthlyDone && (
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
        )}

      </div>

      
        <div className="text-center text-sm text-gray-500 bg-gray-50 p-4 rounded-2xl border border-gray-100 mb-6">
          *หมายเหตุ: คุณไม่จำเป็นต้องเรียนตามแผนเสมอไป คุณสามารถไปลองเรียนบทเรียนอื่นๆและลองใช้ฟีเจอร์อื่นๆนอกเหนือจากที่แผนกำหนดไว้ให้ได้อย่างอิสระ แผนที่สร้างเป็นเพียงแค่ไกด์นำทางเท่านั้น*
        </div>
      {/* Vocab Choice Modal */}
      {showVocabChoice && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 w-full max-w-md shadow-2xl relative">
            <button onClick={() => setShowVocabChoice(false)} className="absolute top-4 right-4 p-2 bg-gray-100 hover:bg-gray-200 rounded-full text-gray-500 transition-colors">
              <X size={20} />
            </button>
            <h3 className="text-xl font-bold text-gray-800 mb-6 text-center">เลือกรูปแบบการท่องศัพท์</h3>
            <div className="grid grid-cols-2 gap-4">
              <button 
                onClick={() => {
                  setShowVocabChoice(false);
                  onNavigate('lessons');
                }} 
                className="aspect-square flex flex-col items-center justify-center p-4 bg-indigo-50 border-2 border-indigo-100 hover:border-indigo-500 rounded-2xl transition-all group"
              >
                <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center shadow-sm mb-4 group-hover:scale-110 transition-transform">
                  <Library size={32} className="text-indigo-600" />
                </div>
                <span className="font-bold text-indigo-900">คลังคำศัพท์</span>
                <span className="text-xs text-indigo-600/70 mt-1 text-center">ดูคำศัพท์และตัวอย่าง</span>
              </button>

              <button 
                onClick={() => {
                  setShowVocabChoice(false);
                  onNavigate('flashcards');
                }} 
                className="aspect-square flex flex-col items-center justify-center p-4 bg-emerald-50 border-2 border-emerald-100 hover:border-emerald-500 rounded-2xl transition-all group"
              >
                <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center shadow-sm mb-4 group-hover:scale-110 transition-transform">
                  <BookOpen size={32} className="text-emerald-600" />
                </div>
                <span className="font-bold text-emerald-900">แฟลชการ์ด</span>
                <span className="text-xs text-emerald-600/70 mt-1 text-center">ทดสอบความจำ</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Right Column (Mobile: Bottom Fixed): Progress Viewer */}
      <div className="fixed bottom-4 right-4 md:bottom-8 md:right-8 w-[90%] md:w-80 bg-slate-900/95 backdrop-blur-md rounded-3xl shadow-2xl p-5 border border-slate-700 z-50 text-white">
        <div className="flex items-center justify-between mb-4">
           <button 
             onClick={() => {
               const views: any[] = ['DAILY', 'WEEKLY', 'MONTHLY', 'OVERALL'];
               const idx = views.indexOf(progressView);
               setProgressView(views[(idx - 1 + 4) % 4]);
             }}
             className="p-1.5 hover:bg-slate-800 rounded-full transition-all"
           >
             <ChevronLeft size={20} />
           </button>
           <div className="font-bold text-sm tracking-wide">
             {progressView === 'DAILY' && 'ความคืบหน้ารายวัน'}
             {progressView === 'WEEKLY' && 'ความคืบหน้ารายสัปดาห์'}
             {progressView === 'MONTHLY' && 'ความคืบหน้ารายเดือน'}
             {progressView === 'OVERALL' && 'ก้าวสู่เป้าหมายหลัก'}
           </div>
           <button 
             onClick={() => {
               const views: any[] = ['DAILY', 'WEEKLY', 'MONTHLY', 'OVERALL'];
               const idx = views.indexOf(progressView);
               setProgressView(views[(idx + 1) % 4]);
             }}
             className="p-1.5 hover:bg-slate-800 rounded-full transition-all"
           >
             <ChevronRight size={20} />
           </button>
        </div>

        <div className="w-full bg-slate-800 h-4 rounded-full overflow-hidden relative shadow-inner">
           {progressView === 'DAILY' && (
             <motion.div 
               initial={{ width: 0 }}
               animate={{ width: `${(dailyDoneCount / dailyCount) * 100}%` }}
               className="h-full bg-gradient-to-r from-rose-500 to-rose-400"
             />
           )}
           {progressView === 'WEEKLY' && (
             <motion.div 
               initial={{ width: 0 }}
               animate={{ width: `${weeklyPercent}%` }}
               className="h-full bg-gradient-to-r from-amber-500 to-amber-400"
             />
           )}
           {progressView === 'MONTHLY' && (
             <motion.div 
               initial={{ width: 0 }}
               animate={{ width: `${monthlyPercent}%` }}
               className="h-full bg-gradient-to-r from-indigo-500 to-indigo-400"
             />
           )}
           {progressView === 'OVERALL' && (
             <motion.div 
               initial={{ width: 0 }}
               animate={{ width: `${plan.overallProgressPercent}%` }}
               className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400"
             />
           )}
        </div>
        
        <div className="text-right mt-2 font-black text-xl">
           {progressView === 'DAILY' && `${Math.round((dailyDoneCount / dailyCount) * 100)}%`}
           {progressView === 'WEEKLY' && `${Math.round(weeklyPercent)}%`}
           {progressView === 'MONTHLY' && `${Math.round(monthlyPercent)}%`}
           {progressView === 'OVERALL' && `${Math.round(plan.overallProgressPercent)}%`}
        </div>
      </div>

    </div>
  );
}

function MissionItem({ idx, title, desc, done, onSkip, onGo }: { idx: number, title: string, desc: string, done: boolean, onSkip: () => void, onGo: () => void }) {
  return (
    <div className={`p-4 rounded-2xl border-2 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${done ? 'border-green-100 bg-green-50/50' : 'border-gray-100 bg-gray-50/50 hover:border-indigo-100'}`}>
      <div className="flex items-start gap-4">
        <div className={`p-2 rounded-xl mt-1 shrink-0 ${done ? 'bg-green-100 text-green-600' : 'bg-gray-200 text-gray-500'}`}>
          {done ? <CheckCircle size={20} /> : <div className="w-5 h-5 flex items-center justify-center font-bold text-xs">{idx + 1}</div>}
        </div>
        <div>
          <h4 className={`font-bold ${done ? 'text-green-800' : 'text-gray-800'}`}>{title}</h4>
          <p className="text-sm text-gray-500 mt-1">{desc}</p>
        </div>
      </div>
      <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
        {!done ? (
          <div className="flex gap-2">
            <button onClick={onGo} className="px-4 py-2 bg-gray-900 text-white text-sm font-bold rounded-xl hover:bg-gray-800 transition-all text-center">
              ไปทำ
            </button>
            <button onClick={onSkip} className="px-4 py-2 bg-green-600 text-white text-sm font-bold rounded-xl hover:bg-green-700 transition-all text-center">
              เสร็จสิ้น
            </button>
          </div>
        ) : (
          <div className="px-4 py-2 bg-green-100 text-green-700 text-sm font-bold rounded-xl flex items-center gap-2">
            เสร็จแล้ว
          </div>
        )}
      </div>
    </div>
  );
}
