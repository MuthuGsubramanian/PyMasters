"""
Lesson Tagger — adds `tags` to every lesson JSON and populates `lesson_concepts`.

Usage:
    cd backend
    python -m graph.lesson_tagger
"""

import json
import os
import sqlite3
from pathlib import Path

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
BASE_DIR = Path(__file__).resolve().parent.parent          # backend/
LESSONS_DIR = BASE_DIR / "lessons"
DB_PATH = os.getenv("DB_PATH", str(BASE_DIR / "pymasters.db"))

# ---------------------------------------------------------------------------
# Track-level defaults
# ---------------------------------------------------------------------------
TRACK_DEFAULTS = {
    "python_fundamentals": {
        "difficulty": "beginner",
        "engagement_type": "hands_on",
        "category": "python_core",
        "estimated_minutes": 20,
    },
    "ai_ml_foundations": {
        "difficulty": "intermediate",
        "engagement_type": "hands_on",
        "category": "data_science",
        "estimated_minutes": 25,
    },
    "deep_learning": {
        "difficulty": "intermediate",
        "engagement_type": "theory",
        "category": "deep_learning",
        "estimated_minutes": 30,
    },
    "fun_automation": {
        "difficulty": "beginner",
        "engagement_type": "project",
        "category": "automation",
        "estimated_minutes": 25,
    },
}

# ---------------------------------------------------------------------------
# LESSON_CONCEPT_MAP
# Maps lesson_id -> { "teaches": [...], "requires": [...] }
# Every concept ID must exist in the concepts table (see concepts.py).
# ---------------------------------------------------------------------------
LESSON_CONCEPT_MAP = {
    # ── python_fundamentals ───────────────────────────────────────────────
    # variables & types module
    "variables": {
        "teaches": ["variables"],
        "requires": [],
    },
    "variables_intro": {
        "teaches": ["variables"],
        "requires": [],
    },
    "variables_types": {
        "teaches": ["data_types"],
        "requires": ["variables"],
    },
    "variables_operators": {
        "teaches": ["operators"],
        "requires": ["variables", "data_types"],
    },
    "variables_conversion": {
        "teaches": ["type_conversion"],
        "requires": ["variables", "data_types"],
    },

    # control flow
    "conditionals": {
        "teaches": ["conditionals", "boolean_logic"],
        "requires": ["variables", "operators"],
    },
    "for_loops": {
        "teaches": ["for_loops", "loop_control"],
        "requires": ["conditionals"],
    },
    "while_loops": {
        "teaches": ["while_loops", "loop_control"],
        "requires": ["conditionals"],
    },

    # data structures
    "lists": {
        "teaches": ["lists", "list_methods", "list_slicing"],
        "requires": ["variables", "for_loops"],
    },
    "ds_tuples": {
        "teaches": ["tuples", "unpacking"],
        "requires": ["lists"],
    },
    "ds_dicts": {
        "teaches": ["dictionaries", "dict_methods"],
        "requires": ["lists"],
    },
    "ds_sets": {
        "teaches": ["sets"],
        "requires": ["lists"],
    },
    "ds_nested": {
        "teaches": ["nested_structures"],
        "requires": ["lists", "dictionaries"],
    },
    "comprehensions": {
        "teaches": ["list_comprehension", "dict_comprehension", "set_comprehension"],
        "requires": ["lists", "for_loops", "dictionaries"],
    },

    # functions
    "functions_basics": {
        "teaches": ["functions_basics", "return_values"],
        "requires": ["variables", "conditionals"],
    },
    "functions_args": {
        "teaches": ["function_arguments"],
        "requires": ["functions_basics"],
    },
    "functions_scope": {
        "teaches": ["scope", "closures"],
        "requires": ["functions_basics"],
    },
    "functions_lambda": {
        "teaches": ["lambda_functions"],
        "requires": ["functions_basics"],
    },

    # OOP
    "oop_classes": {
        "teaches": ["classes_basics"],
        "requires": ["functions_basics", "dictionaries"],
    },
    "oop_inheritance": {
        "teaches": ["inheritance"],
        "requires": ["classes_basics"],
    },
    "oop_composition": {
        "teaches": ["composition"],
        "requires": ["classes_basics"],
    },
    "oop_polymorphism": {
        "teaches": ["abstract_classes", "properties"],
        "requires": ["inheritance"],
    },
    "oop_magic_methods": {
        "teaches": ["magic_methods"],
        "requires": ["classes_basics"],
    },

    # errors & file I/O
    "errors_handling": {
        "teaches": ["error_handling", "custom_exceptions"],
        "requires": ["functions_basics"],
    },
    "errors_context_managers": {
        "teaches": ["context_managers"],
        "requires": ["error_handling", "classes_basics"],
    },
    "fileio_reading": {
        "teaches": ["file_reading"],
        "requires": ["error_handling"],
    },
    "fileio_writing": {
        "teaches": ["file_writing"],
        "requires": ["file_reading"],
    },

    # packages & testing
    "pkg_imports": {
        "teaches": ["modules_imports"],
        "requires": ["functions_basics"],
    },
    "pkg_venvs": {
        "teaches": ["virtual_envs"],
        "requires": ["modules_imports"],
    },
    "testing_pytest": {
        "teaches": ["pytest_basics", "testing_fundamentals"],
        "requires": ["functions_basics", "modules_imports"],
    },
    "testing_tdd": {
        "teaches": ["tdd"],
        "requires": ["pytest_basics"],
    },

    # advanced python
    "adv_decorators": {
        "teaches": ["decorators", "decorator_patterns"],
        "requires": ["closures", "functions_basics"],
    },
    "adv_generators": {
        "teaches": ["generators", "generator_expressions"],
        "requires": ["for_loops", "functions_basics"],
    },
    "adv_iterators": {
        "teaches": ["iterators"],
        "requires": ["for_loops", "classes_basics"],
    },
    "adv_async": {
        "teaches": ["async_basics", "async_advanced"],
        "requires": ["functions_basics", "generators"],
    },
    "adv_threading": {
        "teaches": ["threading", "multiprocessing"],
        "requires": ["functions_basics"],
    },

    # ── ai_ml_foundations ─────────────────────────────────────────────────
    # numpy
    "numpy_arrays": {
        "teaches": ["numpy_basics"],
        "requires": ["lists", "for_loops"],
    },
    "numpy_operations": {
        "teaches": ["numpy_basics"],
        "requires": ["numpy_basics"],
    },
    "numpy_broadcasting": {
        "teaches": ["numpy_basics"],
        "requires": ["numpy_basics"],
    },
    "numpy_linalg": {
        "teaches": ["numpy_linalg"],
        "requires": ["numpy_basics"],
    },

    # pandas
    "pandas_dataframes": {
        "teaches": ["pandas_basics"],
        "requires": ["dictionaries", "numpy_basics"],
    },
    "pandas_filtering": {
        "teaches": ["pandas_basics", "data_cleaning"],
        "requires": ["pandas_basics"],
    },
    "pandas_grouping": {
        "teaches": ["pandas_grouping"],
        "requires": ["pandas_basics"],
    },
    "pandas_merging": {
        "teaches": ["pandas_merging"],
        "requires": ["pandas_basics"],
    },

    # visualization
    "viz_matplotlib": {
        "teaches": ["matplotlib_basics", "data_visualization"],
        "requires": ["numpy_basics", "lists"],
    },
    "viz_plot_types": {
        "teaches": ["matplotlib_basics", "data_visualization"],
        "requires": ["matplotlib_basics"],
    },
    "viz_seaborn": {
        "teaches": ["seaborn_basics"],
        "requires": ["matplotlib_basics", "pandas_basics"],
    },

    # sklearn
    "sklearn_regression": {
        "teaches": ["linear_regression", "ml_fundamentals", "train_test_split"],
        "requires": ["numpy_basics", "pandas_basics"],
    },
    "sklearn_classification": {
        "teaches": ["logistic_regression", "decision_trees", "knn"],
        "requires": ["ml_fundamentals", "train_test_split"],
    },
    "sklearn_clustering": {
        "teaches": ["clustering_kmeans", "clustering_advanced"],
        "requires": ["ml_fundamentals", "numpy_basics"],
    },
    "sklearn_evaluation": {
        "teaches": ["model_evaluation", "bias_variance"],
        "requires": ["ml_fundamentals", "train_test_split"],
    },

    # prompt engineering
    "prompt_basics": {
        "teaches": ["prompt_engineering"],
        "requires": [],
    },
    "prompt_few_shot": {
        "teaches": ["prompt_advanced"],
        "requires": ["prompt_engineering"],
    },
    "prompt_evaluation": {
        "teaches": ["prompt_advanced", "structured_output"],
        "requires": ["prompt_engineering"],
    },

    # ── deep_learning ─────────────────────────────────────────────────────
    # neural network basics
    "nn_perceptrons": {
        "teaches": ["perceptron"],
        "requires": ["numpy_basics"],
    },
    "nn_activation": {
        "teaches": ["activation_functions"],
        "requires": ["perceptron"],
    },
    "nn_layers": {
        "teaches": ["multilayer_network"],
        "requires": ["activation_functions"],
    },
    "nn_forward_pass": {
        "teaches": ["forward_pass"],
        "requires": ["multilayer_network"],
    },

    # backpropagation & optimization
    "bp_loss_functions": {
        "teaches": ["loss_functions"],
        "requires": ["forward_pass"],
    },
    "bp_gradient_descent": {
        "teaches": ["backpropagation", "gradient_descent_dl"],
        "requires": ["loss_functions"],
    },
    "bp_optimization": {
        "teaches": ["gradient_descent_dl", "regularization_dl"],
        "requires": ["backpropagation"],
    },

    # pytorch
    "pt_tensors": {
        "teaches": ["pytorch_basics"],
        "requires": ["numpy_basics"],
    },
    "pt_autograd": {
        "teaches": ["pytorch_basics"],
        "requires": ["pytorch_basics", "backpropagation"],
    },
    "pt_training": {
        "teaches": ["pytorch_training"],
        "requires": ["pytorch_basics", "gradient_descent_dl"],
    },

    # CNN
    "cnn_convolutions": {
        "teaches": ["cnn_basics"],
        "requires": ["multilayer_network", "pytorch_basics"],
    },
    "cnn_pooling": {
        "teaches": ["cnn_basics"],
        "requires": ["cnn_basics"],
    },
    "cnn_architectures": {
        "teaches": ["cnn_architectures"],
        "requires": ["cnn_basics"],
    },
    "cnn_image_classification": {
        "teaches": ["image_classification", "transfer_learning"],
        "requires": ["cnn_architectures", "pytorch_training"],
    },

    # RNN
    "rnn_basics": {
        "teaches": ["rnn_basics"],
        "requires": ["multilayer_network", "pytorch_basics"],
    },
    "rnn_lstm": {
        "teaches": ["lstm_gru"],
        "requires": ["rnn_basics"],
    },
    "rnn_text_generation": {
        "teaches": ["text_generation"],
        "requires": ["lstm_gru", "pytorch_training"],
    },

    # transformers
    "transformer_attention": {
        "teaches": ["attention_mechanism"],
        "requires": ["rnn_basics"],
    },
    "transformer_self_attention": {
        "teaches": ["attention_mechanism"],
        "requires": ["attention_mechanism"],
    },
    "transformer_architecture": {
        "teaches": ["transformer_architecture", "bert_gpt"],
        "requires": ["attention_mechanism"],
    },

    # ── fun_automation ────────────────────────────────────────────────────
    "auto_file_organizer": {
        "teaches": ["file_automation"],
        "requires": ["file_reading", "file_writing", "modules_imports"],
    },
    "auto_web_scraper": {
        "teaches": ["web_scraping_auto", "web_scraping"],
        "requires": ["lists", "dictionaries", "error_handling"],
    },
    "auto_email_sender": {
        "teaches": ["email_automation"],
        "requires": ["functions_basics", "error_handling"],
    },
    "auto_pdf_merger": {
        "teaches": ["pdf_automation"],
        "requires": ["file_reading", "modules_imports"],
    },
    "fun_password_generator": {
        "teaches": ["password_generation"],
        "requires": ["functions_basics", "lists"],
    },
    "fun_quiz_game": {
        "teaches": ["cli_tools"],
        "requires": ["functions_basics", "lists", "conditionals"],
    },
}

# ---------------------------------------------------------------------------
# Real-world application hints per lesson (optional enrichment)
# ---------------------------------------------------------------------------
REAL_WORLD_APPS = {
    "auto_file_organizer": ["file management", "system administration"],
    "auto_web_scraper": ["data collection", "market research"],
    "auto_email_sender": ["notifications", "marketing"],
    "auto_pdf_merger": ["document management", "reporting"],
    "fun_password_generator": ["security", "credential management"],
    "fun_quiz_game": ["education", "gamification"],
    "sklearn_regression": ["price prediction", "forecasting"],
    "sklearn_classification": ["spam detection", "medical diagnosis"],
    "sklearn_clustering": ["customer segmentation", "anomaly detection"],
    "cnn_image_classification": ["medical imaging", "autonomous driving"],
    "rnn_text_generation": ["chatbots", "content creation"],
    "transformer_architecture": ["translation", "search engines"],
}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def build_tags(lesson_id: str, track: str) -> dict:
    """Build a tags dict for a lesson."""
    defaults = TRACK_DEFAULTS.get(track, TRACK_DEFAULTS["python_fundamentals"])
    mapping = LESSON_CONCEPT_MAP.get(lesson_id, None)

    if mapping:
        concepts_taught = mapping["teaches"]
        concepts_required = mapping["requires"]
    else:
        # Fallback: infer a concept from the lesson id
        concepts_taught = [lesson_id]
        concepts_required = []

    return {
        "concepts_taught": concepts_taught,
        "concepts_required": concepts_required,
        "difficulty": defaults["difficulty"],
        "engagement_type": defaults["engagement_type"],
        "estimated_minutes": defaults["estimated_minutes"],
        "real_world_application": REAL_WORLD_APPS.get(lesson_id, []),
        "category": defaults["category"],
        "path_memberships": [],
    }


def tag_lesson_file(filepath: Path) -> tuple[str, dict, bool]:
    """
    Read a lesson JSON, add tags if missing, write back.
    Returns (lesson_id, tags, was_modified).
    """
    with open(filepath, "r", encoding="utf-8") as f:
        data = json.load(f)

    lesson_id = data["id"]
    track = data.get("track", filepath.parent.name)

    if "tags" in data:
        return lesson_id, data["tags"], False

    tags = build_tags(lesson_id, track)
    data["tags"] = tags

    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
        f.write("\n")

    return lesson_id, tags, True


def populate_lesson_concepts(conn: sqlite3.Connection, lesson_id: str, tags: dict):
    """Insert lesson_concepts rows (INSERT OR IGNORE for idempotency)."""
    cursor = conn.cursor()
    for concept_id in tags.get("concepts_taught", []):
        cursor.execute(
            "INSERT OR IGNORE INTO lesson_concepts (lesson_id, concept_id, role, depth) "
            "VALUES (?, ?, 'teaches', 'moderate')",
            (lesson_id, concept_id),
        )
    for concept_id in tags.get("concepts_required", []):
        cursor.execute(
            "INSERT OR IGNORE INTO lesson_concepts (lesson_id, concept_id, role, depth) "
            "VALUES (?, ?, 'requires', 'moderate')",
            (lesson_id, concept_id),
        )


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    print("=" * 60)
    print("  PyMasters Lesson Tagger")
    print("=" * 60)

    # Collect all lesson JSON files
    tracks = ["python_fundamentals", "ai_ml_foundations", "deep_learning", "fun_automation"]
    lesson_files: list[Path] = []
    for track in tracks:
        track_dir = LESSONS_DIR / track
        if track_dir.exists():
            lesson_files.extend(sorted(track_dir.glob("*.json")))

    print(f"\nFound {len(lesson_files)} lesson files across {len(tracks)} tracks.\n")

    if not lesson_files:
        print("No lesson files found. Exiting.")
        return

    # Open DB connection
    db_exists = os.path.exists(DB_PATH)
    conn = sqlite3.connect(DB_PATH)

    if not db_exists:
        print(f"[WARN] Database not found at {DB_PATH}. Creating tables...")

    # Ensure lesson_concepts table exists
    conn.execute("""
        CREATE TABLE IF NOT EXISTS lesson_concepts (
            lesson_id TEXT NOT NULL,
            concept_id TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'teaches',
            depth TEXT DEFAULT 'moderate',
            PRIMARY KEY (lesson_id, concept_id, role)
        )
    """)
    conn.execute("CREATE INDEX IF NOT EXISTS idx_lesson_concepts_lesson ON lesson_concepts(lesson_id)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_lesson_concepts_concept ON lesson_concepts(concept_id)")

    # Process each lesson
    json_modified = 0
    json_skipped = 0
    db_rows_before = conn.execute("SELECT COUNT(*) FROM lesson_concepts").fetchone()[0]
    unmapped = []

    for filepath in lesson_files:
        track = filepath.parent.name
        lesson_id, tags, was_modified = tag_lesson_file(filepath)

        if was_modified:
            json_modified += 1
        else:
            json_skipped += 1

        if lesson_id not in LESSON_CONCEPT_MAP:
            unmapped.append(lesson_id)

        populate_lesson_concepts(conn, lesson_id, tags)

    conn.commit()

    db_rows_after = conn.execute("SELECT COUNT(*) FROM lesson_concepts").fetchone()[0]
    conn.close()

    # Summary
    print("-" * 60)
    print("  SUMMARY")
    print("-" * 60)
    print(f"  Lesson files processed : {len(lesson_files)}")
    print(f"  JSON tags added        : {json_modified}")
    print(f"  JSON already tagged    : {json_skipped}")
    print(f"  DB rows before         : {db_rows_before}")
    print(f"  DB rows after          : {db_rows_after}")
    print(f"  DB rows inserted       : {db_rows_after - db_rows_before}")

    if unmapped:
        print(f"\n  [INFO] {len(unmapped)} lessons used fallback mapping:")
        for lid in unmapped:
            print(f"    - {lid}")

    print("\nDone.")


if __name__ == "__main__":
    main()
