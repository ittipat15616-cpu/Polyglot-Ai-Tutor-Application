import { storage } from './src/firebase';
import { ref, getDownloadURL } from 'firebase/storage';

async function checkLesson1Sample() {
  try {
    const urlInter1 = await getDownloadURL(ref(storage, 'Courseware_Images/listening/intermediate/Lesson1/page1.jpg'));
    console.log('Sample URL Intermediate Lesson 1 page1.jpg:\n', urlInter1);

    const urlAdv1 = await getDownloadURL(ref(storage, 'Courseware_Images/listening/advanced/Lesson1/page1.jpg'));
    console.log('\nSample URL Advanced Lesson 1 page1.jpg:\n', urlAdv1);
  } catch (e) {
    console.error('Error fetching sample URL:', e);
  }
}

checkLesson1Sample();
