import fs from 'fs';
import path from 'path';

async function updateIeltsManifest() {
  const bucket = "polyglot-ai-tuto.firebasestorage.app";
  const prefix = "Courseware_Images/IELTS_Mock_Tests/";
  let url = `https://firebasestorage.googleapis.com/v0/b/${bucket}/o?prefix=${encodeURIComponent(prefix)}`;
  
  let allFiles = [];
  let page = 1;
  
  console.log("Fetching files from Firebase Storage...");
  while (url) {
    console.log(`Fetching page ${page}...`);
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Failed to fetch storage items: ${res.statusText}`);
    }
    const data = await res.json();
    if (data.items) {
      allFiles = allFiles.concat(data.items.map(item => item.name));
    }
    if (data.nextPageToken) {
      url = `https://firebasestorage.googleapis.com/v0/b/${bucket}/o?prefix=${encodeURIComponent(prefix)}&pageToken=${encodeURIComponent(data.nextPageToken)}`;
      page++;
    } else {
      url = null;
    }
  }

  console.log(`Total files retrieved: ${allFiles.length}`);

  // Group files by folder
  // E.g. "Courseware_Images/IELTS_Mock_Tests/IELTS_Mock_Test_1/Listening_Full/page1.jpg"
  // should belong to folder "Courseware_Images/IELTS_Mock_Tests/IELTS_Mock_Test_1/Listening_Full"
  // with filename "page1.jpg"
  const groups = {};
  for (const filePath of allFiles) {
    if (!filePath.endsWith('.jpg')) continue; // only index images
    const lastSlash = filePath.lastIndexOf('/');
    if (lastSlash === -1) continue;
    const folder = filePath.substring(0, lastSlash);
    const fileName = filePath.substring(lastSlash + 1);
    
    if (!groups[folder]) {
      groups[folder] = [];
    }
    groups[folder].push(fileName);
  }

  // Sort files naturally within each folder
  for (const folder in groups) {
    groups[folder].sort((a, b) => {
      const numA = parseInt(a.match(/page(\d+)/)?.[1] || '0', 10);
      const numB = parseInt(b.match(/page(\d+)/)?.[1] || '0', 10);
      return numA - numB;
    });
  }

  // Read existing image_manifest.json
  const manifestPath = path.resolve('src/data/image_manifest.json');
  let manifest = {};
  if (fs.existsSync(manifestPath)) {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  }

  // Merge IELTS groups into manifest
  let addedCount = 0;
  for (const folder in groups) {
    manifest[folder] = groups[folder];
    addedCount++;
  }

  // Write back to image_manifest.json
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
  console.log(`Successfully merged ${addedCount} IELTS folders into ${manifestPath}!`);
}

updateIeltsManifest().catch(err => {
  console.error("Error updating IELTS manifest:", err);
  process.exit(1);
});
