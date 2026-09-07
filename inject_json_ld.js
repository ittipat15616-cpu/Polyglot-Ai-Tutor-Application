import fs from 'fs';
let content = fs.readFileSync('index.html', 'utf8');

const jsonLD = `
    <script type="application/ld+json">
    {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      "name": "Polyglot AI",
      "applicationCategory": "EducationalApplication",
      "operatingSystem": "Web",
      "description": "An AI-powered language learning platform offering real-time AI tutor video calls, mock tests, vocabulary games, flashcards, and comprehensive lessons in English, Chinese, and Thai.",
      "offers": {
        "@type": "Offer",
        "price": "0.00",
        "priceCurrency": "THB",
        "description": "Freemium model with Basic (Free), Pro (199 THB/month), and Premium (399 THB/month) tiers granting varying access to AI credits and mock tests."
      },
      "featureList": [
        "Real-time AI Video Call Tutor",
        "Vocabulary Database (HSK, CEFR)",
        "Spaced Repetition Flashcards",
        "Gamified Vocabulary Learning (Word Scramble, Match Master, Audio Bomb)",
        "Grammar & Reading Exercises",
        "Simulated Exams & Mock Tests (IELTS, TOEIC, HSK, TGAT)"
      ],
      "audience": {
        "@type": "Audience",
        "audienceType": "Language Learners"
      }
    }
    </script>
`;

content = content.replace('</head>', jsonLD + '</head>');
fs.writeFileSync('index.html', content);
