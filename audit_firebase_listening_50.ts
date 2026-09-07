import { storage } from './src/firebase';
import { ref, listAll } from 'firebase/storage';

async function auditFirebaseListening() {
  console.log('--- AUDITING FIREBASE LISTENING LESSONS 1 to 50 ---');

  // Check Intermediate Lessons 1..50
  let interValid = 0;
  for (let i = 1; i <= 50; i++) {
    try {
      const res = await listAll(ref(storage, `Courseware_Images/listening/intermediate/Lesson${i}`));
      if (res.items && res.items.length > 0) {
        interValid++;
      } else {
        console.log(`Intermediate Lesson${i} has NO page images!`);
      }
    } catch (e) {
      console.log(`Error reading Intermediate Lesson${i}:`, e);
    }
  }

  // Check Advanced Lessons 1..50
  let advValid = 0;
  for (let i = 1; i <= 50; i++) {
    try {
      const res = await listAll(ref(storage, `Courseware_Images/listening/advanced/Lesson${i}`));
      if (res.items && res.items.length > 0) {
        advValid++;
      } else {
        console.log(`Advanced Lesson${i} has NO page images!`);
      }
    } catch (e) {
      console.log(`Error reading Advanced Lesson${i}:`, e);
    }
  }

  console.log(`\nSUMMARY:`);
  console.log(`Intermediate valid lessons in Firebase: ${interValid} / 50`);
  console.log(`Advanced valid lessons in Firebase: ${advValid} / 50`);
}

auditFirebaseListening();
