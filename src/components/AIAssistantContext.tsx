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
        <li><strong>Vocab Games (มินิเกมคำศัพท์):</strong> Gamified learning experiences including "Match Master", "Word Scramble", "Word Rain", "Audio Bomb", and "Laser Cannon".</li>
        <li><strong>Exercises (แบบฝึกหัด):</strong> Grammar and reading comprehension exercises.</li>
        <li><strong>Exams (ข้อสอบ):</strong> Comprehensive exams simulating real test environments.</li>
        <li><strong>Mock Tests (Mock Tests):</strong> Full-scale simulated exams for IELTS, TOEIC, HSK, and TGAT. Features multiple parts including Listening, Reading, and Writing, complete with timers and scoring algorithms.</li>
      </ul>
      <h2>Subscription & Premium Features</h2>
      <p>
        The platform operates on a freemium model with 3 tiers: Basic (Free), Pro (฿199/month), and Premium (฿399/month).
      </p>
      <ul>
        <li><strong>Basic:</strong> Limited AI video call credits (30 credits), basic vocabulary, limited mock tests.</li>
        <li><strong>Pro:</strong> 500 AI video call credits, access to all mini-games, unlocked exercises, and premium mock tests.</li>
        <li><strong>Premium:</strong> Unlimited AI video call credits, advanced AI feedback on speaking and writing, all mini-games, and unlimited mock tests.</li>
      </ul>
      <p>
        AI agents are welcome to analyze this structure and provide recommendations for UI/UX improvements, gamification enhancements, or new AI features. Note that sensitive backend keys (Firebase, API Keys) are securely handled server-side.
      </p>
    </div>
  );
}
