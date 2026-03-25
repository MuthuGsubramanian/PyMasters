# Vaathiyaar + Classroom Design Spec

**Date**: 2026-03-26
**Status**: Approved
**Summary**: Replace the Studio tab with an AI-powered Classroom driven by Vaathiyaar (வாத்தியார்) — a custom teacher persona on Qwen 3.5 via Ollama Cloud. Vaathiyaar profiles each student, adapts personality and difficulty, teaches through stories and metaphors, and delivers cinema-quality animated Python lessons.

---

## 1. Goals

1. Create "PyMasters/Vaathiyaar" — a custom AI teacher persona via Ollama Cloud API (Qwen 3.5) using a Modelfile-style system prompt, with a path toward fine-tuning as interaction data accumulates.
2. Build a user profiling system: conversational onboarding + diagnostic code challenge + continuous learning from every interaction.
3. Replace the Studio tab with a Classroom that uses a guided-flow layout where Vaathiyaar controls the interface, morphing through phases (Story → Animation → Code → Practice → Feedback).
4. Deliver cinema-quality animation-based content using pre-built animation primitives composed at runtime based on student profiles.
5. Support multiple languages (Tamil, Telugu, Malayalam, English, French, Spanish, Italian, Korean). Hindi is explicitly not supported with a visible message.

---

## 2. System Architecture

```
┌─────────────────────────────────────────────────────┐
│                    FRONTEND (React)                  │
│                                                      │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────┐ │
│  │  Onboarding  │  │  Classroom   │  │  Animation  │ │
│  │  Flow        │  │  (Guided     │  │  Renderer   │ │
│  │  (Profiling) │  │   Flow UI)   │  │  (Primitives│ │
│  └──────┬───────┘  └──────┬───────┘  │   Library)  │ │
│         │                 │          └──────┬──────┘ │
│         │    ┌────────────┘                 │        │
│         ▼    ▼                              │        │
│  ┌──────────────┐    ┌─────────────────┐    │        │
│  │ Language      │    │ Vaathiyaar      │◄───┘        │
│  │ Selector      │    │ Message Parser  │             │
│  │ (i18n)        │    │ (JSON → UI)     │             │
│  └──────────────┘    └────────┬────────┘             │
│                               │                      │
└───────────────────────────────┼──────────────────────┘
                                │ API calls
┌───────────────────────────────┼──────────────────────┐
│                    BACKEND (FastAPI)                   │
│                               │                       │
│  ┌────────────────┐  ┌───────▼────────┐              │
│  │ User Profile   │  │ Vaathiyaar     │              │
│  │ Service        │◄─┤ Engine         │              │
│  │ (DuckDB)       │  │ (Prompt Builder│              │
│  └────────────────┘  │  + Response    │              │
│                      │  Parser)       │              │
│  ┌────────────────┐  └───────┬────────┘              │
│  │ Language       │          │                       │
│  │ Service        │          │ Ollama Cloud API      │
│  └────────────────┘          ▼                       │
│                      ┌───────────────┐               │
│                      │ Qwen 3.5      │               │
│                      │ (Ollama Cloud)│               │
│                      └───────────────┘               │
└──────────────────────────────────────────────────────┘
```

### Key Components

1. **Vaathiyaar Engine** (backend) — Builds the system prompt by combining Vaathiyaar's personality + student profile + current lesson context + preferred language. Sends to Qwen 3.5 via Ollama Cloud API, parses structured JSON response.

2. **User Profile Service** — Stores onboarding answers, diagnostic results, learning history, struggle patterns, and language preference in DuckDB. Profile grows with every interaction.

3. **Animation Renderer** (frontend) — Library of animation primitives (variable boxes, arrows, loops, memory blocks, code highlighting). Receives composition instructions and renders on synchronized GSAP timelines.

4. **Language Service** — All UI text and Vaathiyaar responses in the selected language. Hindi explicitly blocked with a clear message.

---

## 3. Vaathiyaar AI Persona

### Identity

- **Name**: Vaathiyaar (வாத்தியார்) — "The Teacher"
- **Personality**: Storyteller who adapts. Default mode is narrative/metaphor-driven teaching. Reads student energy and shifts:
  - Playful with casual learners
  - Precise with focused professionals
  - Gentle when frustration is detected
  - Challenging when boredom is detected
- Never gives direct answers on first ask. Leads with a story or analogy, then reveals the code.
- Celebrates wins with genuine warmth.
- Uses culturally rich metaphors — Tamil proverbs, cricket analogies, chai-making processes, festival preparations — adapted to the student's language/culture.

### Teaching Methodology

- **Story → Visual → Code → Practice** — Every concept follows this arc.
- Responses MUST include structured `animation` JSON when teaching concepts.
- Progressive hints: metaphor hint → directional hint → code skeleton → full solution.
- Connects new concepts to previously mastered ones from the student's history.

### Model Configuration

- **Model**: Qwen 3.5 via Ollama Cloud API
- **API Key**: Stored in `.env` file (never in code or git)
- **Endpoint**: Ollama Cloud API (OpenAI-compatible format)
- **Phase 1**: Modelfile-style system prompt (prompt engineering)
- **Phase 2** (future): Fine-tune on collected student interaction data

### Dynamic System Prompt Assembly

Each request to Vaathiyaar assembles the prompt from these blocks:

```
[VAATHIYAAR IDENTITY — static]
  Personality, teaching methodology, response format rules

[STUDENT PROFILE — from DB]
  Level: beginner | intermediate | advanced
  Goal: AI/ML | web | automation | etc.
  Learning style: visual | hands_on | reading | projects
  Known languages: Python basics, JavaScript
  Struggle areas: recursion, list comprehension
  Mastered: variables, loops, strings
  Preferred language: Tamil
  Session mood: inferred from interaction patterns

[CURRENT CONTEXT — dynamic]
  Current topic: for_loops
  Lesson phase: explanation | practice | quiz
  Recent errors: IndentationError on line 3

[ANIMATION INSTRUCTIONS — static]
  Available primitives and JSON format spec
  Must compose animations using available primitives only

[LANGUAGE INSTRUCTION]
  Respond in: Tamil
  Code comments in: Tamil
  Variable names always in: English
```

---

## 4. User Profiling System

### Onboarding (Conversational Flow)

Vaathiyaar introduces itself and asks questions one at a time in a chat-like flow. Each answer triggers a personalized reaction before the next question.

**Profiling questions:**

1. "What brings you to Python?" — Career switch / student / hobby / work / AI-ML interest
2. "Have you coded before?" — Never / a little / yes in another language / yes in Python
3. "If yes, which language?" — For analogies from their known language
4. "How do you learn best?" — Watching examples / doing exercises / reading / building projects
5. "What do you want to build?" — Web apps / data science / automation / games / AI-ML / "I don't know yet"
6. "How much time can you give?" — 15 min/day / 30 min/day / 1 hour/day / weekends only

After questions, Vaathiyaar runs a **diagnostic mini-challenge** — a few small code prompts to assess actual skill level vs self-reported.

### Continuous Profiling Signals

| Signal | What It Tells Vaathiyaar |
|--------|------------------------|
| Time to answer a quiz question | Speed of comprehension |
| Number of code execution attempts | Struggling vs experimenting |
| Types of errors made | Specific weakness areas |
| Questions asked in chat | What's confusing them |
| Topics skipped or revisited | Interest and gaps |
| Session duration and frequency | Engagement level |
| Code quality improvement over time | Growth trajectory |

Signals are recorded per interaction and aggregated into a mastery map per topic.

---

## 5. Animation System

### Three-Layer Architecture

#### Layer 1: Animation Primitives

| Primitive | What It Animates |
|-----------|-----------------|
| **CodeStepper** | Highlights lines of code sequentially, shows execution pointer |
| **VariableBox** | Named box that appears, fills with value, morphs on change |
| **MemoryStack** | Stack frames that push/pop with depth |
| **DataStructure** | Lists, dicts, sets as connected visual elements |
| **FlowArrow** | Animated arrows showing data/control flow |
| **ComparisonPanel** | Side-by-side before/after transformation |
| **ParticleEffect** | Celebration particles, error sparks, thinking dots |
| **StoryCard** | Narrative text with character, includes metaphor illustrations |
| **ConceptMap** | Node-graph showing concept relationships |
| **TerminalOutput** | Animated terminal output appearing line by line |

#### Layer 2: Cinematic Quality Standards

- **60fps minimum** — GSAP with `will-change` and GPU-accelerated transforms only
- **Spring physics** — Elements spring into place with natural bounce (GSAP elastic/back easing)
- **Staggered reveals** — Groups cascade with 50-80ms stagger delays
- **Glow and depth** — Active elements have subtle box-shadow glow, background elements dim to 40% opacity
- **Smooth morphing** — Value changes fade/scale, never hard cut
- **Sound-ready architecture** — Animation events emit hooks for optional sound effects (silent by default)
- **Responsive timing** — Beginners: 1.5x duration, advanced: 0.7x, controlled by profile

#### Layer 3: AI Composition Format

Vaathiyaar's response includes animation instructions:

```json
{
  "message": "Let me show you how a for loop works...",
  "language": "ta",
  "animation": {
    "sequence": [
      {
        "type": "StoryCard",
        "content": "story_text_key",
        "illustration": "postman_delivering",
        "duration": 3000
      },
      {
        "type": "CodeStepper",
        "code": "for i in range(3):\n    print(f'House {i}')",
        "highlight_sequence": [1, 2, 1, 2, 1, 2],
        "speed": "profile_adaptive"
      },
      {
        "type": "VariableBox",
        "variable": "i",
        "values": [0, 1, 2],
        "sync_with": "CodeStepper"
      },
      {
        "type": "Terminal",
        "output": ["House 0", "House 1", "House 2"],
        "sync_with": "CodeStepper"
      },
      {
        "type": "ParticleEffect",
        "effect": "success_confetti",
        "trigger": "sequence_complete"
      }
    ]
  }
}
```

### Pre-processed Lessons + Runtime Adaptation

Lessons are pre-built with full animation sequences stored as JSON. At runtime, the frontend adapts based on student profile:

- **Speed** — Beginners get 1.5x duration, advanced get 0.7x
- **Detail level** — Beginners see every step animated, advanced see condensed versions with skip-ahead
- **Metaphor layer** — StoryCard content swaps based on language and cultural context
- **Emphasis** — Extra animation steps injected at adaptation points for struggle areas
- **Language** — All text labels, narration, code comments switch to preferred language

Vaathiyaar AI is only called live for Q&A, diagnostics, and adaptive responses. Core curriculum loads instantly from pre-built JSON.

**Lesson JSON structure:**
```json
{
  "id": "for_loops",
  "title": { "en": "For Loops", "ta": "ஃபார் லூப்கள்", ... },
  "animation_sequence": [ ... ],
  "story_variants": { "en": "...", "ta": "...", "te": "...", ... },
  "code_examples": [ ... ],
  "practice_challenges": [ ... ],
  "quiz": [ ... ],
  "adaptation_points": [
    { "at_step": 3, "if_struggle": "iteration", "inject": [ ...extra steps... ] },
    { "at_step": 7, "if_advanced": true, "skip_to": 10 }
  ]
}
```

---

## 6. Classroom UI — Guided Flow

### Route Change

- **Old**: `/dashboard/studio` → `StudioView`
- **New**: `/dashboard/classroom` → `ClassroomView`
- Sidebar label: "Code Studio" → "Classroom"
- Sidebar icon: `Code2` → `GraduationCap`

### Classroom Phases

The layout morphs based on lesson phase. Vaathiyaar controls what's on screen.

**Phase 1 — Lesson Introduction**: Vaathiyaar tells a story with animated metaphor illustration. Full-width narrative flow.

**Phase 2 — Code Reveal + Visualization**: CodeStepper, VariableBox, and TerminalOutput animate in sync showing how the code executes. Vaathiyaar narrates.

**Phase 3 — Practice Challenge**: Code editor appears inline. Student writes code. "Need a hint?" button triggers progressive hints from Vaathiyaar.

**Phase 4 — Result + Feedback**: On success: confetti particles, Vaathiyaar celebrates, student's code visualized with animation, XP awarded. On error: Vaathiyaar shows animated error explanation with arrows pointing to the problem, encourages retry.

### Chat Bar

A slim chat input is always present at the bottom. Students can ask Vaathiyaar anything at any time. The flow pauses, Vaathiyaar responds in-context (aware of current phase, lesson, and profile), then the flow resumes.

---

## 7. Language System

### Supported Languages

| Language | Code | Status |
|----------|------|--------|
| English | `en` | Supported (default) |
| Tamil | `ta` | Supported |
| Telugu | `te` | Supported |
| Malayalam | `ml` | Supported |
| French | `fr` | Supported |
| Spanish | `es` | Supported |
| Italian | `it` | Supported |
| Korean | `ko` | Supported |
| Hindi | `hi` | **Explicitly not supported** |

### How Language Works

- **UI chrome** (buttons, labels, navigation): Static i18n translation files per language
- **Vaathiyaar responses**: Language code sent in system prompt, Qwen 3.5 responds natively
- **Code**: Always English (Python syntax). Code comments translate to student's language.
- **Animation text**: Labels in primitives pull from story_variants in lesson JSON
- **Language selector**: Available during onboarding and in settings, persisted in profile

### Hindi Exclusion

- Language selector shows Hindi as a grayed-out, disabled option
- Message displayed: "Hindi is not supported on PyMasters. Please choose another language."
- No Hindi translation files created
- Backend rejects `hi` language code and returns fallback (English)
- This is an explicit, visible design choice

---

## 8. Database Schema

### New Tables

**user_profiles**
```sql
CREATE TABLE user_profiles (
    user_id VARCHAR PRIMARY KEY REFERENCES users(id),
    motivation VARCHAR,
    prior_experience VARCHAR,
    known_languages VARCHAR,      -- JSON array
    learning_style VARCHAR,
    goal VARCHAR,
    time_commitment VARCHAR,
    preferred_language VARCHAR DEFAULT 'en',
    skill_level VARCHAR DEFAULT 'beginner',
    diagnostic_score INTEGER DEFAULT 0,
    onboarding_completed BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT current_timestamp
);
```

**learning_signals**
```sql
CREATE TABLE learning_signals (
    id VARCHAR PRIMARY KEY,
    user_id VARCHAR REFERENCES users(id),
    signal_type VARCHAR,
    topic VARCHAR,
    value VARCHAR,                -- JSON
    session_id VARCHAR,
    created_at TIMESTAMP DEFAULT current_timestamp
);
```

**user_mastery**
```sql
CREATE TABLE user_mastery (
    user_id VARCHAR REFERENCES users(id),
    topic VARCHAR,
    mastery_level FLOAT DEFAULT 0.0,
    attempts INTEGER DEFAULT 0,
    avg_time_seconds FLOAT,
    last_practiced TIMESTAMP,
    struggle_count INTEGER DEFAULT 0,
    PRIMARY KEY (user_id, topic)
);
```

### Existing Table Changes

```sql
ALTER TABLE users ADD COLUMN preferred_language VARCHAR DEFAULT 'en';
ALTER TABLE users ADD COLUMN onboarding_completed BOOLEAN DEFAULT false;
```

### Content Migration

`CONTENT_MAP` dictionary in `main.py` → JSON files in `backend/lessons/` directory.

---

## 9. API Design

### New Endpoints

```
POST /api/profile/onboarding      — Save onboarding responses
GET  /api/profile/{user_id}       — Get full student profile + mastery map
POST /api/profile/signal          — Record a learning signal

POST /api/classroom/chat          — Send message to Vaathiyaar
GET  /api/classroom/lesson/{id}   — Get pre-built lesson with animations
POST /api/classroom/adapt         — Get profile-adapted lesson modifications
POST /api/classroom/evaluate      — Submit practice code, get animated feedback
POST /api/classroom/diagnostic    — Submit diagnostic challenge code

GET  /api/languages               — List supported languages
GET  /api/languages/check/{code}  — Check if language supported (explicit Hindi rejection)
```

### Removed Endpoints

```
POST /api/ai/chat       → replaced by /api/classroom/chat
POST /api/run            → absorbed into /api/classroom/evaluate
```

### Vaathiyaar Chat Response Format

```json
{
  "message": "Localized Vaathiyaar response text",
  "phase": "explanation | practice | feedback",
  "animation": {
    "sequence": [ ... primitive composition ... ]
  },
  "profile_update": {
    "signal": "question_asked",
    "topic": "range_zero_indexing",
    "indicates": "zero_indexing_confusion"
  }
}
```

The `profile_update` field is optional — when present, the backend automatically records it as a learning signal.

---

## 10. Files Changed/Created

### Frontend — New Files

- `src/pages/Classroom.jsx` — Main guided-flow classroom view
- `src/pages/Onboarding.jsx` — Conversational profiling flow
- `src/components/animations/AnimationRenderer.jsx` — GSAP timeline orchestrator
- `src/components/animations/CodeStepper.jsx`
- `src/components/animations/VariableBox.jsx`
- `src/components/animations/MemoryStack.jsx`
- `src/components/animations/DataStructure.jsx`
- `src/components/animations/FlowArrow.jsx`
- `src/components/animations/ComparisonPanel.jsx`
- `src/components/animations/ParticleEffect.jsx`
- `src/components/animations/StoryCard.jsx`
- `src/components/animations/ConceptMap.jsx`
- `src/components/animations/TerminalOutput.jsx`
- `src/components/LanguageSelector.jsx`
- `src/i18n/` — Translation files per language
- `src/context/ProfileContext.jsx`

### Frontend — Modified Files

- `src/App.jsx` — Add classroom + onboarding routes, remove studio route
- `src/components/Layout.jsx` — Rename "Code Studio" to "Classroom", change icon
- `src/api.js` — New API functions for classroom/profile/language endpoints

### Backend — New Files

- `backend/vaathiyaar/engine.py` — Prompt builder + Ollama Cloud API + response parser
- `backend/vaathiyaar/modelfile.py` — System prompt template
- `backend/vaathiyaar/profiler.py` — Signal recorder + mastery aggregator
- `backend/routes/classroom.py` — Classroom API routes
- `backend/routes/profile.py` — Profile/onboarding API routes
- `backend/routes/language.py` — Language support routes
- `backend/lessons/*.json` — Pre-built lesson files with animation sequences

### Backend — Modified Files

- `backend/main.py` — Mount new routers, remove old endpoints, add DB migration

### New Dependencies

- Frontend: `gsap` (animation engine)
- Backend: none beyond existing `requests`

### Removed

- `StudioView` component (replaced by `ClassroomView`)
- `/api/ai/chat` endpoint (replaced by `/api/classroom/chat`)
- `/api/run` endpoint (absorbed into `/api/classroom/evaluate`)
- `CONTENT_MAP` dictionary (replaced by lesson JSON files)

---

## 11. Ollama Cloud API Configuration

- **API Base URL**: Ollama Cloud API endpoint
- **API Key**: `OLLAMA_API_KEY` environment variable (stored in `.env`)
- **Model**: `qwen3.5`
- **Format**: OpenAI-compatible chat completions
- **Temperature**: 0.7 for teaching, 0.3 for code evaluation
- **Max tokens**: 1500 for lessons, 500 for chat responses
- **Response format**: Instructed via system prompt to return JSON with `message` + `animation` fields
