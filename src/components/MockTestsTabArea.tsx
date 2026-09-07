import React, { useState, useEffect } from 'react';
import { FileText, Clock, ChevronLeft, Award, History, CheckCircle, XCircle, Sparkles, X } from 'lucide-react';
import MockTestArea from './MockTestArea';
import IeltsMockTestArea from './IeltsMockTestArea';
import ToeicMockTestArea from './ToeicMockTestArea';
import { loadMockTestResultsHistory, MockTestResultRecord } from '../services/userPersistence';

const hskExamsData: Record<string, { id: string, name: string, videoId: string }[]> = {
  HSK1: [
    { id: 'H10901', name: 'ข้อสอบ HSK1 ชุด H10901', videoId: '8_JRYnsB6qU' },
    { id: 'H10902', name: 'ข้อสอบ HSK1 ชุด H10902', videoId: 'tHHS1avF_yQ' },
    { id: 'H11003', name: 'ข้อสอบ HSK1 ชุด H11003', videoId: 'RYZhjRcb54g' },
    { id: 'H11004', name: 'ข้อสอบ HSK1 ชุด H11004', videoId: 'e07D-435glE' },
    { id: 'H11005', name: 'ข้อสอบ HSK1 ชุด H11005', videoId: 'y-jPjnNob9I' },
    { id: 'H11329', name: 'ข้อสอบ HSK1 ชุด H11329', videoId: 'RqhAgDClY6A' },
    { id: 'H11330', name: 'ข้อสอบ HSK1 ชุด H11330', videoId: 'vBne3H4ca4E' },
    { id: 'H11331', name: 'ข้อสอบ HSK1 ชุด H11331', videoId: 'Y6Z-yHzcqgQ' },
    { id: 'H11332', name: 'ข้อสอบ HSK1 ชุด H11332', videoId: 'fXmlHgKXkJ0' },
    { id: 'H11334', name: 'ข้อสอบ HSK1 ชุด H11334', videoId: 's02v2uE-4Bg' },
  ],
  HSK2: [
    { id: 'H20901', name: 'ข้อสอบ HSK2 ชุด H20901', videoId: 'lkdzZ9ZUmNA' },
    { id: 'H20902', name: 'ข้อสอบ HSK2 ชุด H20902', videoId: 'qQEoMpY6DYY' },
    { id: 'H21003', name: 'ข้อสอบ HSK2 ชุด H21003', videoId: 'OHqqCvpBhk0' },
    { id: 'H21004', name: 'ข้อสอบ HSK2 ชุด H21004', videoId: 'TvVQ4xBVtEo' },
    { id: 'H21005', name: 'ข้อสอบ HSK2 ชุด H21005', videoId: 'zNZWoHVT3fM' },
    { id: 'H21329', name: 'ข้อสอบ HSK2 ชุด H21329', videoId: 'L_CbpOvyu8A' },
    { id: 'H21330', name: 'ข้อสอบ HSK2 ชุด H21330', videoId: 'x-0ZdKh49_g' },
    { id: 'H21331', name: 'ข้อสอบ HSK2 ชุด H21331', videoId: 'BGTG-rfhOHE' },
    { id: 'H21332', name: 'ข้อสอบ HSK2 ชุด H21332', videoId: 'msmbWhifOIk' },
    { id: 'H21334', name: 'ข้อสอบ HSK2 ชุด H21334', videoId: 'zqBtukjwiec' },
  ],
  HSK3: [
    { id: 'H31001', name: 'ข้อสอบ HSK3 ชุด H31001', videoId: 'UlGwJaejn9E' },
    { id: 'H31002', name: 'ข้อสอบ HSK3 ชุด H31002', videoId: '_ZfnH5u5hfA' },
    { id: 'H31003', name: 'ข้อสอบ HSK3 ชุด H31003', videoId: 'jqXR7dnWUZw' },
    { id: 'H31004', name: 'ข้อสอบ HSK3 ชุด H31004', videoId: 'yaGqJMbHwKk' },
    { id: 'H31005', name: 'ข้อสอบ HSK3 ชุด H31005', videoId: 'RJjyosA2rWs' },
    { id: 'H31327', name: 'ข้อสอบ HSK3 ชุด H31327', videoId: 'qBsYyZjRqS0' },
    { id: 'H31328', name: 'ข้อสอบ HSK3 ชุด H31328', videoId: 'aM7cDmXHcUo' },
    { id: 'H31329', name: 'ข้อสอบ HSK3 ชุด H31329', videoId: '0CNCPDaTqLU' },
    { id: 'H31330', name: 'ข้อสอบ HSK3 ชุด H31330', videoId: 'iSQkOYaA7YI' },
    { id: 'H31332', name: 'ข้อสอบ HSK3 ชุด H31332', videoId: 'dqb6TtdEntc' },
  ],
  HSK4: [
    { id: 'H41001', name: 'ข้อสอบ HSK4 ชุด H41001', videoId: 'LraoOUis_dw' },
    { id: 'H41002', name: 'ข้อสอบ HSK4 ชุด H41002', videoId: '9_nm3L9pbBY' },
    { id: 'H41003', name: 'ข้อสอบ HSK4 ชุด H41003', videoId: 'K7FZZXTEqd0' },
    { id: 'H41004', name: 'ข้อสอบ HSK4 ชุด H41004', videoId: 'gIgIpJZfbig' },
    { id: 'H41005', name: 'ข้อสอบ HSK4 ชุด H41005', videoId: 'SkPYI6XEd0c' },
    { id: 'H41006', name: 'ข้อสอบ HSK4 ชุด H41006', videoId: 'zytXDibbFU0' },
    { id: 'H41007', name: 'ข้อสอบ HSK4 ชุด H41007', videoId: '4ztgMHzHl00' },
    { id: 'H41008', name: 'ข้อสอบ HSK4 ชุด H41008', videoId: 'rEmLSO7gz48' },
    { id: 'H41009', name: 'ข้อสอบ HSK4 ชุด H41009', videoId: 'Ys5b1SbscNI' },
    { id: 'H41218', name: 'ข้อสอบ HSK4 ชุด H41218', videoId: 'OfmXmLH4JT4' },
    { id: 'H41219', name: 'ข้อสอบ HSK4 ชุด H41219', videoId: 'P1tR1Tjn5Zo' },
    { id: 'H41220', name: 'ข้อสอบ HSK4 ชุด H41220', videoId: 'jU7Tvkm-bYY' },
    { id: 'H41221', name: 'ข้อสอบ HSK4 ชุด H41221', videoId: 'hExDaxcf2HY' },
    { id: 'H41327', name: 'ข้อสอบ HSK4 ชุด H41327', videoId: 'zgT1edrKNkA' },
    { id: 'H41328', name: 'ข้อสอบ HSK4 ชุด H41328', videoId: 'mAm91VlUkek' },
    { id: 'H41329', name: 'ข้อสอบ HSK4 ชุด H41329', videoId: '3jjhHHeWAS4' },
    { id: 'H41330', name: 'ข้อสอบ HSK4 ชุด H41330', videoId: '7IFs8aFM0eI' },
    { id: 'H41332', name: 'ข้อสอบ HSK4 ชุด H41332', videoId: 'TNEERk3t9W8' },
  ],
  HSK5: [
    { id: 'H51001', name: 'ข้อสอบ HSK5 ชุด H51001', videoId: '9h6ShKLMM7s' },
    { id: 'H51002', name: 'ข้อสอบ HSK5 ชุด H51002', videoId: 'KkcxtQSrKEQ' },
    { id: 'H51003', name: 'ข้อสอบ HSK5 ชุด H51003', videoId: 'QLQZF4Q5MVQ' },
    { id: 'H51004', name: 'ข้อสอบ HSK5 ชุด H51004', videoId: 'yucVuMZoOs8' },
    { id: 'H51005', name: 'ข้อสอบ HSK5 ชุด H51005', videoId: '8P4kGZMo-DI' },
    { id: 'H51327', name: 'ข้อสอบ HSK5 ชุด H51327', videoId: 'FCubat-sFKk' },
    { id: 'H51328', name: 'ข้อสอบ HSK5 ชุด H51328', videoId: 'u7PjdRrAMTU' },
    { id: 'H51329', name: 'ข้อสอบ HSK5 ชุด H51329', videoId: 'MHp3H4eg4NQ' },
    { id: 'H51330', name: 'ข้อสอบ HSK5 ชุด H51330', videoId: '5cU7XtfQ1iQ' },
    { id: 'H51332', name: 'ข้อสอบ HSK5 ชุด H51332', videoId: 'vY3kzNfuV3I' },
  ],
  HSK6: [
    { id: 'H61001', name: 'ข้อสอบ HSK6 ชุด H61001', videoId: 'qR3Ni3o7vMI' },
    { id: 'H61002', name: 'ข้อสอบ HSK6 ชุด H61002', videoId: '2i8aGAgE--g' },
    { id: 'H61003', name: 'ข้อสอบ HSK6 ชุด H61003', videoId: '8pAxx2N_VlA' },
    { id: 'H61004', name: 'ข้อสอบ HSK6 ชุด H61004', videoId: 'ShoZIr0QIVA' },
    { id: 'H61005', name: 'ข้อสอบ HSK6 ชุด H61005', videoId: 'fAn-0n0TrGo' },
    { id: 'H61327', name: 'ข้อสอบ HSK6 ชุด H61327', videoId: 'fjH9mqsu56c' },
    { id: 'H61328', name: 'ข้อสอบ HSK6 ชุด H61328', videoId: 'iRJujU8kHUs' },
    { id: 'H61329', name: 'ข้อสอบ HSK6 ชุด H61329', videoId: 'Oe_c1Sm8494' },
    { id: 'H61330', name: 'ข้อสอบ HSK6 ชุด H61330', videoId: 'HtzmOTOgcjo' },
    { id: 'H61332', name: 'ข้อสอบ HSK6 ชุด H61332', videoId: 'NyiUTcHp70E' },
  ],
};

export default function MockTestsTabArea({ activeLang, onAskAI }: { activeLang?: string; onAskAI?: (msg: any) => void }) {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedExamSet, setSelectedExamSet] = useState<string | null>(null);
  const [selectedSkill, setSelectedSkill] = useState<string | null>(null);
  const [history, setHistory] = useState<MockTestResultRecord[]>([]);
  const [showHistoryModal, setShowHistoryModal] = useState(false);

  const fetchHistory = async () => {
    const list = await loadMockTestResultsHistory();
    setHistory(list);
  };

  useEffect(() => {
    fetchHistory();
  }, [selectedExamSet, selectedSkill]);

  useEffect(() => {
    setSelectedCategory(null);
    setSelectedExamSet(null);
    setSelectedSkill(null);
  }, [activeLang]);


  // If testing
  
  // If EN language is selected, render EN Mock logic
  if (activeLang === 'EN') {
    if (!selectedCategory) {
      return (
        <div className="flex flex-col h-full w-full max-w-4xl mx-auto pb-10 mt-4">
          <div className="flex items-center justify-between gap-4 mb-8">
            <div>
              <h1 className="text-3xl font-black text-gray-800 tracking-tight flex items-center gap-3">
                <Clock className="text-indigo-600" size={32} />
                English Mock Tests (จำลองสอบจับเวลา)
              </h1>
              <p className="text-gray-500 font-medium">เลือกระบบจำลองสอบที่คุณต้องการ</p>
            </div>
            <button
              onClick={async () => {
                await fetchHistory();
                setShowHistoryModal(true);
              }}
              className="flex items-center gap-2 px-4 py-2.5 bg-indigo-50 border border-indigo-200 text-indigo-700 font-bold rounded-2xl shadow-xs hover:bg-indigo-100 transition-all text-xs sm:text-sm shrink-0"
            >
              <History size={18} /> ประวัติผลการสอบย้อนหลัง
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <button
              id="tutorial-mock-ielts-category"
              onClick={() => setSelectedCategory('IELTS')}
              className="group flex flex-col items-center justify-center p-8 bg-white border border-gray-100 rounded-3xl shadow-sm hover:shadow-xl hover:-translate-y-1 hover:border-indigo-500 transition-all duration-300"
            >
              <div className="text-5xl mb-4 group-hover:scale-110 transition-transform">🎓</div>
              <h3 className="text-2xl font-bold text-gray-800">IELTS Mock Tests</h3>
              <p className="text-sm text-gray-500 mt-2 text-center">จำลองสอบ IELTS ครบทั้ง 4 ทักษะ</p>
            </button>
            <button
              onClick={() => setSelectedCategory('TOEIC')}
              className="group flex flex-col items-center justify-center p-8 bg-white border border-gray-100 rounded-3xl shadow-sm hover:shadow-xl hover:-translate-y-1 hover:border-blue-500 transition-all duration-300"
            >
              <div className="text-5xl mb-4 group-hover:scale-110 transition-transform">🏢</div>
              <h3 className="text-2xl font-bold text-gray-800">TOEIC Mock Tests</h3>
              <p className="text-sm text-gray-500 mt-2 text-center">จำลองสอบ TOEIC (Listening & Reading) 200 ข้อ</p>
            </button>
          </div>

          {/* History Modal */}
          {showHistoryModal && (
            <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-md flex items-center justify-center p-4">
              <div className="bg-white rounded-3xl shadow-2xl max-w-3xl w-full max-h-[85vh] flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200">
                <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-indigo-50/50">
                  <div className="flex items-center gap-3">
                    <div className="p-3 bg-indigo-600 text-white rounded-2xl">
                      <Award size={24} />
                    </div>
                    <div>
                      <h3 className="text-xl font-extrabold text-slate-900">ประวัติผลการสอบและ AI Feedback</h3>
                      <p className="text-xs text-slate-500">เก็บบันทึกผลสอบย้อนหลัง แยกตามระดับ พาร์ท และทักษะอย่างละเอียด</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowHistoryModal(false)}
                    className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-full transition-all"
                  >
                    <X size={20} />
                  </button>
                </div>

                <div className="p-6 overflow-y-auto flex-1 divide-y divide-gray-100 space-y-4">
                  {history.length === 0 ? (
                    <div className="text-center py-12 text-gray-400">
                      <History size={48} className="mx-auto mb-3 opacity-40" />
                      <p className="font-bold text-gray-600">ยังไม่มีประวัติการสอบ</p>
                      <p className="text-xs text-gray-400 mt-1">เมื่อทำข้อสอบจำลองเสร็จ ผลสอบจะถูกเก็บบันทึกลงบัญชีทันที</p>
                    </div>
                  ) : (
                    history.map((rec) => (
                      <div key={rec.id} className="pt-4 first:pt-0 bg-slate-50/50 rounded-2xl p-4 border border-slate-100">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span className="px-2.5 py-1 bg-indigo-100 text-indigo-800 text-xs font-black rounded-lg uppercase">
                              {rec.level} - {rec.part}
                            </span>
                            <span className="text-xs text-gray-400 font-medium">
                              {new Date(rec.createdAt).toLocaleString('th-TH')}
                            </span>
                          </div>
                          <span className={`px-3 py-1 rounded-xl text-xs font-black flex items-center gap-1 ${rec.isPass ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                            {rec.isPass ? <CheckCircle size={14} /> : <XCircle size={14} />}
                            {rec.isPass ? 'ผ่าน' : 'ไม่ผ่าน'}
                          </span>
                        </div>

                        <div className="flex items-baseline gap-2 mb-3">
                          <span className="text-2xl font-black text-slate-900">{rec.score}</span>
                          <span className="text-xs text-slate-500 font-bold">/ {rec.maxScore} (คะแนนรวม / Band Score)</span>
                        </div>

                        {rec.aiFeedback && (
                          <div className="bg-white p-3.5 rounded-xl border border-indigo-100 text-xs text-slate-700 mb-2">
                            <span className="font-bold text-indigo-700 block mb-1">🤖 AI Feedback:</span>
                            <p className="whitespace-pre-wrap">{rec.aiFeedback}</p>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      );
    } else if (selectedCategory === 'IELTS') {
      if (!selectedSkill) {
        const ieltsSkills = [
          { id: 'full', name: 'IELTS Full Mock', icon: '📝' },
          { id: 'reading', name: 'Reading', icon: '📖' },
          { id: 'listening', name: 'Listening', icon: '🎧' },
          { id: 'writing', name: 'Writing', icon: '✍️' },
        ];
        return (
          <div className="flex flex-col h-full w-full max-w-4xl mx-auto pb-10 mt-4">
            <button onClick={() => setSelectedCategory(null)} className="flex items-center gap-2 text-indigo-600 font-medium hover:text-indigo-700 transition-colors mb-6 self-start">
              <ChevronLeft size={20} /> กลับไปเลือกประเภทข้อสอบ
            </button>
            <h2 className="text-2xl font-bold text-gray-900 mb-6">IELTS Mock Tests</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {ieltsSkills.map((skill) => (
                <button
                  key={skill.id}
                  id={skill.id === 'full' ? 'tutorial-mock-ielts-full' : undefined}
                  onClick={() => setSelectedSkill(skill.id)}
                  className="group flex flex-col items-center justify-center p-8 bg-white border border-gray-100 rounded-3xl shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300"
                >
                  <div className="text-4xl mb-4 group-hover:scale-110 transition-transform">{skill.icon}</div>
                  <h3 className="text-xl font-bold text-gray-800">{skill.name}</h3>
                  <p className="text-sm text-gray-500 mt-2 text-center">มีทั้งหมด 20 ชุด</p>
                </button>
              ))}
            </div>
          </div>
        );
      } else if (!selectedExamSet) {
        return (
          <div className="flex flex-col h-full w-full max-w-5xl mx-auto pb-10 mt-4">
            <button onClick={() => setSelectedSkill(null)} className="flex items-center gap-2 text-indigo-600 font-medium hover:text-indigo-700 transition-colors mb-6 self-start">
              <ChevronLeft size={20} /> กลับไปเลือกทักษะ
            </button>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">IELTS Mock Tests - {selectedSkill.toUpperCase()}</h2>
            <p className="text-gray-500 mb-8">ข้อสอบจำลองพร้อมจับเวลา (20 ชุด)</p>
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-8 gap-4">
              {Array.from({ length: 20 }).map((_, i) => (
                <button
                  key={i}
                  id={i === 0 ? 'tutorial-mock-exam-1' : undefined}
                  onClick={() => setSelectedExamSet(`IELTS_Mock_${i + 1}`)}
                  className="bg-white py-3 px-2 rounded-xl border border-gray-100 shadow-sm hover:border-indigo-400 hover:shadow-md transition-all flex flex-col items-center gap-2 group"
                >
                  <span className="font-bold text-gray-700 text-sm">Exam {i + 1}</span>
                </button>
              ))}
            </div>
          </div>
        );
      } else {
        let initialSkill: any = selectedSkill === 'full' ? undefined : selectedSkill;
        return <IeltsMockTestArea examId={selectedExamSet} initialSkill={initialSkill} onBack={() => setSelectedExamSet(null)} />;
      }
    } else if (selectedCategory === 'TOEIC') {
      if (!selectedSkill) {
        const toeicSkills = [
          { id: 'reading', name: 'Reading', icon: '📖' },
          { id: 'listening', name: 'Listening', icon: '🎧' }
        ];
        return (
          <div className="flex flex-col h-full w-full max-w-4xl mx-auto pb-10 mt-4">
            <button onClick={() => setSelectedCategory(null)} className="flex items-center gap-2 text-blue-600 font-medium hover:text-blue-700 transition-colors mb-6 self-start">
              <ChevronLeft size={20} /> กลับไปเลือกประเภทข้อสอบ
            </button>
            <h2 className="text-2xl font-bold text-gray-900 mb-6">TOEIC Mock Tests</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              {toeicSkills.map((skill) => (
                <button
                  key={skill.id}
                  onClick={() => setSelectedSkill(skill.id)}
                  className="group flex flex-col items-center justify-center p-8 bg-white border border-gray-100 rounded-3xl shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300"
                >
                  <div className="text-4xl mb-4 group-hover:scale-110 transition-transform">{skill.icon}</div>
                  <h3 className="text-xl font-bold text-gray-800">{skill.name}</h3>
                  <p className="text-sm text-gray-500 mt-2 text-center">มีทั้งหมด 20 ชุด</p>
                </button>
              ))}
            </div>
          </div>
        );
      } else if (!selectedExamSet) {
        return (
          <div className="flex flex-col h-full w-full max-w-5xl mx-auto pb-10 mt-4">
            <button onClick={() => setSelectedSkill(null)} className="flex items-center gap-2 text-blue-600 font-medium hover:text-blue-700 transition-colors mb-6 self-start">
              <ChevronLeft size={20} /> กลับไปเลือกทักษะ
            </button>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">TOEIC Mock Tests - {selectedSkill.toUpperCase()}</h2>
            <p className="text-gray-500 mb-8">ข้อสอบจำลอง TOEIC เสมือนจริง (20 ชุด)</p>
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-8 gap-4">
              {Array.from({ length: 20 }).map((_, i) => (
                <button
                  key={i}
                  onClick={() => setSelectedExamSet(`toeic_${selectedSkill}_${i + 1}`)}
                  className="bg-white py-3 px-2 rounded-xl border border-gray-100 shadow-sm hover:border-blue-400 hover:shadow-md transition-all flex flex-col items-center gap-2 group"
                >
                  <span className="font-bold text-gray-700 text-sm">Exam {i + 1}</span>
                </button>
              ))}
            </div>
          </div>
        );
      } else {
        return (
          <ToeicMockTestArea
            examId={selectedExamSet}
            mode="mock"
            onBack={() => setSelectedExamSet(null)}
          />
        );
      }
    }
  }

  if (selectedExamSet && selectedCategory) {
    const examData = hskExamsData[selectedCategory]?.find(e => e.id === selectedExamSet);
    return (
      <MockTestArea 
        level={selectedCategory} 
        examId={selectedExamSet} 
        videoId={examData?.videoId}
        onExit={() => setSelectedExamSet(null)} 
      />
    );
  }

  // View: Choose Level
  if (!selectedCategory) {
    return (
      <div className="flex flex-col gap-8 pb-10 w-full animate-fade-in max-w-4xl mx-auto mt-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-black text-gray-800 tracking-tight flex items-center gap-3">
              <Clock className="text-indigo-600" size={32} />
              จำลองสอบ HSK (Mock Test)
            </h1>
            <p className="text-gray-500 font-medium">ระบบจำลองการสอบเสมือนจริงแบบจับเวลา พร้อมให้ AI ตรวจให้คะแนน</p>
          </div>
          <button
            onClick={async () => {
              await fetchHistory();
              setShowHistoryModal(true);
            }}
            className="flex items-center gap-2 px-4 py-2.5 bg-indigo-50 border border-indigo-200 text-indigo-700 font-bold rounded-2xl shadow-xs hover:bg-indigo-100 transition-all text-xs sm:text-sm shrink-0"
          >
            <History size={18} /> ประวัติผลการสอบย้อนหลัง
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {Object.keys(hskExamsData).map((catId) => (
            <button
              key={catId}
              id={catId === 'HSK1' ? 'tutorial-cn-mock-hsk1' : undefined}
              onClick={() => setSelectedCategory(catId)}
              className="group flex flex-col items-center justify-center p-8 bg-white border border-gray-100 rounded-3xl shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300"
            >
              <div className="w-16 h-16 rounded-2xl bg-indigo-50 flex items-center justify-center text-indigo-600 mb-4 group-hover:scale-110 transition-transform">
                <FileText size={32} />
              </div>
              <h3 className="text-xl font-bold text-gray-800">จำลองสอบ {catId}</h3>
              <p className="text-sm text-gray-500 mt-2 text-center">มีทั้งหมด {hskExamsData[catId].length} ชุด</p>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // View: Choose specific exam set
  const examsList = hskExamsData[selectedCategory] || [];
  return (
    <div className="flex flex-col gap-6 pb-10 w-full animate-fade-in max-w-4xl mx-auto mt-4">
      <div className="flex items-center gap-4 bg-white p-4 rounded-2xl shadow-sm border border-gray-100">
        <button 
          onClick={() => setSelectedCategory(null)}
          className="w-10 h-10 flex items-center justify-center bg-gray-50 hover:bg-gray-100 rounded-full transition-colors text-gray-600"
        >
          <ChevronLeft size={20} />
        </button>
        <div>
          <h2 className="text-xl font-bold text-gray-800">เลือกระดับ {selectedCategory}</h2>
          <p className="text-sm text-gray-500">จำลองสอบ {selectedCategory} พร้อมจับเวลาจริง</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {examsList.map((exam) => (
          <button
            key={exam.id}
            id={exam.id === 'H10901' ? 'tutorial-cn-mock-h10901' : undefined}
            onClick={() => setSelectedExamSet(exam.id)}
            className="flex items-center gap-4 p-5 bg-white border border-gray-100 rounded-2xl shadow-sm hover:shadow-md hover:border-indigo-200 transition-all text-left group"
          >
            <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center font-bold shrink-0">
              <Clock size={20} />
            </div>
            <div className="flex-1">
              <h3 className="font-bold text-gray-800 group-hover:text-indigo-600 transition-colors line-clamp-1">
                {exam.name}
              </h3>
              <p className="text-xs text-gray-400 mt-1 uppercase font-medium">{exam.id}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
