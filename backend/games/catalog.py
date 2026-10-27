"""The six launch games. Ids are stable API values; titles/blurbs are UI copy."""

GAMES = {
    "output_oracle": {
        "id": "output_oracle", "title": "Output Oracle",
        "blurb": "Predict exactly what the snippet prints before the interpreter does.",
        "kind": "bank", "levels": 6, "bank": "output_oracle", "items_per_round": 6,
        "topics": ["variables", "lists", "ds_dicts", "ds_tuples", "conditionals", "for_loops",
                   "functions_scope", "comprehensions", "adv_generators", "adv_decorators", "errors_handling"],
    },
    "bug_hunt": {
        "id": "bug_hunt", "title": "Bug Hunt",
        "blurb": "Find the guilty line, then pick the fix that makes the test pass.",
        "kind": "bank", "levels": 6, "bank": "bug_hunt", "items_per_round": 6,
        "topics": ["conditionals", "for_loops", "while_loops", "functions_basics", "functions_args",
                   "lists", "errors_handling", "fileio_reading"],
    },
    "shape_sorter": {
        "id": "shape_sorter", "title": "Shape Sorter",
        "blurb": "Route each requirement to the right container: list, tuple, set or dict.",
        "kind": "bank", "levels": 6, "bank": "shape_sorter", "items_per_round": 6,
        "topics": ["lists", "ds_tuples", "ds_sets", "ds_dicts", "hash_tables", "queues", "stacks"],
    },
    "big_o_sprint": {
        "id": "big_o_sprint", "title": "Big-O Sprint",
        "blurb": "Tag the complexity, then watch the real operation counts race.",
        "kind": "bank", "levels": 6, "bank": "big_o_sprint", "items_per_round": 6,
        "topics": ["big_o_complexity", "searching", "sorting_basics", "hash_tables", "recursion_fundamentals"],
    },
    "gradient_golf": {
        "id": "gradient_golf", "title": "Gradient Golf",
        "blurb": "Pick a learning rate, swing, and sink the ball in the loss minimum.",
        "kind": "sim", "levels": 6, "bank": None, "items_per_round": 3,
        "topics": ["gradient_descent", "linear_regression_gd", "linear_regression", "neural_networks_intro"],
    },
    "overfit_detective": {
        "id": "overfit_detective", "title": "Overfit Detective",
        "blurb": "Fit the training points, commit, then face the hidden test set.",
        "kind": "sim", "levels": 6, "bank": None, "items_per_round": 3,
        "topics": ["model_evaluation", "train_test_split", "linear_regression", "logistic_regression"],
    },
}
