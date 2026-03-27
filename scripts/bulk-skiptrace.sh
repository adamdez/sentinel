#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SERVICE_KEY=$(grep SUPABASE_SERVICE_ROLE_KEY "$SCRIPT_DIR/.env.local" | head -1 | sed 's/.*=//;s/"//g')
API="https://sentinel.dominionhomedeals.com/api/enrichment/skiptrace-direct"

BATCH_SIZE=3
SUCCESS=0
ERRORS=0
PROMOTED=0
FACTS=0

# Read lead IDs from stdin or from the embedded list
readarray -t LEADS < "$SCRIPT_DIR/scripts/lead-ids.txt"

TOTAL=${#LEADS[@]}

echo "=== Bulk Skip-Trace: $TOTAL leads in batches of $BATCH_SIZE ==="
echo ""

for ((i=0; i<TOTAL; i+=BATCH_SIZE)); do
  BATCH=("${LEADS[@]:i:BATCH_SIZE}")
  BATCH_NUM=$(( i/BATCH_SIZE + 1 ))
  TOTAL_BATCHES=$(( (TOTAL + BATCH_SIZE - 1) / BATCH_SIZE ))

  # Build JSON array
  JSON_IDS=$(printf '"%s",' "${BATCH[@]}")
  JSON_IDS="[${JSON_IDS%,}]"

  echo "--- Batch $BATCH_NUM/$TOTAL_BATCHES (leads $((i+1))-$((i+${#BATCH[@]}))) ---"

  RESULT=$(curl -s --max-time 600 -X POST "$API" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $SERVICE_KEY" \
    -d "{\"leadIds\": $JSON_IDS, \"force\": true}" 2>&1)

  if echo "$RESULT" | grep -q '"ok":true'; then
    BATCH_PROMOTED=$(echo "$RESULT" | grep -o '"phonesPromoted":[0-9]*' | grep -o '[0-9]*' | awk '{s+=$1}END{print s+0}')
    BATCH_FACTS=$(echo "$RESULT" | grep -o '"newFactsCreated":[0-9]*' | grep -o '[0-9]*' | awk '{s+=$1}END{print s+0}')
    BATCH_ERR=$(echo "$RESULT" | grep -o '"unexpected_error"' | wc -l)

    PROMOTED=$((PROMOTED + BATCH_PROMOTED))
    FACTS=$((FACTS + BATCH_FACTS))
    SUCCESS=$((SUCCESS + ${#BATCH[@]} - BATCH_ERR))
    ERRORS=$((ERRORS + BATCH_ERR))

    echo "  OK: +${BATCH_PROMOTED} phones, +${BATCH_FACTS} facts (running total: ${PROMOTED} phones, ${FACTS} facts)"
  else
    echo "  FAILED: $(echo $RESULT | head -c 200)"
    ERRORS=$((ERRORS + ${#BATCH[@]}))
  fi

  # Delay between batches to respect rate limits
  if ((i + BATCH_SIZE < TOTAL)); then
    sleep 3
  fi
done

echo ""
echo "=== COMPLETE ==="
echo "Total leads: $TOTAL"
echo "Success: $SUCCESS"
echo "Errors: $ERRORS"
echo "Total phones promoted: $PROMOTED"
echo "Total facts created: $FACTS"
