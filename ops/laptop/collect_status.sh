#!/bin/bash
# Collects PyMasters + GCP status facts into a markdown file for the daily email.
# Read-only: changes nothing in GCP, GitHub or on the VM.
set -u
export CLOUDSDK_CORE_DISABLE_PROMPTS=1
REPO=~/Documents/Development/PyMasters
OUT=~/pymasters-ops/reports/status-$(date +%F).md
APP=pymasters-app
OLD=festive-bazaar-424313-i5
GA=--account=muthu.g.subramanian@gmail.com   # owner of the legacy projects
WA=--account=muthu@pymasters.net             # org + main billing account
MEDIA=/mnt/eternity-store/EternityModels/pymasters-social
[ -d "${MEDIA%/*}" ] || MEDIA=~/.local/share/pymasters-social/media   # machines without the Eternity model store
sec() { echo; echo "## $1"; }

# The org account's gcloud login can expire (Workspace reauthentication). When it has, fall back to the
# owner's gmail account for every read it is allowed (billing, BigQuery, storage, compute list) and flag it;
# IAP SSH to the VM still needs the org account, so the VM sections will say "SSH to VM failed".
ORG_AUTH=ok
if ! timeout 15 gcloud auth print-access-token --quiet --account=muthu@pymasters.net >/dev/null 2>&1; then
  ORG_AUTH=expired
  export CLOUDSDK_CORE_ACCOUNT=muthu.g.subramanian@gmail.com
  WA=$GA
fi
GMAIL_AUTH=ok
if ! timeout 15 gcloud auth print-access-token --quiet --account=muthu.g.subramanian@gmail.com >/dev/null 2>&1; then
  GMAIL_AUTH=expired
fi

{
echo "# PyMasters daily status — $(date '+%F %H:%M %Z')"

sec "Open reminders"
[ "$ORG_AUTH" = expired ] && echo "- ACTION FOR OWNER (urgent): the laptop's gcloud login for muthu@pymasters.net expired. Run: ~/pymasters-ops/gcloud_reauth.sh (or gcloud auth login muthu@pymasters.net) on this laptop. Until then the VM checks and the nightly laptop DB backup cannot run (the VM's own Cloud Storage backup is unaffected)."
[ "$GMAIL_AUTH" = expired ] && echo "- ACTION FOR OWNER: the laptop's fallback gcloud login for muthu.g.subramanian@gmail.com also expired. Run: ~/pymasters-ops/gcloud_reauth.sh (or gcloud auth login muthu.g.subramanian@gmail.com)."
[ -s ~/pymasters-ops/reminders.txt ] && cat ~/pymasters-ops/reminders.txt || echo "- none"
Y=$(date -d yesterday +%F)
[ -e ~/pymasters-ops/reports/sent-$Y ] || echo "- ACTION FOR OPS: the daily status email for $Y was NOT sent (check ~/pymasters-ops/reports/send-$Y.log)."

sec "Site"
H=$(curl -s -m 15 https://pymasters.net/health)
echo "- /health: ${H:-NO RESPONSE}"
code=$(curl -s -o /dev/null -m 15 -w '%{http_code} %{time_total}s' https://pymasters.net/)
echo "- homepage: HTTP $code"
git -C "$REPO" fetch -q origin main 2>/dev/null
MAIN=$(git -C "$REPO" rev-parse origin/main)
LIVE=$(echo "$H" | python3 -c 'import json,sys;print(json.load(sys.stdin).get("build",""))' 2>/dev/null)
[ "$LIVE" = "$MAIN" ] && echo "- live build matches main (${MAIN:0:7})" || echo "- WARNING: live build ${LIVE:0:7} != main ${MAIN:0:7}"

sec "CI (last 5 runs)"
(cd "$REPO" && gh run list -e push -L 5 --json conclusion,displayTitle,createdAt -q '.[] | "- \(.conclusion // "running") — \(.displayTitle) (\(.createdAt))"' 2>&1)

sec "Test health"
# Tier 1 gates every deploy (deploy.yml); Tier 2 runs nightly (nightly-e2e.yml); the prod smoke runs here at 07:30.
echo "- Tier 1 (deploy gate, latest run on main): $(cd "$REPO" && gh run list -w deploy.yml -e push -b main -L 1 --json conclusion,createdAt -q '.[] | "\(.conclusion // "running") (\(.createdAt))"' 2>&1)"
NDIR=$(mktemp -d)
NRUN=$(cd "$REPO" && gh run list -w nightly-e2e.yml -L 1 --json databaseId,conclusion,createdAt -q '.[0] | "\(.databaseId) \(.conclusion // "running") \(.createdAt)"' 2>/dev/null)
if [ -n "$NRUN" ] && (cd "$REPO" && gh run download "${NRUN%% *}" -n nightly-report -D "$NDIR" >/dev/null 2>&1); then
  python3 - "$NDIR/nightly-report.json" "$NRUN" <<'PY'
import json, sys
r = json.load(open(sys.argv[1])); t = r["totals"]
print(f"- Tier 2 nightly ({sys.argv[2].split()[1]}, {r['date']}): {t['passed']} passed, {t['failed']} failed, {t['flaky']} flaky")
for f in r["failures"][:8]:
    print(f"  - FAILED {f['test']}: {f['message'][:140]}")
PY
else
  echo "- Tier 2 nightly: no report yet (${NRUN:-never run})"
fi
rm -rf "$NDIR"
PS=~/pymasters-ops/reports/prod-smoke-$(date +%F).json
if [ -s "$PS" ]; then
  python3 - "$PS" <<'PY'
import json, sys
r = json.load(open(sys.argv[1]))
print(f"- Production smoke ({r['date']}): {'PASSED' if r['ok'] else 'FAILED'}")
for c in r["checks"]:
    print(f"  - {'ok' if c['ok'] else 'FAILED'} {c['name']}: {c['detail']}")
PY
else
  echo "- Production smoke: did not run today (systemctl --user status pymasters-prod-smoke)"
fi
[ -s ~/pymasters-ops/reports/triage-$(date +%F).md ] && echo "- Triage today: ~/pymasters-ops/reports/triage-$(date +%F).md"

sec "Commits on main, last 24h"
git -C "$REPO" log origin/main --since='24 hours ago' --format='- %h %s (%an)' | head -20
echo "- open PRs: $(cd "$REPO" && gh pr list --json number -q 'length' 2>/dev/null)  open issues: $(cd "$REPO" && gh issue list --json number -q 'length' 2>/dev/null)"

echo "- Vaathiyaar training stats: $(curl -s -m 15 https://pymasters.net/api/classroom/training/stats)"

sec "Production VM"
if [ "$ORG_AUTH" = ok ]; then
  timeout 90 gcloud compute ssh pymasters-vm --project $APP --zone us-central1-a --quiet --tunnel-through-iap --account=muthu@pymasters.net --command \
   'echo "- $(uptime -p), load $(cut -d" " -f1-3 /proc/loadavg)"; free -m | awk "/Mem/{print \"- RAM used \"\$3\"/\"\$2\" MB\"} /Swap/{print \"- swap used \"\$3\" MB\"}"; df -h / | awk "NR==2{print \"- disk \"\$5\" used\"}"; sudo docker ps --format "- container {{.Names}}: {{.Status}}"; systemctl is-failed pymasters-update.service pymasters-learn.service | paste -sd" " | sed "s/^/- timers update\/learn: /"' 2>/dev/null || echo "- SSH to VM failed"
else
  echo "- SSH to VM failed (org gcloud login expired)"
fi

sec "AI tutor (Vaathiyaar) and nightly content job"
# Read-only: last nightly content-job result + how often learners saw the "breather" (all AI providers failed) in 24 h.
if [ "$ORG_AUTH" = ok ]; then
  timeout 90 gcloud compute ssh pymasters-vm --project $APP --zone us-central1-a --quiet --tunnel-through-iap --account=muthu@pymasters.net --command \
   'sudo docker exec pymasters-app python3 -c "
import sqlite3,os,json
c=sqlite3.connect(\"file:\"+os.environ[\"DB_PATH\"]+\"?mode=ro\",uri=True)
r=c.execute(\"select window,result from job_runs where job=\x27content\x27 order by id desc limit 1\").fetchone()
if r:
    d=json.loads(r[1]); print(\"- content job\",r[0],\"published\" if d.get(\"published\") else \"NOT published: \"+str(d.get(\"reason\",\"\"))[:220])
q=c.execute(\"select status,count(*) from content_queue group by 1\").fetchall(); print(\"- content queue\",dict(q))
"; echo "- AI provider failures shown to learners (24h): $(sudo docker logs pymasters-app --since 24h 2>&1 | grep -ciE "usage limit|status code: 429|401 Client Error|all providers")"' 2>/dev/null || echo "- SSH to VM failed"
else
  echo "- SSH to VM failed (org gcloud login expired)"
fi

sec "Backups"
echo "- Litestream replica (gs://pymasters-app-db/vm): last write $(gcloud storage ls -l -r gs://pymasters-app-db/vm/ 2>/dev/null | grep -v TOTAL | sort -k2 | tail -1 | awk '{print $2}')"

echo "- laptop nightly backup: $(tail -1 $MEDIA/db-backups/backup.log 2>/dev/null || echo none)"

sec "GCP cost guards"
# Old Cloud Run services were deleted 2026-11-01 (prod is the VM); any service here is unexpected spend.
cr=$(gcloud run services list $WA --project $APP --format='value(metadata.name,region)' 2>/dev/null | paste -sd';')
echo "- Cloud Run services in $APP: ${cr:-none (expected)}"
echo "- running VMs in $APP: $(gcloud compute instances list $WA --project $APP --format='value(name,machineType.basename(),status)' 2>/dev/null | paste -sd';')"
for p in $( (gcloud projects list $GA --format='value(projectId)' 2>/dev/null; gcloud projects list $WA --format='value(projectId)' 2>/dev/null) | sort -u); do
  b=$(gcloud billing projects describe $p $GA --format='value(billingEnabled,billingAccountName.basename())' 2>/dev/null || gcloud billing projects describe $p $WA --format='value(billingEnabled,billingAccountName.basename())' 2>/dev/null)
  echo "- project $p billing=$b"
done

sec "Laptop heat (ops machine)"
python3 - <<'PY'
import csv, os, datetime
p=os.path.expanduser("~/pymasters-ops/thermal.csv")
rows=[]
if os.path.exists(p):
    cut=(datetime.datetime.now()-datetime.timedelta(hours=24)).strftime("%Y-%m-%d %H:%M:%S")
    rows=[r for r in csv.DictReader(open(p)) if r["time"]>=cut and r["acpitz"]]
if rows:
    t=[float(r["acpitz"]) for r in rows]
    print(f"- CPU zone temp last 24h: max {max(t):.0f}C, avg {sum(t)/len(t):.0f}C (hardware power-cut at 100C); bot paused in {sum(int(r['paused']) for r in rows)} of {len(rows)} minutes")
else:
    print("- no thermal samples yet")
PY
echo "- thermal guard: $(systemctl --user is-active pymasters-thermal-guard.service); pauses last 24h: $(grep -c PAUSE ~/pymasters-ops/thermal.log 2>/dev/null)"
echo "- overheat power-offs in the last 3 boots: $(for b in -1 -2 -3; do journalctl -b $b --no-pager 2>/dev/null | grep -c 'HARDWARE PROTECTION shutdown'; done | awk '{s+=$1} END {print s+0}')"

sec "Social bot (YouTube + LinkedIn)"
(cd "$REPO" && env -u VIRTUAL_ENV PYTHONPATH="$REPO" ~/pymasters-ops/social-venv/bin/python -m socialbot report 2>/dev/null) || echo "- social bot report failed"
echo "- last bot runs: $(journalctl --user -u pymasters-social.service --since '24 hours ago' --no-pager -o cat 2>/dev/null | grep -c -E 'Finished|Deactivated') ok, $(journalctl --user -u pymasters-social.service --since '24 hours ago' --no-pager -o cat 2>/dev/null | grep -c -i 'failed') failed"

sec "Topic Innovation (24/7 Claude Code queue)"
python3 - <<'PY'
import json, os
p = os.path.expanduser("~/pymasters-ops/innovation/queue.json")
try:
    q = json.load(open(p))
except (OSError, ValueError):
    q = None
if not q:
    print("- no innovation queue yet (pymasters-innovate.timer has not completed a cycle)")
else:
    ts = q.get("topics", [])
    by = {}
    for t in ts:
        by.setdefault(t.get("status", "queued"), []).append(t)
    print(f"- {len(ts)} topics innovated: {len(by.get('queued', []))} queued, {len(by.get('validated', []))} validated "
          f"lessons awaiting review, {len(by.get('failed', []))} failed, {len(by.get('promoted', []))} promoted")
    for t in by.get("validated", []):
        print(f"- REVIEW: `{t['id']}` ({t.get('track')}) {t.get('title', '')} - ~/pymasters-ops/innovation/review/{t['id']}.json")
    for t in sorted(by.get("queued", []), key=lambda t: -float(t.get("score") or 0))[:5]:
        print(f"- queued: `{t['id']}` (score {t.get('score')}) {t.get('title', '')}")
    c = (q.get("cycles") or [None])[-1]
    if c:
        print(f"- last cycle {c.get('finished', '')[:16]}: +{len(c.get('topics_added', []))} topics, drafted {c.get('drafted')}")
PY
echo "- timer: $(systemctl --user is-active pymasters-innovate.timer); runs last 24h: $(journalctl --user -u pymasters-innovate.service --since '24 hours ago' --no-pager -o cat 2>/dev/null | grep -c 'cycle: done') done"

sec "Free tier usage (month to date)"
python3 - "$WA" <<'PY'
import json, subprocess, datetime, urllib.request, urllib.parse, sys
A=sys.argv[1]
tok=subprocess.run(["gcloud","auth","print-access-token","--quiet",A],capture_output=True,text=True).stdout.strip()
now=datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None); start=now.replace(day=1,hour=0,minute=0,second=0,microsecond=0)
def q(metric, group, per=None):
    params={"filter":f'metric.type="{metric}"',"interval.startTime":start.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "interval.endTime":now.strftime("%Y-%m-%dT%H:%M:%SZ"),"aggregation.alignmentPeriod":f"{int((now-start).total_seconds())+60}s",
            "aggregation.perSeriesAligner":"ALIGN_SUM","aggregation.crossSeriesReducer":"REDUCE_SUM","aggregation.groupByFields":group}
    url="https://monitoring.googleapis.com/v3/projects/pymasters-app/timeSeries?"+urllib.parse.urlencode(params)
    d=json.load(urllib.request.urlopen(urllib.request.Request(url,headers={"Authorization":"Bearer "+tok})))
    out={}
    for t in d.get("timeSeries",[]):
        k=list(t.get("metric",{}).get("labels",{}).values()); v=t["points"][0]["value"]
        out[k[0] if k else "all"]=float(v.get("int64Value") or v.get("doubleValue") or 0)
    return out
try:
    if not tok:
        raise RuntimeError("gcloud access token unavailable (re-login required)")
    ops=q("storage.googleapis.com/api/request_count","metric.label.method")
    class_a=sum(v for k,v in ops.items() if k in ("WriteObject","ListObjects","ComposeObject","CopyObject","RewriteObject","InsertObject","ListBuckets","SetIamPolicy","GetIamPolicy","UpdateObject"))
    print(f"- GCS Class A operations: {class_a:,.0f} of 5,000 free")
    eg=q("compute.googleapis.com/instance/network/sent_bytes_count","metric.label.loadbalanced")
    print(f"- VM outbound traffic (incl. free traffic to Google services): {sum(eg.values())/1e9:.2f} GB of 1 GB free to the internet")
except Exception as e:
    print("- monitoring query failed:", e)
PY
echo "- Artifact Registry images: $(gcloud artifacts docker images list us-central1-docker.pkg.dev/pymasters-app/cloud-run-source-deploy/pymasters $WA --format='value(metadata.imageSizeBytes)' 2>/dev/null | awk '{s+=$1;n++} END {printf "%d images, %.2f GB (before layer sharing)", n, s/1e9}') — 0.5 GB free; policy keeps the newest 2"
echo "- Secret Manager active versions: $(for s in $(gcloud secrets list --project pymasters-app $WA --format='value(name)' 2>/dev/null); do gcloud secrets versions list $s --project pymasters-app $WA --filter='state=enabled' --format='value(name)' 2>/dev/null; done | wc -l) of 6 free"
echo "- Budget: one budget, INR 5,000/month ceiling (owner limit), alerts at 2/5/25/50/90/100% + forecast"

sec "GCP spend (billing export)"
T=$(bq ls --project_id=pymasters-app --format=json billing_export 2>/dev/null | python3 -c 'import json,sys;t=[x["tableReference"]["tableId"] for x in json.load(sys.stdin) if x["tableReference"]["tableId"].startswith("gcp_billing_export_v1")];print(t[0] if t else "")' 2>/dev/null)
if [ -n "$T" ]; then
  bq query --project_id=pymasters-app --use_legacy_sql=false --format=pretty "
   SELECT project.id AS project, service.description AS service,
          ROUND(SUM(IF(DATE(usage_start_time,'Asia/Kolkata')=DATE_SUB(CURRENT_DATE('Asia/Kolkata'),INTERVAL 1 DAY),cost + IFNULL((SELECT SUM(c.amount) FROM UNNEST(credits) c),0),0)),2) AS yesterday_net,
          ROUND(SUM(IF(DATE_TRUNC(DATE(usage_start_time,'Asia/Kolkata'),MONTH)=DATE_TRUNC(CURRENT_DATE('Asia/Kolkata'),MONTH),cost + IFNULL((SELECT SUM(c.amount) FROM UNNEST(credits) c),0),0)),2) AS mtd_net,
          ROUND(SUM(IF(DATE_TRUNC(DATE(usage_start_time,'Asia/Kolkata'),MONTH)=DATE_TRUNC(CURRENT_DATE('Asia/Kolkata'),MONTH),cost,0)),2) AS mtd_gross,
          ANY_VALUE(currency) AS cur
   FROM \`pymasters-app.billing_export.$T\`
   WHERE usage_start_time >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 35 DAY)
   GROUP BY 1,2 HAVING mtd_gross > 0 OR mtd_net > 0 ORDER BY mtd_net DESC, mtd_gross DESC LIMIT 15" 2>&1
  echo "- totals (gross = list price, net = after credits). If data_through is more than 2 days old the export is lagging/backfilling: say spend is not yet known, do not treat it as low:"
  bq query --project_id=pymasters-app --use_legacy_sql=false --format=pretty "
   SELECT invoice.month AS month, ANY_VALUE(currency) AS cur, ROUND(SUM(cost),2) AS gross,
          ROUND(SUM(cost) + SUM(IFNULL((SELECT SUM(c.amount) FROM UNNEST(credits) c),0)),2) AS net,
          CAST(MAX(DATE(usage_start_time, 'Asia/Kolkata')) AS STRING) AS data_through
   FROM \`pymasters-app.billing_export.$T\`
   WHERE invoice.month >= FORMAT_DATE('%Y%m', DATE_SUB(CURRENT_DATE('Asia/Kolkata'), INTERVAL 1 MONTH))
   GROUP BY 1 ORDER BY 1" 2>&1
else
  echo "- billing export not enabled yet (Console > Billing > Billing export > BigQuery, dataset pymasters-app.billing_export)"
fi
} > "$OUT" 2>&1
echo "$OUT"
