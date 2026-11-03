import asyncio


async def fetch_url(url: str, timeout: int = 10) -> str:
    """Fetch a single URL. Return response text or raise."""
    import aiohttp                      # ImportError in the sandbox is handled by fetch_all like any failure
    async with aiohttp.ClientSession() as session:
        async with session.get(url, timeout=aiohttp.ClientTimeout(total=timeout)) as resp:
            return await resp.text()


async def fetch_all(urls: list[str], max_concurrent: int = 5, timeout: int = 10) -> dict[str, str]:
    """Fetch every URL concurrently (at most max_concurrent at once); failures become 'error: ...' strings."""
    sem = asyncio.Semaphore(max_concurrent)

    async def one(url):
        async with sem:
            try:
                return url, await asyncio.wait_for(fetch_url(url, timeout), timeout)
            except Exception as e:
                return url, f"error: {e!r}"
    return dict(await asyncio.gather(*(one(u) for u in urls)))
