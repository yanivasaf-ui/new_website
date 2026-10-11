#!/usr/bin/env bash
# Endpoint tests for /api/analyze. Usage: bash scripts/quiz-curl-tests.sh [base_url]
# Every lead uses the name "TEST". Each group uses its own fake client IP (cf-connecting-ip), so the
# 5-per-hour limit of one group never affects another. Set LLM_MODE_FILE to a file read by a
# stand-in LLM server to also force the LLM failure states (hang / garbage).
BASE="${1:-http://localhost:8787}"
SID() { node -e 'console.log(crypto.randomUUID())'; }
ANSWERS='{"industry":"construction","size":"6_15","channels":["whatsapp","phone"],"acquisition":"referrals","sink":"scheduling","hours":"5_10","pain":"אני מתאם את אותו סיור באתר שלוש פעמים כי הלקוח לא עונה"}'
complete() { # session_id, phone -> JSON body
  echo "{\"stage\":\"complete\",\"session_id\":\"$1\",\"answers\":$ANSWERS,\"contact\":{\"name\":\"TEST\",\"whatsapp\":\"$2\",\"email\":\"\",\"consent\":true},\"utm\":{\"source\":\"test\",\"medium\":\"curl\",\"campaign\":\"quiz-dev\"},\"device\":\"mobile\",\"website\":\"${3:-}\"}"
}
run() { # name, ip, path, body
  echo "=== $1"
  curl -s -o /tmp/quiz-curl-body -w "HTTP %{http_code} in %{time_total}s\n" -X POST "$BASE$3" \
    -H 'content-type: application/json' -H 'origin: http://localhost:8787' -H "cf-connecting-ip: $2" --data "$4"
  head -c 700 /tmp/quiz-curl-body; echo; echo
}
setmode() { [ -n "$LLM_MODE_FILE" ] && echo "$1" > "$LLM_MODE_FILE"; }

setmode valid
S1=$(SID)
run "partial after Q3 (anonymous)" 10.0.0.1 /api/analyze "{\"stage\":\"partial\",\"session_id\":\"$S1\",\"answers\":{\"industry\":\"construction\",\"size\":\"6_15\",\"channels\":[\"whatsapp\"]},\"utm\":{\"source\":\"test\"},\"device\":\"mobile\",\"website\":\"\"}"
run "SUCCESS: valid complete lead" 10.0.0.1 /api/analyze "$(complete $S1 '050-123-4567')"
run "missing phone" 10.0.0.2 /api/analyze "$(complete $(SID) '')"
run "invalid phone (landline)" 10.0.0.2 /api/analyze "$(complete $(SID) '03-1234567')"
run "honeypot filled" 10.0.0.2 /api/analyze "$(complete $(SID) '0501234567' 'http://spam.example')"
run "invalid option" 10.0.0.2 /api/analyze "{\"stage\":\"complete\",\"session_id\":\"$(SID)\",\"answers\":{\"industry\":\"crypto\"},\"utm\":{},\"device\":\"mobile\"}"
echo "=== foreign origin"; curl -s -w " HTTP %{http_code}\n" -X POST "$BASE/api/analyze" -H 'origin: https://evil.example' -H 'content-type: application/json' --data '{}'; echo
echo "=== GET not allowed"; curl -s -w " HTTP %{http_code}\n" "$BASE/api/analyze"; echo
run "booking click" 10.0.0.1 /api/analyze/click "{\"session_id\":\"$S1\"}"

if [ -n "$LLM_MODE_FILE" ]; then
  # With the template fallback ON (default) these return 200 source=template. Start the Worker with
  # QUIZ_TEMPLATE_FALLBACK=0 to see the 502 analysis_failed error state instead.
  setmode hang;    run "LLM FAILURE: model hangs (30s x 2 attempts, then template)" 10.0.0.3 /api/analyze "$(complete $(SID) '0501234567')"
  setmode garbage; run "LLM FAILURE: model returns invalid JSON (1 retry)" 10.0.0.4 /api/analyze "$(complete $(SID) '0501234567')"
  setmode garbage; run "LLM FAILURE + English pain text (template must not quote it)" 10.0.0.4 /api/analyze "$(complete $(SID) '0501234567' | sed 's/אני מתאם את אותו סיור באתר שלוש פעמים כי הלקוח לא עונה/my clients never answer the phone/')"
  setmode valid
fi

echo "=== RATE LIMITED: 7 valid submissions from one IP (limit 5/hour)"
for i in 1 2 3 4 5 6 7; do
  curl -s -o /tmp/quiz-curl-body -w "#$i HTTP %{http_code}  " -X POST "$BASE/api/analyze" -H 'content-type: application/json' -H 'origin: http://localhost:8787' -H 'cf-connecting-ip: 10.0.0.5' --data "$(complete $(SID) '0501234567')"
  head -c 120 /tmp/quiz-curl-body; echo
done; echo
run "partial from the rate-limited IP still works (own limit)" 10.0.0.5 /api/analyze "{\"stage\":\"partial\",\"session_id\":\"$(SID)\",\"answers\":{\"industry\":\"retail\",\"size\":\"solo\",\"channels\":[\"email\"]},\"utm\":{},\"device\":\"mobile\",\"website\":\"\"}"
echo "=== static asset still served"; curl -s -o /dev/null -w "HTTP %{http_code} /he/\n" "$BASE/he/"
echo "=== quiz page"; curl -s -o /dev/null -w "HTTP %{http_code} /quiz/ (%{size_download}B)\n" -L "$BASE/quiz/"
echo "=== unknown path 404"; curl -s -o /dev/null -w "HTTP %{http_code} /nope\n" "$BASE/nope"
