const fs = require('fs');
let code = fs.readFileSync('src/components/LearningPlanModal.tsx', 'utf8');

const stateVarString = `const [progressView, setProgressView] = useState<'DAILY' | 'WEEKLY' | 'MONTHLY' | 'OVERALL'>('DAILY');`;
const newStateVarString = stateVarString + `\n  const [showVocabChoice, setShowVocabChoice] = useState(false);`;

code = code.replace(stateVarString, newStateVarString);

const oldVocabGo = `              onGo={() => {
    if (window.confirm("คุณต้องการเปิดหน้า 'คลังคำศัพท์' (กด OK) หรือ 'แฟลชการ์ด' (กด Cancel) ?")) {
      onNavigate('vocab');
    } else {
      onNavigate('flashcards');
    }
  }}`;

const newVocabGo = `              onGo={() => setShowVocabChoice(true)}`;

code = code.replace(oldVocabGo, newVocabGo);

const vocabChoiceModal = `
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
`;

const rightColumn = `{/* Right Column (Mobile: Bottom Fixed): Progress Viewer */}`;
code = code.replace(rightColumn, vocabChoiceModal + '\n      ' + rightColumn);

// Make sure Library icon is imported
if (!code.includes('Library,')) {
    code = code.replace("import { X,", "import { X, Library,");
}

fs.writeFileSync('src/components/LearningPlanModal.tsx', code);
