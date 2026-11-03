from collections import deque


def bfs(graph: dict, start) -> list:
    seen, order, q = {start}, [], deque([start])
    while q:
        node = q.popleft()
        order.append(node)
        for nxt in graph.get(node, []):
            if nxt not in seen:
                seen.add(nxt)
                q.append(nxt)
    return order


def dfs(graph: dict, start) -> list:
    seen, order = set(), []

    def visit(node):
        seen.add(node)
        order.append(node)
        for nxt in graph.get(node, []):
            if nxt not in seen:
                visit(nxt)
    visit(start)
    return order


def shortest_path(graph: dict, start, end) -> list:
    prev, q = {start: None}, deque([start])
    while q:
        node = q.popleft()
        if node == end:
            path = []
            while node is not None:
                path.append(node)
                node = prev[node]
            return path[::-1]
        for nxt in graph.get(node, []):
            if nxt not in prev:
                prev[nxt] = node
                q.append(nxt)
    return []


def has_cycle(graph: dict) -> bool:
    state = {}                          # 1 = on the current path, 2 = finished

    def visit(node) -> bool:
        state[node] = 1
        for nxt in graph.get(node, []):
            if state.get(nxt) == 1 or (nxt not in state and visit(nxt)):
                return True
        state[node] = 2
        return False
    return any(node not in state and visit(node) for node in graph)
