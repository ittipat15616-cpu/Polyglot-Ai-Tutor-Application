import { storage } from './src/firebase';
import { ref, listAll } from 'firebase/storage';

async function checkFirebase() {
  console.log('--- CHECKING FIREBASE STORAGE FOR LISTENING COURSEWARE ---');

  // Check Intermediate
  try {
    const interRef = ref(storage, 'Courseware_Images/listening/intermediate');
    const interRes = await listAll(interRef);
    console.log('Firebase Intermediate Folders count:', interRes.prefixes.length);
    console.log('Firebase Intermediate Prefix names (sample 10):', interRes.prefixes.slice(0, 10).map(p => p.name));
    console.log('Firebase Intermediate Last 5 Prefix names:', interRes.prefixes.slice(-5).map(p => p.name));
  } catch (e) {
    console.error('Error listing Firebase Intermediate:', e);
  }

  // Check Advanced
  try {
    const advRef = ref(storage, 'Courseware_Images/listening/advanced');
    const advRes = await listAll(advRef);
    console.log('\nFirebase Advanced Folders count:', advRes.prefixes.length);
    console.log('Firebase Advanced Prefix names (sample 10):', advRes.prefixes.slice(0, 10).map(p => p.name));
    console.log('Firebase Advanced Files in Advanced root:', advRes.items.map(i => i.name));
  } catch (e) {
    console.error('Error listing Firebase Advanced:', e);
  }
}

checkFirebase();
