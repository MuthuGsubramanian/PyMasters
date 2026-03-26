"""Animation template library for dynamic module generation.

Maps concept types to composable animation patterns.
"""

CONCEPT_TEMPLATES = {
    "loop_iteration": {
        "description": "Loops, iteration, repetition",
        "sequence": [
            {"type": "StoryCard", "content": "story_variant"},
            {"type": "CodeStepper", "props": {}},
            {"type": "VariableBox", "props": {}},
            {"type": "TerminalOutput", "props": {}},
        ],
    },
    "data_structure": {
        "description": "Lists, dicts, sets, trees, graphs",
        "sequence": [
            {"type": "StoryCard", "content": "story_variant"},
            {"type": "DataStructure", "props": {}},
            {"type": "CodeStepper", "props": {}},
            {"type": "VariableBox", "props": {}},
        ],
    },
    "function_call": {
        "description": "Functions, scope, closures, recursion",
        "sequence": [
            {"type": "StoryCard", "content": "story_variant"},
            {"type": "CodeStepper", "props": {}},
            {"type": "MemoryStack", "props": {}},
            {"type": "TerminalOutput", "props": {}},
        ],
    },
    "comparison": {
        "description": "Comparing two approaches, before/after",
        "sequence": [
            {"type": "StoryCard", "content": "story_variant"},
            {"type": "ComparisonPanel", "props": {}},
            {"type": "CodeStepper", "props": {}},
        ],
    },
    "algorithm": {
        "description": "Algorithms, step-by-step processes",
        "sequence": [
            {"type": "StoryCard", "content": "story_variant"},
            {"type": "FlowArrow", "props": {}},
            {"type": "CodeStepper", "props": {}},
            {"type": "VariableBox", "props": {}},
        ],
    },
    "neural_network": {
        "description": "Neural networks, layers, weights",
        "sequence": [
            {"type": "StoryCard", "content": "story_variant"},
            {"type": "ConceptMap", "props": {}},
            {"type": "FlowArrow", "props": {}},
            {"type": "DataStructure", "props": {}},
        ],
    },
    "io_operation": {
        "description": "File I/O, input/output",
        "sequence": [
            {"type": "StoryCard", "content": "story_variant"},
            {"type": "CodeStepper", "props": {}},
            {"type": "TerminalOutput", "props": {}},
        ],
    },
    "concept_explanation": {
        "description": "Abstract concepts, theory",
        "sequence": [
            {"type": "StoryCard", "content": "story_variant"},
            {"type": "ConceptMap", "props": {}},
            {"type": "ComparisonPanel", "props": {}},
        ],
    },
}


def get_template_for_topic(topic_description: str) -> str:
    """Return the best template key for a given topic."""
    topic_lower = topic_description.lower()
    keyword_map = {
        "loop_iteration": ["loop", "iterate", "for", "while", "repeat", "range", "comprehension"],
        "data_structure": ["list", "dict", "set", "tuple", "tree", "graph", "stack", "queue", "array", "dataframe"],
        "function_call": ["function", "def", "scope", "closure", "recursion", "lambda", "decorator", "generator"],
        "comparison": ["compare", "vs", "difference", "versus", "tradeoff", "before", "after"],
        "algorithm": ["algorithm", "sort", "search", "binary", "dynamic programming", "greedy"],
        "neural_network": ["neural", "network", "layer", "perceptron", "cnn", "rnn", "transformer", "attention", "backprop"],
        "io_operation": ["file", "read", "write", "io", "stream", "csv", "json"],
        "concept_explanation": ["concept", "theory", "pattern", "principle", "paradigm", "oop", "class"],
    }
    for template_key, keywords in keyword_map.items():
        if any(kw in topic_lower for kw in keywords):
            return template_key
    return "concept_explanation"
