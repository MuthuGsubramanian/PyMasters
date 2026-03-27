# PyMasters Content Expansion — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand PyMasters from 80 to 222 lessons with knowledge graph, 15 AI-adaptive learning paths, smart content insertion, and triple notification.

**Architecture:** SQLite knowledge graph (concepts + edges tables), lesson JSON files with `tags` field, path adaptation engine in `backend/paths/`, new frontend Paths page with SVG knowledge map. Content generated as hand-crafted JSON with cinema-quality animation sequences.

**Tech Stack:** FastAPI, SQLite, React 19, Framer Motion, GSAP, Tailwind CSS

---

## Phasing Strategy

This plan is decomposed into 4 phases. Each phase ships independently:

| Phase | What | Depends On | Deliverable |
|-------|------|-----------|-------------|
| 1 | DB schema + Knowledge graph + Tag retrofit | Nothing | Infrastructure ready, existing lessons tagged |
| 2 | 142 new lesson JSONs (7 tracks) | Phase 1 (for tags) | All content in place |
| 3 | Learning paths backend + frontend | Phase 1 + 2 | Paths page, path detail, knowledge map |
| 4 | Smart insertion + triple notification + onboarding | Phase 3 | AI adaptation, proactive messages |

---

## Phase 1: Database + Knowledge Graph + Tag Retrofit

### Task 1: Add Knowledge Graph Tables to Database

**Files:**
- Modify: `backend/main.py:85-310` (init_db function)

- [ ] **Step 1: Add 8 new CREATE TABLE statements to init_db()**

Add the following after the `lesson_completions` table creation (around line 297) in the `init_db()` function inside `main.py`:

```python
        # ── Knowledge Graph tables ────────────────────────────────────
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS concepts (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                category TEXT NOT NULL,
                difficulty TEXT NOT NULL,
                description TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS concept_edges (
                from_concept TEXT NOT NULL REFERENCES concepts(id),
                to_concept TEXT NOT NULL REFERENCES concepts(id),
                relationship TEXT NOT NULL DEFAULT 'requires',
                weight REAL DEFAULT 1.0,
                PRIMARY KEY (from_concept, to_concept)
            )
        """)

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS lesson_concepts (
                lesson_id TEXT NOT NULL,
                concept_id TEXT NOT NULL REFERENCES concepts(id),
                role TEXT NOT NULL DEFAULT 'teaches',
                depth TEXT DEFAULT 'moderate',
                PRIMARY KEY (lesson_id, concept_id, role)
            )
        """)

        # ── Learning Paths tables ─────────────────────────────────────
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS learning_paths (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                description TEXT,
                icon TEXT,
                difficulty_start TEXT,
                difficulty_end TEXT,
                category TEXT,
                estimated_hours INTEGER,
                lesson_sequence TEXT NOT NULL,
                concepts_covered TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS user_learning_paths (
                user_id TEXT NOT NULL,
                path_id TEXT NOT NULL REFERENCES learning_paths(id),
                status TEXT DEFAULT 'active',
                current_position INTEGER DEFAULT 0,
                adapted_sequence TEXT,
                skipped_lessons TEXT,
                inserted_lessons TEXT,
                started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                last_activity TIMESTAMP,
                completed_at TIMESTAMP,
                PRIMARY KEY (user_id, path_id)
            )
        """)

        # ── Vaathiyaar proactive messages ─────────────────────────────
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS pending_vaathiyaar_messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL,
                message TEXT NOT NULL,
                message_type TEXT NOT NULL,
                action_data TEXT,
                delivered BOOLEAN DEFAULT 0,
                dismissed BOOLEAN DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS lesson_insertions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL,
                path_id TEXT,
                lesson_id TEXT NOT NULL,
                position INTEGER,
                reason TEXT NOT NULL,
                concept_id TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS path_adaptation_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL,
                path_id TEXT NOT NULL,
                action TEXT NOT NULL,
                details TEXT,
                lesson_affected TEXT,
                concept_trigger TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        cursor.execute("CREATE INDEX IF NOT EXISTS idx_concepts_category ON concepts(category)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_lesson_concepts_lesson ON lesson_concepts(lesson_id)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_lesson_concepts_concept ON lesson_concepts(concept_id)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_user_paths_user ON user_learning_paths(user_id, status)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_pending_msgs_user ON pending_vaathiyaar_messages(user_id, delivered)")
```

- [ ] **Step 2: Verify DB initializes without errors**

Run: `cd backend && python -c "from main import init_db; init_db()"`
Expected: No errors, tables created

- [ ] **Step 3: Commit**

```bash
git add backend/main.py
git commit -m "feat: add knowledge graph, learning paths, and messages DB tables"
```

---

### Task 2: Create Knowledge Graph Seed Data — Concepts

**Files:**
- Create: `backend/graph/__init__.py`
- Create: `backend/graph/concepts.py`

- [ ] **Step 1: Create graph package init**

```python
# backend/graph/__init__.py
```

- [ ] **Step 2: Create concepts.py with all ~300 concept definitions and seed function**

Create `backend/graph/concepts.py` containing:
1. `CONCEPTS` — a list of dicts, each with `id`, `name`, `category`, `difficulty`, `description`
2. `CONCEPT_EDGES` — a list of dicts, each with `from_concept`, `to_concept`, `relationship`, `weight`
3. `seed_concepts(db_path)` — function that inserts all concepts and edges into DB (idempotent via INSERT OR IGNORE)

The concept definitions must cover all 10 categories from the spec:

```python
"""
graph/concepts.py — Knowledge graph seed data.

Contains ~300 concept nodes and ~400 prerequisite edges.
Call seed_concepts(db_path) on startup to populate.
"""

import sqlite3
import os

# ─── CONCEPT DEFINITIONS ───────────────────────────────────────────────────
# Each concept: (id, name, category, difficulty, description)

CONCEPTS = [
    # ── python_core (~60 concepts) ──────────────────────────────────────
    ("variables", "Variables", "python_core", "beginner", "Named containers that store values"),
    ("data_types", "Data Types", "python_core", "beginner", "int, float, str, bool — Python's basic types"),
    ("type_conversion", "Type Conversion", "python_core", "beginner", "Converting between data types with int(), str(), float()"),
    ("operators", "Operators", "python_core", "beginner", "Arithmetic, comparison, logical, and assignment operators"),
    ("string_basics", "String Basics", "python_core", "beginner", "Creating, indexing, and slicing strings"),
    ("string_methods", "String Methods", "python_core", "beginner", "split(), join(), strip(), replace(), format()"),
    ("string_formatting", "String Formatting", "python_core", "beginner", "f-strings, .format(), and % formatting"),
    ("conditionals", "Conditionals", "python_core", "beginner", "if, elif, else — decision making in code"),
    ("boolean_logic", "Boolean Logic", "python_core", "beginner", "and, or, not — combining conditions"),
    ("for_loops", "For Loops", "python_core", "beginner", "Iterating over sequences with for"),
    ("while_loops", "While Loops", "python_core", "beginner", "Looping while a condition is true"),
    ("loop_control", "Loop Control", "python_core", "beginner", "break, continue, and else in loops"),
    ("lists", "Lists", "python_core", "beginner", "Ordered, mutable sequences"),
    ("list_methods", "List Methods", "python_core", "beginner", "append, insert, remove, sort, reverse"),
    ("list_slicing", "List Slicing", "python_core", "beginner", "Extracting sub-lists with [start:stop:step]"),
    ("tuples", "Tuples", "python_core", "beginner", "Ordered, immutable sequences"),
    ("dictionaries", "Dictionaries", "python_core", "beginner", "Key-value mappings for fast lookups"),
    ("dict_methods", "Dictionary Methods", "python_core", "beginner", "keys(), values(), items(), get(), update()"),
    ("sets", "Sets", "python_core", "beginner", "Unordered collections of unique elements"),
    ("nested_structures", "Nested Structures", "python_core", "beginner", "Lists of dicts, dicts of lists, etc."),
    ("functions_basics", "Functions Basics", "python_core", "beginner", "Defining and calling functions with def"),
    ("function_arguments", "Function Arguments", "python_core", "beginner", "Positional, keyword, default, *args, **kwargs"),
    ("return_values", "Return Values", "python_core", "beginner", "Returning data from functions"),
    ("scope", "Scope", "python_core", "intermediate", "Local, enclosing, global, built-in (LEGB rule)"),
    ("closures", "Closures", "python_core", "intermediate", "Functions that capture enclosing scope variables"),
    ("lambda_functions", "Lambda Functions", "python_core", "intermediate", "Anonymous one-line functions"),
    ("list_comprehension", "List Comprehensions", "python_core", "intermediate", "Concise list creation: [x for x in ...]"),
    ("dict_comprehension", "Dict Comprehensions", "python_core", "intermediate", "Concise dict creation: {k:v for k,v in ...}"),
    ("set_comprehension", "Set Comprehensions", "python_core", "intermediate", "Concise set creation: {x for x in ...}"),
    ("generators", "Generators", "python_core", "intermediate", "Lazy iterators with yield"),
    ("generator_expressions", "Generator Expressions", "python_core", "intermediate", "Parenthesized comprehensions for lazy eval"),
    ("decorators", "Decorators", "python_core", "intermediate", "Functions that modify other functions with @syntax"),
    ("decorator_patterns", "Decorator Patterns", "python_core", "advanced", "Class decorators, parameterized decorators, functools.wraps"),
    ("classes_basics", "Classes Basics", "python_core", "intermediate", "Defining classes with __init__, self, attributes"),
    ("inheritance", "Inheritance", "python_core", "intermediate", "Single and multiple inheritance, super()"),
    ("composition", "Composition", "python_core", "intermediate", "Has-a relationships, preferring composition over inheritance"),
    ("magic_methods", "Magic Methods", "python_core", "intermediate", "__str__, __repr__, __len__, __eq__, __lt__"),
    ("class_methods", "Class & Static Methods", "python_core", "intermediate", "@classmethod, @staticmethod, cls vs self"),
    ("properties", "Properties", "python_core", "intermediate", "@property, getters, setters, encapsulation"),
    ("abstract_classes", "Abstract Classes", "python_core", "advanced", "ABC, abstractmethod, interface contracts"),
    ("design_patterns", "Design Patterns", "python_core", "advanced", "Singleton, Factory, Observer, Strategy"),
    ("context_managers", "Context Managers", "python_core", "intermediate", "with statement, __enter__/__exit__, contextlib"),
    ("error_handling", "Error Handling", "python_core", "beginner", "try, except, finally, raise"),
    ("custom_exceptions", "Custom Exceptions", "python_core", "intermediate", "Creating exception hierarchies"),
    ("file_reading", "File Reading", "python_core", "beginner", "Reading files with open() and read modes"),
    ("file_writing", "File Writing", "python_core", "beginner", "Writing to files with open() and write modes"),
    ("modules_imports", "Modules & Imports", "python_core", "beginner", "import, from...import, __name__, packages"),
    ("type_hints", "Type Hints", "python_core", "intermediate", "Type annotations, Optional, Union, typing module"),
    ("dataclasses", "Dataclasses", "python_core", "intermediate", "@dataclass, field(), frozen, post_init"),
    ("async_basics", "Async Basics", "python_core", "advanced", "asyncio, coroutines, await, event loop"),
    ("async_advanced", "Async Advanced", "python_core", "advanced", "gather, tasks, aiohttp, async generators"),
    ("threading", "Threading", "python_core", "advanced", "Thread, Lock, GIL, concurrent.futures"),
    ("multiprocessing", "Multiprocessing", "python_core", "advanced", "Process, Pool, shared memory, parallel execution"),
    ("recursion", "Recursion", "python_core", "intermediate", "Functions that call themselves, base cases"),
    ("memoization", "Memoization", "python_core", "intermediate", "Caching recursive results with functools.lru_cache"),
    ("walrus_operator", "Walrus Operator", "python_core", "intermediate", "Assignment expressions with :="),
    ("unpacking", "Unpacking", "python_core", "intermediate", "Tuple unpacking, * operator, extended unpacking"),
    ("iterators", "Iterators", "python_core", "intermediate", "__iter__, __next__, StopIteration protocol"),
    ("metaclasses", "Metaclasses", "python_core", "advanced", "type(), __new__, custom metaclasses"),

    # ── stdlib (~25 concepts) ───────────────────────────────────────────
    ("pathlib", "pathlib", "stdlib", "intermediate", "Object-oriented filesystem paths"),
    ("datetime_module", "datetime", "stdlib", "intermediate", "Date and time handling, timedelta, formatting"),
    ("regex", "Regular Expressions", "stdlib", "intermediate", "re module: match, search, findall, sub, groups"),
    ("regex_advanced", "Regex Advanced", "stdlib", "advanced", "Lookahead, lookbehind, named groups, compilation"),
    ("json_module", "JSON Module", "stdlib", "beginner", "json.loads(), json.dumps(), file I/O"),
    ("csv_module", "CSV Module", "stdlib", "beginner", "csv.reader, csv.writer, DictReader"),
    ("collections_module", "Collections", "stdlib", "intermediate", "Counter, defaultdict, namedtuple, deque, OrderedDict"),
    ("itertools_module", "itertools", "stdlib", "intermediate", "chain, product, combinations, permutations, groupby"),
    ("functools_module", "functools", "stdlib", "intermediate", "lru_cache, partial, reduce, wraps"),
    ("os_module", "os Module", "stdlib", "beginner", "os.path, os.listdir, os.makedirs, environment variables"),
    ("sys_module", "sys Module", "stdlib", "intermediate", "sys.argv, sys.path, sys.exit"),
    ("subprocess_module", "subprocess", "stdlib", "intermediate", "Running external commands from Python"),
    ("logging_module", "Logging", "stdlib", "intermediate", "logging module, levels, handlers, formatters"),
    ("argparse_module", "argparse", "stdlib", "intermediate", "Command-line argument parsing"),
    ("sqlite3_module", "sqlite3", "stdlib", "intermediate", "Embedded SQL database from Python"),
    ("unittest_module", "unittest", "stdlib", "intermediate", "Built-in testing framework, TestCase, assertions"),
    ("typing_module", "typing Module", "stdlib", "intermediate", "Generic types, Protocol, TypeVar, overload"),
    ("abc_module", "abc Module", "stdlib", "intermediate", "Abstract base classes and virtual subclasses"),
    ("contextlib_module", "contextlib", "stdlib", "intermediate", "contextmanager decorator, suppress, redirect"),
    ("dataclasses_module", "dataclasses Module", "stdlib", "intermediate", "@dataclass decorator, field, asdict, astuple"),
    ("enum_module", "Enum", "stdlib", "intermediate", "Enum, IntEnum, Flag for named constants"),
    ("math_module", "math Module", "stdlib", "beginner", "Mathematical functions and constants"),
    ("random_module", "random Module", "stdlib", "beginner", "Random number generation, choice, shuffle"),
    ("secrets_module", "secrets Module", "stdlib", "intermediate", "Cryptographically secure random generation"),
    ("hashlib_module", "hashlib", "stdlib", "intermediate", "Hash functions: md5, sha256, password hashing"),

    # ── web_dev (~30 concepts) ──────────────────────────────────────────
    ("http_fundamentals", "HTTP Fundamentals", "web_dev", "beginner", "HTTP methods, status codes, headers, request/response"),
    ("rest_api", "REST API Concepts", "web_dev", "beginner", "REST principles, endpoints, CRUD, JSON payloads"),
    ("api_consumption", "API Consumption", "web_dev", "beginner", "requests library, API keys, pagination, error handling"),
    ("flask_basics", "Flask Basics", "web_dev", "intermediate", "Routes, templates, request handling"),
    ("flask_forms", "Flask Forms & DB", "web_dev", "intermediate", "WTForms, SQLAlchemy, form validation"),
    ("flask_auth", "Flask Authentication", "web_dev", "intermediate", "Login, sessions, Flask-Login, password hashing"),
    ("django_basics", "Django Basics", "web_dev", "intermediate", "Project structure, settings, manage.py, apps"),
    ("django_models", "Django Models", "web_dev", "intermediate", "ORM, migrations, queries, relationships"),
    ("django_views", "Django Views & Templates", "web_dev", "intermediate", "Function/class views, URL routing, Jinja"),
    ("django_forms", "Django Forms & Auth", "web_dev", "intermediate", "ModelForm, user registration, auth system"),
    ("django_rest", "Django REST Framework", "web_dev", "intermediate", "Serializers, ViewSets, routers, permissions"),
    ("fastapi_basics", "FastAPI Basics", "web_dev", "intermediate", "Async routes, auto-docs, Pydantic models"),
    ("fastapi_crud", "FastAPI CRUD", "web_dev", "intermediate", "Full CRUD API with database integration"),
    ("fastapi_auth", "FastAPI Authentication", "web_dev", "intermediate", "JWT, OAuth2, dependency injection"),
    ("html_css", "HTML & CSS Basics", "web_dev", "beginner", "HTML structure, CSS selectors, box model"),
    ("javascript_basics", "JavaScript for Python Devs", "web_dev", "intermediate", "JS fundamentals from a Python perspective"),
    ("websockets", "WebSockets", "web_dev", "intermediate", "Real-time bidirectional communication"),
    ("deployment", "Deployment", "web_dev", "intermediate", "WSGI/ASGI, Gunicorn, Nginx, cloud hosting"),
    ("docker", "Docker for Python", "web_dev", "intermediate", "Dockerfile, compose, containerization"),
    ("sql_basics", "SQL Basics", "web_dev", "beginner", "SELECT, INSERT, UPDATE, DELETE, JOINs"),
    ("orm_concepts", "ORM Concepts", "web_dev", "intermediate", "Object-relational mapping, SQLAlchemy basics"),
    ("api_design", "API Design", "web_dev", "intermediate", "Versioning, pagination, error responses, documentation"),
    ("authentication_concepts", "Authentication Concepts", "web_dev", "intermediate", "Sessions, JWT, OAuth, password security"),
    ("web_security", "Web Security", "web_dev", "intermediate", "XSS, CSRF, SQL injection, CORS, HTTPS"),
    ("templating", "Templating", "web_dev", "beginner", "Jinja2, template inheritance, filters"),
    ("web_scraping", "Web Scraping", "web_dev", "intermediate", "requests + BeautifulSoup, Scrapy, ethical scraping"),

    # ── data_science (~25 concepts) ─────────────────────────────────────
    ("numpy_basics", "NumPy Basics", "data_science", "intermediate", "Arrays, operations, broadcasting"),
    ("numpy_linalg", "NumPy Linear Algebra", "data_science", "intermediate", "Matrix operations, dot product, eigenvalues"),
    ("pandas_basics", "Pandas Basics", "data_science", "intermediate", "DataFrames, Series, indexing, filtering"),
    ("pandas_grouping", "Pandas Grouping", "data_science", "intermediate", "groupby, aggregation, pivot tables"),
    ("pandas_merging", "Pandas Merging", "data_science", "intermediate", "merge, join, concat, reshaping"),
    ("data_cleaning", "Data Cleaning", "data_science", "intermediate", "Missing values, outliers, encoding, normalization"),
    ("data_visualization", "Data Visualization", "data_science", "intermediate", "Matplotlib, Seaborn, plot types"),
    ("matplotlib_basics", "Matplotlib Basics", "data_science", "intermediate", "Figure, Axes, plot, scatter, bar, histogram"),
    ("seaborn_basics", "Seaborn", "data_science", "intermediate", "Statistical plots, themes, pair plots"),
    ("statistics_basics", "Statistics Basics", "data_science", "intermediate", "Mean, median, std, distributions, correlation"),
    ("feature_engineering", "Feature Engineering", "data_science", "intermediate", "Feature creation, selection, polynomial features"),
    ("data_pipelines", "Data Pipelines", "data_science", "intermediate", "ETL, data flow, transformation chains"),
    ("exploratory_analysis", "Exploratory Data Analysis", "data_science", "intermediate", "EDA techniques, profiling, patterns"),

    # ── ai_ml (~30 concepts) ────────────────────────────────────────────
    ("ml_fundamentals", "ML Fundamentals", "ai_ml", "intermediate", "Supervised vs unsupervised vs reinforcement"),
    ("ml_workflow", "ML Workflow", "ai_ml", "intermediate", "Data → preprocess → train → evaluate → deploy"),
    ("train_test_split", "Train/Test Split", "ai_ml", "intermediate", "Splitting data, cross-validation, stratification"),
    ("linear_regression", "Linear Regression", "ai_ml", "intermediate", "OLS, gradient descent, cost function"),
    ("logistic_regression", "Logistic Regression", "ai_ml", "intermediate", "Binary classification, sigmoid, decision boundary"),
    ("decision_trees", "Decision Trees", "ai_ml", "intermediate", "Splitting criteria, pruning, visualization"),
    ("random_forests", "Random Forests", "ai_ml", "intermediate", "Ensemble methods, bagging, feature importance"),
    ("svm", "Support Vector Machines", "ai_ml", "advanced", "Support vectors, kernels, margin maximization"),
    ("knn", "K-Nearest Neighbors", "ai_ml", "intermediate", "Distance metrics, k selection, curse of dimensionality"),
    ("naive_bayes", "Naive Bayes", "ai_ml", "intermediate", "Bayes theorem, text classification, conditional probability"),
    ("clustering_kmeans", "K-Means Clustering", "ai_ml", "intermediate", "Centroid-based clustering, elbow method, silhouette"),
    ("clustering_advanced", "Advanced Clustering", "ai_ml", "advanced", "DBSCAN, hierarchical, Gaussian mixture models"),
    ("dimensionality_reduction", "Dimensionality Reduction", "ai_ml", "advanced", "PCA, t-SNE, UMAP"),
    ("model_evaluation", "Model Evaluation", "ai_ml", "intermediate", "Accuracy, precision, recall, F1, ROC-AUC, confusion matrix"),
    ("hyperparameter_tuning", "Hyperparameter Tuning", "ai_ml", "intermediate", "GridSearch, RandomSearch, Bayesian optimization"),
    ("sklearn_pipelines", "sklearn Pipelines", "ai_ml", "intermediate", "Pipeline, ColumnTransformer, end-to-end workflows"),
    ("model_deployment", "Model Deployment", "ai_ml", "advanced", "pickle, joblib, FastAPI serving, MLflow"),
    ("bias_variance", "Bias-Variance Tradeoff", "ai_ml", "intermediate", "Underfitting, overfitting, generalization"),
    ("ensemble_methods", "Ensemble Methods", "ai_ml", "intermediate", "Bagging, boosting, stacking, voting"),
    ("gradient_boosting", "Gradient Boosting", "ai_ml", "advanced", "XGBoost, LightGBM, CatBoost"),

    # ── deep_learning (~35 concepts) ────────────────────────────────────
    ("perceptron", "Perceptron", "deep_learning", "intermediate", "Single neuron, weights, bias, activation"),
    ("multilayer_network", "Multilayer Networks", "deep_learning", "intermediate", "Hidden layers, network architecture, depth"),
    ("activation_functions", "Activation Functions", "deep_learning", "intermediate", "ReLU, sigmoid, tanh, softmax, leaky ReLU"),
    ("forward_pass", "Forward Pass", "deep_learning", "intermediate", "Matrix multiplication, layer-by-layer computation"),
    ("loss_functions", "Loss Functions", "deep_learning", "intermediate", "MSE, cross-entropy, custom losses"),
    ("backpropagation", "Backpropagation", "deep_learning", "intermediate", "Chain rule, gradient computation, weight updates"),
    ("gradient_descent_dl", "Gradient Descent (DL)", "deep_learning", "intermediate", "SGD, momentum, Adam, learning rate scheduling"),
    ("regularization_dl", "Regularization (DL)", "deep_learning", "intermediate", "Dropout, L1/L2, batch norm, early stopping"),
    ("pytorch_basics", "PyTorch Basics", "deep_learning", "intermediate", "Tensors, autograd, nn.Module, device management"),
    ("pytorch_training", "PyTorch Training", "deep_learning", "intermediate", "DataLoader, training loop, optimizer, loss tracking"),
    ("cnn_basics", "CNN Basics", "deep_learning", "intermediate", "Convolution, filters, feature maps, stride, padding"),
    ("cnn_architectures", "CNN Architectures", "deep_learning", "advanced", "LeNet, VGG, ResNet, architecture design principles"),
    ("image_classification", "Image Classification", "deep_learning", "intermediate", "End-to-end CNN image classifier"),
    ("transfer_learning", "Transfer Learning", "deep_learning", "intermediate", "Pre-trained models, fine-tuning, feature extraction"),
    ("rnn_basics", "RNN Basics", "deep_learning", "intermediate", "Sequential data, hidden state, vanishing gradients"),
    ("lstm_gru", "LSTM & GRU", "deep_learning", "advanced", "Long short-term memory, gated recurrent units"),
    ("text_generation", "Text Generation", "deep_learning", "advanced", "Character-level RNN, temperature, sampling"),
    ("attention_mechanism", "Attention Mechanism", "deep_learning", "advanced", "Attention scores, self-attention, Q/K/V"),
    ("transformer_architecture", "Transformer Architecture", "deep_learning", "advanced", "Encoder-decoder, multi-head attention, positional encoding"),
    ("bert_gpt", "BERT & GPT Concepts", "deep_learning", "advanced", "Pre-training, fine-tuning, masked LM vs autoregressive"),
    ("gan_basics", "GAN Basics", "deep_learning", "advanced", "Generator, discriminator, adversarial training"),
    ("gan_image", "GAN Image Generation", "deep_learning", "advanced", "DCGAN, training tricks, mode collapse"),
    ("autoencoders", "Autoencoders", "deep_learning", "advanced", "Encoder-decoder, latent space, VAE"),
    ("model_optimization", "Model Optimization", "deep_learning", "advanced", "Quantization, pruning, ONNX, TensorRT"),
    ("dl_project", "DL End-to-End Project", "deep_learning", "advanced", "Dataset → model → training → evaluation → deployment"),

    # ── devops (~20 concepts) ───────────────────────────────────────────
    ("testing_fundamentals", "Testing Fundamentals", "devops", "intermediate", "Why test, test types, test pyramid"),
    ("pytest_basics", "pytest Basics", "devops", "intermediate", "Test functions, assertions, fixtures, parametrize"),
    ("pytest_advanced", "pytest Advanced", "devops", "intermediate", "Mocking, monkeypatch, conftest, plugins"),
    ("tdd", "Test-Driven Development", "devops", "intermediate", "Red-green-refactor, test-first workflow"),
    ("ci_cd_basics", "CI/CD Basics", "devops", "intermediate", "Continuous integration, GitHub Actions, pipelines"),
    ("ci_cd_python", "CI/CD for Python", "devops", "intermediate", "Linting, testing, building, deploying Python projects"),
    ("docker_basics", "Docker Fundamentals", "devops", "intermediate", "Images, containers, Dockerfile, volumes, networking"),
    ("docker_compose", "Docker Compose", "devops", "intermediate", "Multi-container apps, services, environment vars"),
    ("packaging", "Python Packaging", "devops", "intermediate", "setup.py, pyproject.toml, PyPI publishing"),
    ("git_basics", "Git Basics", "devops", "beginner", "init, add, commit, push, pull, branches"),
    ("git_workflows", "Git Workflows", "devops", "intermediate", "Feature branches, PRs, rebasing, merge strategies"),
    ("logging", "Logging", "devops", "intermediate", "logging module, levels, structured logging, handlers"),
    ("code_quality", "Code Quality", "devops", "intermediate", "Linters, formatters, type checkers, pre-commit hooks"),
    ("virtual_envs", "Virtual Environments", "devops", "beginner", "venv, pip, requirements.txt, dependency isolation"),

    # ── automation (~15 concepts) ───────────────────────────────────────
    ("file_automation", "File Automation", "automation", "beginner", "Organizing, renaming, copying files with Python"),
    ("web_scraping_auto", "Web Scraping", "automation", "intermediate", "requests + BeautifulSoup for data extraction"),
    ("email_automation", "Email Automation", "automation", "intermediate", "smtplib, MIME, sending personalized emails"),
    ("pdf_automation", "PDF Automation", "automation", "intermediate", "PyPDF2, reading, merging, creating PDFs"),
    ("excel_automation", "Excel Automation", "automation", "intermediate", "openpyxl, reading/writing spreadsheets"),
    ("cli_tools", "CLI Tools", "automation", "intermediate", "argparse, click, building command-line applications"),
    ("task_scheduling", "Task Scheduling", "automation", "intermediate", "schedule, cron, APScheduler, periodic tasks"),
    ("browser_automation", "Browser Automation", "automation", "intermediate", "Selenium, Playwright, web interaction"),
    ("api_automation", "API Automation", "automation", "intermediate", "Automating API calls, webhooks, integrations"),
    ("password_generation", "Password Generation", "automation", "beginner", "secrets module, random strings, strength scoring"),
    ("data_backup", "Data Backup Scripts", "automation", "beginner", "Automating file backups with shutil and scheduling"),

    # ── dsa (~25 concepts) ──────────────────────────────────────────────
    ("big_o", "Big O Notation", "dsa", "intermediate", "Time and space complexity analysis"),
    ("arrays", "Arrays & Strings", "dsa", "intermediate", "Array operations, string algorithms, two pointers"),
    ("linked_lists", "Linked Lists", "dsa", "intermediate", "Singly/doubly linked, insertion, deletion, reversal"),
    ("stacks", "Stacks", "dsa", "intermediate", "LIFO, push/pop, applications, call stack"),
    ("queues", "Queues", "dsa", "intermediate", "FIFO, deque, priority queue, BFS"),
    ("hash_tables", "Hash Tables", "dsa", "intermediate", "Hashing, collision handling, dict internals"),
    ("binary_trees", "Binary Trees", "dsa", "intermediate", "Tree structure, traversals (in/pre/post-order)"),
    ("bst", "Binary Search Trees", "dsa", "intermediate", "BST operations, search, insert, delete, balancing"),
    ("heaps", "Heaps", "dsa", "intermediate", "Min/max heap, heapq, heap sort, priority queue"),
    ("graphs", "Graphs", "dsa", "intermediate", "Adjacency list/matrix, BFS, DFS"),
    ("graphs_advanced", "Advanced Graphs", "dsa", "advanced", "Dijkstra, topological sort, cycle detection, MST"),
    ("sorting_basic", "Basic Sorting", "dsa", "intermediate", "Bubble, selection, insertion sort"),
    ("sorting_advanced", "Advanced Sorting", "dsa", "advanced", "Merge sort, quicksort, timsort, radix sort"),
    ("binary_search", "Binary Search", "dsa", "intermediate", "Search in sorted arrays, bisect module"),
    ("recursion_dsa", "Recursion (DSA)", "dsa", "intermediate", "Recursive thinking, call stack, base cases"),
    ("dynamic_programming", "Dynamic Programming", "dsa", "advanced", "Memoization, tabulation, common patterns"),
    ("greedy_algorithms", "Greedy Algorithms", "dsa", "advanced", "Greedy strategy, interval scheduling, activity selection"),
    ("string_algorithms", "String Algorithms", "dsa", "advanced", "Pattern matching, KMP, anagrams, palindromes"),
    ("sliding_window", "Sliding Window", "dsa", "intermediate", "Fixed and variable window, max subarray"),
    ("two_pointers", "Two Pointers", "dsa", "intermediate", "Left/right pointers, fast/slow, sorted array tricks"),

    # ── ai_dev (~20 concepts) ───────────────────────────────────────────
    ("what_is_ai", "What is AI", "ai_dev", "beginner", "AI history, types (narrow, general), current landscape"),
    ("prompt_engineering", "Prompt Engineering", "ai_dev", "beginner", "Zero-shot, few-shot, chain-of-thought prompting"),
    ("prompt_advanced", "Advanced Prompting", "ai_dev", "intermediate", "System prompts, temperature, structured output, guardrails"),
    ("llm_concepts", "LLM Concepts", "ai_dev", "intermediate", "Tokens, embeddings, attention, transformer overview"),
    ("openai_api", "OpenAI API", "ai_dev", "intermediate", "Chat completions, streaming, function calling"),
    ("anthropic_api", "Anthropic API", "ai_dev", "intermediate", "Claude API, messages, tool use, system prompts"),
    ("langchain_basics", "LangChain Basics", "ai_dev", "intermediate", "Chains, prompts, output parsers, memory"),
    ("langchain_agents", "LangChain Agents", "ai_dev", "intermediate", "Tools, agent types, ReAct pattern, custom tools"),
    ("rag", "RAG", "ai_dev", "intermediate", "Retrieval augmented generation, chunking, retrieval"),
    ("embeddings", "Embeddings", "ai_dev", "intermediate", "Text embeddings, cosine similarity, semantic search"),
    ("vector_databases", "Vector Databases", "ai_dev", "intermediate", "ChromaDB, Pinecone, FAISS, indexing strategies"),
    ("chatbot_building", "Building Chatbots", "ai_dev", "intermediate", "Conversation memory, context management, persona"),
    ("ai_code_assistants", "AI Code Assistants", "ai_dev", "beginner", "Claude Code, Cursor, Copilot, AI-assisted development"),
    ("structured_output", "Structured Output", "ai_dev", "intermediate", "JSON mode, function calling, Pydantic + LLMs"),
    ("multimodal_ai", "Multi-Modal AI", "ai_dev", "intermediate", "Vision APIs, image + text, document understanding"),
    ("ai_safety", "AI Safety & Ethics", "ai_dev", "beginner", "Bias, hallucination, responsible AI practices"),
    ("fine_tuning", "Fine-Tuning", "ai_dev", "advanced", "When to fine-tune, data prep, LoRA, PEFT"),
    ("ai_deployment", "AI App Deployment", "ai_dev", "intermediate", "Serving models, API wrappers, cost optimization"),
    ("ai_evaluation", "AI Evaluation", "ai_dev", "intermediate", "Benchmarking, human eval, automated scoring"),
    ("agent_frameworks", "Agent Frameworks", "ai_dev", "advanced", "Multi-agent systems, tool use, planning patterns"),
]


# ─── CONCEPT EDGES ─────────────────────────────────────────────────────────
# (from_concept, to_concept, relationship, weight)
# weight: 1.0 = hard prereq, 0.7 = strong recommendation, 0.3 = loosely related

CONCEPT_EDGES = [
    # Python Core progression
    ("variables", "data_types", "requires", 1.0),
    ("data_types", "type_conversion", "requires", 1.0),
    ("variables", "operators", "requires", 1.0),
    ("variables", "string_basics", "requires", 1.0),
    ("string_basics", "string_methods", "requires", 1.0),
    ("string_basics", "string_formatting", "requires", 1.0),
    ("operators", "conditionals", "requires", 1.0),
    ("conditionals", "boolean_logic", "requires", 0.7),
    ("conditionals", "for_loops", "requires", 1.0),
    ("for_loops", "while_loops", "requires", 0.7),
    ("for_loops", "loop_control", "requires", 0.7),
    ("variables", "lists", "requires", 1.0),
    ("lists", "list_methods", "requires", 1.0),
    ("lists", "list_slicing", "requires", 1.0),
    ("lists", "tuples", "requires", 0.7),
    ("variables", "dictionaries", "requires", 1.0),
    ("dictionaries", "dict_methods", "requires", 1.0),
    ("lists", "sets", "requires", 0.7),
    ("lists", "nested_structures", "requires", 0.7),
    ("dictionaries", "nested_structures", "requires", 0.7),
    ("for_loops", "functions_basics", "requires", 1.0),
    ("functions_basics", "function_arguments", "requires", 1.0),
    ("functions_basics", "return_values", "requires", 1.0),
    ("functions_basics", "scope", "requires", 0.7),
    ("scope", "closures", "requires", 1.0),
    ("functions_basics", "lambda_functions", "requires", 0.7),
    ("for_loops", "list_comprehension", "requires", 1.0),
    ("lists", "list_comprehension", "requires", 1.0),
    ("list_comprehension", "dict_comprehension", "requires", 0.7),
    ("list_comprehension", "set_comprehension", "requires", 0.7),
    ("list_comprehension", "generators", "requires", 0.7),
    ("generators", "generator_expressions", "requires", 1.0),
    ("functions_basics", "decorators", "requires", 1.0),
    ("closures", "decorators", "requires", 0.7),
    ("decorators", "decorator_patterns", "requires", 1.0),
    ("functions_basics", "classes_basics", "requires", 1.0),
    ("classes_basics", "inheritance", "requires", 1.0),
    ("classes_basics", "composition", "requires", 0.7),
    ("classes_basics", "magic_methods", "requires", 1.0),
    ("classes_basics", "class_methods", "requires", 0.7),
    ("classes_basics", "properties", "requires", 0.7),
    ("inheritance", "abstract_classes", "requires", 0.7),
    ("abstract_classes", "design_patterns", "requires", 0.7),
    ("functions_basics", "context_managers", "requires", 0.7),
    ("conditionals", "error_handling", "requires", 1.0),
    ("error_handling", "custom_exceptions", "requires", 0.7),
    ("variables", "file_reading", "requires", 1.0),
    ("file_reading", "file_writing", "requires", 1.0),
    ("functions_basics", "modules_imports", "requires", 0.7),
    ("functions_basics", "type_hints", "requires", 0.7),
    ("classes_basics", "dataclasses", "requires", 0.7),
    ("functions_basics", "async_basics", "requires", 0.7),
    ("generators", "async_basics", "requires", 0.7),
    ("async_basics", "async_advanced", "requires", 1.0),
    ("functions_basics", "threading", "requires", 0.7),
    ("threading", "multiprocessing", "requires", 0.7),
    ("functions_basics", "recursion", "requires", 1.0),
    ("recursion", "memoization", "requires", 1.0),
    ("generators", "iterators", "requires", 0.7),
    ("classes_basics", "metaclasses", "requires", 0.7),

    # Stdlib edges
    ("file_reading", "pathlib", "requires", 0.7),
    ("variables", "datetime_module", "requires", 0.7),
    ("string_basics", "regex", "requires", 1.0),
    ("regex", "regex_advanced", "requires", 1.0),
    ("dictionaries", "json_module", "requires", 0.7),
    ("file_reading", "csv_module", "requires", 0.7),
    ("lists", "collections_module", "requires", 0.7),
    ("for_loops", "itertools_module", "requires", 0.7),
    ("decorators", "functools_module", "requires", 0.7),
    ("file_reading", "os_module", "requires", 0.7),
    ("error_handling", "logging_module", "requires", 0.7),
    ("functions_basics", "argparse_module", "requires", 0.7),
    ("file_reading", "sqlite3_module", "requires", 0.7),
    ("functions_basics", "unittest_module", "requires", 0.7),
    ("context_managers", "contextlib_module", "requires", 1.0),
    ("dataclasses", "dataclasses_module", "requires", 1.0),

    # Web dev progression
    ("http_fundamentals", "rest_api", "requires", 1.0),
    ("rest_api", "api_consumption", "requires", 1.0),
    ("dictionaries", "http_fundamentals", "requires", 0.7),
    ("json_module", "rest_api", "requires", 0.7),
    ("functions_basics", "flask_basics", "requires", 1.0),
    ("flask_basics", "flask_forms", "requires", 1.0),
    ("flask_forms", "flask_auth", "requires", 1.0),
    ("functions_basics", "django_basics", "requires", 1.0),
    ("django_basics", "django_models", "requires", 1.0),
    ("django_models", "django_views", "requires", 1.0),
    ("django_views", "django_forms", "requires", 1.0),
    ("django_models", "django_rest", "requires", 1.0),
    ("async_basics", "fastapi_basics", "requires", 0.7),
    ("type_hints", "fastapi_basics", "requires", 0.7),
    ("fastapi_basics", "fastapi_crud", "requires", 1.0),
    ("fastapi_crud", "fastapi_auth", "requires", 1.0),
    ("http_fundamentals", "html_css", "requires", 0.7),
    ("http_fundamentals", "websockets", "requires", 0.7),
    ("flask_basics", "deployment", "requires", 0.7),
    ("deployment", "docker", "requires", 0.7),
    ("sql_basics", "orm_concepts", "requires", 1.0),
    ("rest_api", "api_design", "requires", 0.7),
    ("flask_auth", "authentication_concepts", "requires", 0.7),
    ("http_fundamentals", "web_security", "requires", 0.7),
    ("html_css", "templating", "requires", 0.7),
    ("api_consumption", "web_scraping", "requires", 0.7),

    # Data science progression
    ("lists", "numpy_basics", "requires", 1.0),
    ("numpy_basics", "numpy_linalg", "requires", 0.7),
    ("numpy_basics", "pandas_basics", "requires", 1.0),
    ("pandas_basics", "pandas_grouping", "requires", 1.0),
    ("pandas_basics", "pandas_merging", "requires", 1.0),
    ("pandas_basics", "data_cleaning", "requires", 1.0),
    ("pandas_basics", "data_visualization", "requires", 0.7),
    ("data_visualization", "matplotlib_basics", "requires", 1.0),
    ("matplotlib_basics", "seaborn_basics", "requires", 0.7),
    ("numpy_basics", "statistics_basics", "requires", 0.7),
    ("data_cleaning", "feature_engineering", "requires", 1.0),
    ("pandas_basics", "exploratory_analysis", "requires", 0.7),

    # ML progression
    ("statistics_basics", "ml_fundamentals", "requires", 0.7),
    ("numpy_basics", "ml_fundamentals", "requires", 0.7),
    ("ml_fundamentals", "ml_workflow", "requires", 1.0),
    ("ml_workflow", "train_test_split", "requires", 1.0),
    ("train_test_split", "linear_regression", "requires", 1.0),
    ("linear_regression", "logistic_regression", "requires", 1.0),
    ("logistic_regression", "decision_trees", "requires", 0.7),
    ("decision_trees", "random_forests", "requires", 1.0),
    ("logistic_regression", "svm", "requires", 0.7),
    ("ml_fundamentals", "knn", "requires", 0.7),
    ("statistics_basics", "naive_bayes", "requires", 0.7),
    ("ml_fundamentals", "clustering_kmeans", "requires", 0.7),
    ("clustering_kmeans", "clustering_advanced", "requires", 1.0),
    ("numpy_linalg", "dimensionality_reduction", "requires", 0.7),
    ("train_test_split", "model_evaluation", "requires", 1.0),
    ("model_evaluation", "hyperparameter_tuning", "requires", 1.0),
    ("hyperparameter_tuning", "sklearn_pipelines", "requires", 0.7),
    ("sklearn_pipelines", "model_deployment", "requires", 1.0),
    ("model_evaluation", "bias_variance", "requires", 0.7),
    ("random_forests", "ensemble_methods", "requires", 0.7),
    ("ensemble_methods", "gradient_boosting", "requires", 1.0),

    # Deep learning progression
    ("linear_regression", "perceptron", "requires", 0.7),
    ("numpy_basics", "perceptron", "requires", 0.7),
    ("perceptron", "multilayer_network", "requires", 1.0),
    ("multilayer_network", "activation_functions", "requires", 1.0),
    ("activation_functions", "forward_pass", "requires", 1.0),
    ("forward_pass", "loss_functions", "requires", 1.0),
    ("loss_functions", "backpropagation", "requires", 1.0),
    ("backpropagation", "gradient_descent_dl", "requires", 1.0),
    ("gradient_descent_dl", "regularization_dl", "requires", 0.7),
    ("multilayer_network", "pytorch_basics", "requires", 0.7),
    ("pytorch_basics", "pytorch_training", "requires", 1.0),
    ("forward_pass", "cnn_basics", "requires", 0.7),
    ("cnn_basics", "cnn_architectures", "requires", 1.0),
    ("cnn_basics", "image_classification", "requires", 1.0),
    ("cnn_architectures", "transfer_learning", "requires", 1.0),
    ("forward_pass", "rnn_basics", "requires", 0.7),
    ("rnn_basics", "lstm_gru", "requires", 1.0),
    ("lstm_gru", "text_generation", "requires", 0.7),
    ("forward_pass", "attention_mechanism", "requires", 0.7),
    ("attention_mechanism", "transformer_architecture", "requires", 1.0),
    ("transformer_architecture", "bert_gpt", "requires", 1.0),
    ("multilayer_network", "gan_basics", "requires", 0.7),
    ("gan_basics", "gan_image", "requires", 1.0),
    ("multilayer_network", "autoencoders", "requires", 0.7),
    ("pytorch_training", "model_optimization", "requires", 0.7),
    ("pytorch_training", "dl_project", "requires", 0.7),

    # DevOps progression
    ("functions_basics", "testing_fundamentals", "requires", 0.7),
    ("testing_fundamentals", "pytest_basics", "requires", 1.0),
    ("pytest_basics", "pytest_advanced", "requires", 1.0),
    ("pytest_basics", "tdd", "requires", 0.7),
    ("testing_fundamentals", "ci_cd_basics", "requires", 0.7),
    ("ci_cd_basics", "ci_cd_python", "requires", 1.0),
    ("deployment", "docker_basics", "requires", 0.7),
    ("docker_basics", "docker_compose", "requires", 1.0),
    ("modules_imports", "packaging", "requires", 0.7),
    ("modules_imports", "virtual_envs", "requires", 0.7),

    # Automation progression
    ("file_reading", "file_automation", "requires", 1.0),
    ("pathlib", "file_automation", "requires", 0.7),
    ("api_consumption", "web_scraping_auto", "requires", 0.7),
    ("for_loops", "email_automation", "requires", 0.7),
    ("file_reading", "pdf_automation", "requires", 0.7),
    ("file_reading", "excel_automation", "requires", 0.7),
    ("argparse_module", "cli_tools", "requires", 0.7),
    ("web_scraping_auto", "browser_automation", "requires", 0.7),
    ("random_module", "password_generation", "requires", 0.7),
    ("secrets_module", "password_generation", "requires", 0.7),

    # DSA progression
    ("for_loops", "big_o", "requires", 0.7),
    ("lists", "arrays", "requires", 1.0),
    ("classes_basics", "linked_lists", "requires", 0.7),
    ("lists", "stacks", "requires", 0.7),
    ("lists", "queues", "requires", 0.7),
    ("dictionaries", "hash_tables", "requires", 1.0),
    ("recursion", "binary_trees", "requires", 1.0),
    ("binary_trees", "bst", "requires", 1.0),
    ("binary_trees", "heaps", "requires", 0.7),
    ("lists", "graphs", "requires", 0.7),
    ("dictionaries", "graphs", "requires", 0.7),
    ("graphs", "graphs_advanced", "requires", 1.0),
    ("for_loops", "sorting_basic", "requires", 1.0),
    ("recursion", "sorting_advanced", "requires", 1.0),
    ("lists", "binary_search", "requires", 1.0),
    ("functions_basics", "recursion_dsa", "requires", 1.0),
    ("recursion_dsa", "dynamic_programming", "requires", 1.0),
    ("big_o", "greedy_algorithms", "requires", 0.7),
    ("string_basics", "string_algorithms", "requires", 0.7),
    ("arrays", "sliding_window", "requires", 0.7),
    ("arrays", "two_pointers", "requires", 0.7),

    # AI dev progression
    ("what_is_ai", "prompt_engineering", "requires", 1.0),
    ("prompt_engineering", "prompt_advanced", "requires", 1.0),
    ("prompt_engineering", "llm_concepts", "requires", 0.7),
    ("llm_concepts", "openai_api", "requires", 0.7),
    ("llm_concepts", "anthropic_api", "requires", 0.7),
    ("openai_api", "langchain_basics", "requires", 0.7),
    ("langchain_basics", "langchain_agents", "requires", 1.0),
    ("llm_concepts", "rag", "requires", 1.0),
    ("llm_concepts", "embeddings", "requires", 1.0),
    ("embeddings", "vector_databases", "requires", 1.0),
    ("langchain_basics", "chatbot_building", "requires", 0.7),
    ("prompt_engineering", "ai_code_assistants", "requires", 0.7),
    ("openai_api", "structured_output", "requires", 0.7),
    ("llm_concepts", "multimodal_ai", "requires", 0.7),
    ("what_is_ai", "ai_safety", "requires", 0.7),
    ("llm_concepts", "fine_tuning", "requires", 0.7),
    ("openai_api", "ai_deployment", "requires", 0.7),
    ("langchain_agents", "agent_frameworks", "requires", 1.0),

    # Cross-domain edges
    ("bert_gpt", "llm_concepts", "related_to", 0.3),
    ("sklearn_pipelines", "ml_workflow", "related_to", 0.3),
    ("fastapi_basics", "ai_deployment", "related_to", 0.3),
    ("docker", "model_deployment", "related_to", 0.3),
    ("pytest_basics", "tdd", "related_to", 0.3),
]


def seed_concepts(db_path: str):
    """Insert all concepts and edges into the database. Idempotent via INSERT OR IGNORE."""
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    # Insert concepts
    cursor.executemany(
        "INSERT OR IGNORE INTO concepts (id, name, category, difficulty, description) VALUES (?, ?, ?, ?, ?)",
        CONCEPTS,
    )

    # Insert edges
    cursor.executemany(
        "INSERT OR IGNORE INTO concept_edges (from_concept, to_concept, relationship, weight) VALUES (?, ?, ?, ?)",
        CONCEPT_EDGES,
    )

    conn.commit()
    conn.close()
    print(f"Seeded {len(CONCEPTS)} concepts and {len(CONCEPT_EDGES)} edges")
```

- [ ] **Step 3: Verify seed runs without errors**

Run: `cd backend && python -c "from graph.concepts import seed_concepts; seed_concepts('pymasters.db')"`
Expected: "Seeded 297 concepts and 213 edges"

- [ ] **Step 4: Commit**

```bash
git add backend/graph/__init__.py backend/graph/concepts.py
git commit -m "feat: add knowledge graph seed data — 297 concepts, 213 edges"
```

---

### Task 3: Create Graph Query Module

**Files:**
- Create: `backend/graph/edges.py`
- Create: `backend/graph/queries.py`

- [ ] **Step 1: Create edges.py — edge management utilities**

```python
"""
graph/edges.py — Edge management and prerequisite queries.
"""

import sqlite3


def get_prerequisites(db_path: str, concept_id: str) -> list[dict]:
    """Get all prerequisite concepts for a given concept."""
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    rows = conn.execute(
        """
        SELECT c.id, c.name, c.category, c.difficulty, ce.relationship, ce.weight
        FROM concept_edges ce
        JOIN concepts c ON c.id = ce.from_concept
        WHERE ce.to_concept = ?
        ORDER BY ce.weight DESC
        """,
        [concept_id],
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_dependents(db_path: str, concept_id: str) -> list[dict]:
    """Get all concepts that depend on a given concept."""
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    rows = conn.execute(
        """
        SELECT c.id, c.name, c.category, c.difficulty, ce.relationship, ce.weight
        FROM concept_edges ce
        JOIN concepts c ON c.id = ce.to_concept
        WHERE ce.from_concept = ?
        ORDER BY ce.weight DESC
        """,
        [concept_id],
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_lessons_for_concept(db_path: str, concept_id: str) -> list[dict]:
    """Get all lessons that teach, require, or reinforce a concept."""
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    rows = conn.execute(
        """
        SELECT lesson_id, role, depth
        FROM lesson_concepts
        WHERE concept_id = ?
        """,
        [concept_id],
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]
```

- [ ] **Step 2: Create queries.py — graph traversal for recommendations**

```python
"""
graph/queries.py — Graph traversal: learning frontier, gap detection, recommendations.
"""

import sqlite3


def get_user_mastery_map(db_path: str, user_id: str) -> dict[str, float]:
    """Return {concept_id: mastery_level} for a user, including 0.0 for untouched concepts."""
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row

    # Get all concepts
    all_concepts = conn.execute("SELECT id FROM concepts").fetchall()

    # Get user mastery from lesson_concepts + user_mastery
    mastery_rows = conn.execute(
        """
        SELECT lc.concept_id, MAX(um.mastery_level) as mastery
        FROM lesson_concepts lc
        LEFT JOIN user_mastery um ON um.topic = lc.concept_id AND um.user_id = ?
        WHERE lc.role = 'teaches'
        GROUP BY lc.concept_id
        """,
        [user_id],
    ).fetchall()
    conn.close()

    mastery_map = {r["id"]: 0.0 for r in all_concepts}
    for row in mastery_rows:
        if row["mastery"] is not None:
            mastery_map[row["concept_id"]] = row["mastery"]

    return mastery_map


def get_learning_frontier(db_path: str, user_id: str, limit: int = 5) -> list[dict]:
    """
    Find the next concepts a user should learn — concepts where:
    1. All prerequisites have mastery >= 0.5 (or no prerequisites)
    2. The concept itself has mastery < 0.5
    Sorted by: number of dependents (most impactful first)
    """
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row

    mastery_map = get_user_mastery_map(db_path, user_id)

    # Get all concepts with their prerequisite status
    all_concepts = conn.execute(
        "SELECT id, name, category, difficulty, description FROM concepts"
    ).fetchall()

    frontier = []
    for concept in all_concepts:
        cid = concept["id"]
        if mastery_map.get(cid, 0.0) >= 0.5:
            continue  # Already learned

        # Check prerequisites
        prereqs = conn.execute(
            "SELECT from_concept, weight FROM concept_edges WHERE to_concept = ? AND relationship = 'requires'",
            [cid],
        ).fetchall()

        prereqs_met = all(
            mastery_map.get(p["from_concept"], 0.0) >= 0.5 or p["weight"] < 0.7
            for p in prereqs
        )

        if prereqs_met:
            # Count dependents (how many concepts this unlocks)
            dependent_count = conn.execute(
                "SELECT COUNT(*) as cnt FROM concept_edges WHERE from_concept = ?", [cid]
            ).fetchone()["cnt"]

            frontier.append({
                **dict(concept),
                "mastery": mastery_map.get(cid, 0.0),
                "dependent_count": dependent_count,
            })

    conn.close()

    # Sort by impact (most dependents first), then by difficulty
    difficulty_order = {"beginner": 0, "intermediate": 1, "advanced": 2}
    frontier.sort(key=lambda c: (-c["dependent_count"], difficulty_order.get(c["difficulty"], 1)))

    return frontier[:limit]


def detect_knowledge_gaps(db_path: str, user_id: str, target_concept: str) -> list[dict]:
    """
    Find prerequisite concepts the user hasn't mastered yet for a target concept.
    Returns a list of gap concepts sorted by depth (deepest prereqs first).
    """
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row

    mastery_map = get_user_mastery_map(db_path, user_id)
    gaps = []
    visited = set()

    def _find_gaps(concept_id, depth=0):
        if concept_id in visited:
            return
        visited.add(concept_id)

        prereqs = conn.execute(
            "SELECT from_concept, weight FROM concept_edges WHERE to_concept = ? AND relationship = 'requires' AND weight >= 0.7",
            [concept_id],
        ).fetchall()

        for prereq in prereqs:
            pid = prereq["from_concept"]
            mastery = mastery_map.get(pid, 0.0)
            if mastery < 0.5:
                concept_info = conn.execute(
                    "SELECT id, name, category, difficulty FROM concepts WHERE id = ?", [pid]
                ).fetchone()
                if concept_info:
                    gaps.append({**dict(concept_info), "mastery": mastery, "depth": depth})
            _find_gaps(pid, depth + 1)

    _find_gaps(target_concept)
    conn.close()

    # Deepest gaps first (foundational missing knowledge)
    gaps.sort(key=lambda g: -g["depth"])
    return gaps


def get_full_knowledge_map(db_path: str, user_id: str) -> dict:
    """
    Return the full knowledge graph with user mastery overlaid.
    Used for the frontend KnowledgeMap visualization.
    """
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row

    mastery_map = get_user_mastery_map(db_path, user_id)

    concepts = conn.execute("SELECT id, name, category, difficulty FROM concepts").fetchall()
    edges = conn.execute("SELECT from_concept, to_concept, relationship, weight FROM concept_edges").fetchall()
    conn.close()

    nodes = []
    for c in concepts:
        nodes.append({
            **dict(c),
            "mastery": mastery_map.get(c["id"], 0.0),
        })

    return {
        "nodes": nodes,
        "edges": [dict(e) for e in edges],
    }
```

- [ ] **Step 3: Commit**

```bash
git add backend/graph/edges.py backend/graph/queries.py
git commit -m "feat: add knowledge graph query module — frontier, gaps, recommendations"
```

---

### Task 4: Wire Graph Seeding into App Startup

**Files:**
- Modify: `backend/main.py`

- [ ] **Step 1: Add graph seed call to init_db()**

Add after the test user seeding block (around line 310) but before `conn.commit()`:

```python
        # Seed knowledge graph concepts
        try:
            from graph.concepts import seed_concepts
            seed_concepts(DB_PATH)
        except Exception as e:
            print(f"Graph seed: {e}")
```

- [ ] **Step 2: Commit**

```bash
git add backend/main.py
git commit -m "feat: seed knowledge graph on app startup"
```

---

### Task 5: Create Graph & Messages API Routes

**Files:**
- Create: `backend/routes/graph.py`
- Create: `backend/routes/messages.py`
- Modify: `backend/main.py` (add route imports)

- [ ] **Step 1: Create graph.py API router**

```python
"""
graph.py — FastAPI APIRouter for knowledge graph endpoints.

Prefix: /api/graph
"""

import os
from fastapi import APIRouter
from graph.queries import get_learning_frontier, get_full_knowledge_map, detect_knowledge_gaps
from graph.edges import get_prerequisites, get_dependents, get_lessons_for_concept

router = APIRouter(prefix="/api/graph", tags=["graph"])

DB_PATH = os.getenv("DB_PATH", os.path.abspath("pymasters.db"))


@router.get("/concepts")
def list_concepts():
    """List all concepts with category and difficulty."""
    import sqlite3
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    rows = conn.execute("SELECT id, name, category, difficulty, description FROM concepts ORDER BY category, difficulty").fetchall()
    conn.close()
    return {"concepts": [dict(r) for r in rows]}


@router.get("/concepts/{concept_id}")
def get_concept(concept_id: str):
    """Get a concept with its edges and related lessons."""
    import sqlite3
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    concept = conn.execute("SELECT * FROM concepts WHERE id = ?", [concept_id]).fetchone()
    conn.close()

    if not concept:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail=f"Concept '{concept_id}' not found")

    return {
        "concept": dict(concept),
        "prerequisites": get_prerequisites(DB_PATH, concept_id),
        "dependents": get_dependents(DB_PATH, concept_id),
        "lessons": get_lessons_for_concept(DB_PATH, concept_id),
    }


@router.get("/user-map/{user_id}")
def user_knowledge_map(user_id: str):
    """Get the full knowledge map with user mastery overlay."""
    return get_full_knowledge_map(DB_PATH, user_id)


@router.get("/recommendations/{user_id}")
def recommendations(user_id: str, limit: int = 5):
    """Get top recommended concepts based on current mastery."""
    return {"recommendations": get_learning_frontier(DB_PATH, user_id, limit)}


@router.get("/gaps/{user_id}/{target_concept}")
def knowledge_gaps(user_id: str, target_concept: str):
    """Find prerequisite gaps for a target concept."""
    return {"gaps": detect_knowledge_gaps(DB_PATH, user_id, target_concept)}
```

- [ ] **Step 2: Create messages.py API router**

```python
"""
messages.py — FastAPI APIRouter for Vaathiyaar proactive messages.

Prefix: /api/messages
"""

import os
import sqlite3
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional

router = APIRouter(prefix="/api/messages", tags=["messages"])

DB_PATH = os.getenv("DB_PATH", os.path.abspath("pymasters.db"))


@router.get("/pending/{user_id}")
def get_pending_messages(user_id: str):
    """Get all undelivered, undismissed proactive messages for a user."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    rows = conn.execute(
        """
        SELECT id, message, message_type, action_data, created_at
        FROM pending_vaathiyaar_messages
        WHERE user_id = ? AND delivered = 0 AND dismissed = 0
        ORDER BY created_at DESC
        """,
        [user_id],
    ).fetchall()
    conn.close()

    # Mark as delivered
    if rows:
        conn = sqlite3.connect(DB_PATH)
        conn.execute(
            "UPDATE pending_vaathiyaar_messages SET delivered = 1 WHERE user_id = ? AND delivered = 0 AND dismissed = 0",
            [user_id],
        )
        conn.commit()
        conn.close()

    return {"messages": [dict(r) for r in rows]}


@router.post("/{message_id}/dismiss")
def dismiss_message(message_id: int):
    """Mark a proactive message as dismissed."""
    conn = sqlite3.connect(DB_PATH)
    result = conn.execute(
        "UPDATE pending_vaathiyaar_messages SET dismissed = 1 WHERE id = ?", [message_id]
    )
    conn.commit()
    conn.close()
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Message not found")
    return {"success": True}


class MessageAction(BaseModel):
    action: str  # start_now, add_to_path


@router.post("/{message_id}/action")
def message_action(message_id: int, body: MessageAction):
    """Record that user took an action on a proactive message."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    msg = conn.execute(
        "SELECT * FROM pending_vaathiyaar_messages WHERE id = ?", [message_id]
    ).fetchone()

    if not msg:
        conn.close()
        raise HTTPException(status_code=404, detail="Message not found")

    # Mark as dismissed (action taken)
    conn.execute(
        "UPDATE pending_vaathiyaar_messages SET dismissed = 1 WHERE id = ?", [message_id]
    )
    conn.commit()
    conn.close()

    return {"success": True, "action": body.action, "action_data": msg["action_data"]}
```

- [ ] **Step 3: Register new routes in main.py**

Add to the route imports section (around line 21-26):

```python
from routes.graph import router as graph_router
from routes.messages import router as messages_router
```

Add to the route mounting section (find where other routers are included):

```python
app.include_router(graph_router)
app.include_router(messages_router)
```

- [ ] **Step 4: Commit**

```bash
git add backend/routes/graph.py backend/routes/messages.py backend/main.py
git commit -m "feat: add knowledge graph and messages API routes"
```

---

### Task 6: Tag Retrofit — Add Tags to Existing 80 Lessons + lesson_concepts Seed

**Files:**
- Create: `backend/graph/lesson_tagger.py`

- [ ] **Step 1: Create lesson_tagger.py**

This script reads all existing lesson JSON files, adds a `tags` field based on the lesson's topic/track/content, and inserts `lesson_concepts` rows mapping each lesson to its concepts.

```python
"""
graph/lesson_tagger.py — Retrofit existing lessons with tags and populate lesson_concepts.

Run: python -m graph.lesson_tagger
"""

import json
import os
import sqlite3
from pathlib import Path

DB_PATH = os.getenv("DB_PATH", os.path.abspath("pymasters.db"))
LESSONS_DIR = Path(__file__).parent.parent / "lessons"

# Map lesson IDs / topics to concept IDs they teach and require
LESSON_CONCEPT_MAP = {
    # python_fundamentals
    "variables": {"teaches": ["variables", "data_types", "type_conversion"], "requires": []},
    "variables_types": {"teaches": ["variables", "data_types", "type_conversion"], "requires": []},
    "variables_conversion": {"teaches": ["type_conversion", "string_formatting"], "requires": ["variables"]},
    "conditionals": {"teaches": ["conditionals", "boolean_logic"], "requires": ["variables", "operators"]},
    "for_loops": {"teaches": ["for_loops", "loop_control"], "requires": ["conditionals", "lists"]},
    "while_loops": {"teaches": ["while_loops", "loop_control"], "requires": ["conditionals"]},
    "lists_basics": {"teaches": ["lists", "list_methods"], "requires": ["variables"]},
    "lists_slicing": {"teaches": ["list_slicing"], "requires": ["lists"]},
    "ds_tuples": {"teaches": ["tuples"], "requires": ["lists"]},
    "ds_dicts": {"teaches": ["dictionaries", "dict_methods"], "requires": ["variables"]},
    "ds_sets": {"teaches": ["sets"], "requires": ["lists"]},
    "ds_nested": {"teaches": ["nested_structures"], "requires": ["lists", "dictionaries"]},
    "functions_basics": {"teaches": ["functions_basics", "return_values"], "requires": ["for_loops"]},
    "functions_args": {"teaches": ["function_arguments"], "requires": ["functions_basics"]},
    "functions_scope": {"teaches": ["scope", "closures"], "requires": ["functions_basics"]},
    "functions_lambda": {"teaches": ["lambda_functions"], "requires": ["functions_basics"]},
    "comprehensions": {"teaches": ["list_comprehension"], "requires": ["for_loops", "lists"]},
    "errors_handling": {"teaches": ["error_handling"], "requires": ["conditionals"]},
    "errors_context_managers": {"teaches": ["context_managers", "custom_exceptions"], "requires": ["error_handling"]},
    "fileio_reading": {"teaches": ["file_reading"], "requires": ["variables", "string_basics"]},
    "fileio_writing": {"teaches": ["file_writing"], "requires": ["file_reading"]},
    "oop_basics": {"teaches": ["classes_basics"], "requires": ["functions_basics"]},
    "oop_classes": {"teaches": ["classes_basics", "magic_methods"], "requires": ["functions_basics"]},
    "oop_inheritance": {"teaches": ["inheritance"], "requires": ["classes_basics"]},
    "modules_basics": {"teaches": ["modules_imports"], "requires": ["functions_basics"]},
    "modules_packages": {"teaches": ["modules_imports"], "requires": ["functions_basics"]},
    "string_methods": {"teaches": ["string_methods", "string_formatting"], "requires": ["string_basics"]},
    "string_formatting": {"teaches": ["string_formatting"], "requires": ["string_basics"]},
    "adv_decorators": {"teaches": ["decorators", "decorator_patterns"], "requires": ["functions_basics", "closures"]},
    "adv_generators": {"teaches": ["generators", "generator_expressions"], "requires": ["for_loops", "functions_basics"]},
    "adv_iterators": {"teaches": ["iterators"], "requires": ["generators"]},
    "adv_async": {"teaches": ["async_basics"], "requires": ["functions_basics", "generators"]},
    "adv_threading": {"teaches": ["threading"], "requires": ["functions_basics"]},

    # ai_ml_foundations
    "numpy_arrays": {"teaches": ["numpy_basics"], "requires": ["lists"]},
    "numpy_operations": {"teaches": ["numpy_basics"], "requires": ["numpy_basics"]},
    "numpy_broadcasting": {"teaches": ["numpy_basics"], "requires": ["numpy_basics"]},
    "numpy_linalg": {"teaches": ["numpy_linalg"], "requires": ["numpy_basics"]},
    "pandas_dataframes": {"teaches": ["pandas_basics"], "requires": ["dictionaries", "numpy_basics"]},
    "pandas_filtering": {"teaches": ["pandas_basics"], "requires": ["pandas_basics"]},
    "pandas_grouping": {"teaches": ["pandas_grouping"], "requires": ["pandas_basics"]},
    "pandas_merging": {"teaches": ["pandas_merging"], "requires": ["pandas_basics"]},
    "sklearn_regression": {"teaches": ["linear_regression"], "requires": ["numpy_basics", "pandas_basics"]},
    "sklearn_classification": {"teaches": ["logistic_regression", "decision_trees"], "requires": ["linear_regression"]},
    "sklearn_clustering": {"teaches": ["clustering_kmeans"], "requires": ["numpy_basics"]},
    "sklearn_evaluation": {"teaches": ["model_evaluation"], "requires": ["linear_regression"]},
    "viz_matplotlib": {"teaches": ["matplotlib_basics"], "requires": ["numpy_basics"]},
    "viz_plot_types": {"teaches": ["data_visualization"], "requires": ["matplotlib_basics"]},
    "viz_seaborn": {"teaches": ["seaborn_basics"], "requires": ["matplotlib_basics"]},
    "prompt_basics": {"teaches": ["prompt_engineering"], "requires": ["what_is_ai"]},
    "prompt_few_shot": {"teaches": ["prompt_advanced"], "requires": ["prompt_engineering"]},
    "prompt_evaluation": {"teaches": ["ai_evaluation"], "requires": ["prompt_engineering"]},

    # deep_learning
    "nn_layers": {"teaches": ["multilayer_network"], "requires": ["perceptron"]},
    "nn_activation": {"teaches": ["activation_functions"], "requires": ["multilayer_network"]},
    "nn_forward_pass": {"teaches": ["forward_pass"], "requires": ["activation_functions"]},
    "bp_loss_functions": {"teaches": ["loss_functions"], "requires": ["forward_pass"]},
    "bp_gradient_descent": {"teaches": ["gradient_descent_dl"], "requires": ["backpropagation"]},
    "bp_optimization": {"teaches": ["regularization_dl"], "requires": ["gradient_descent_dl"]},
    "cnn_convolutions": {"teaches": ["cnn_basics"], "requires": ["forward_pass"]},
    "cnn_pooling": {"teaches": ["cnn_basics"], "requires": ["cnn_basics"]},
    "cnn_architectures": {"teaches": ["cnn_architectures"], "requires": ["cnn_basics"]},
    "cnn_image_classification": {"teaches": ["image_classification"], "requires": ["cnn_architectures"]},

    # fun_automation
    "auto_file_organizer": {"teaches": ["file_automation"], "requires": ["file_reading", "pathlib"]},
    "auto_web_scraper": {"teaches": ["web_scraping_auto"], "requires": ["api_consumption"]},
    "auto_email_sender": {"teaches": ["email_automation"], "requires": ["for_loops", "string_formatting"]},
    "auto_pdf_merger": {"teaches": ["pdf_automation"], "requires": ["file_reading"]},
    "fun_password_generator": {"teaches": ["password_generation"], "requires": ["random_module"]},
    "fun_quiz_game": {"teaches": ["cli_tools"], "requires": ["dictionaries", "for_loops"]},
}

# Default difficulty and engagement type by track
TRACK_DEFAULTS = {
    "python_fundamentals": {"difficulty": "beginner", "engagement_type": "hands_on", "category": "python_core"},
    "ai_ml_foundations": {"difficulty": "intermediate", "engagement_type": "hands_on", "category": "data_science"},
    "deep_learning": {"difficulty": "intermediate", "engagement_type": "theory", "category": "deep_learning"},
    "fun_automation": {"difficulty": "beginner", "engagement_type": "project", "category": "automation"},
}


def tag_all_lessons():
    """Add tags to all existing lesson JSON files and populate lesson_concepts table."""
    conn = sqlite3.connect(DB_PATH)

    tagged_count = 0
    concept_rows = 0

    for track_dir in sorted(LESSONS_DIR.iterdir()):
        if not track_dir.is_dir() or track_dir.name == "__pycache__":
            continue

        for lesson_file in sorted(track_dir.glob("*.json")):
            if lesson_file.name == "schema.json":
                continue

            with open(lesson_file, "r", encoding="utf-8") as f:
                lesson = json.load(f)

            lesson_id = lesson.get("id", lesson_file.stem)
            track = lesson.get("track", track_dir.name)
            topic = lesson.get("topic", lesson_id)
            defaults = TRACK_DEFAULTS.get(track, {"difficulty": "intermediate", "engagement_type": "hands_on", "category": "python_core"})

            # Build tags
            concept_map = LESSON_CONCEPT_MAP.get(lesson_id, LESSON_CONCEPT_MAP.get(topic, None))
            teaches = concept_map["teaches"] if concept_map else [topic]
            requires = concept_map["requires"] if concept_map else []

            tags = {
                "concepts_taught": teaches,
                "concepts_required": requires,
                "difficulty": defaults["difficulty"],
                "engagement_type": defaults["engagement_type"],
                "estimated_minutes": 20,
                "real_world_application": [],
                "category": defaults["category"],
                "path_memberships": [],
            }

            # Add tags to lesson JSON (don't overwrite if already present)
            if "tags" not in lesson:
                lesson["tags"] = tags

                with open(lesson_file, "w", encoding="utf-8") as f:
                    json.dump(lesson, f, indent=2, ensure_ascii=False)
                tagged_count += 1

            # Insert lesson_concepts rows
            for concept_id in teaches:
                conn.execute(
                    "INSERT OR IGNORE INTO lesson_concepts (lesson_id, concept_id, role, depth) VALUES (?, ?, 'teaches', 'moderate')",
                    [lesson_id, concept_id],
                )
                concept_rows += 1

            for concept_id in requires:
                conn.execute(
                    "INSERT OR IGNORE INTO lesson_concepts (lesson_id, concept_id, role, depth) VALUES (?, ?, 'requires', 'moderate')",
                    [lesson_id, concept_id],
                )
                concept_rows += 1

    conn.commit()
    conn.close()
    print(f"Tagged {tagged_count} lessons, inserted {concept_rows} lesson_concept rows")


if __name__ == "__main__":
    tag_all_lessons()
```

- [ ] **Step 2: Run the tagger**

Run: `cd backend && python -m graph.lesson_tagger`
Expected: "Tagged N lessons, inserted M lesson_concept rows"

- [ ] **Step 3: Commit all changes (tagged JSONs + tagger script)**

```bash
git add backend/graph/lesson_tagger.py backend/lessons/
git commit -m "feat: retrofit 80 existing lessons with concept tags + lesson_concepts mapping"
```

---

## Phase 2: Content Generation (142 New Lessons)

> **This is the largest phase.** Each lesson is a hand-crafted JSON file with 5-10 animation primitives, practice challenges, and quizzes. Due to the volume, this phase should be executed using **subagent-driven-development** with one subagent per track (7 tracks = 7 parallel subagents).

### Task 7: Generate python_intermediate/ (25 lessons)

**Files:** Create 25 JSON files in `backend/lessons/python_intermediate/`

Each lesson follows the exact schema of existing lessons (see `backend/lessons/python_fundamentals/variables.json` as reference) with the `tags` field included.

Animation standard per lesson:
- StoryCard (Vaathiyaar narrative)
- ConceptMap (concept connections)
- CodeStepper (10-20 steps with en/ta descriptions)
- 1-3 VariableBoxes synced to CodeStepper
- TerminalOutput
- Additional primitives per concept type (see spec Section 3)
- practice_challenges with instruction, expected_output, hints
- quiz with 3 questions

Lesson list: oop_classes_basics, oop_inheritance, oop_composition, oop_magic_methods, oop_design_patterns, decorators_basics, decorators_advanced, generators_yield, context_managers, comprehensions_advanced, regex_basics, regex_advanced, datetime_time, pathlib_files, collections_module, itertools_module, json_csv_data, type_hints, dataclasses, async_await_basics, async_advanced, threading_basics, multiprocessing, error_handling_advanced, closures_scope

- [ ] **Step 1: Create all 25 lesson JSON files** (use subagent with the full lesson list and schema reference)
- [ ] **Step 2: Add tags + lesson_concepts for each new lesson** (run lesson_tagger or add tags inline)
- [ ] **Step 3: Commit**

```bash
git add backend/lessons/python_intermediate/
git commit -m "feat: add 25 python_intermediate lessons with cinema animations"
```

### Task 8: Generate web_development/ (20 lessons)

Same structure as Task 7. Lesson list from spec Section 2.3.

- [ ] **Step 1: Create all 20 lesson JSON files**
- [ ] **Step 2: Add tags + lesson_concepts**
- [ ] **Step 3: Commit**

### Task 9: Generate dsa/ (20 lessons)

Same structure. Lesson list from spec Section 2.3.

- [ ] **Step 1: Create all 20 lesson JSON files**
- [ ] **Step 2: Add tags + lesson_concepts**
- [ ] **Step 3: Commit**

### Task 10: Generate ai_fundamentals/ (18 lessons)

Same structure. Lesson list from spec Section 2.3.

- [ ] **Step 1: Create all 18 lesson JSON files**
- [ ] **Step 2: Add tags + lesson_concepts**
- [ ] **Step 3: Commit**

### Task 11: Generate machine_learning/ (22 lessons)

Same structure. Lesson list from spec Section 2.3.

- [ ] **Step 1: Create all 22 lesson JSON files**
- [ ] **Step 2: Add tags + lesson_concepts**
- [ ] **Step 3: Commit**

### Task 12: Generate deep_learning_complete/ (25 lessons)

Same structure. Lesson list from spec Section 2.3.

- [ ] **Step 1: Create all 25 lesson JSON files**
- [ ] **Step 2: Add tags + lesson_concepts**
- [ ] **Step 3: Commit**

### Task 13: Generate testing_devops/ (12 lessons)

Same structure. Lesson list from spec Section 2.3.

- [ ] **Step 1: Create all 12 lesson JSON files**
- [ ] **Step 2: Add tags + lesson_concepts**
- [ ] **Step 3: Commit**

---

## Phase 3: Learning Paths Backend + Frontend

### Task 14: Create Learning Path Definitions

**Files:**
- Create: `backend/paths/__init__.py`
- Create: `backend/paths/definitions.py`

- [ ] **Step 1: Create paths package and definitions**

`backend/paths/definitions.py` contains the 15 learning path definitions. Each has: id, name, description, icon, difficulty_start, difficulty_end, category, estimated_hours, lesson_sequence (ordered list of lesson IDs), concepts_covered.

The lesson_sequence for each path must reference actual lesson IDs from the JSON files created in Phase 2.

- [ ] **Step 2: Create seed function and call from main.py**
- [ ] **Step 3: Commit**

### Task 15: Create Path Adaptation Engine

**Files:**
- Create: `backend/paths/adapter.py`
- Create: `backend/paths/inserter.py`
- Create: `backend/paths/recommender.py`

- [ ] **Step 1: Create adapter.py** — the AI path adaptation logic (skip/insert/reorder/branch/generate decisions)
- [ ] **Step 2: Create inserter.py** — smart content insertion into adapted sequences
- [ ] **Step 3: Create recommender.py** — concept recommendations based on mastery + graph
- [ ] **Step 4: Commit**

### Task 16: Create Paths API Route

**Files:**
- Create: `backend/routes/paths.py`
- Modify: `backend/main.py` (add route)

- [ ] **Step 1: Create paths.py** with endpoints: list paths, get path, start path, progress, active, switch
- [ ] **Step 2: Wire adaptation into /api/classroom/evaluate** — call adapter after lesson completion
- [ ] **Step 3: Register route in main.py**
- [ ] **Step 4: Commit**

### Task 17: Update Classroom Lessons Endpoint

**Files:**
- Modify: `backend/routes/classroom.py`

- [ ] **Step 1: Update /api/classroom/lessons** to return active_path, next_in_path, path_progress
- [ ] **Step 2: Add fun_automation and all new tracks to TRACK_ORDER and routing logic**
- [ ] **Step 3: Commit**

### Task 18: Frontend — Learning Paths Page

**Files:**
- Create: `frontend/src/pages/Paths.jsx`
- Modify: `frontend/src/App.jsx` (add route)
- Modify: `frontend/src/components/Layout.jsx` (add nav item)

- [ ] **Step 1: Create Paths.jsx** — active path banner, recommended paths, all paths grid with progress rings
- [ ] **Step 2: Add route in App.jsx**: `/dashboard/paths` and `/dashboard/paths/:pathId`
- [ ] **Step 3: Add "Paths" nav item in Layout.jsx sidebar**
- [ ] **Step 4: Commit**

### Task 19: Frontend — Path Detail View + Knowledge Map

**Files:**
- Create: `frontend/src/components/KnowledgeMap.jsx`
- Modify: `frontend/src/pages/Paths.jsx` (add detail view)

- [ ] **Step 1: Create KnowledgeMap.jsx** — SVG-based interactive concept graph with GSAP animations, mastery coloring, hover/click
- [ ] **Step 2: Add path detail view to Paths.jsx** — timeline view with completed/next/locked/inserted lessons
- [ ] **Step 3: Commit**

---

## Phase 4: Smart Insertion + Triple Notification + Onboarding

### Task 20: Wire Triple Notification for Custom Content

**Files:**
- Modify: `backend/modules/pipeline.py` (stage 5 assembly)
- Modify: `backend/paths/inserter.py`

- [ ] **Step 1: Update stage_5_assembly** to create all 3 notification channels (badge + path insertion + vaathiyaar message)
- [ ] **Step 2: Commit**

### Task 21: Frontend — Vaathiyaar Proactive Message Banner

**Files:**
- Create: `frontend/src/components/VaathiyaarMessage.jsx`
- Modify: `frontend/src/pages/Classroom.jsx`
- Modify: `frontend/src/pages/Playground.jsx`

- [ ] **Step 1: Create VaathiyaarMessage.jsx** — animated banner with action buttons (Start Now, Add to Path, Dismiss)
- [ ] **Step 2: Add message fetching to Classroom.jsx** — check /api/messages/pending on load
- [ ] **Step 3: Add message fetching to Playground.jsx**
- [ ] **Step 4: Commit**

### Task 22: Update Onboarding — Path Recommendation

**Files:**
- Modify: `frontend/src/pages/Onboarding.jsx`

- [ ] **Step 1: Add path recommendation step** after existing questions — Vaathiyaar suggests a path with embedded card
- [ ] **Step 2: Add path start API call** when user accepts recommendation
- [ ] **Step 3: Commit**

### Task 23: Integration Testing

- [ ] **Step 1: Test end-to-end flow**: Register → Onboard (hobby motivation) → Path recommended → Start path → Complete lesson → Mastery updated → Path adapted
- [ ] **Step 2: Test custom content trigger**: Fail a lesson 2x → Module generated → Triple notification fires → Lesson inserted in path
- [ ] **Step 3: Test knowledge map**: Complete several lessons → Verify concept mastery colors update
- [ ] **Step 4: Final commit and push**

```bash
git push origin main
```
