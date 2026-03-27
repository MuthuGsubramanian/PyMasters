# PyMasters Classroom Content Expansion — Design Spec

**Date:** 2026-03-27
**Status:** Approved
**Scope:** End-to-end content expansion, knowledge graph, AI-adaptive learning paths, smart notifications

---

## 1. Overview

Expand PyMasters from 80 lessons across 4 tracks to 222 lessons across 11 tracks, with a knowledge graph of ~300 concepts, 15 pre-defined learning paths with AI-adaptive sequencing, smart custom content insertion, and triple-channel notification when new content is ready.

### Goals

1. Fill all major content gaps identified from RealPython's topic universe (~200+ tutorials, 35+ learning paths)
2. Every lesson has cinema-quality animations (5-10 primitives each) — this is PyMasters' USP
3. Personalized learning paths that adapt in real-time based on user behavior
4. Knowledge graph powering gap detection, recommendations, and visual mastery maps
5. Seamless custom content generation → insertion → notification pipeline

### Non-Goals

- No video content (animations only)
- No external LMS integrations
- No payment/subscription system
- No mobile app (web-responsive only)

---

## 2. Content Plan

### 2.1 New Lesson Tracks (142 new lessons)

| Track | Directory | Lessons | Difficulty | Description |
|-------|-----------|---------|------------|-------------|
| python_intermediate | `backend/lessons/python_intermediate/` | 25 | intermediate-advanced | OOP, decorators, generators, async, stdlib deep dives |
| web_development | `backend/lessons/web_development/` | 20 | beginner-intermediate | HTTP, Flask, Django, FastAPI, HTML/CSS, deployment |
| dsa | `backend/lessons/dsa/` | 20 | intermediate-advanced | Big O, linked lists, trees, graphs, sorting, DP, interview patterns |
| ai_fundamentals | `backend/lessons/ai_fundamentals/` | 18 | beginner-intermediate | Prompt engineering, LLM concepts, RAG, embeddings, agents, AI coding |
| machine_learning | `backend/lessons/machine_learning/` | 22 | intermediate-advanced | Full ML pipeline: numpy, pandas, sklearn, evaluation, deployment |
| deep_learning_complete | `backend/lessons/deep_learning_complete/` | 25 | intermediate-advanced | Perceptrons → CNNs → RNNs → Transformers → GANs → deployment |
| testing_devops | `backend/lessons/testing_devops/` | 12 | intermediate | pytest, TDD, CI/CD, Docker, packaging, git workflows |

### 2.2 Existing Tracks (80 lessons — retrofit with tags)

| Track | Lessons | Action |
|-------|---------|--------|
| python_fundamentals | 36 | Add `tags` field to JSON + insert `lesson_concepts` rows |
| ai_ml_foundations | 18 | Add `tags` field to JSON + insert `lesson_concepts` rows |
| deep_learning | 20 | Add `tags` field to JSON + insert `lesson_concepts` rows |
| fun_automation | 6 | Add `tags` field to JSON + insert `lesson_concepts` rows |

### 2.3 Complete Lesson Listing

#### python_intermediate/ (25 lessons)

```
oop_classes_basics.json          — Classes, __init__, self, attributes
oop_inheritance.json             — Single/multiple inheritance, super()
oop_composition.json             — Has-a vs Is-a, when to compose
oop_magic_methods.json           — __str__, __repr__, __len__, __eq__
oop_design_patterns.json         — Singleton, Factory, Observer, Strategy
decorators_basics.json           — Function decorators, @syntax, wraps
decorators_advanced.json         — Class decorators, parameterized decorators
generators_yield.json            — yield, generator expressions, lazy evaluation
context_managers.json            — with statement, __enter__/__exit__, contextlib
comprehensions_advanced.json     — Dict/set comprehensions, nested, conditional
regex_basics.json                — re module, patterns, match/search/findall
regex_advanced.json              — Groups, lookahead, substitution
datetime_time.json               — datetime, timedelta, formatting, timezones
pathlib_files.json               — Path, glob, file operations
collections_module.json          — Counter, defaultdict, namedtuple, deque
itertools_module.json            — chain, product, combinations, permutations
json_csv_data.json               — json.loads/dumps, csv reader/writer
type_hints.json                  — Basic annotations, Optional, Union, typing module
dataclasses.json                 — @dataclass, field(), frozen, post_init
async_await_basics.json          — asyncio, coroutines, event loop
async_advanced.json              — gather, tasks, aiohttp, async generators
threading_basics.json            — Thread, Lock, GIL explanation
multiprocessing.json             — Process, Pool, shared memory
error_handling_advanced.json     — Custom exceptions, exception chaining, traceback
closures_scope.json              — Closures, nonlocal, LEGB rule
```

#### web_development/ (20 lessons)

```
http_fundamentals.json           — HTTP methods, status codes, headers, request/response
rest_api_concepts.json           — REST principles, endpoints, CRUD, JSON
flask_basics.json                — Routes, templates, request handling
flask_forms_db.json              — WTForms, SQLAlchemy, user input
flask_authentication.json        — Login, sessions, Flask-Login
django_intro.json                — Project structure, settings, manage.py
django_models.json               — Models, migrations, ORM queries
django_views_templates.json      — Views, URL routing, Jinja templates
django_forms_auth.json           — Forms, user registration, authentication
django_rest_framework.json       — Serializers, ViewSets, API endpoints
fastapi_intro.json               — Async routes, auto-docs, Pydantic models
fastapi_crud.json                — Full CRUD API with database
fastapi_authentication.json      — JWT, OAuth2, dependency injection
html_css_basics.json             — HTML structure, CSS selectors, box model
javascript_for_python_devs.json  — JS basics from a Python perspective
api_consumption.json             — requests library, API keys, pagination
websockets_basics.json           — Real-time communication, socket.io concepts
deployment_basics.json           — Hosting, WSGI/ASGI, Gunicorn, Nginx
docker_for_python.json           — Dockerfile, compose, containerizing Python apps
database_sql_basics.json         — SQL queries, joins, SQLite, PostgreSQL
```

#### dsa/ (20 lessons)

```
big_o_complexity.json            — Time/space complexity, Big O notation
arrays_strings.json              — Array operations, string algorithms
linked_lists.json                — Singly/doubly linked lists, operations
stacks.json                      — Stack operations, applications, call stack
queues.json                      — Queue, deque, priority queue
hash_tables.json                 — Hashing, collision handling, dict internals
trees_basics.json                — Binary trees, traversal (inorder, preorder, postorder)
binary_search_trees.json         — BST operations, balancing concepts
heaps.json                       — Min/max heap, heapq module
graphs_basics.json               — Adjacency list/matrix, BFS, DFS
graphs_advanced.json             — Dijkstra, topological sort, cycle detection
sorting_basics.json              — Bubble, selection, insertion sort
sorting_advanced.json            — Merge sort, quicksort, timsort
searching.json                   — Linear search, binary search, bisect
recursion_fundamentals.json      — Base case, recursive thinking, stack frames
recursion_advanced.json          — Memoization, dynamic programming intro
dynamic_programming.json         — Tabulation, common DP patterns
greedy_algorithms.json           — Greedy strategy, interval scheduling, huffman
string_algorithms.json           — Pattern matching, anagram detection, palindromes
coding_interview_patterns.json   — Two pointers, sliding window, fast/slow
```

#### ai_fundamentals/ (18 lessons)

```
what_is_ai.json                  — AI history, types, current landscape
prompt_engineering_basics.json   — Zero-shot, few-shot, chain-of-thought
prompt_engineering_advanced.json — System prompts, temperature, structured output
llm_how_they_work.json           — Tokens, embeddings, attention simplified
openai_api_basics.json           — API keys, chat completions, streaming
anthropic_api_basics.json        — Claude API, messages, tool use
langchain_intro.json             — Chains, prompts, output parsers
langchain_agents.json            — Tools, agent types, ReAct pattern
rag_fundamentals.json            — Retrieval augmented generation, vector stores
embeddings_similarity.json       — Text embeddings, cosine similarity, FAISS
vector_databases.json            — ChromaDB, Pinecone, storing/querying vectors
building_chatbots.json           — Conversation memory, context management
ai_code_assistants.json          — Claude Code, Cursor, Copilot, AI-assisted dev
structured_output.json           — JSON mode, function calling, Pydantic + LLMs
multi_modal_ai.json              — Vision APIs, image + text, document understanding
ai_safety_ethics.json            — Bias, hallucination, responsible AI practices
fine_tuning_basics.json          — When to fine-tune, data preparation, LoRA concepts
ai_app_deployment.json           — Serving models, API wrappers, cost optimization
```

#### machine_learning/ (22 lessons)

```
ml_what_is_it.json               — Supervised vs unsupervised vs reinforcement
ml_workflow.json                 — Data > Preprocess > Train > Evaluate > Deploy
numpy_foundations.json           — Arrays, operations, broadcasting, linear algebra
pandas_foundations.json          — DataFrames, series, indexing, filtering
data_cleaning.json               — Missing values, outliers, encoding, scaling
feature_engineering.json         — Feature selection, creation, polynomial features
train_test_split.json            — Splitting data, cross-validation, stratification
linear_regression.json           — OLS, gradient descent, cost function
logistic_regression.json         — Classification, sigmoid, decision boundary
decision_trees.json              — Splitting criteria, pruning, visualization
random_forests.json              — Ensemble methods, bagging, feature importance
svm.json                         — Support vectors, kernels, margin maximization
knn.json                         — K-nearest neighbors, distance metrics
naive_bayes.json                 — Bayes theorem, text classification
clustering_kmeans.json           — K-means, elbow method, silhouette score
clustering_advanced.json         — DBSCAN, hierarchical clustering, GMM
dimensionality_reduction.json    — PCA, t-SNE, UMAP
model_evaluation.json            — Accuracy, precision, recall, F1, ROC-AUC
hyperparameter_tuning.json       — GridSearch, RandomSearch, Bayesian optimization
ml_pipelines.json                — sklearn Pipeline, ColumnTransformer, end-to-end
model_deployment.json            — pickle, joblib, FastAPI serving, MLflow basics
ml_project_end_to_end.json       — Complete project: data > model > API > monitoring
```

#### deep_learning_complete/ (25 lessons)

```
dl_perceptron.json               — Single neuron, weights, bias, activation
dl_multilayer_network.json       — Hidden layers, network architecture
dl_activation_functions.json     — ReLU, sigmoid, tanh, softmax, when to use each
dl_forward_pass.json             — Matrix multiplication, layer-by-layer computation
dl_loss_functions.json           — MSE, cross-entropy, custom losses
dl_backpropagation.json          — Chain rule, gradient computation, weight updates
dl_gradient_descent.json         — SGD, momentum, Adam, learning rate scheduling
dl_regularization.json           — Dropout, L1/L2, batch normalization, early stopping
dl_pytorch_basics.json           — Tensors, autograd, nn.Module
dl_pytorch_training.json         — DataLoader, training loop, loss tracking
dl_cnn_intro.json                — Convolution operation, filters, feature maps
dl_cnn_architectures.json        — LeNet, VGG, ResNet, architecture design
dl_cnn_image_classification.json — End-to-end image classifier with PyTorch
dl_cnn_transfer_learning.json    — Pre-trained models, fine-tuning, feature extraction
dl_rnn_intro.json                — Sequential data, hidden state, vanishing gradients
dl_lstm_gru.json                 — LSTM cells, GRU, gates, memory
dl_rnn_text_generation.json      — Character-level RNN, text generation
dl_attention_mechanism.json      — Attention scores, self-attention, query/key/value
dl_transformer_architecture.json — Encoder-decoder, multi-head attention, positional encoding
dl_bert_gpt_concepts.json        — BERT vs GPT, pre-training, fine-tuning
dl_gan_basics.json               — Generator, discriminator, adversarial training
dl_gan_image_generation.json     — DCGAN, training tricks, mode collapse
dl_autoencoders.json             — Encoder-decoder, latent space, VAE
dl_model_optimization.json       — Quantization, pruning, ONNX, TensorRT
dl_project_end_to_end.json       — Complete project: dataset > model > training > deployment
```

#### testing_devops/ (12 lessons)

```
testing_why.json                 — Why test, test types, test pyramid
unittest_basics.json             — unittest module, TestCase, assertions
pytest_basics.json               — pytest, fixtures, parametrize
pytest_advanced.json             — Mocking, monkeypatch, conftest, plugins
tdd_workflow.json                — Red-green-refactor, test-first development
ci_cd_basics.json                — What is CI/CD, GitHub Actions intro
ci_cd_python.json                — Python CI pipeline, linting, testing, deploy
docker_fundamentals.json         — Images, containers, Dockerfile, volumes
docker_compose.json              — Multi-container apps, networking, env vars
packaging_distribution.json      — setup.py, pyproject.toml, PyPI publishing
git_workflows.json               — Branching, PRs, rebasing, merge strategies
logging_monitoring.json          — logging module, levels, structured logging
```

---

## 3. Animation Standard

### USP Commitment

Every single lesson (all 222) gets cinema-quality visual animations. This is PyMasters' core differentiator.

### Minimum Animation Sequence Per Lesson (5 primitives)

1. **StoryCard** — Vaathiyaar narrates with typewriter effect, themed emoji, dark cinema styling
2. **ConceptMap** — Visual node graph showing concept prerequisites and connections
3. **CodeStepper** — Cinema-mode line-by-line execution with syntax highlighting, narration bubbles, inline output, contextual icons
4. **VariableBox(es)** — Type-aware animated variable tracking synced to CodeStepper
5. **TerminalOutput** — Python `>>>` prompt with typing animation showing real output

### Additional Primitives by Concept Type

| Concept Type | Extra Animations |
|-------------|-----------------|
| Control flow (if/else, loops) | FlowArrow (animated branching), multiple CodeStepper passes for iterations |
| Data structures (lists, dicts, trees) | DataStructure (themed, add/remove/highlight animations) |
| Functions / Recursion | MemoryStack (call stack push/pop, color-coded frames) |
| Before/After patterns | ComparisonPanel (side-by-side with VS badge) |
| OOP / Architecture | ConceptMap with multi-level hierarchy |
| Math / ML formulas | CodeStepper with formula evaluation + VariableBox per iteration |
| Neural Networks | DataStructure for layers + MemoryStack for forward/backward pass + FlowArrow for data flow |
| Web / API | ComparisonPanel (request vs response) + TerminalOutput (HTTP status, JSON) |
| Projects | StoryCard (what we're building) → ConceptMap (architecture) → multiple CodeStepper → TerminalOutput |

### Richness Tiers

| Tier | Which Lessons | Primitives | CodeStepper Steps |
|------|--------------|------------|-------------------|
| Tier 1 — Flagship | First lesson of each path (~15) | 8-10 | 15-20+ |
| Tier 2 — Core | Main path content (~100) | 6-8 | 10-20 |
| Tier 3 — Supplementary | Deep dives, practice-heavy (~95+) | 5-6 | 8-15 |

### CodeStepper Standard

- Real, runnable Python code (not pseudocode)
- Step descriptions in English and Tamil
- Output annotations on print/return lines
- Multiple code blocks for complex topics

---

## 4. Knowledge Graph

### 4.1 Database Schema

```sql
-- Concept nodes (~300)
CREATE TABLE IF NOT EXISTS concepts (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    difficulty TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Directed edges between concepts
CREATE TABLE IF NOT EXISTS concept_edges (
    from_concept TEXT NOT NULL REFERENCES concepts(id),
    to_concept TEXT NOT NULL REFERENCES concepts(id),
    relationship TEXT NOT NULL DEFAULT 'requires',
    weight REAL DEFAULT 1.0,
    PRIMARY KEY (from_concept, to_concept)
);

-- Many-to-many: lessons <-> concepts
CREATE TABLE IF NOT EXISTS lesson_concepts (
    lesson_id TEXT NOT NULL,
    concept_id TEXT NOT NULL REFERENCES concepts(id),
    role TEXT NOT NULL DEFAULT 'teaches',
    depth TEXT DEFAULT 'moderate',
    PRIMARY KEY (lesson_id, concept_id, role)
);
```

### 4.2 Concept Categories (~300 total)

| Category | Examples | Count |
|----------|---------|-------|
| python_core | variables, loops, functions, OOP, decorators, generators, comprehensions | ~60 |
| stdlib | pathlib, datetime, regex, json, csv, collections, itertools | ~25 |
| web_dev | http, rest_api, django, flask, fastapi, html_templates, authentication | ~30 |
| data_science | pandas, numpy, matplotlib, data_cleaning, statistics, visualization | ~25 |
| ai_ml | supervised_learning, regression, classification, clustering, feature_engineering | ~30 |
| deep_learning | neural_nets, backpropagation, cnn, rnn, lstm, transformers, attention, gan | ~35 |
| devops | testing, pytest, docker, ci_cd, packaging, git | ~20 |
| automation | file_ops, web_scraping, email, pdf, cli_tools, scheduling | ~15 |
| dsa | linked_lists, stacks, queues, hash_tables, trees, sorting, recursion, big_o | ~25 |
| ai_dev | prompt_engineering, rag, embeddings, langchain, agents, llm_api | ~20 |

### 4.3 Lesson JSON Tag Extension

Every lesson gets a new `tags` field:

```json
{
  "tags": {
    "concepts_taught": ["list_comprehension", "generator_expression"],
    "concepts_required": ["for_loops", "lists"],
    "difficulty": "intermediate",
    "engagement_type": "hands_on",
    "estimated_minutes": 25,
    "real_world_application": ["data_filtering", "memory_optimization"],
    "category": "python_core",
    "path_memberships": ["python_fundamentals_path", "data_scientist_path"]
  }
}
```

---

## 5. Learning Paths

### 5.1 Pre-Defined Paths (15)

| # | Path ID | Name | Lessons | Difficulty |
|---|---------|------|---------|------------|
| 1 | python_zero_to_hero | Python Zero to Hero | ~25 | beginner → intermediate |
| 2 | python_for_programmers | Python for Programmers | ~15 | intermediate → advanced |
| 3 | web_developer_path | Web Developer | ~20 | beginner → intermediate |
| 4 | data_scientist_path | Data Scientist | ~20 | intermediate → advanced |
| 5 | ai_fundamentals_path | AI Fundamentals | ~20 | beginner → intermediate |
| 6 | ml_engineer_path | Machine Learning Engineer | ~25 | intermediate → advanced |
| 7 | dl_neural_nets_path | Deep Learning & Neural Networks | ~25 | intermediate → advanced |
| 8 | automation_engineer_path | Automation Engineer | ~15 | beginner → intermediate |
| 9 | dsa_interview_path | DSA & Interview Prep | ~20 | intermediate → advanced |
| 10 | testing_devops_path | Testing & DevOps | ~15 | intermediate → advanced |
| 11 | stdlib_mastery_path | Standard Library Mastery | ~15 | intermediate |
| 12 | oop_patterns_path | OOP & Design Patterns | ~15 | intermediate → advanced |
| 13 | fun_projects_path | Fun & Projects | ~15 | beginner → intermediate |
| 14 | fullstack_python_path | Full-Stack Python | ~20 | intermediate → advanced |
| 15 | ai_ml_dl_complete_journey | AI/ML/DL Complete Journey | ~50 | beginner → advanced |

### 5.2 Database Schema

```sql
CREATE TABLE IF NOT EXISTS learning_paths (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    icon TEXT,
    difficulty_start TEXT,
    difficulty_end TEXT,
    category TEXT,
    estimated_hours INTEGER,
    lesson_sequence TEXT NOT NULL,  -- JSON array of lesson IDs
    concepts_covered TEXT,          -- JSON array of concept IDs
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_learning_paths (
    user_id TEXT NOT NULL,
    path_id TEXT NOT NULL REFERENCES learning_paths(id),
    status TEXT DEFAULT 'active',
    current_position INTEGER DEFAULT 0,
    adapted_sequence TEXT,          -- JSON: AI-modified lesson order
    skipped_lessons TEXT,           -- JSON array
    inserted_lessons TEXT,          -- JSON array
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_activity TIMESTAMP,
    completed_at TIMESTAMP,
    PRIMARY KEY (user_id, path_id)
);
```

### 5.3 AI Path Adaptation Engine

**File:** `backend/paths/adapter.py`

**Trigger:** Runs after every lesson completion or 2+ evaluation failures.

**Input:**
- User's current adapted_sequence
- user_mastery map (all topic mastery scores)
- Recent learning_signals (last 20)
- Knowledge graph (concept prerequisites)
- lesson_completions (what they've done)

**Decisions:**

| Decision | Condition | Action |
|----------|-----------|--------|
| SKIP | Mastery for upcoming lesson's required concepts > 0.8 | Mark skippable, suggest to user |
| INSERT | Mastery for a required concept < 0.3 AND it's a prereq for next 3 lessons | Insert remedial lesson (existing or trigger generation) |
| REORDER | 3+ interest signals about a topic further down the path | Bubble it up in sequence |
| BRANCH | Behavior suggests different path would serve better | Suggest path switch or merge |
| GENERATE | No existing lesson covers a detected gap | Trigger 5-stage pipeline, insert when ready |

**Output:**
- Updated adapted_sequence in user_learning_paths
- Notification if significant change
- Vaathiyaar message explaining adaptation

---

## 6. Smart Content Insertion

### 6.1 Triggers

| Trigger | Detection | Priority |
|---------|-----------|----------|
| Struggle | 2+ failures on same concept | High — insert immediately |
| Interest | 3+ chat questions about a topic | Medium — insert at next logical position |
| User request | "Teach me X" in Playground/Classroom | High — Vaathiyaar confirms and generates |

### 6.2 Insertion Logic (`backend/paths/inserter.py`)

1. **FIND POSITION** — Scan adapted_sequence for where concept belongs based on concept_edges
2. **INSERT** — Add lesson ID at position with metadata `{ inserted: true, reason: "..." }`
3. **Struggle lessons** → inserted BEFORE the problem lesson (remedial), auto-set as next
4. **Interest lessons** → inserted at next natural break
5. **User-requested** → inserted immediately after current position

### 6.3 Database

```sql
CREATE TABLE IF NOT EXISTS lesson_insertions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    path_id TEXT,
    lesson_id TEXT NOT NULL,
    position INTEGER,
    reason TEXT NOT NULL,
    concept_id TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

## 7. Triple Notification System

### Channel 1: Badge (Passive)

```sql
-- Uses existing notifications table
INSERT INTO notifications (user_id, type, title, message, link, metadata)
VALUES (?, 'custom_lesson_ready', 'New Lesson: ...', '...', '/dashboard/classroom?lesson=...', '{"reason":"..."}');
```

### Channel 2: Path Insertion (Active)

- `user_learning_paths.adapted_sequence` updated with new lesson
- Frontend renders with badges: "New! Personalized" / "Recommended Review" / "Your Request"
- Animated entry in path timeline view

### Channel 3: Vaathiyaar Conversational (Proactive)

```sql
CREATE TABLE IF NOT EXISTS pending_vaathiyaar_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    message TEXT NOT NULL,
    message_type TEXT NOT NULL,
    action_data TEXT,              -- JSON: { lesson_id, path_id, ... }
    delivered BOOLEAN DEFAULT 0,
    dismissed BOOLEAN DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

Messages delivered as animated banner on next Classroom/Playground load:
- **Struggle:** "I noticed you had a tough time with X. I've prepared a special visual lesson..."
- **Interest:** "You've been asking great questions about X! I built a deep-dive lesson..."
- **Request:** "Your custom lesson on X is ready! I packed it with animations..."

Actions: [Start Now] → opens lesson, [Add to My Path] → stays in path, [Dismiss] → removes

---

## 8. Frontend Changes

### 8.1 New Page: `/dashboard/paths`

- Active path banner with progress ring and continue button
- "Recommended For You" section based on profile
- Grid of all 15 paths as cards (icon, name, lesson count, difficulty, progress ring)
- Filter: All / Beginner / Intermediate / Advanced

### 8.2 Path Detail: `/dashboard/paths/:pathId`

- Path header: name, description, progress bar, estimated time remaining
- Timeline view: completed (green check) → personalized insertions (sparkle badge) → next (play icon) → locked (lock icon)
- Knowledge Map: SVG-based interactive concept graph (green=mastered, yellow=in-progress, gray=not started, pulsing=recommended next)

### 8.3 Knowledge Map Component (`KnowledgeMap.jsx`)

- SVG-based, GSAP-animated
- Nodes = concepts colored by mastery level
- Edges = prerequisite relationships
- Force-directed or hierarchical layout
- Hover = mastery %, click = opens related lessons
- No external graph library (graph is small enough)

### 8.4 Sidebar Navigation Update

Add "Paths" nav item between "Learning Path" and "Classroom"

### 8.5 Vaathiyaar Proactive Messages

- Check `pending_vaathiyaar_messages` on Classroom/Playground load
- Render as animated banner (Framer Motion slide-down)
- Action buttons: Start Now, Add to My Path, Dismiss

### 8.6 Onboarding Path Recommendation

After existing onboarding questions, Vaathiyaar recommends a path:
- Embedded path card with name, lessons, hours, what you'll learn
- Actions: [Start This Path] → creates user_learning_paths → /dashboard/paths/{id}
- [Browse All Paths] → /dashboard/paths
- [Skip for now] → /dashboard/classroom

---

## 9. Backend Architecture

### 9.1 New Files

```
backend/
├── paths/
│   ├── __init__.py
│   ├── adapter.py          — AI path adaptation (skip/insert/reorder/branch/generate)
│   ├── inserter.py         — Smart content insertion into adapted sequences
│   ├── recommender.py      — Concept recommendation (mastery + graph)
│   └── definitions.py      — 15 learning path definitions
├── graph/
│   ├── __init__.py
│   ├── concepts.py         — Concept CRUD, ~300 concept seed data
│   ├── edges.py            — Edge management, prerequisite queries
│   └── queries.py          — Graph traversal: next concepts, learning frontier, gap detection
├── routes/
│   ├── paths.py            — Learning paths API (NEW)
│   ├── graph.py            — Knowledge graph API (NEW)
│   ├── messages.py         — Vaathiyaar messages API (NEW)
│   └── ... (existing)
```

### 9.2 New API Endpoints

**Learning Paths (`/api/paths/`)**

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/paths/` | GET | List all 15 paths |
| `/api/paths/{path_id}` | GET | Path detail with lesson sequence |
| `/api/paths/{path_id}/start` | POST | Start a path |
| `/api/paths/{path_id}/progress` | GET | User progress, adapted sequence, mastery per concept |
| `/api/paths/active` | GET | User's active path(s) |
| `/api/paths/{path_id}/switch` | POST | Switch path, carry over completions |

**Knowledge Graph (`/api/graph/`)**

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/graph/concepts` | GET | All concepts |
| `/api/graph/concepts/{id}` | GET | Concept with edges + lessons |
| `/api/graph/user-map/{user_id}` | GET | User's knowledge map with mastery |
| `/api/graph/recommendations/{user_id}` | GET | Top 5 recommended next concepts |

**Adaptation (`/api/paths/adapt/`)**

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/paths/adapt/evaluate` | POST | Run adaptation after lesson completion |
| `/api/paths/adapt/history/{user_id}` | GET | Adaptation log |

**Messages (`/api/messages/`)**

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/messages/pending/{user_id}` | GET | Undelivered proactive messages |
| `/api/messages/{id}/dismiss` | POST | Dismiss message |
| `/api/messages/{id}/action` | POST | User took action (start, add_to_path) |

### 9.3 Updated Existing Endpoints

- `/api/classroom/evaluate` — also calls path adaptation + checks generation triggers
- `/api/classroom/lessons` — also returns `active_path`, `next_in_path`, `path_progress`

### 9.4 Database Migration

8 new tables added to `init_db()` in `main.py`:
- `concepts`
- `concept_edges`
- `lesson_concepts`
- `learning_paths`
- `user_learning_paths`
- `pending_vaathiyaar_messages`
- `lesson_insertions`
- `path_adaptation_log`

```sql
CREATE TABLE IF NOT EXISTS path_adaptation_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    path_id TEXT NOT NULL,
    action TEXT NOT NULL,           -- skip, insert, reorder, branch, generate
    details TEXT,                   -- JSON: what changed and why
    lesson_affected TEXT,           -- lesson ID that was skipped/inserted/moved
    concept_trigger TEXT,           -- concept that triggered this adaptation
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

## 10. Onboarding → Path Selection

### Path Recommendation Logic

```python
MOTIVATION_TO_PATH = {
    "hobby":          "fun_projects_path",
    "ai_ml":          "ai_ml_dl_complete_journey",
    "data_science":   "data_scientist_path",
    "career_switch":  "python_zero_to_hero",
    "work":           "python_for_programmers",
    "student":        "python_zero_to_hero",
}

GOAL_TO_PATH = {
    "web":            "web_developer_path",
    "automation":     "automation_engineer_path",
    "ai_ml":          "ml_engineer_path",
    "data_science":   "data_scientist_path",
    "games":          "fun_projects_path",
}
```

Priority: goal > motivation. If beginner experience, always start with `python_zero_to_hero`.

---

## 11. Implementation Order

1. **Database migration** — add 7 new tables
2. **Knowledge graph** — seed ~300 concepts + edges
3. **Content generation** — 142 new lesson JSONs with full animations
4. **Tag retrofit** — add tags to existing 80 lessons + lesson_concepts rows
5. **Learning path definitions** — 15 paths with lesson sequences
6. **Backend APIs** — paths, graph, messages, adaptation endpoints
7. **Path adaptation engine** — skip/insert/reorder/branch/generate logic
8. **Smart insertion** — content insertion + triple notification
9. **Frontend: Paths page** — browse, start, continue paths
10. **Frontend: Path detail** — timeline + knowledge map
11. **Frontend: Vaathiyaar messages** — proactive message banner
12. **Frontend: Onboarding update** — path recommendation step
13. **Integration testing** — end-to-end flow validation
