const fs = require('fs');
let code = fs.readFileSync('src/components/VocabArea.tsx', 'utf8');

// Add auth import if not present
if (!code.includes("import { auth } from '../firebase'")) {
  code = code.replace(
    "import { saveModuleBookmark, loadModuleBookmark, ModuleBookmark } from '../services/userPersistence';",
    "import { saveModuleBookmark, loadModuleBookmark, ModuleBookmark } from '../services/userPersistence';\nimport { auth } from '../firebase';\nimport { onAuthStateChanged } from 'firebase/auth';"
  );
}

const oldUseEffect = /useEffect\(\(\) => \{\n    loadModuleBookmark\('handwriting', activeLang\)\.then\(b => setBookmark\(b\)\);\n  \}, \[activeLang\]\);/;

const newUseEffect = `useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, () => {
      loadModuleBookmark('handwriting', activeLang).then(b => setBookmark(b));
    });
    return () => unsubscribe();
  }, [activeLang]);`;

code = code.replace(oldUseEffect, newUseEffect);

fs.writeFileSync('src/components/VocabArea.tsx', code);
