# PyMasters AI Learning Platform — Design Spec

## Vision
Transform PyMasters into a one-stop AI-powered Python training portal with visual explanations, interactive AI tutoring, real-time code execution, and personalized learning paths. Target audience: beginners through intermediate developers with adaptive difficulty.

## AI Engine Architecture

### Dual-Provider Model Routing
- **Claude Haiku**: Quick hints, quiz generation, simple Q&A, code formatting suggestions (~50 calls/user/hour cap)
- **Claude Sonnet**: Code review, complex debugging, project architecture guidance, personalized learning paths (~20 calls/user/hour cap)
- **HuggingFace**: Code embeddings for skill assessment, content similarity/recommendations, visual code explanations
- **Caching**: Common responses cached in MongoDB `ai_cache` collection (24h TTL for Q&A, 7d for generated exercises)

### API Keys
- `ANTHROPIC_API_KEY` — Claude API (new env var)
- `HUGGINGFACEHUB_API_TOKEN` — HuggingFace Inference API (existing)

## Pages & Features

### 1. Dashboard (Mission Control)
Replaces current basic module list.
- Personalized greeting with AI-generated daily learning tip
- XP counter, streak tracker, current rank badge
- "Next Mission" card — AI recommends what to learn next based on progress
- Module grid with progress bars, difficulty badges, estimated time
- Weekly activity heatmap (contribution-graph style)
- Quick-launch buttons: Continue lesson, Start challenge, Ask tutor

### 2. AI Tutor (Claude-Powered)
Replaces HuggingFace chat.
- Full conversational interface with Claude as "PyMaster" — a senior Python mentor
- Context-aware: knows user's skill level, current module, recent code
- Code sharing: user pastes code, Claude reviews with inline annotations
- Visual explanations: Claude generates Mermaid diagrams, ASCII art, step-by-step execution traces
- Conversation history persisted per user in MongoDB
- Model routing: Haiku for quick questions, auto-escalates to Sonnet for complex topics
- Suggested prompts: "Explain this error", "Review my code", "Quiz me on decorators"

### 3. Code Arena (Interactive Practice)
New page replacing legacy Practice.
- Split-pane: code editor (left) + output/AI feedback (right)
- Server-side Python execution in restricted subprocess
- AI feedback loop: after execution, Claude analyzes the code and suggests improvements
- Exercise types:
  - Fix the bug (broken code, find/fix)
  - Complete the function (skeleton + tests)
  - Refactor challenge (working code, make it better)
  - Free coding with AI assistance
- Difficulty adapts based on user performance
- HuggingFace embeddings to match exercises to skill gaps
- Test runner: user sees pass/fail for each test case with visual badges

### 4. Project Studio
Replaces Generative Studio.
- Claude guides users through building real Python projects step-by-step
- Project templates: Web scraper, REST API, Data pipeline, CLI tool, Discord bot
- Each project broken into milestones with AI-generated instructions
- Code workspace with execution for each milestone
- Claude reviews completed milestones before advancing
- Final project summary with AI-generated code review report

### 5. Learning Paths
Enhanced module browsing.
- Visual path map showing module dependencies (prerequisites → advanced)
- AI-generated module recommendations based on user goals
- Each module contains: lessons (markdown + visual), exercises, quizzes
- Lesson content: mix of curated seed data + Claude-generated supplementary content
- Visual explanations: diagrams for data structures, algorithms, design patterns
- Mini-quizzes after each lesson (Claude-generated, cached)

### 6. Progress Pulse (Analytics)
New analytics dashboard.
- Skill radar chart (6 axes: Syntax, Data Structures, OOP, Functions, Libraries, Problem Solving)
- Learning velocity graph (XP over time)
- Streak calendar
- AI-generated weekly summary: "You mastered list comprehensions, struggled with recursion — here's what to focus on"
- Achievement badges gallery
- Time spent per topic breakdown

### 7. Profile
Enhanced from current.
- Skill level display with radar chart
- Achievement badges
- Learning preferences (pace, difficulty preference, preferred topics)
- AI tutor personality settings (concise vs detailed, formal vs casual)
- API usage stats (for transparency)

## Design System (Cinematic Evolved)

### Colors (existing palette, refined)
- Background: `#020617` → `#0f172a` gradient
- Primary accent: `#38bdf8` (cyan)
- Secondary accent: `#c084fc` (purple)
- Success/XP: `#22c55e` (green)
- Warning: `#f59e0b` (amber)
- Text: `#f8fafc` (primary), `#94a3b8` (muted)

### Typography
- Headings: Orbitron (keep existing)
- Body: Inter (keep existing)
- Code: JetBrains Mono (upgrade from default monospace)

### Gamification Elements (borrowed from Hacker Terminal concept)
- XP points for completing lessons, exercises, projects
- Daily streaks with multiplier
- Ranks: Novice → Apprentice → Developer → Engineer → Master → Grandmaster
- Achievement badges for milestones

### Component Patterns
- Cards: glass-morphism with subtle borders, hover glow effects
- Progress bars: gradient cyan-to-purple with animation
- Code blocks: syntax-highlighted with JetBrains Mono
- AI response bubbles: distinct styling with brain emoji avatar
- Metric cards: animated counters on load

## Database Schema Changes

### Modified Collections
```
users += {
  xp: int,
  streak: int,
  last_active_date: date,
  rank: string,
  skill_levels: {syntax: float, data_structures: float, oop: float, functions: float, libraries: float, problem_solving: float},
  preferences: {pace: string, difficulty: string, tutor_style: string},
  achievements: [string]
}

progress += {
  time_spent_seconds: int,
  attempts: int,
  ai_feedback_history: [{timestamp, feedback}],
  score: float
}
```

### New Collections
```
exercises: {
  _id, module_id, type (fix_bug|complete_function|refactor|free),
  title, description, starter_code, solution_code, test_cases,
  difficulty, tags, ai_generated: bool, created_at
}

projects: {
  _id, user_id, template_id, title, description,
  milestones: [{title, instructions, user_code, ai_review, completed}],
  status, created_at, updated_at
}

achievements: {
  _id, key, title, description, icon, criteria,
  category (learning|streak|social|mastery)
}

ai_cache: {
  _id, cache_key (hash of prompt+model), response, model,
  created_at, ttl_seconds
}
```

## New Files Structure
```
pymasters_app/
  services/
    ai_router.py          — Model routing logic (Haiku vs Sonnet)
    claude_service.py      — Claude API wrapper
    hf_service.py          — HuggingFace service (refactored from existing)
    exercise_generator.py  — AI-generated exercises
    skill_assessor.py      — HF embeddings for skill analysis
    xp_service.py          — XP/streak/rank calculations
    code_executor.py       — Safe Python execution service
    cache_service.py       — AI response caching
  views/
    dashboard.py           — Rewritten mission control
    tutor.py               — Rewritten with Claude
    code_arena.py          — New interactive practice
    project_studio.py      — New project builder
    learning_paths.py      — New visual learning paths
    progress_pulse.py      — New analytics
    profile.py             — Enhanced profile
  components/
    header.py              — Updated navigation
    code_editor.py         — Code editor component
    skill_radar.py         — Radar chart component
    achievement_badge.py   — Badge display component
    xp_bar.py              — XP/streak/rank display
```

## Technical Constraints
- Streamlit framework (keep existing)
- MongoDB primary database with local JSON fallback
- Cloud Run deployment (us-central1)
- Cost-conscious: Haiku-first, Sonnet only when needed
- Rate limiting per user to control API costs
