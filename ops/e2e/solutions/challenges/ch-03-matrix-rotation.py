def rotate_90(matrix: list[list[int]]) -> None:
    """Rotate NxN matrix 90 degrees clockwise in place: transpose, then reverse each row."""
    n = len(matrix)
    for i in range(n):
        for j in range(i + 1, n):
            matrix[i][j], matrix[j][i] = matrix[j][i], matrix[i][j]
    for row in matrix:
        row.reverse()
