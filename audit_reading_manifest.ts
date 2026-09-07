import manifest from './src/data/image_manifest.json';

console.log('--- AUDITING READING MOCK TESTS 1..20 IN IMAGE MANIFEST ---');

for (let i = 1; i <= 20; i++) {
  const key = `Courseware_Images/IELTS_Mock_Tests/IELTS_Mock_Test_${i}/Reading_Full`;
  const pages = (manifest as any)[key] || [];
  console.log(`Reading Set ${i}: ${pages.length} total pages. Key: ${key}`);
}
