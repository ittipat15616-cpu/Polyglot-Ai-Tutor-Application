const fs = require('fs');
const acorn = require('acorn');
const ts = require('typescript');

const files = [
  'src/utils/curriculumHelper.ts',
  'src/components/LearningPlanModal.tsx',
  'src/components/VideoCallArea.tsx',
  'src/App.tsx'
];

files.forEach(f => {
  const code = fs.readFileSync(f, 'utf8');
  const result = ts.transpileModule(code, { compilerOptions: { jsx: ts.JsxEmit.React } });
  try {
    acorn.parse(result.outputText, { ecmaVersion: 2020, sourceType: 'module' });
    console.log(f, "is valid javascript");
  } catch (e) {
    console.log(f, "Syntax Error:", e.message);
  }
});
