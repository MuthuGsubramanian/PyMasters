"""Validator for a lesson's optional `under_the_hood` topic explainer (the "How it works" tab).

Same rules as ~/pymasters-ops/content/validate_uth_topic.py, which content authors run. Shape (every string may
also be a {"en": ..., "ta": ...} object; "en" is required):

{
  "summary":  str (40-280),
  "steps": [                                  # 4-7 steps that build the mechanism up in order
    {"title": str (3-80),
     "body":  str (60-600),
     "visual": {"type": <key of CONSUMES>, "props": {...}}    # optional; keys must be ones that type consumes
    }
  ],                                          # at least 2 steps carry a visual
  "takeaway": str (30-400)
}
"""

# Mirrors frontend/src/components/animations/normalize.js CONTRACT (the frontend contract test is the authority).
CONSUMES = {
    "VariableBox": ["variable", "values", "value", "animate_sequence", "label", "data_type", "dataType",
                    "variables", "boxes"],
    "TerminalOutput": ["output", "lines"],
    "FlowArrow": ["label", "branch", "direction", "stages", "steps", "nodes", "flows", "from", "to"],
    "DataStructure": ["structure", "data", "operations", "structure_type", "highlight_cells", "highlight",
                      "highlight_color", "highlightColor", "initial_state", "items", "labels", "label",
                      "animations", "pending_append"],
    "MemoryStack": ["frames", "slots", "operations"],
    "ComparisonPanel": ["before", "after", "left", "right", "left_label", "right_label", "left_content",
                        "right_content", "items", "models", "comparisons", "x_labels"],
    "ConceptMap": ["nodes", "edges"],
    "FlowDiagram": ["nodes", "edges", "executionPath", "variables"],
    "NeuralNetworkVisualizer": ["layers", "labels", "activations"],
    "AlgorithmVisualizer": ["algorithm", "data", "target"],
    "TreeVisualizer": ["data", "operations", "operationArgs"],
    "CodeStepper": ["code", "steps", "highlightSequence", "stepDescriptions"],
}
CAPTION_KEYS = {"title", "description", "caption"}


def _text(v, path, lo, hi, errs):
    if isinstance(v, dict):
        en = v.get("en")
        if not isinstance(en, str):
            errs.append(f"{path}: localized object needs an 'en' string")
            return
        v = en
    if not isinstance(v, str) or not v.strip():
        errs.append(f"{path}: missing text")
        return
    n = len(v.strip())
    if n < lo or n > hi:
        errs.append(f"{path}: {n} chars (want {lo}-{hi})")
    if "TODO" in v or "lorem" in v.lower():
        errs.append(f"{path}: placeholder text")


def validate_under_the_hood(obj) -> list:
    """Return a list of human-readable errors; empty means valid."""
    errs = []
    if not isinstance(obj, dict):
        return ["under_the_hood must be an object"]
    unknown = set(obj) - {"summary", "steps", "takeaway"}
    if unknown:
        errs.append(f"unknown keys {sorted(unknown)}")
    _text(obj.get("summary"), "summary", 40, 280, errs)
    _text(obj.get("takeaway"), "takeaway", 30, 400, errs)
    steps = obj.get("steps")
    if not isinstance(steps, list) or not 4 <= len(steps) <= 7:
        errs.append("steps: need 4-7 steps")
        return errs
    visuals = 0
    for i, st in enumerate(steps):
        p = f"steps[{i}]"
        if not isinstance(st, dict):
            errs.append(f"{p}: must be an object")
            continue
        extra = set(st) - {"title", "body", "visual"}
        if extra:
            errs.append(f"{p}: unknown keys {sorted(extra)}")
        _text(st.get("title"), f"{p}.title", 3, 80, errs)
        _text(st.get("body"), f"{p}.body", 60, 600, errs)
        vis = st.get("visual")
        if vis is None:
            continue
        visuals += 1
        if not isinstance(vis, dict) or vis.get("type") not in CONSUMES or not isinstance(vis.get("props"), dict):
            errs.append(f"{p}.visual: needs type in {sorted(CONSUMES)} and a props object")
            continue
        bad = set(vis["props"]) - set(CONSUMES[vis["type"]]) - CAPTION_KEYS
        if bad:
            errs.append(f"{p}.visual: {vis['type']} does not use props {sorted(bad)}")
        if not vis["props"]:
            errs.append(f"{p}.visual: empty props")
    if visuals < 2:
        errs.append(f"need at least 2 steps with a visual (have {visuals})")
    return errs
