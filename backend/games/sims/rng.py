"""mulberry32 — bit-exact twin of frontend/src/games/engine/rng.js."""

MASK = 0xFFFFFFFF


def mulberry32(seed: int):
    state = [seed & MASK]

    def nxt() -> float:
        state[0] = (state[0] + 0x6D2B79F5) & MASK
        t = state[0]
        t = ((t ^ (t >> 15)) * (t | 1)) & MASK
        t = (t ^ (t + (((t ^ (t >> 7)) * (t | 61)) & MASK))) & MASK
        return ((t ^ (t >> 14)) & MASK) / 4294967296

    return nxt


def crc32(s: str) -> int:
    import zlib
    return zlib.crc32(s.encode("utf-8")) & MASK
