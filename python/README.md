# Python YOLO integration

Your current Python app can keep working as-is:

```text
Python YOLO -> Serial #HOPLE:10000 -> ESP32 -> Supabase
```

The ESP32 cloud firmware logs accepted money to `money_events` after the bill is fully accepted by the conveyor.

## Optional direct YOLO logging

If you also want YOLO label/confidence in Supabase, add `supabase`:

```bash
pip install supabase
```

Add near the imports in `vending_money_camera_fixed.py`:

```python
from supabase import create_client

SUPABASE_URL = "https://vjbmzmzdjsahyegnutne.supabase.co"
SUPABASE_KEY = "sb_publishable_lGCGKWhEl7g1pqcZCknoSg_c9lcG_8_"
MACHINE_ID = "vending-001"
supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
```

Then in `process_detection_frame`, right after this line:

```python
self.resultSignal.emit(best_name, value, best_score)
```

Add:

```python
try:
    supabase.table("machine_events").insert({
        "machine_id": MACHINE_ID,
        "event_type": "yolo_detected",
        "severity": "info",
        "message": f"{best_name} = {value}",
        "payload": {
            "raw_label": best_name,
            "amount": value,
            "score": float(best_score),
            "confidence_gap": float(gap),
        },
    }).execute()
except Exception as exc:
    self.log(f"Supabase log error: {exc}")
```

Do not let Python send money directly to `money_events` unless you want to count bills before ESP32 confirms the conveyor accepted them.

