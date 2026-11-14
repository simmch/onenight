#!/usr/bin/env bash
# Publish the working tree to Amplify Hosting. GitHub is not connected to this app.
set -euo pipefail

APP_ID="d1vu55442k5ach"
BRANCH="main"
REGION="us-east-2"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ZIP="/tmp/one-night-amplify.zip"
URL="https://main.${APP_ID}.amplifyapp.com"

aws_json() {
  aws amplify "$@" --app-id "$APP_ID" --region "$REGION" --output json
}

echo "Packing $ROOT"
rm -f "$ZIP"
(
  cd "$ROOT"
  zip -r -q -X "$ZIP" . -x '*.git*' -x '.DS_Store' -x '*/.DS_Store'
)
echo "Archive $(du -h "$ZIP" | awk '{print $1}')"

# A leftover upload slot blocks the next one. Cancel those, and wait out a deploy already running.
jobs=$(aws_json list-jobs --branch-name "$BRANCH" --max-items 5)
python3 - "$jobs" << 'PY'
import json, subprocess, sys
data = json.loads(sys.argv[1])
app, branch, region = "d1vu55442k5ach", "main", "us-east-2"
for job in data.get("jobSummaries", []):
    if job.get("status") != "PENDING":
        continue
    print(f"Cancelling unfinished job {job['jobId']}")
    subprocess.check_call([
        "aws", "amplify", "stop-job",
        "--app-id", app, "--branch-name", branch, "--job-id", job["jobId"],
        "--region", region,
    ], stdout=subprocess.DEVNULL)
PY

echo "Uploading to Amplify"
python3 - "$ZIP" << 'PY'
import json, subprocess, sys, time
zip_path, app, branch, region = sys.argv[1], "d1vu55442k5ach", "main", "us-east-2"

def aws(*args):
    return subprocess.check_output(["aws", "amplify", *args, "--region", region, "--output", "json"], text=True)

# If a deploy is already running, let it finish before starting another.
for _ in range(60):
    jobs = json.loads(aws("list-jobs", "--app-id", app, "--branch-name", branch, "--max-items", "3"))
    running = [j for j in jobs.get("jobSummaries", []) if j.get("status") == "RUNNING"]
    if not running:
        break
    print(f"Waiting for job {running[0]['jobId']} to finish")
    time.sleep(5)
else:
    raise SystemExit("A deploy is still running. Try again in a minute.")

created = json.loads(aws("create-deployment", "--app-id", app, "--branch-name", branch))
job_id = created["jobId"]
print(f"Job {job_id}")
upload = subprocess.run([
    "curl", "-sS", "-o", "/tmp/one-night-amplify-upload.txt", "-w", "%{http_code}",
    "-X", "PUT", "-H", "Content-Type: application/zip",
    "--upload-file", zip_path, created["zipUploadUrl"],
], capture_output=True, text=True)
if upload.returncode != 0 or upload.stdout.strip() not in {"200", "204"}:
    detail = (upload.stderr or "")[-400:]
    raise SystemExit(f"Upload failed ({upload.stdout.strip()}). {detail}")

aws("start-deployment", "--app-id", app, "--branch-name", branch, "--job-id", job_id)
for _ in range(60):
    job = json.loads(aws("get-job", "--app-id", app, "--branch-name", branch, "--job-id", job_id))
    status = job["job"]["summary"]["status"]
    print(status)
    if status == "SUCCEED":
        break
    if status in {"FAILED", "CANCELLED"}:
        raise SystemExit(f"Deploy {status}")
    time.sleep(5)
else:
    raise SystemExit("Deploy did not finish in time. Check the Amplify console.")
PY

echo "Live at $URL"
