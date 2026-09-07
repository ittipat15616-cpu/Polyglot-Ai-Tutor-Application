import React, { useState } from 'react';
import { Sparkles, BookOpen, Clock, ChevronRight } from 'lucide-react';
import IeltsPracticeArea from './IeltsPracticeArea';
import IeltsMockTestArea from './IeltsMockTestArea';

export default function IeltsHubArea() {
  const [activeMode, setActiveMode] = useState<'hub' | 'practice' | 'mock'>('hub');
  const [selectedSet, setSelectedSet] = useState<number | null>(null);

  // Generate 20 mock tests
  const mockTests = Array.from({ length: 20 }, (_, i) => ({
    id: i + 1,
    name: `IELTS Mock Test Set ${i + 1}`,
    description: `Complete IELTS Academic test covering Reading, Listening, Writing, and Speaking.`
  }));

  if (activeMode === 'practice' && selectedSet) {
    return <IeltsPracticeArea examId={`IELTS_Mock_${selectedSet}`} skill="Full Mock Exams" onBack={() => setActiveMode('hub')} />;
  }

  if (activeMode === 'mock' && selectedSet) {
    return <IeltsMockTestArea examId={`IELTS_Mock_${selectedSet}`} onBack={() => setActiveMode('hub')} />;
  }

  return (
    <div className="flex flex-col h-full w-full max-w-7xl mx-auto pb-10">
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 mb-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-3 bg-indigo-100 text-indigo-600 rounded-xl">
            <Sparkles size={24} />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-gray-900">IELTS Hub</h2>
            <p className="text-gray-500">ศูนย์รวมการฝึกฝนและจำลองสอบ IELTS Academic</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <div className="bg-gradient-to-br from-indigo-500 to-purple-600 p-8 rounded-2xl shadow-md text-white relative overflow-hidden group">
          <div className="relative z-10">
            <BookOpen size={40} className="mb-4 text-indigo-100" />
            <h3 className="text-2xl font-bold mb-2">Practice Mode (ฝึกฝน)</h3>
            <p className="text-indigo-100 mb-6">โหมดสำหรับฝึกทำข้อสอบทีละส่วน สามารถดูเฉลยและคำอธิบายจุดอ่อนจุดแข็งได้ทันที</p>
            <div className="inline-flex items-center gap-2 bg-white/20 px-4 py-2 rounded-lg font-medium backdrop-blur-sm">
              เลือกชุดข้อสอบด้านล่าง <ChevronRight size={16} />
            </div>
          </div>
          <div className="absolute -bottom-10 -right-10 w-48 h-48 bg-white/10 rounded-full blur-2xl group-hover:bg-white/20 transition-all duration-500"></div>
        </div>

        <div className="bg-gradient-to-br from-rose-500 to-orange-500 p-8 rounded-2xl shadow-md text-white relative overflow-hidden group">
          <div className="relative z-10">
            <Clock size={40} className="mb-4 text-rose-100" />
            <h3 className="text-2xl font-bold mb-2">Mock Test Mode (จำลองสอบ)</h3>
            <p className="text-rose-100 mb-6">โหมดจำลองสนามสอบจริง พร้อมระบบ AI ประเมิน Band Score และให้ Feedback ทันทีที่สอบเสร็จ</p>
            <div className="inline-flex items-center gap-2 bg-white/20 px-4 py-2 rounded-lg font-medium backdrop-blur-sm">
              เลือกชุดข้อสอบด้านล่าง <ChevronRight size={16} />
            </div>
          </div>
          <div className="absolute -bottom-10 -right-10 w-48 h-48 bg-white/10 rounded-full blur-2xl group-hover:bg-white/20 transition-all duration-500"></div>
        </div>
      </div>

      <h3 className="text-xl font-bold text-gray-900 mb-4">เลือกชุดข้อสอบ (Select a Set)</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 overflow-y-auto pr-2 pb-10" style={{ maxHeight: '600px' }}>
        {mockTests.map(test => (
          <div key={test.id} className="bg-white border border-gray-200 rounded-xl p-5 hover:border-indigo-300 hover:shadow-md transition-all flex flex-col justify-between">
            <div>
              <div className="flex justify-between items-start mb-2">
                <h4 className="font-bold text-gray-900 text-lg">Set {test.id}</h4>
                <span className="text-xs font-medium bg-gray-100 text-gray-600 px-2 py-1 rounded-full">20 ชุด</span>
              </div>
              <p className="text-sm text-gray-500 mb-4 line-clamp-2">{test.description}</p>
            </div>
            
            <div className="flex gap-2 mt-auto">
              <button 
                onClick={() => { setSelectedSet(test.id); setActiveMode('practice'); }}
                className="flex-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 py-2 rounded-lg text-sm font-medium transition-colors flex justify-center items-center gap-1"
              >
                <BookOpen size={14} /> ฝึกฝน
              </button>
              <button 
                onClick={() => { setSelectedSet(test.id); setActiveMode('mock'); }}
                className="flex-1 bg-rose-50 hover:bg-rose-100 text-rose-700 py-2 rounded-lg text-sm font-medium transition-colors flex justify-center items-center gap-1"
              >
                <Clock size={14} /> จำลองสอบ
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
