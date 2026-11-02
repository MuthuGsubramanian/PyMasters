from bisect import bisect_left, bisect_right


def find_first(arr: list[int], target: int) -> int:
    i = bisect_left(arr, target)
    return i if i < len(arr) and arr[i] == target else -1


def find_last(arr: list[int], target: int) -> int:
    i = bisect_right(arr, target) - 1
    return i if i >= 0 and arr[i] == target else -1


def find_insert_pos(arr: list[int], target: int) -> int:
    return bisect_left(arr, target)
