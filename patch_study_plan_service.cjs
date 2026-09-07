const fs = require('fs');
let code = fs.readFileSync('src/services/studyPlanService.ts', 'utf8');

if (!code.includes('deleteStudyPlan')) {
    code = code.replace("import { doc, getDoc, setDoc } from 'firebase/firestore';", "import { doc, getDoc, setDoc, deleteDoc } from 'firebase/firestore';");
    code += `

export const deleteStudyPlan = async (lang: 'EN' | 'CN'): Promise<void> => {
  if (!auth.currentUser) return;
  try {
    const ref = doc(db, 'users', auth.currentUser.uid, 'studyPlans', lang);
    await deleteDoc(ref);
  } catch (e) {
    console.error(e);
  }
};
`;
    fs.writeFileSync('src/services/studyPlanService.ts', code);
}
