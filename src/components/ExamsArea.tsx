import React, { useState, useEffect } from 'react';
import { BookOpen, Headphones, PenTool, Mic, ChevronLeft, FileText, PlayCircle, Bot, ShieldAlert, Clock, Info, Download, ArrowRight, X, Bookmark, Play } from 'lucide-react';
import DocumentGallery from './DocumentGallery';
import mockExams from '../data/mock_exams.json';
import InteractiveExamViewer from './InteractiveExamViewer';
import IeltsPracticeArea from './IeltsPracticeArea';
import ToeicMockTestArea from './ToeicMockTestArea';
import { saveModuleBookmark, loadModuleBookmark, ModuleBookmark } from '../services/userPersistence';


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
  HSKK_Basic: [
    { id: 'H71001', name: 'ข้อสอบ HSKK ระดับต้น ชุด H71001', videoId: 'El1QYI_QhsA' },
    { id: 'H71002', name: 'ข้อสอบ HSKK ระดับต้น ชุด H71002', videoId: 'e_OER_nKHcA' },
    { id: 'H71003', name: 'ข้อสอบ HSKK ระดับต้น ชุด H71003', videoId: '4MCsBd35sGg' },
    { id: 'H71004', name: 'ข้อสอบ HSKK ระดับต้น ชุด H71004', videoId: 'WJoHM79KfQk' },
    { id: 'H71105', name: 'ข้อสอบ HSKK ระดับต้น ชุด H71105', videoId: 'SmCGFAr3fiw' },
    { id: 'H71106', name: 'ข้อสอบ HSKK ระดับต้น ชุด H71106', videoId: 'e6g1WGuyd4o' },
    { id: 'H71107', name: 'ข้อสอบ HSKK ระดับต้น ชุด H71107', videoId: 'H_4ZUcCQMmk' },
    { id: 'H71208', name: 'ข้อสอบ HSKK ระดับต้น ชุด H71208', videoId: '5V9tzwYaCIU' },
    { id: 'H71209', name: 'ข้อสอบ HSKK ระดับต้น ชุด H71209', videoId: '1kXp_xjtqfY' },
    { id: 'H71210', name: 'ข้อสอบ HSKK ระดับต้น ชุด H71210', videoId: '4B6bIiYf-4k' },
  ],
  HSKK_Intermediate: [
    { id: 'H81001', name: 'ข้อสอบ HSKK ระดับกลาง ชุด H81001', videoId: 'BqMr9RfoZOg' },
    { id: 'H81002', name: 'ข้อสอบ HSKK ระดับกลาง ชุด H81002', videoId: '6CEas7FQ85o' },
    { id: 'H81003', name: 'ข้อสอบ HSKK ระดับกลาง ชุด H81003', videoId: 'mEQ-yEf3bIE' },
    { id: 'H81004', name: 'ข้อสอบ HSKK ระดับกลาง ชุด H81004', videoId: 'msH4in1_6uY' },
    { id: 'H81105', name: 'ข้อสอบ HSKK ระดับกลาง ชุด H81105', videoId: 'ngRigWky6HY' },
    { id: 'H81107', name: 'ข้อสอบ HSKK ระดับกลาง ชุด H81107', videoId: 'TTt5JfKZfcM' },
    { id: 'H81208', name: 'ข้อสอบ HSKK ระดับกลาง ชุด H81208', videoId: 'JZU49jhArV8' },
    { id: 'H81209', name: 'ข้อสอบ HSKK ระดับกลาง ชุด H81209', videoId: '5B76U3y5QHc' },
    { id: 'H81210', name: 'ข้อสอบ HSKK ระดับกลาง ชุด H81210', videoId: 'OxRYPnFRsDg' },
    { id: 'H81311', name: 'ข้อสอบ HSKK ระดับกลาง ชุด H81311', videoId: '7sWteGrhYR0' },
  ],
  HSKK_Advanced: [
    { id: 'H91001', name: 'ข้อสอบ HSKK ระดับสูง ชุด H91001', videoId: '68yTAQAeSY8' },
    { id: 'H91003', name: 'ข้อสอบ HSKK ระดับสูง ชุด H91003', videoId: 'Rt3fPSN5L2g' },
    { id: 'H91105', name: 'ข้อสอบ HSKK ระดับสูง ชุด H91105', videoId: 'Duv9Qx6d9Q8' },
    { id: 'H91106', name: 'ข้อสอบ HSKK ระดับสูง ชุด H91106', videoId: 'YAbycGsqi2s' },
    { id: 'H91107', name: 'ข้อสอบ HSKK ระดับสูง ชุด H91107', videoId: 'W8bACIwEr2w' },
    { id: 'H91208', name: 'ข้อสอบ HSKK ระดับสูง ชุด H91208', videoId: 'iPCghjdc9HY' },
    { id: 'H91209', name: 'ข้อสอบ HSKK ระดับสูง ชุด H91209', videoId: 'ftL_0TyQKH0' },
    { id: 'H91210', name: 'ข้อสอบ HSKK ระดับสูง ชุด H91210', videoId: 'tE9fUTzo9WY' },
  ]
};

export default function ExamsArea({ activeLang, onAskAI }: { activeLang: 'EN' | 'CN' | 'TH', onAskAI?: (word: string) => void }) {
  const [selectedExamType, setSelectedExamType] = useState<'HSK' | 'HSKK' | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedSkill, setSelectedSkill] = useState<string | null>(null);
  const [selectedExamSet, setSelectedExamSet] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const [bookmark, setBookmark] = useState<ModuleBookmark | null>(null);

  useEffect(() => {
    setSelectedExamType(null);
    setSelectedCategory(null);
    setSelectedSkill(null);
    setSelectedExamSet(null);
    loadModuleBookmark('exams', activeLang).then(b => setBookmark(b));
  }, [activeLang]);

  useEffect(() => {
    if (!selectedExamType && !selectedCategory && !selectedSkill && !selectedExamSet) return;
    
    let shouldSave = false;
    let title = 'ข้อสอบล่าสุด';

    if (activeLang === 'CN') {
      if (selectedExamSet && selectedCategory) {
        title = `${selectedExamType || 'HSK'} > ${selectedCategory} > ชุดข้อสอบ ${selectedExamSet}`;
        shouldSave = true;
      }
    } else {
      if (selectedExamSet && selectedCategory) {
        title = `${selectedCategory} ${selectedSkill ? '> ' + selectedSkill : ''} > ชุดข้อสอบ ${selectedExamSet}`;
        shouldSave = true;
      }
    }

    if (!shouldSave) return;

    const dataState = { selectedExamType, selectedCategory, selectedSkill, selectedExamSet };
    saveModuleBookmark('exams', activeLang, title, dataState);
    setBookmark({
      module: 'exams',
      lang: activeLang,
      title,
      data: dataState,
      updatedAt: Date.now()
    });
  }, [selectedExamType, selectedCategory, selectedSkill, selectedExamSet, activeLang]);

  const restoreBookmark = () => {
    if (!bookmark || !bookmark.data) return;
    const d = bookmark.data;
    setSelectedExamType(d.selectedExamType || null);
    setSelectedCategory(d.selectedCategory || null);
    setSelectedSkill(d.selectedSkill || null);
    setSelectedExamSet(d.selectedExamSet || null);
  };


  if (activeLang === 'TH') {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[50vh]">
        <h2 className="text-2xl font-bold text-gray-800 mb-2">ตัวอย่างข้อสอบ</h2>
        <p className="text-gray-500">ฟีเจอร์นี้กำลังพัฒนาสำหรับภาษานี้</p>
      </div>
    );
  }

  // IELTS Options
  const ieltsSkills = [
    { id: 'full', name: 'Full Mock Exams', icon: <FileText size={24} className="text-red-500" /> },
    { id: 'listening', name: 'Listening', icon: <Headphones size={24} className="text-blue-500" /> },
    { id: 'reading', name: 'Reading', icon: <BookOpen size={24} className="text-emerald-500" /> },
    { id: 'writing', name: 'Writing', icon: <PenTool size={24} className="text-amber-500" /> },
    { id: 'speaking', name: 'Speaking', icon: <Mic size={24} className="text-purple-500" /> },
  ];

  // CEFR Options
  const cefrSkills = [
    { id: 'listening', name: 'Listening', icon: <Headphones size={24} className="text-blue-500" /> },
    { id: 'reading', name: 'Reading', icon: <BookOpen size={24} className="text-emerald-500" /> },
  ];

  const handleCategorySelect = (category: string) => {
    setSelectedCategory(category);
    setSelectedSkill(null);
    setSelectedExamSet(null);
  };

  const handleBack = () => {
    if (selectedExamSet) {
      setSelectedExamSet(null);
      return;
    }
    if (selectedSkill) {
      if (selectedCategory && selectedCategory.startsWith('HSK')) {
        setSelectedCategory(null);
        setSelectedSkill(null);
      } else {
        setSelectedSkill(null);
      }
      return;
    } 
    if (selectedCategory) {
      setSelectedCategory(null);
      return;
    }
    setSelectedExamType(null);
  };

  if (selectedExamSet && selectedCategory) {
    const interactiveExam = mockExams.find(e => e.id === selectedExamSet);
    if (interactiveExam) {
      return (
        <InteractiveExamViewer 
          exam={interactiveExam as any} 
          onBack={() => setSelectedExamSet(null)} 
          onAskAI={onAskAI} 
        />
      );
    }

    if (selectedCategory.startsWith('HSK')) {
      const examsList = hskExamsData[selectedCategory] || [];
      const examData = examsList.find(e => e.id === selectedExamSet);
      const folderName = selectedCategory.startsWith('HSKK') ? selectedCategory.toLowerCase() : selectedCategory.replace('HSK', 'H');
      const pdfUrl = `/hsk/${folderName}/${selectedExamSet}.pdf`;

      if (isFullscreen) {
        return (
          <div className="fixed inset-0 z-50 bg-gray-50 flex flex-col">
            {/* Floating Toolbar */}
            <div className="absolute top-4 right-4 z-[60] flex flex-col items-center gap-3">
              {onAskAI && (
                <button 
                  onClick={() => onAskAI?.(`ฉันกำลังทำข้อสอบ ${selectedCategory} ชุด ${selectedExamSet} ช่วยอธิบายโจทย์และสอนเพิ่มเติมหน่อได้ไหม?`)}
                  title="ถาม AI Tutor"
                  className="w-12 h-12 rounded-full shadow-lg flex items-center justify-center text-white transition-all hover:scale-110"
                  style={{ background: 'linear-gradient(135deg,#7c3aed,#5b21b6)', boxShadow: '0 4px 14px rgba(124,58,237,0.4)' }}
                >
                  <Bot size={22} />
                </button>
              )}
              
              <button 
                onClick={() => setIsFullscreen(false)} 
                title="ออกเต็มจอ"
                className="w-12 h-12 bg-white rounded-full shadow-lg flex items-center justify-center text-gray-500 hover:text-red-600 hover:bg-red-50 transition-colors border border-gray-200"
              >
                 <X size={24} />
              </button>
            </div>
            <div className="flex-1 rounded-xl overflow-hidden bg-gray-50 relative">
              <DocumentGallery type="hsk" folder={folderName} prefix={selectedExamSet} enableAnnotation={true} />
            </div>
          </div>
        );
      }

      return (
        <div className="flex flex-col h-full w-full max-w-4xl mx-auto relative pb-24">
          <button 
            onClick={handleBack}
            className="flex items-center gap-2 text-indigo-600 font-medium hover:text-indigo-700 transition-colors mb-6 self-start"
          >
            <ChevronLeft size={20} /> ย้อนกลับไปเลือกชุดข้อสอบ
          </button>

          <h2 className="text-2xl font-bold text-gray-900 mb-6">{selectedCategory} - {selectedExamSet}</h2>

          {/* Video Embed Section */}
          <div className="bg-white rounded-2xl shadow-sm border border-indigo-100 p-6 mb-6 flex flex-col items-center">
            <div className="flex items-center gap-2 mb-4 self-start">
              <PlayCircle size={24} className="text-rose-500" />
              <h3 className="text-xl font-semibold text-gray-800">พาร์ทฟัง (Listening)</h3>
            </div>
            
            {examData?.videoId ? (
              <div className="flex flex-col items-center w-full">
                <div id="tutorial-cn-exam-yt-player" className="w-full aspect-video rounded-xl overflow-hidden bg-gray-900 shadow-md max-w-3xl border border-indigo-200">
                  <iframe 
                    width="100%" 
                    height="100%" 
                    src={`https://www.youtube.com/embed/${examData.videoId}`} 
                    title="YouTube video player" 
                    frameBorder="0" 
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
                    allowFullScreen
                  ></iframe>
                </div>
                <a
                  id="tutorial-cn-exam-yt-link"
                  href={`https://www.youtube.com/watch?v=${examData.videoId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 flex items-center gap-2 px-4 py-2 bg-rose-50 text-rose-600 hover:bg-rose-100 rounded-xl font-bold text-sm transition-colors border border-rose-200"
                >
                  <PlayCircle size={18} /> เปิดดูใน YouTube (เพื่อฟังเสียงแบบไม่หยุดเล่นขณะดูเต็มจอ)
                </a>
              </div>
            ) : (
              <div className="w-full aspect-video rounded-xl bg-indigo-50/50 flex flex-col items-center justify-center border-2 border-dashed border-indigo-200 max-w-3xl">
                <PlayCircle size={48} className="text-indigo-300 mb-2" />
                <p className="text-indigo-600 font-medium">วิดีโอพาร์ทฟังจะแสดงตรงนี้</p>
                <p className="text-sm text-indigo-400 mt-1">(รอเพิ่มลิงก์ YouTube)</p>
              </div>
            )}
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 flex flex-col h-[700px]">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <FileText size={22} className="text-indigo-500" />
                <h3 className="text-xl font-semibold text-gray-800">เอกสารข้อสอบ</h3>
              </div>
              <div className="flex items-center gap-2">
                
                <button 
                  onClick={() => setIsFullscreen(true)}
                  className="flex items-center gap-2 text-sm bg-indigo-50 text-indigo-600 hover:bg-indigo-100 px-4 py-2 rounded-lg font-medium transition-colors"
                >
                  ดูแบบเต็มจอ
                </button>
              </div>
            </div>
            <div className="w-full h-full flex-1 overflow-hidden rounded-xl border border-gray-100">
              <DocumentGallery 
                type="hsk" 
                folder={folderName} 
                prefix={selectedExamSet} 
                enableAnnotation={true} 
              />
            </div>
          </div>

          {/* Floating Ask AI Button — fixed bottom right, always fully visible */}
          {onAskAI && (
            <button
              onClick={() => onAskAI?.(`ฉันกำลังทำข้อสอบ ${selectedCategory} ชุด ${selectedExamSet} ช่วยอธิบายโจทย์และสอนเพิ่มเติมได้ไหม?`)}
              className="fab-ai"
            >
              <Bot size={22} />
              <span className="hidden sm:inline">ถาม AI Tutor</span>
            </button>
          )}
        </div>
      );
    }
  }

  // View: HSK Exam Sets List
  if (selectedCategory && selectedCategory.startsWith('HSK') && selectedSkill) {
    const examsList = hskExamsData[selectedCategory] || [];
    
    if (examsList.length === 0) {
      return (
        <div className="flex flex-col h-full w-full max-w-4xl mx-auto">
          <button 
            onClick={handleBack}
            className="flex items-center gap-2 text-indigo-600 font-medium hover:text-indigo-700 transition-colors mb-6 self-start"
          >
            <ChevronLeft size={20} /> กลับไประดับ HSK
          </button>
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 flex flex-col items-center justify-center min-h-[400px]">
            <FileText size={48} className="text-rose-200 mb-4" />
            <h2 className="text-2xl font-bold text-gray-900 mb-2">ข้อสอบ {selectedCategory}</h2>
            <p className="text-gray-500 text-center max-w-md">
              ระบบยังไม่มีไฟล์ตัวอย่างข้อสอบสำหรับระดับนี้ กรุณาอัปเดตระบบในภายหลัง
            </p>
          </div>
        </div>
      );
    }

    return (
      <div className="flex flex-col h-full w-full max-w-4xl mx-auto">
        <button 
          onClick={handleBack}
          className="flex items-center gap-2 text-indigo-600 font-medium hover:text-indigo-700 transition-colors mb-6 self-start"
        >
          <ChevronLeft size={20} /> กลับไประดับ HSK
        </button>
        
        <h2 className="text-2xl font-bold text-gray-900 mb-2">ข้อสอบ {selectedCategory}</h2>
        <p className="text-gray-500 mb-8">เลือกชุดข้อสอบที่คุณต้องการฝึกทำ</p>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          {examsList.map((exam) => (
            <button
              key={exam.id}
              id={exam.id === 'H10901' ? 'tutorial-cn-exam-h10901' : undefined}
              onClick={() => setSelectedExamSet(exam.id)}
              className="bg-white border border-gray-200 rounded-2xl p-6 flex flex-col items-start gap-3 hover:border-rose-400 hover:shadow-md transition-all text-left group"
            >
              <div className="w-12 h-12 rounded-xl bg-rose-50 flex items-center justify-center text-rose-600 font-bold group-hover:scale-110 transition-transform shrink-0">
                <FileText size={24} />
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-900 mb-1">{exam.id}</h3>
                <p className="text-gray-500 text-sm">{exam.name}</p>
              </div>
            </button>
          ))}
          
          {/* Inject HSK Interactive Mock Exams */}
          {mockExams.filter(e => e.type === 'HSK' && selectedCategory === 'HSK4').map(exam => (
            <button
              key={exam.id}
              onClick={() => setSelectedExamSet(exam.id)}
              className="bg-white border border-gray-200 rounded-2xl p-6 flex flex-col items-start gap-3 hover:border-emerald-400 hover:shadow-md transition-all text-left group"
            >
              <div className="w-12 h-12 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600 font-bold group-hover:scale-110 transition-transform shrink-0">
                <Bot size={24} />
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-900 mb-1">{exam.title}</h3>
                <p className="text-emerald-500 text-sm font-medium">Interactive Reading Quiz</p>
              </div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // General Skill Selection for non-HSK categories
  if (selectedSkill && selectedCategory && selectedCategory !== 'TOEIC') {
    if (selectedCategory === 'IELTS') {
      if (!selectedExamSet) {
        return (
          <div className="flex flex-col h-full w-full max-w-5xl mx-auto pb-10">
            <button onClick={() => setSelectedSkill(null)} className="flex items-center gap-2 text-indigo-600 font-medium hover:text-indigo-700 transition-colors mb-6 self-start">
              <ChevronLeft size={20} /> ย้อนกลับไปเลือกทักษะ
            </button>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">IELTS Practice Tests - {selectedSkill.toUpperCase()}</h2>
            <p className="text-gray-500 mb-8">ข้อสอบฝึกทำ (20 ชุด)</p>
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-8 gap-4">
              {Array.from({ length: 20 }).map((_, i) => (
                <button
                  key={i}
                  id={i === 0 ? 'tutorial-exam-set-1' : undefined}
                  onClick={() => setSelectedExamSet(`IELTS_Mock_${i + 1}`)}
                  className="bg-white py-3 px-2 rounded-xl border border-gray-100 shadow-sm hover:border-indigo-400 hover:shadow-md transition-all flex flex-col items-center gap-2 group"
                >
                  <span className="font-bold text-gray-700 text-sm">Exam {i + 1}</span>
                </button>
              ))}
            </div>
          </div>
        )
      } else {
        // Find which initial skill to pass based on selectedSkill
        let initialSkill: any = undefined;
        if (selectedSkill === 'Reading') initialSkill = 'reading';
        if (selectedSkill === 'Listening') initialSkill = 'listening';
        if (selectedSkill === 'Writing') initialSkill = 'writing';
        if (selectedSkill === 'Speaking') initialSkill = 'speaking';
        
        return <IeltsPracticeArea examId={selectedExamSet} skill={selectedSkill || ''} onBack={() => setSelectedExamSet(null)} />;
      }
    }

    const availableExams = mockExams.filter(e => e.type === selectedCategory && e.skill.toLowerCase() === selectedSkill.toLowerCase());

    return (
      <div className="flex flex-col h-full w-full max-w-4xl mx-auto">
        <button 
          onClick={handleBack}
          className="flex items-center gap-2 text-indigo-600 font-medium hover:text-indigo-700 transition-colors mb-6 self-start"
        >
          <ChevronLeft size={20} /> ย้อนกลับ
        </button>
        
        {availableExams.length > 0 ? (
          <div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">ข้อสอบ {selectedCategory} - {selectedSkill}</h2>
            <p className="text-gray-500 mb-8">เลือกชุดข้อสอบที่คุณต้องการฝึกทำ (Interactive Mode)</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {availableExams.map(exam => (
                <button
                  key={exam.id}
                  onClick={() => setSelectedExamSet(exam.id)}
                  className="bg-white border border-gray-200 rounded-2xl p-6 flex flex-col items-start gap-3 hover:border-indigo-400 hover:shadow-md transition-all text-left group"
                >
                  <div className="w-12 h-12 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600 font-bold group-hover:scale-110 transition-transform shrink-0">
                    <FileText size={24} />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-gray-900 mb-1">{exam.title}</h3>
                    <p className="text-indigo-500 text-sm font-medium">ข้อสอบฝึกทำ (Interactive)</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 flex flex-col items-center justify-center min-h-[400px]">
            <FileText size={48} className="text-indigo-200 mb-4" />
            <h2 className="text-2xl font-bold text-gray-900 mb-2">{selectedCategory} - {selectedSkill} (ตัวอย่างข้อสอบ)</h2>
            <p className="text-gray-500 text-center max-w-md">
              (ส่วนรับรองการอัปโหลดไฟล์/วิดีโอตัวอย่างข้อสอบจะอยู่ตรงนี้)
            </p>
          </div>
        )}
      </div>
    );
  }

  if (selectedCategory && !selectedCategory.startsWith('HSK')) {
    if (selectedCategory === 'TOEIC') {
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
            <h2 className="text-2xl font-bold text-gray-900 mb-6">TOEIC Practice Tests</h2>
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
            <h2 className="text-2xl font-bold text-gray-900 mb-2">TOEIC Practice Tests - {selectedSkill.toUpperCase()}</h2>
            <p className="text-gray-500 mb-8">ข้อสอบฝึกทำ TOEIC (20 ชุด)</p>
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
        return <ToeicMockTestArea examId={selectedExamSet} mode="practice" onBack={() => setSelectedExamSet(null)} />;
      }
    }

    const skills = selectedCategory === 'IELTS' ? ieltsSkills : cefrSkills;
    return (
      <div className="flex flex-col h-full w-full max-w-4xl mx-auto">
         <button 
          onClick={handleBack}
          className="flex items-center gap-2 text-indigo-600 font-medium hover:text-indigo-700 transition-colors mb-6 self-start"
        >
          <ChevronLeft size={20} /> กลับไปเลือกหมวดหมู่
        </button>
        
        <h2 className="text-2xl font-bold text-gray-900 mb-6">เลือกทักษะข้อสอบ ({selectedCategory})</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {skills.map((skill) => (
            <button
              key={skill.id}
              id={skill.id === 'full' ? 'tutorial-exam-full-mock' : undefined}
              onClick={() => setSelectedSkill(skill.name)}
              className="bg-white border border-gray-200 rounded-2xl p-6 flex flex-col items-center justify-center gap-4 hover:border-indigo-300 hover:shadow-md transition-all group"
            >
              <div className="p-4 rounded-full bg-gray-50 group-hover:bg-indigo-50 transition-colors">
                {skill.icon}
              </div>
              <span className="text-lg font-semibold text-gray-800">{skill.name}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (activeLang === 'CN') {
    const hskLevels = [
      { id: 'HSK1', name: 'HSK 1', desc: 'การวัดระดับภาษาจีนระดับเริ่มต้น' },
      { id: 'HSK2', name: 'HSK 2', desc: 'การวัดระดับภาษาจีนระดับต้น' },
      { id: 'HSK3', name: 'HSK 3', desc: 'การวัดระดับภาษาจีนระดับกลางตอนต้น' },
      { id: 'HSK4', name: 'HSK 4', desc: 'การวัดระดับภาษาจีนระดับกลาง' },
      { id: 'HSK5', name: 'HSK 5', desc: 'การวัดระดับภาษาจีนระดับสูงตอนต้น' },
      { id: 'HSK6', name: 'HSK 6', desc: 'การวัดระดับภาษาจีนระดับสูง' },
    ];
    
    const hskkLevels = [
      { id: 'HSKK_Basic', name: 'HSKK Basic', desc: 'การทดสอบการพูดภาษาจีนระดับต้น' },
      { id: 'HSKK_Intermediate', name: 'HSKK Intermediate', desc: 'การทดสอบการพูดภาษาจีนระดับกลาง' },
      { id: 'HSKK_Advanced', name: 'HSKK Advanced', desc: 'การทดสอบการพูดภาษาจีนระดับสูง' },
    ];

    if (!selectedExamType) {
      return (
        <div className="flex flex-col h-full w-full max-w-4xl mx-auto">
          {/* Resume Exam Banner */}
          {bookmark && bookmark.data && (
            <div className="mb-6 bg-gradient-to-r from-rose-600 via-pink-700 to-amber-700 text-white p-4 sm:p-5 rounded-2xl shadow-lg flex flex-col sm:flex-row items-center justify-between gap-4 animate-in fade-in duration-300">
              <div className="flex items-center gap-3.5">
                <div className="w-11 h-11 bg-white/20 backdrop-blur-md rounded-xl flex items-center justify-center shrink-0">
                  <Bookmark className="text-amber-300" size={22} />
                </div>
                <div>
                  <span className="text-xs text-rose-200 font-bold uppercase tracking-wider">ฝึกทำข้อสอบชุดล่าสุดต่อ (ภาษาจีน)</span>
                  <h4 className="text-base sm:text-lg font-bold text-white leading-tight">
                    {bookmark.title}
                  </h4>
                </div>
              </div>
              <button
                onClick={restoreBookmark}
                className="w-full sm:w-auto bg-amber-400 hover:bg-amber-300 text-rose-950 font-bold px-5 py-2.5 rounded-xl shadow-md transition-all flex items-center justify-center gap-2 text-sm shrink-0 hover:scale-105"
              >
                <Play size={16} fill="currentColor" />
                <span>เข้าทำข้อสอบต่อ</span>
              </button>
            </div>
          )}

          <h2 className="text-2xl font-bold text-gray-900 mb-2">ตัวอย่างข้อสอบ (Chinese)</h2>
          <p className="text-gray-500 mb-8">เลือกประเภทข้อสอบภาษาจีนที่คุณต้องการทดสอบ</p>
  
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <button
              id="tutorial-cn-exam-hsk"
              onClick={() => setSelectedExamType('HSK')}
              className="bg-white border border-gray-200 rounded-3xl p-8 flex flex-col items-start gap-4 hover:border-rose-500 hover:shadow-lg transition-all text-left"
            >
              <div className="w-16 h-16 rounded-2xl bg-rose-50 flex items-center justify-center text-rose-600 font-bold text-xl mb-2">
                HSK
              </div>
              <div>
                <h3 className="text-2xl font-bold text-gray-900 mb-2">HSK (汉语水平考试)</h3>
                <p className="text-gray-600">การทดสอบความรู้ภาษาจีนสำหรับชาวต่างชาติ (การฟัง การอ่าน การเขียน)</p>
              </div>
              <div className="mt-4 flex items-center gap-2 text-rose-600 font-semibold uppercase tracking-wide text-sm">
                เข้าสู่ระบบจำลองสอบ <ArrowRight size={16} />
              </div>
            </button>
  
            <button
              onClick={() => setSelectedExamType('HSKK')}
              className="bg-white border border-gray-200 rounded-3xl p-8 flex flex-col items-start gap-4 hover:border-orange-500 hover:shadow-lg transition-all text-left"
            >
              <div className="w-16 h-16 rounded-2xl bg-orange-50 flex items-center justify-center text-orange-600 font-bold text-xl mb-2">
                HSKK
              </div>
              <div>
                <h3 className="text-2xl font-bold text-gray-900 mb-2">HSKK (汉语水平口语考试)</h3>
                <p className="text-gray-600">การทดสอบการพูดภาษาจีน (ทักษะการพูดโดยเฉพาะ)</p>
              </div>
              <div className="mt-4 flex items-center gap-2 text-orange-600 font-semibold uppercase tracking-wide text-sm">
                เข้าสู่ระบบจำลองสอบ <ArrowRight size={16} />
              </div>
            </button>
          </div>
        </div>
      );
    }

    const levelsToDisplay = selectedExamType === 'HSK' ? hskLevels : hskkLevels;

    return (
      <div className="flex flex-col h-full w-full max-w-4xl mx-auto pb-10">
        <button 
          onClick={handleBack}
          className="flex items-center gap-2 text-indigo-600 font-medium hover:text-indigo-700 transition-colors mb-6 self-start"
        >
          <ChevronLeft size={20} /> ย้อนกลับ
        </button>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">ตัวอย่างข้อสอบ {selectedExamType}</h2>
        <p className="text-gray-500 mb-8">เลือกระดับที่ต้องการทดสอบ</p>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {levelsToDisplay.map((level) => (
            <button
              key={level.id}
              id={level.id === 'HSK1' ? 'tutorial-cn-exam-hsk1' : undefined}
              onClick={() => { setSelectedCategory(level.id); setSelectedSkill('รวมทักษะ'); }}
              className={`bg-white border border-gray-200 rounded-3xl p-6 flex flex-col items-start gap-4 hover:shadow-lg transition-all text-left ${selectedExamType === 'HSK' ? 'hover:border-rose-500' : 'hover:border-orange-500'}`}
            >
              <div className={`h-14 px-5 rounded-2xl inline-flex items-center justify-center font-bold text-xl mb-2 whitespace-nowrap shrink-0 ${selectedExamType === 'HSK' ? 'bg-rose-50 text-rose-600' : 'bg-orange-50 text-orange-600'}`}>
                {level.name}
              </div>
              <div>
                <h3 className="text-xl font-bold text-gray-900 mb-1">{level.name} Practice Tests</h3>
                <p className="text-gray-600 text-sm">{level.desc}</p>
              </div>
              <div className={`mt-2 flex items-center gap-2 font-semibold uppercase tracking-wide text-sm ${selectedExamType === 'HSK' ? 'text-rose-600' : 'text-orange-600'}`}>
                ดูตัวอย่างข้อสอบ <ArrowRight size={16} />
              </div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full w-full max-w-4xl mx-auto">
      {/* Resume Exam Banner */}
      {bookmark && bookmark.data && (
        <div className="mb-6 bg-gradient-to-r from-indigo-600 via-indigo-700 to-purple-700 text-white p-4 sm:p-5 rounded-2xl shadow-lg flex flex-col sm:flex-row items-center justify-between gap-4 animate-in fade-in duration-300">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 bg-white/20 backdrop-blur-md rounded-xl flex items-center justify-center shrink-0">
              <Bookmark className="text-amber-300" size={22} />
            </div>
            <div>
              <span className="text-xs text-indigo-200 font-bold uppercase tracking-wider">ฝึกทำข้อสอบชุดล่าสุดต่อ (ภาษาอังกฤษ)</span>
              <h4 className="text-base sm:text-lg font-bold text-white leading-tight">
                {bookmark.title}
              </h4>
            </div>
          </div>
          <button
            onClick={restoreBookmark}
            className="w-full sm:w-auto bg-amber-400 hover:bg-amber-300 text-indigo-950 font-bold px-5 py-2.5 rounded-xl shadow-md transition-all flex items-center justify-center gap-2 text-sm shrink-0 hover:scale-105"
          >
            <Play size={16} fill="currentColor" />
            <span>เข้าทำข้อสอบต่อ</span>
          </button>
        </div>
      )}

      <h2 className="text-2xl font-bold text-gray-900 mb-2">ตัวอย่างข้อสอบ (English)</h2>
      <p className="text-gray-500 mb-8">เลือกระบบการประเมินที่คุณต้องการทดสอบ</p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <button
          id="tutorial-exam-ielts-card"
          onClick={() => handleCategorySelect('IELTS')}
          className="bg-white border border-gray-200 rounded-3xl p-8 flex flex-col items-start gap-4 hover:border-indigo-500 hover:shadow-lg transition-all text-left"
        >
          <div className="w-16 h-16 rounded-2xl bg-indigo-50 flex items-center justify-center text-indigo-600 font-bold text-xl mb-2">
            IELTS
          </div>
          <div>
            <h3 className="text-2xl font-bold text-gray-900 mb-2">IELTS Practice Tests</h3>
            <p className="text-gray-600">ตัวอย่างข้อสอบ IELTS ครบทั้ง 4 ทักษะ: Listening, Reading, Writing, และ Speaking</p>
          </div>
          <div className="mt-4 flex items-center gap-2 text-indigo-600 font-semibold uppercase tracking-wide text-sm">
            ดูตัวอย่างข้อสอบ <ArrowRight size={16} />
          </div>
        </button>

        <button
          onClick={() => handleCategorySelect('TOEIC')}
          className="bg-white border border-gray-200 rounded-3xl p-8 flex flex-col items-start gap-4 hover:border-blue-500 hover:shadow-lg transition-all text-left"
        >
          <div className="w-16 h-16 rounded-2xl bg-blue-50 flex items-center justify-center text-blue-600 font-bold text-xl mb-2">
            TOEIC
          </div>
          <div>
            <h3 className="text-2xl font-bold text-gray-900 mb-2">TOEIC Practice Tests</h3>
            <p className="text-gray-600">ข้อสอบจำลอง TOEIC เสมือนจริง ครบทั้ง Listening และ Reading 200 ข้อ</p>
          </div>
          <div className="mt-4 flex items-center gap-2 text-blue-600 font-semibold uppercase tracking-wide text-sm">
            ดูตัวอย่างข้อสอบ <ArrowRight size={16} />
          </div>
        </button>
      </div>
    </div>
  );
}
