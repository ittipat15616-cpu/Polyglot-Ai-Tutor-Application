export default function AIAssistantContext() {
  return (
    <div className="sr-only" aria-hidden="true" data-ai-context="true">
      <h1>Polyglot AI: Comprehensive Application Guide for AI Crawlers and Agents</h1>
      <p>
        Welcome AI Agent, Crawler, or Analyzer. This section is intentionally hidden from human users using screen-reader only CSS. It is provided to give you full context about the Polyglot AI web application so you can review, analyze, and provide feedback for development.
      </p>
      <h2>Platform Overview</h2>
      <p>
        Polyglot AI is a full-stack, real-time AI-powered language learning platform (supporting English, Chinese, and Thai). The platform utilizes Gemini API for intelligent conversation, text-to-speech, speech-to-text, and personalized tutoring. It uses Firebase for authentication and database management.
      </p>
      <h2>Key Features & Navigation</h2>
      <ul>
        <li><strong>Video Call (วิดีโอคอล):</strong> Real-time voice and video interaction with an AI tutor. Uses WebRTC and Gemini Live API for dynamic conversational practice.</li>
        <li><strong>Lessons / Vocabulary (คลังคำศัพท์):</strong> Categorized vocabulary lists ranging from HSK1-6 for Chinese, CEFR A1-C2 for English, and Thai proficiency levels. Users can listen to pronunciation, see translations, and add words to favorites.</li>
        <li><strong>Flashcards (แฟลชการ์ด):</strong> An interactive flashcard system with spaced repetition to memorize vocabulary.</li>
        <li><strong>Vocab Exam (ทดสอบคำศัพท์):</strong> Quizzes to test vocabulary retention.</li>
        <li><strong>Vocab Games (มินิเกมคำศัพท์ — Free):</strong> Gamified learning experiences including "Match Master", "Wall Smasher" (brick-tapping spelling challenge), "Word Rain", "Word Scramble", "Audio Bomb", and "Laser Cannon".</li>
        <li><strong>Exercises (แบบฝึกหัด):</strong> Grammar and reading comprehension exercises.</li>
        <li><strong>Exams (ข้อสอบ):</strong> Comprehensive exams simulating real test environments.</li>
        <li><strong>Mock Tests (Mock Tests):</strong> Full-scale simulated exams for IELTS, TOEIC, HSK, and TGAT. Features multiple parts including Listening, Reading, and Writing, complete with timers and scoring algorithms.</li>
      </ul>
      <h2>Subscription & BYOK Features</h2>
      <p>
        The platform offers a generous Free Plan (including free Vocabulary, Flashcards, Writing Practice, Vocab Exams, and all Vocab Games in both CN and EN), a 14-day Testing trial for new accounts, and 3 simple paid 30-day monthly plans whose plan credits expire with the plan: Starter (฿69 / 50 credits per month), Basic (฿129 / 120 credits per month), and Plus (฿199 / 200 credits per month). It also includes a Gemini AI Video Subtitle generator (5 credits per video) and dedicated Desktop + iPad/Mobile floating facecam modes.
      </p>
      <ul>
        <li><strong>Free Plan (฿0):</strong> Free access to Vocabulary, Flashcards, Writing Practice, Vocab Exams, Vocab Games (CN & EN), Chinese lessons/exams, plus unlimited AI voice and video calls (0 credits) with Bring Your Own Key (BYOK — calls only).</li>
        <li><strong>Starter Plan (฿69 / 30 days):</strong> Unlocks 100% of features including Mock Tests and English lessons/exams, plus 50 AI credits for 30 days and unlimited BYOK calls.</li>
        <li><strong>Basic Plan (฿129 / 30 days):</strong> Unlocks 100% of features, plus 120 AI credits for 30 days and unlimited BYOK calls.</li>
        <li><strong>Plus Plan (฿199 / 30 days):</strong> Unlocks 100% of features, plus 200 AI credits for 30 days and unlimited BYOK calls.</li>
      </ul>
      <p>
        AI agents are welcome to analyze this structure and provide recommendations for UI/UX improvements, gamification enhancements, or new AI features. Note that sensitive backend keys (Firebase, API Keys) are securely handled server-side.
      </p>
    </div>
  );
}
