import functools
import inspect
import time


def timer(func):
    @functools.wraps(func)
    def wrapper(*args, **kwargs):
        start = time.perf_counter()
        result = func(*args, **kwargs)
        print(f"{func.__name__} took {time.perf_counter() - start:.4f}s")
        return result
    return wrapper


def retry(max_attempts: int = 3):
    def decorator(func):
        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            for attempt in range(1, max_attempts + 1):
                try:
                    return func(*args, **kwargs)
                except Exception:
                    if attempt == max_attempts:
                        raise
        return wrapper
    return decorator


def validate_types(func):
    sig = inspect.signature(func)

    @functools.wraps(func)
    def wrapper(*args, **kwargs):
        for name, value in sig.bind(*args, **kwargs).arguments.items():
            expected = func.__annotations__.get(name)
            if isinstance(expected, type) and not isinstance(value, expected):
                raise TypeError(f"{name} must be {expected.__name__}, got {type(value).__name__}")
        return func(*args, **kwargs)
    return wrapper
