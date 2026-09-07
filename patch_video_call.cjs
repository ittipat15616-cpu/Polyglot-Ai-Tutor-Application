const fs = require('fs');
let code = fs.readFileSync('src/components/VideoCallArea.tsx', 'utf8');

// Add isSeriousMode state
const stateInsert = `  const [isCalling, setIsCalling] = useState(false);
  const [isSeriousMode, setIsSeriousMode] = useState(false);`;
code = code.replace(`  const [isCalling, setIsCalling] = useState(false);`, stateInsert);

// Add to params
const paramsInsert = `        if (includeAskWord) params.set('askWord', askWord);
        if (isSeriousMode) params.set('seriousMode', 'true');`;
code = code.replace(`        if (includeAskWord) params.set('askWord', askWord);`, paramsInsert);

// Add button in UI
const uiInsert = `      {/* Left: User & AI Camera Column */}
      <div className={\`w-full md:w-1/3 flex flex-col gap-4 \${isPdfFullscreen ? 'static' : ''}\`}>
        <div className="flex justify-between items-center bg-white p-2 rounded-2xl shadow-sm border border-gray-100">
          <span className="text-sm font-bold text-gray-700 ml-2">โหมดฝึกพูดจริงจัง</span>
          <button 
            onClick={() => {
              if (isCalling) {
                alert("กรุณาวางสายก่อนเพื่อเปลี่ยนโหมด");
                return;
              }
              setIsSeriousMode(!isSeriousMode);
            }}
            className={\`w-12 h-6 rounded-full transition-colors relative \${isSeriousMode ? 'bg-indigo-600' : 'bg-gray-300'}\`}
          >
            <div className={\`w-4 h-4 bg-white rounded-full absolute top-1 transition-transform \${isSeriousMode ? 'left-7' : 'left-1'}\`}></div>
          </button>
        </div>`;
code = code.replace(`      {/* Left: User & AI Camera Column */}
      <div className={\`w-full md:w-1/3 flex flex-col gap-4 \${isPdfFullscreen ? 'static' : ''}\`}>`, uiInsert);

fs.writeFileSync('src/components/VideoCallArea.tsx', code);
