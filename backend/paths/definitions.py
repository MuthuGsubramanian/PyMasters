"""
Learning path definitions — 15 curated paths built from the 222 lessons
across 11 tracks.  Each path is a tuple ready for INSERT into learning_paths.

Call ``seed_paths(db_path)`` at startup to populate the table (INSERT OR IGNORE).
"""

import json
import sqlite3

# ── Helper to build the tuple expected by the INSERT statement ───────────

def _p(id, name, description, icon, diff_start, diff_end, category, hours, lessons, concepts):
    return (id, name, description, icon, diff_start, diff_end, category, hours, json.dumps(lessons), json.dumps(concepts))


# ── Path definitions ─────────────────────────────────────────────────────

PATH_DEFINITIONS = [

    # 1. Python Zero to Hero  (~25 lessons from python_fundamentals + python_intermediate basics)
    _p(
        "python_zero_to_hero",
        "Python Zero to Hero",
        "Start from scratch and build a rock-solid Python foundation — variables, control flow, functions, OOP, file I/O, and beyond.",
        "rocket",
        "beginner", "intermediate",
        "foundation",
        40,
        [
            "variables_intro", "variables", "variables_types", "variables_operators", "variables_conversion",
            "conditionals", "for_loops", "while_loops", "lists", "ds_tuples",
            "ds_dicts", "ds_sets", "ds_nested", "comprehensions",
            "functions_basics", "functions_args", "functions_scope", "functions_lambda",
            "errors_handling", "errors_context_managers",
            "fileio_reading", "fileio_writing",
            "oop_classes", "oop_inheritance", "oop_polymorphism",
        ],
        ["variables", "types", "conditionals", "loops", "lists", "dicts", "tuples", "sets",
         "comprehensions", "functions", "scope", "lambda", "errors", "file_io", "oop"],
    ),

    # 2. Python for Programmers  (~15 lessons, skip basics)
    _p(
        "python_for_programmers",
        "Python for Programmers",
        "Already know another language? Fast-track through Python's unique features — comprehensions, decorators, generators, async.",
        "zap",
        "intermediate", "advanced",
        "foundation",
        20,
        [
            "comprehensions", "functions_lambda", "functions_scope",
            "oop_classes", "oop_inheritance", "oop_magic_methods", "oop_composition",
            "adv_decorators", "adv_generators", "adv_iterators",
            "comprehensions_advanced", "decorators_basics", "decorators_advanced",
            "generators_yield", "async_await_basics",
        ],
        ["comprehensions", "lambda", "oop", "decorators", "generators", "iterators", "async"],
    ),

    # 3. Web Developer Path  (~20 lessons from web_development)
    _p(
        "web_developer_path",
        "Web Developer Path",
        "Learn to build modern web applications with Python — HTML/CSS, Flask, Django, FastAPI, REST APIs, and deployment.",
        "globe",
        "beginner", "advanced",
        "web",
        35,
        [
            "html_css_basics", "http_fundamentals", "rest_api_concepts",
            "flask_basics", "flask_forms_db", "flask_authentication",
            "django_intro", "django_models", "django_views_templates", "django_forms_auth",
            "django_rest_framework",
            "fastapi_intro", "fastapi_crud", "fastapi_authentication",
            "api_consumption", "database_sql_basics",
            "javascript_for_python_devs", "websockets_basics",
            "deployment_basics", "docker_for_python",
        ],
        ["html", "css", "http", "rest", "flask", "django", "fastapi", "sql", "deployment", "docker"],
    ),

    # 4. Data Scientist Path  (~20 lessons from ai_ml_foundations + machine_learning data portions)
    _p(
        "data_scientist_path",
        "Data Scientist Path",
        "Master the data pipeline — NumPy, Pandas, visualization, data cleaning, feature engineering, and core ML models.",
        "bar_chart",
        "intermediate", "advanced",
        "data_science",
        35,
        [
            "numpy_arrays", "numpy_operations", "numpy_broadcasting", "numpy_linalg",
            "pandas_dataframes", "pandas_filtering", "pandas_grouping", "pandas_merging",
            "viz_matplotlib", "viz_plot_types", "viz_seaborn",
            "data_cleaning", "feature_engineering",
            "train_test_split", "linear_regression", "logistic_regression",
            "model_evaluation", "decision_trees", "random_forests",
            "ml_project_end_to_end",
        ],
        ["numpy", "pandas", "matplotlib", "seaborn", "data_cleaning", "feature_engineering",
         "regression", "classification", "evaluation"],
    ),

    # 5. AI Fundamentals Path  (~18 lessons from ai_fundamentals)
    _p(
        "ai_fundamentals_path",
        "AI Fundamentals Path",
        "Understand modern AI — how LLMs work, prompt engineering, embeddings, RAG, LangChain, and building chatbots.",
        "brain",
        "intermediate", "advanced",
        "ai",
        30,
        [
            "what_is_ai", "llm_how_they_work",
            "prompt_engineering_basics", "prompt_engineering_advanced",
            "openai_api_basics", "anthropic_api_basics", "structured_output",
            "embeddings_similarity", "vector_databases", "rag_fundamentals",
            "langchain_intro", "langchain_agents",
            "building_chatbots", "multi_modal_ai",
            "fine_tuning_basics", "ai_code_assistants",
            "ai_safety_ethics", "ai_app_deployment",
        ],
        ["llm", "prompt_engineering", "openai", "anthropic", "embeddings", "rag",
         "langchain", "chatbots", "fine_tuning", "ai_safety"],
    ),

    # 6. ML Engineer Path  (~23 lessons: python basics -> machine_learning full)
    _p(
        "ml_engineer_path",
        "ML Engineer Path",
        "End-to-end machine learning — from Python essentials through data wrangling, model training, evaluation, and deployment.",
        "cpu",
        "beginner", "advanced",
        "ml",
        40,
        [
            "variables_intro", "variables", "lists", "ds_dicts", "functions_basics",
            "ml_what_is_it", "ml_workflow",
            "numpy_foundations", "pandas_foundations",
            "data_cleaning", "feature_engineering", "train_test_split",
            "linear_regression", "logistic_regression", "knn", "naive_bayes",
            "decision_trees", "random_forests", "svm",
            "clustering_kmeans", "clustering_advanced",
            "model_evaluation", "hyperparameter_tuning",
            "ml_pipelines", "model_deployment", "ml_project_end_to_end",
        ],
        ["variables", "lists", "dicts", "functions", "ml_workflow", "numpy", "pandas",
         "regression", "classification", "clustering", "evaluation", "deployment"],
    ),

    # 7. Deep Learning & Neural Nets  (~25 lessons from deep_learning_complete)
    _p(
        "dl_neural_nets_path",
        "Deep Learning & Neural Networks",
        "Master neural networks from perceptrons to transformers — CNNs, RNNs, LSTMs, GANs, attention, and a capstone project.",
        "layers",
        "intermediate", "advanced",
        "deep_learning",
        45,
        [
            "dl_perceptron", "dl_multilayer_network", "dl_activation_functions", "dl_forward_pass",
            "dl_loss_functions", "dl_backpropagation", "dl_gradient_descent",
            "dl_regularization", "dl_model_optimization",
            "dl_pytorch_basics", "dl_pytorch_training",
            "dl_cnn_intro", "dl_cnn_architectures", "dl_cnn_image_classification", "dl_cnn_transfer_learning",
            "dl_rnn_intro", "dl_lstm_gru", "dl_rnn_text_generation",
            "dl_attention_mechanism", "dl_transformer_architecture", "dl_bert_gpt_concepts",
            "dl_autoencoders", "dl_gan_basics", "dl_gan_image_generation",
            "dl_project_end_to_end",
        ],
        ["perceptron", "neural_network", "backpropagation", "cnn", "rnn", "lstm",
         "transformer", "attention", "gan", "pytorch"],
    ),

    # 8. Automation Engineer Path  (~13 lessons from fun_automation + python_fundamentals basics)
    _p(
        "automation_engineer_path",
        "Automation Engineer Path",
        "Automate boring stuff with Python — file management, web scraping, emails, PDFs, plus the programming fundamentals to get there.",
        "settings",
        "beginner", "intermediate",
        "automation",
        20,
        [
            "variables_intro", "variables", "conditionals", "for_loops", "lists",
            "functions_basics", "fileio_reading", "fileio_writing",
            "auto_file_organizer", "auto_web_scraper",
            "auto_email_sender", "auto_pdf_merger",
            "fun_password_generator",
        ],
        ["variables", "conditionals", "loops", "functions", "file_io",
         "web_scraping", "automation", "email"],
    ),

    # 9. DSA Interview Prep  (~20 lessons from dsa)
    _p(
        "dsa_interview_path",
        "DSA Interview Prep",
        "Crack coding interviews — Big-O, arrays, linked lists, trees, graphs, DP, and common interview patterns.",
        "trophy",
        "intermediate", "advanced",
        "dsa",
        40,
        [
            "big_o_complexity", "arrays_strings",
            "linked_lists", "stacks", "queues",
            "hash_tables", "sorting_basics", "sorting_advanced",
            "searching", "recursion_fundamentals", "recursion_advanced",
            "trees_basics", "binary_search_trees", "heaps",
            "graphs_basics", "graphs_advanced",
            "dynamic_programming", "greedy_algorithms",
            "string_algorithms", "coding_interview_patterns",
        ],
        ["big_o", "arrays", "linked_lists", "stacks", "queues", "hash_tables",
         "sorting", "searching", "recursion", "trees", "graphs", "dp", "greedy"],
    ),

    # 10. Testing & DevOps Path  (~12 lessons from testing_devops)
    _p(
        "testing_devops_path",
        "Testing & DevOps Path",
        "Ship reliable software — pytest, TDD, CI/CD pipelines, Docker, logging, and packaging.",
        "shield",
        "intermediate", "advanced",
        "devops",
        22,
        [
            "testing_why", "unittest_basics",
            "pytest_basics", "pytest_advanced", "tdd_workflow",
            "git_workflows",
            "ci_cd_basics", "ci_cd_python",
            "docker_fundamentals", "docker_compose",
            "logging_monitoring", "packaging_distribution",
        ],
        ["testing", "pytest", "tdd", "git", "ci_cd", "docker", "logging", "packaging"],
    ),

    # 11. Stdlib Mastery  (~13 lessons from python_intermediate, stdlib-focused)
    _p(
        "stdlib_mastery_path",
        "Standard Library Mastery",
        "Unlock Python's hidden superpowers — regex, pathlib, collections, itertools, datetime, JSON/CSV, and more.",
        "package",
        "intermediate", "advanced",
        "foundation",
        18,
        [
            "regex_basics", "regex_advanced",
            "pathlib_files",
            "collections_module", "itertools_module",
            "datetime_time", "json_csv_data",
            "type_hints", "dataclasses",
            "context_managers", "error_handling_advanced",
            "closures_scope", "comprehensions_advanced",
        ],
        ["regex", "pathlib", "collections", "itertools", "datetime", "json", "csv",
         "type_hints", "dataclasses", "context_managers"],
    ),

    # 12. OOP & Design Patterns  (~12 lessons from python_intermediate + python_fundamentals OOP)
    _p(
        "oop_patterns_path",
        "OOP & Design Patterns",
        "Deep-dive into object-oriented programming — classes, inheritance, composition, magic methods, and design patterns.",
        "boxes",
        "intermediate", "advanced",
        "foundation",
        18,
        [
            "oop_classes", "oop_inheritance", "oop_polymorphism",
            "oop_magic_methods", "oop_composition",
            "oop_classes_basics", "oop_inheritance",
            "oop_magic_methods", "oop_composition", "oop_design_patterns",
            "dataclasses", "type_hints",
        ],
        ["classes", "inheritance", "polymorphism", "composition", "magic_methods",
         "design_patterns", "dataclasses"],
    ),

    # 13. Fun Projects Path  (~12 lessons from fun_automation + easy python_fundamentals)
    _p(
        "fun_projects_path",
        "Fun Projects Path",
        "Learn Python by building cool stuff — games, password generators, web scrapers, and automation scripts.",
        "gamepad",
        "beginner", "intermediate",
        "projects",
        18,
        [
            "variables_intro", "variables", "conditionals", "for_loops", "while_loops",
            "lists", "functions_basics",
            "fun_quiz_game", "fun_password_generator",
            "auto_file_organizer", "auto_web_scraper",
            "auto_email_sender", "auto_pdf_merger",
        ],
        ["variables", "conditionals", "loops", "functions", "lists",
         "games", "automation", "web_scraping"],
    ),

    # 14. Fullstack Python  (~20 lessons: web_development + database + deployment)
    _p(
        "fullstack_python_path",
        "Fullstack Python Developer",
        "Build and deploy complete web apps — frontend basics, Flask, Django, FastAPI, databases, Docker, and CI/CD.",
        "server",
        "intermediate", "advanced",
        "web",
        40,
        [
            "html_css_basics", "http_fundamentals", "javascript_for_python_devs",
            "rest_api_concepts", "database_sql_basics",
            "flask_basics", "flask_forms_db", "flask_authentication",
            "django_intro", "django_models", "django_views_templates", "django_forms_auth",
            "fastapi_intro", "fastapi_crud", "fastapi_authentication",
            "websockets_basics", "deployment_basics", "docker_for_python",
            "ci_cd_basics", "ci_cd_python",
        ],
        ["html", "css", "http", "javascript", "sql", "flask", "django", "fastapi",
         "websockets", "docker", "ci_cd", "deployment"],
    ),

    # 15. AI/ML/DL Complete Journey  (~48 lessons: python basics -> ai -> ml -> dl)
    _p(
        "ai_ml_dl_complete_journey",
        "AI / ML / DL Complete Journey",
        "The mega-path — from Python basics through AI fundamentals, classical ML, and deep learning. Everything you need to become an AI engineer.",
        "sparkles",
        "beginner", "advanced",
        "ai",
        80,
        [
            # Python essentials (~8)
            "variables_intro", "variables", "lists", "ds_dicts",
            "functions_basics", "functions_args", "comprehensions", "oop_classes",
            # AI fundamentals (~10)
            "what_is_ai", "llm_how_they_work",
            "prompt_engineering_basics", "prompt_engineering_advanced",
            "openai_api_basics", "anthropic_api_basics",
            "embeddings_similarity", "rag_fundamentals",
            "langchain_intro", "building_chatbots",
            # ML foundations (~14)
            "numpy_foundations", "pandas_foundations",
            "data_cleaning", "feature_engineering",
            "ml_what_is_it", "ml_workflow", "train_test_split",
            "linear_regression", "logistic_regression", "decision_trees", "random_forests",
            "clustering_kmeans", "model_evaluation", "hyperparameter_tuning",
            # Deep learning (~16)
            "dl_perceptron", "dl_multilayer_network", "dl_activation_functions",
            "dl_forward_pass", "dl_backpropagation", "dl_gradient_descent",
            "dl_pytorch_basics", "dl_pytorch_training",
            "dl_cnn_intro", "dl_cnn_image_classification",
            "dl_rnn_intro", "dl_lstm_gru",
            "dl_attention_mechanism", "dl_transformer_architecture", "dl_bert_gpt_concepts",
            "dl_project_end_to_end",
        ],
        ["variables", "functions", "oop", "ai", "llm", "prompt_engineering",
         "numpy", "pandas", "ml", "regression", "classification", "clustering",
         "neural_network", "cnn", "rnn", "transformer", "pytorch"],
    ),
]


# ── Seed function ────────────────────────────────────────────────────────

def seed_paths(db_path: str):
    """Insert all 15 path definitions into learning_paths (idempotent)."""
    conn = sqlite3.connect(db_path)
    conn.execute("PRAGMA journal_mode=WAL")
    cursor = conn.cursor()
    for p in PATH_DEFINITIONS:
        cursor.execute(
            """INSERT OR IGNORE INTO learning_paths
               (id, name, description, icon, difficulty_start, difficulty_end,
                category, estimated_hours, lesson_sequence, concepts_covered)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            p,
        )
    conn.commit()
    conn.close()
    print(f"Seeded {len(PATH_DEFINITIONS)} learning paths.")
