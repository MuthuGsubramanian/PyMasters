"""pmsocial — PyMasters social bot CLI.

  python -m socialbot produce {short|long|linkedin} [--lesson KEY]   write, gate and render one item
  python -m socialbot publish [--dry-run]                             publish due rendered items
  python -m socialbot tick                                            scheduled run: produce what the cadence needs, publish what is due
  python -m socialbot status                                          recent items
  python -m socialbot auth {youtube|linkedin|drive}                   one-time OAuth in Eighty
  python -m socialbot sync-drive [--limit N] [--force]                back up all generated posts, shorts & videos to Google Drive
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
    p = sub.add_parser("produce"); p.add_argument("kind", choices=["short", "long", "linkedin", "thematic", "influencer"]); p.add_argument("--lesson"); p.add_argument("--bilingual", action="store_true"); p.add_argument("--presenter"); p.add_argument("--presenter-avatar", action="store_true", help="Use official PyMasters presenter avatar pack for thumbnails/cards")
    p = sub.add_parser("telegram-pack"); p.add_argument("--topic", required=True); p.add_argument("--out-dir", required=True); p.add_argument("--code", default=""); p.add_argument("--mode", choices=["hybrid", "composite", "multimodal"], default="hybrid"); p.add_argument("--motion", action="store_true")
    p = sub.add_parser("publish"); p.add_argument("--dry-run", action="store_true")
    sub.add_parser("tick")
    sub.add_parser("linkedin-hourly")
    p = sub.add_parser("status"); p.add_argument("--limit", type=int, default=15)
    p = sub.add_parser("auth"); p.add_argument("service", choices=["youtube", "linkedin", "linkedin-page", "drive"])
    p = sub.add_parser("sync-drive"); p.add_argument("--limit", type=int, default=500); p.add_argument("--force", action="store_true")
    sub.add_parser("metrics")
    sub.add_parser("report")
    a = ap.parse_args(argv)

    if a.cmd == "produce":
        from socialbot import pipeline
        if a.kind == "influencer":
            item_id = pipeline.produce_influencer(a.lesson, bilingual_hook=a.bilingual, presenter_mp4=a.presenter)
        else:
            item_id = pipeline.produce(a.kind, a.lesson, use_presenter_avatar=(True if a.presenter_avatar else None))
        it = store.get_item(item_id)
        print(json.dumps({k: it[k] for k in ("id", "kind", "status", "score", "topic", "error")}, indent=1))
        print(json.dumps(it.get("media"), indent=1))
    elif a.cmd == "telegram-pack":
        from socialbot import presenter_pack
        res = presenter_pack.build_telegram_broadcast_pack(
            topic=a.topic, out_dir=a.out_dir, code=a.code, mode=a.mode, motion=a.motion
        )
        print(json.dumps(res["metadata"], indent=1))
    elif a.cmd == "publish":
        from socialbot import scheduler
        scheduler.publish_due(dry_run=a.dry_run)
    elif a.cmd == "tick":
        from socialbot import scheduler
        scheduler.tick()
    elif a.cmd == "linkedin-hourly":
        from socialbot import scheduler
        scheduler.linkedin_hourly_tick()
    elif a.cmd == "status":
        for it in store.items(limit=a.limit):
            print(f"#{it['id']:<4} {it['kind']:<8} {it['status']:<10} {str(it['score'] or ''):<5} "
                  f"{(it['publish_at'] or '')[:16]:<16} {it['topic'][:44]:<44} {it['remote_url'] or it['error'] or ''}")
    elif a.cmd == "auth":
        from socialbot import auth
        {"youtube": auth.youtube, "linkedin": lambda: auth.linkedin("member"),
         "linkedin-page": lambda: auth.linkedin("org"), "drive": auth.drive}[a.service]()
    elif a.cmd == "sync-drive":
        from socialbot.publish import drive
        print(json.dumps(drive.sync_all(limit=a.limit, force=a.force), indent=1))
    elif a.cmd == "report":
        from socialbot import report
        print(report.text())
    elif a.cmd == "metrics":
        from socialbot import scheduler
        scheduler.refresh_metrics()
    return 0


if __name__ == "__main__":
    sys.exit(main())
