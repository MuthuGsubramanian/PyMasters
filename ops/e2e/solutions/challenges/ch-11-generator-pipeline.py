from typing import Callable, Generator, Iterable, TypeVar

T = TypeVar("T")


def read_chunks(data: Iterable[T], size: int) -> Generator[list, None, None]:
    chunk = []
    for item in data:
        chunk.append(item)
        if len(chunk) == size:
            yield chunk
            chunk = []
    if chunk:
        yield chunk


def transform(chunks: Iterable, fn: Callable) -> Generator:
    for chunk in chunks:
        yield fn(chunk)


def batch_filter(items: Iterable[T], pred: Callable[[T], bool]) -> Generator[T, None, None]:
    for item in items:
        if pred(item):
            yield item


def pipeline(data: Iterable, *stages: Callable) -> Generator:
    """Chain stages lazily: each stage takes the previous stage's iterable and returns a new one."""
    for stage in stages:
        data = stage(data)
    yield from data
