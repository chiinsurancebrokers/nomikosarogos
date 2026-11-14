
## Operator control of the decisions pipeline (no shell needed)

Set `ADMIN_TOKEN` (≥24 random chars) in Railway; without it the endpoints return 404. Then:

```bash
H="Authorization: Bearer $ADMIN_TOKEN"; B=https://<backend-domain>/api/admin
curl -X POST -H "$H" -H 'content-type: application/json' $B/decisions/ingest -d '{"only":["1497/2023"]}'   # or {"url":"<official areiospagos URL>","area":"civil"}
curl -H "$H" $B/decisions                                                                                   # status per decision
curl -X POST -H "$H" -H 'content-type: application/json' $B/decisions/review -d '{"ref":"ΑΠ 1497/2023","action":"approve"}'
```
Ingest still stores `pending`; only `approve` after a human has read the full decision makes it searchable.
