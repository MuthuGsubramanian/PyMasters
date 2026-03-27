"""Animation template library for dynamic module generation.

Maps concept types to composable animation patterns.
Every template now includes visual code flow components
(FlowDiagram, ExecutionVisualizer, LoopVisualizer) as appropriate.
"""

CONCEPT_TEMPLATES = {
    "loop_iteration": {
        "description": "Loops, iteration, repetition",
        "sequence": [
            {"type": "StoryCard", "content": "story_variant"},
            {"type": "LoopVisualizer", "props": {}},
            {"type": "ExecutionVisualizer", "props": {}},
            {"type": "FlowDiagram", "props": {}},
            {"type": "TerminalOutput", "props": {}},
        ],
        "visual_flow_prompt": (
            "Generate a LoopVisualizer config showing the loop iterating through its collection step by step, "
            "an ExecutionVisualizer with line-by-line execution steps showing variables changing, "
            "and a FlowDiagram with nodes for Start, init, condition check, body, increment, loop back, and End."
        ),
    },
    "data_structure": {
        "description": "Lists, dicts, sets, trees, graphs",
        "sequence": [
            {"type": "StoryCard", "content": "story_variant"},
            {"type": "ExecutionVisualizer", "props": {}},
            {"type": "DataStructure", "props": {}},
            {"type": "CodeStepper", "props": {}},
            {"type": "TerminalOutput", "props": {}},
        ],
        "visual_flow_prompt": (
            "Generate an ExecutionVisualizer showing step-by-step how the data structure is created and modified, "
            "with variables tracking the structure's state at each step."
        ),
    },
    "function_call": {
        "description": "Functions, scope, closures, recursion",
        "sequence": [
            {"type": "StoryCard", "content": "story_variant"},
            {"type": "ExecutionVisualizer", "props": {}},
            {"type": "FlowDiagram", "props": {}},
            {"type": "MemoryStack", "props": {}},
            {"type": "TerminalOutput", "props": {}},
        ],
        "visual_flow_prompt": (
            "Generate an ExecutionVisualizer showing the function being defined, then called, "
            "with variables entering scope inside the function and the return value flowing back. "
            "Generate a FlowDiagram with nodes for: call site, enter function, execute body, return, resume caller."
        ),
    },
    "conditional": {
        "description": "If/else, elif, match/case, branching logic",
        "sequence": [
            {"type": "StoryCard", "content": "story_variant"},
            {"type": "FlowDiagram", "props": {}},
            {"type": "ExecutionVisualizer", "props": {}},
            {"type": "TerminalOutput", "props": {}},
        ],
        "visual_flow_prompt": (
            "Generate a FlowDiagram showing the if/elif/else decision tree with True and False branches, "
            "and an execution path showing which branch is taken for the example values. "
            "Generate an ExecutionVisualizer showing the condition being evaluated step by step."
        ),
    },
    "comparison": {
        "description": "Comparing two approaches, before/after",
        "sequence": [
            {"type": "StoryCard", "content": "story_variant"},
            {"type": "ComparisonPanel", "props": {}},
            {"type": "ExecutionVisualizer", "props": {}},
            {"type": "TerminalOutput", "props": {}},
        ],
        "visual_flow_prompt": (
            "Generate an ExecutionVisualizer for the 'after' (improved) version, "
            "showing how the optimized code executes differently."
        ),
    },
    "algorithm": {
        "description": "Algorithms, step-by-step processes, sorting, searching",
        "sequence": [
            {"type": "StoryCard", "content": "story_variant"},
            {"type": "FlowDiagram", "props": {}},
            {"type": "ExecutionVisualizer", "props": {}},
            {"type": "DataStructure", "props": {}},
            {"type": "TerminalOutput", "props": {}},
        ],
        "visual_flow_prompt": (
            "Generate a FlowDiagram showing the algorithm's decision flow (comparisons, swaps, recursion). "
            "Generate an ExecutionVisualizer showing the algorithm processing data step by step "
            "with variables tracking the current state (indices, comparisons, result)."
        ),
    },
    "neural_network": {
        "description": "Neural networks, layers, weights, training",
        "sequence": [
            {"type": "StoryCard", "content": "story_variant"},
            {"type": "FlowDiagram", "props": {}},
            {"type": "ExecutionVisualizer", "props": {}},
            {"type": "DataStructure", "props": {}},
            {"type": "TerminalOutput", "props": {}},
        ],
        "visual_flow_prompt": (
            "Generate a FlowDiagram showing the forward pass through layers or the training loop flow. "
            "Generate an ExecutionVisualizer showing weights/loss values changing during training steps."
        ),
    },
    "io_operation": {
        "description": "File I/O, input/output, API calls",
        "sequence": [
            {"type": "StoryCard", "content": "story_variant"},
            {"type": "ExecutionVisualizer", "props": {}},
            {"type": "FlowDiagram", "props": {}},
            {"type": "TerminalOutput", "props": {}},
        ],
        "visual_flow_prompt": (
            "Generate an ExecutionVisualizer showing the file/API operation step by step. "
            "Generate a FlowDiagram showing the data flow: open → read/write → process → close."
        ),
    },
    "concept_explanation": {
        "description": "Abstract concepts, theory, OOP, patterns",
        "sequence": [
            {"type": "StoryCard", "content": "story_variant"},
            {"type": "ConceptMap", "props": {}},
            {"type": "ExecutionVisualizer", "props": {}},
            {"type": "ComparisonPanel", "props": {}},
            {"type": "TerminalOutput", "props": {}},
        ],
        "visual_flow_prompt": (
            "Generate an ExecutionVisualizer demonstrating the concept with a concrete code example, "
            "showing variables and state changing step by step."
        ),
    },
    "web_development": {
        "description": "HTTP, APIs, frameworks, web concepts",
        "sequence": [
            {"type": "StoryCard", "content": "story_variant"},
            {"type": "FlowDiagram", "props": {}},
            {"type": "ExecutionVisualizer", "props": {}},
            {"type": "ComparisonPanel", "props": {}},
            {"type": "TerminalOutput", "props": {}},
        ],
        "visual_flow_prompt": (
            "Generate a FlowDiagram showing the request/response flow or framework routing. "
            "Generate an ExecutionVisualizer showing the server-side code processing a request."
        ),
    },
    "testing": {
        "description": "Testing, TDD, CI/CD, quality",
        "sequence": [
            {"type": "StoryCard", "content": "story_variant"},
            {"type": "ExecutionVisualizer", "props": {}},
            {"type": "FlowDiagram", "props": {}},
            {"type": "ComparisonPanel", "props": {}},
            {"type": "TerminalOutput", "props": {}},
        ],
        "visual_flow_prompt": (
            "Generate an ExecutionVisualizer showing a test running: arrange → act → assert. "
            "Generate a FlowDiagram showing the TDD cycle or CI/CD pipeline stages."
        ),
    },
    "ai_ml": {
        "description": "AI, ML, prompts, LLMs, agents",
        "sequence": [
            {"type": "StoryCard", "content": "story_variant"},
            {"type": "FlowDiagram", "props": {}},
            {"type": "ExecutionVisualizer", "props": {}},
            {"type": "DataStructure", "props": {}},
            {"type": "TerminalOutput", "props": {}},
        ],
        "visual_flow_prompt": (
            "Generate a FlowDiagram showing the AI/ML pipeline or agent decision flow. "
            "Generate an ExecutionVisualizer showing model training/inference code executing step by step."
        ),
    },
}


def get_template_for_topic(topic_description: str) -> str:
    """Return the best template key for a given topic."""
    topic_lower = topic_description.lower()
    keyword_map = {
        "loop_iteration": ["loop", "iterate", "for", "while", "repeat", "range", "comprehension", "enumerate"],
        "conditional": ["if", "else", "elif", "condition", "branch", "match", "case", "decision", "boolean"],
        "data_structure": ["list", "dict", "set", "tuple", "tree", "graph", "stack", "queue", "array", "dataframe", "linked"],
        "function_call": ["function", "def", "scope", "closure", "recursion", "lambda", "decorator", "generator", "return"],
        "comparison": ["compare", "vs", "difference", "versus", "tradeoff", "before", "after", "refactor"],
        "algorithm": ["algorithm", "sort", "search", "binary", "dynamic programming", "greedy", "bfs", "dfs", "dijkstra"],
        "neural_network": ["neural", "network", "layer", "perceptron", "cnn", "rnn", "transformer", "attention", "backprop", "pytorch", "tensor"],
        "io_operation": ["file", "read", "write", "io", "stream", "csv", "json", "pdf", "email", "scrape"],
        "web_development": ["http", "api", "flask", "django", "fastapi", "rest", "html", "css", "deploy", "docker", "web", "route", "endpoint"],
        "testing": ["test", "pytest", "tdd", "ci", "cd", "mock", "assert", "coverage", "git", "package", "pip"],
        "ai_ml": ["ai", "ml", "machine learning", "prompt", "llm", "rag", "embedding", "agent", "langchain", "openai", "claude", "sklearn"],
        "concept_explanation": ["concept", "theory", "pattern", "principle", "paradigm", "oop", "class", "type hint", "dataclass", "async"],
    }
    for template_key, keywords in keyword_map.items():
        if any(kw in topic_lower for kw in keywords):
            return template_key
    return "concept_explanation"
