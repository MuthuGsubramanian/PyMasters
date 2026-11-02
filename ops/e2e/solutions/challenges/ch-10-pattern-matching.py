def evaluate(expr) -> float:
    match expr:
        case int() | float():
            return expr
        case ("add", a, b):
            return evaluate(a) + evaluate(b)
        case ("sub", a, b):
            return evaluate(a) - evaluate(b)
        case ("mul", a, b):
            return evaluate(a) * evaluate(b)
        case ("div", a, b):
            return evaluate(a) / evaluate(b)
        case ("neg", a):
            return -evaluate(a)
        case _:
            raise ValueError(f"unknown expression: {expr!r}")
