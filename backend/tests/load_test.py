"""
Minimal load test (stdlib only) for the deployed or local API.

Logs in once, then fires concurrent authenticated GETs at read-heavy endpoints and
reports throughput and latency percentiles.

    python backend/tests/load_test.py --base https://<cloudfront-domain>/api/core \
        --concurrency 10 --requests 300
"""

import argparse
import json
import statistics
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor

ENDPOINTS = ["/dashboard", "/projects", "/deliverables", "/allocations/utilisation", "/budget"]


def _request(url: str, token: str | None = None, body: dict | None = None) -> tuple[int, bytes]:
    req = urllib.request.Request(url, data=json.dumps(body).encode() if body else None, method="POST" if body else "GET")
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return resp.status, resp.read()
    except urllib.error.HTTPError as err:
        return err.code, b""


def main() -> None:
    """Run the load test and print a summary."""
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--base", default="http://localhost:3001/api/core")
    parser.add_argument("--concurrency", type=int, default=10)
    parser.add_argument("--requests", type=int, default=200)
    parser.add_argument("--email", default="viewer@acme.com")
    parser.add_argument("--password", default="Password123")
    args = parser.parse_args()

    status, body = _request(f"{args.base}/auth/login", body={"email": args.email, "password": args.password})
    if status != 200:
        raise SystemExit(f"Login failed with HTTP {status}")
    token = json.loads(body)["access_token"]

    def hit(i: int) -> tuple[str, int, float]:
        path = ENDPOINTS[i % len(ENDPOINTS)]
        start = time.perf_counter()
        code, _ = _request(f"{args.base}{path}", token)
        return path, code, (time.perf_counter() - start) * 1000

    started = time.perf_counter()
    with ThreadPoolExecutor(max_workers=args.concurrency) as pool:
        results = list(pool.map(hit, range(args.requests)))
    elapsed = time.perf_counter() - started

    latencies = sorted(r[2] for r in results)
    errors = [r for r in results if r[1] != 200]
    pct = lambda p: latencies[min(len(latencies) - 1, int(len(latencies) * p))]  # noqa: E731
    print(f"requests={len(results)} concurrency={args.concurrency} duration={elapsed:.1f}s "
          f"throughput={len(results) / elapsed:.1f} req/s errors={len(errors)}")
    print(f"latency ms: p50={pct(0.50):.0f} p90={pct(0.90):.0f} p95={pct(0.95):.0f} "
          f"p99={pct(0.99):.0f} max={latencies[-1]:.0f} mean={statistics.mean(latencies):.0f}")
    for path in ENDPOINTS:
        lat = sorted(r[2] for r in results if r[0] == path)
        print(f"  {path:<26} p50={lat[len(lat) // 2]:.0f}ms  p95={lat[min(len(lat) - 1, int(len(lat) * 0.95))]:.0f}ms")
    if errors:
        print("error status codes:", sorted({e[1] for e in errors}))


if __name__ == "__main__":
    main()
