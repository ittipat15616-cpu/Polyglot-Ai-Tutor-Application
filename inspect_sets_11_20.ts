import manifest from './src/data/image_manifest.json';

console.log('--- INSPECTING SETS 11..20 READING PAGE FILENAMES IN MANIFEST ---');

for (let i = 11; i <= 20; i++) {
  const key = `Courseware_Images/IELTS_Mock_Tests/IELTS_Mock_Test_${i}/Reading_Full`;
  const pages = (manifest as any)[key] || [];
  console.log(`\nSet ${i} (${pages.length} files):`);
  console.log('First 5:', pages.slice(0, 5));
  console.log('Last 5:', pages.slice(-5));
}
