"""pmsocial — PyMasters social bot CLI.

  python -m socialbot produce {short|long|linkedin} [--lesson KEY]   write, gate and render one item
  python -m socialbot publish [--dry-run]                             publish due rendered items
  python -m socialbot tick                                            scheduled run: produce what the cadence needs, publish what is due
  python -m socialbot status                                          recent items
  python -m socialbot auth {youtube|linkedin}                         one-time OAuth in Eighty
  python -m socialbot metrics                                         refresh views/engagement
"""
import argparse
import json
import logging
import sys

from socialbot import config, store


def main(argv=None):
    config.ensure_dirs()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    ap = argparse.ArgumentParser(prog="pmsocial")
    sub = ap.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("produce"); p.add_argument("kind", choices=["short", "long", "linkedin"]); p.add_argument("--lesson")
    p = sub.add_parser("publish"); p.add_argument("--dry-run", action="store_true")
    sub.add_parser("tick")
    p = sub.add_parser("status"); p.add_argument("--limit", type=int, default=15)
    p = sub.add_parser("auth"); p.add_argument("service", choices=["youtube", "linkedin", "linkedin-page"])
    sub.add_parser("metrics")
    sub.add_parser("report")
    a = ap.parse_args(argv)

    if a.cmd == "produce":
        from socialbot import pipeline
        item_id = pipeline.produce(a.kind, a.lesson)
        it = store.get_item(item_id)
        print(json.dumps({k: it[k] for k in ("id", "kind", "status", "score", "topic", "error")}, indent=1))
        print(json.dumps(it.get("media"), indent=1))
    elif a.cmd == "publish":
        from socialbot import scheduler
        scheduler.publish_due(dry_run=a.dry_run)
    elif a.cmd == "tick":
        from socialbot import scheduler
        scheduler.tick()
    elif a.cmd == "status":
        for it in store.items(limit=a.limit):
            print(f"#{it['id']:<4} {it['kind']:<8} {it['status']:<10} {str(it['score'] or ''):<5} "
                  f"{(it['publish_at'] or '')[:16]:<16} {it['topic'][:44]:<44} {it['remote_url'] or it['error'] or ''}")
    elif a.cmd == "auth":
        from socialbot import auth
        {"youtube": auth.youtube, "linkedin": lambda: auth.linkedin("member"),
         "linkedin-page": lambda: auth.linkedin("org")}[a.service]()
    elif a.cmd == "report":
        from socialbot import report
        print(report.text())
    elif a.cmd == "metrics":
        from socialbot import scheduler
        scheduler.refresh_metrics()
    return 0


if __name__ == "__main__":
    sys.exit(main())
