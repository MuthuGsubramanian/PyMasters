#!/bin/bash
# Collects PyMasters + GCP status facts into a markdown file for the daily email.
# Read-only: changes nothing in GCP, GitHub or on the VM.
set -u
REPO=~/Documents/Development/PyMasters
OUT=~/pymasters-ops/reports/status-$(date +%F).md
APP=pymasters-app
OLD=festive-bazaar-424313-i5
GA=--account=muthu.g.subramanian@gmail.com   # owner of the legacy projects
WA=--account=muthu@pymasters.net             # org + main billing account
sec() { echo; echo "## $1"; }

{
echo "# PyMasters daily status — $(date '+%F %H:%M %Z')"

sec "Open reminders"
[ -s ~/pymasters-ops/reminders.txt ] && cat ~/pymasters-ops/reminders.txt || echo "- none"

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
(cd "$REPO" && gh run list -L 5 --json conclusion,displayTitle,createdAt -q '.[] | "- \(.conclusion // "running") — \(.displayTitle) (\(.createdAt))"' 2>&1)

sec "Commits on main, last 24h"
git -C "$REPO" log origin/main --since='24 hours ago' --format='- %h %s (%an)' | head -20
echo "- open PRs: $(cd "$REPO" && gh pr list --json number -q 'length' 2>/dev/null)  open issues: $(cd "$REPO" && gh issue list --json number -q 'length' 2>/dev/null)"

echo "- Vaathiyaar training stats: $(curl -s -m 15 https://pymasters.net/api/classroom/training/stats)"

sec "Production VM"
timeout 90 gcloud compute ssh pymasters-vm --project $APP --zone us-central1-a --quiet --tunnel-through-iap --command \
 'echo "- $(uptime -p), load $(cut -d" " -f1-3 /proc/loadavg)"; free -m | awk "/Mem/{print \"- RAM used \"\$3\"/\"\$2\" MB\"} /Swap/{print \"- swap used \"\$3\" MB\"}"; df -h / | awk "NR==2{print \"- disk \"\$5\" used\"}"; sudo docker ps --format "- container {{.Names}}: {{.Status}}"; systemctl is-failed pymasters-update.service pymasters-learn.service | paste -sd" " | sed "s/^/- timers update\/learn: /"' 2>/dev/null || echo "- SSH to VM failed"

sec "Backups"
echo "- Litestream replica (gs://pymasters-app-db/vm): last write $(gcloud storage ls -l -r gs://pymasters-app-db/vm/ 2>/dev/null | grep -v TOTAL | sort -k2 | tail -1 | awk '{print $2}')"

echo "- laptop nightly backup: $(tail -1 /mnt/eternity-store/EternityModels/pymasters-social/db-backups/backup.log 2>/dev/null || echo none)"

sec "GCP cost guards"
# Old Cloud Run services were deleted 2026-11-01 (prod is the VM); any service here is unexpected spend.
cr=$(gcloud run services list $WA --project $APP --format='value(metadata.name,region)' 2>/dev/null | paste -sd';')
echo "- Cloud Run services in $APP: ${cr:-none (expected)}"
echo "- running VMs in $APP: $(gcloud compute instances list --project $APP --format='value(name,machineType.basename(),status)' | paste -sd';')"
for p in $( (gcloud projects list $GA --format='value(projectId)'; gcloud projects list $WA --format='value(projectId)') | sort -u); do
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

sec "Free tier usage (month to date)"
python3 - <<'PY'
import json, subprocess, datetime, urllib.request, urllib.parse
A="--account=muthu@pymasters.net"
tok=subprocess.run(["gcloud","auth","print-access-token",A],capture_output=True,text=True).stdout.strip()
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
    ops=q("storage.googleapis.com/api/request_count","metric.label.method")
    class_a=sum(v for k,v in ops.items() if k in ("WriteObject","ListObjects","ComposeObject","CopyObject","RewriteObject","InsertObject","ListBuckets","SetIamPolicy","GetIamPolicy","UpdateObject"))
    print(f"- GCS Class A operations: {class_a:,.0f} of 5,000 free")
    eg=q("compute.googleapis.com/instance/network/sent_bytes_count","metric.label.loadbalanced")
    print(f"- VM outbound traffic (incl. free traffic to Google services): {sum(eg.values())/1e9:.2f} GB of 1 GB free to the internet")
except Exception as e:
    print("- monitoring query failed:", e)
PY
echo "- Artifact Registry images: $(gcloud artifacts docker images list us-central1-docker.pkg.dev/pymasters-app/cloud-run-source-deploy/pymasters --account=muthu@pymasters.net --format='value(metadata.imageSizeBytes)' 2>/dev/null | awk '{s+=$1;n++} END {printf "%d images, %.2f GB (before layer sharing)", n, s/1e9}') — 0.5 GB free; policy keeps the newest 2"
echo "- Secret Manager active versions: $(for s in $(gcloud secrets list --project pymasters-app --account=muthu@pymasters.net --format='value(name)'); do gcloud secrets versions list $s --project pymasters-app --account=muthu@pymasters.net --filter='state=enabled' --format='value(name)'; done | wc -l) of 6 free"
echo "- Budget: one budget, INR 5,000/month ceiling (owner limit), alerts at 2/5/25/50/90/100% + forecast"

sec "GCP spend (billing export)"
T=$(bq ls --project_id=pymasters-app --format=json billing_export 2>/dev/null | python3 -c 'import json,sys;t=[x["tableReference"]["tableId"] for x in json.load(sys.stdin) if x["tableReference"]["tableId"].startswith("gcp_billing_export_v1")];print(t[0] if t else "")' 2>/dev/null)
if [ -n "$T" ]; then
  bq query --project_id=pymasters-app --use_legacy_sql=false --format=pretty "
   SELECT project.id AS project, service.description AS service,
          ROUND(SUM(IF(DATE(usage_start_time,'Asia/Kolkata')=DATE_SUB(CURRENT_DATE('Asia/Kolkata'),INTERVAL 1 DAY),cost,0)),2) AS yesterday,
          ROUND(SUM(IF(DATE_TRUNC(DATE(usage_start_time,'Asia/Kolkata'),MONTH)=DATE_TRUNC(CURRENT_DATE('Asia/Kolkata'),MONTH),cost,0)),2) AS month_to_date,
          ANY_VALUE(currency) AS cur
   FROM \`pymasters-app.billing_export.$T\`
   WHERE usage_start_time >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 35 DAY)
   GROUP BY 1,2 HAVING month_to_date > 0 ORDER BY month_to_date DESC LIMIT 15" 2>&1
else
  echo "- billing export not enabled yet (Console > Billing > Billing export > BigQuery, dataset pymasters-app.billing_export)"
fi
} > "$OUT" 2>&1
echo "$OUT"
