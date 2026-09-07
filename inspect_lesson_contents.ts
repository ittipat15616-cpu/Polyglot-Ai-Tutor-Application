import { storage } from './src/firebase';
import { ref, listAll } from 'firebase/storage';

async function inspectDetails() {
  console.log('--- INSPECTING INTERMEDIATE & ADVANCED LESSON IMAGES IN FIREBASE ---');

  // Check Intermediate Lesson 1
  try {
    const res1 = await listAll(ref(storage, 'Courseware_Images/listening/intermediate/Lesson1'));
    console.log('Intermediate Lesson1 files:', res1.items.map(i => i.name));
  } catch (e) {
    console.error('Error Lesson1:', e);
  }

  // Check Intermediate Lesson 49
  try {
    const res49 = await listAll(ref(storage, 'Courseware_Images/listening/intermediate/Lesson49'));
    console.log('Intermediate Lesson49 files:', res49.items.map(i => i.name));
  } catch (e) {
    console.error('Error Lesson49:', e);
  }

  // Check Advanced Lesson 1
  try {
    const resAdv1 = await listAll(ref(storage, 'Courseware_Images/listening/advanced/Lesson1'));
    console.log('Advanced Lesson1 files:', resAdv1.items.map(i => i.name));
  } catch (e) {
    console.error('Error Adv Lesson1:', e);
  }
}

inspectDetails();
