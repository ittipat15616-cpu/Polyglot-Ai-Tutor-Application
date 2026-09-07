const fs = require('fs');
const path = require('path');

const gamesDir = path.join(__dirname, 'src', 'components', 'games');
const files = fs.readdirSync(gamesDir).filter(f => f.endsWith('.tsx'));

const newButtons = `<div className="flex gap-2 mt-4">
              <button
                onClick={startGame}
                className="flex-1 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold py-3 px-1 rounded-xl transition-all flex items-center justify-center gap-1.5 text-sm"
              >
                <RefreshCw size={16} /> ลองอีกครั้ง
              </button>
              <button
                onClick={onBack}
                className="flex-1 bg-slate-700 hover:bg-slate-600 text-white font-bold py-3 px-1 rounded-xl transition-all flex items-center justify-center gap-1.5 text-sm"
              >
                กลับเมนูเกม
              </button>
              {onNextStage && (
                <button
                  onClick={onNextStage}
                  className="flex-1 bg-emerald-500 hover:bg-emerald-400 text-white font-bold py-3 px-1 rounded-xl transition-all flex items-center justify-center gap-1.5 text-sm shadow-lg shadow-emerald-500/20"
                >
                  เล่นด่านถัดไป
                </button>
              )}
            </div>`;

for (const file of files) {
  const filePath = path.join(gamesDir, file);
  let content = fs.readFileSync(filePath, 'utf8');
  
  // replace <div className="flex gap-3"> ... </div> safely assuming no nested divs inside the button block
  const regex = /<div className="flex gap-3">(?:(?!<div)[\s\S])*?<\/div>/g;
  
  const matches = content.match(regex);
  if (matches) {
    console.log(`Matched ${matches.length} in ${file}`);
    content = content.replace(regex, newButtons);
    fs.writeFileSync(filePath, content);
  } else {
    console.log(`No match in ${file}`);
  }
}
