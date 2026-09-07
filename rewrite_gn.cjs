const fs = require('fs');
let code = fs.readFileSync('src/components/GoodnotesMode.tsx', 'utf8');

// We want to rewrite GoodnotesMode to accept directLaunch,
// rewrite DeckList for the two buttons, and fix GoodnotesHanziWord's outline.
// The easiest way is to rewrite the whole file, since it's only about 500 lines long.
