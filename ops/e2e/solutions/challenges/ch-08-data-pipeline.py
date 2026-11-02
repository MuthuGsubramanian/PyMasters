from typing import Callable, Generic, List, TypeVar

T = TypeVar("T")


class Pipeline(Generic[T]):
    def __init__(self, steps=None):
        self.steps: List[Callable[[list], list]] = list(steps or [])

    def map(self, fn: Callable) -> "Pipeline":
        return Pipeline(self.steps + [lambda xs: [fn(x) for x in xs]])

    def filter(self, pred: Callable) -> "Pipeline":
        return Pipeline(self.steps + [lambda xs: [x for x in xs if pred(x)]])

    def execute(self, data: list) -> list:
        for step in self.steps:
            data = step(data)
        return list(data)
