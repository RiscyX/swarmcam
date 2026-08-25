import os
import sqlite3
from typing import Optional

DB_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "fire_events.db")
SNAPSHOT_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "fire_snapshots")

def get_fire_events_db(camera: Optional[str] = None, label: Optional[str] = None, after: Optional[float] = None, before: Optional[float] = None, limit: int = 100):
    query = "SELECT id, camera, label, score, timestamp FROM fire_events WHERE 1=1"
    params = []
    if camera:
        query += " AND camera = ?"
        params.append(camera)
    if label:
        query += " AND label = ?"
        params.append(label)
    if after is not None:
        query += " AND timestamp >= ?"
        params.append(after)
    if before is not None:
        query += " AND timestamp <= ?"
        params.append(before)
        
    query += " ORDER BY timestamp DESC LIMIT ?"
    params.append(limit)

    with sqlite3.connect(DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        cursor = conn.execute(query, params)
        rows = cursor.fetchall()
        results = []
        for r in rows:
            row_dict = dict(r)
            has_snapshot = os.path.exists(os.path.join(SNAPSHOT_DIR, f"{row_dict['id']}.jpg"))
            row_dict["has_snapshot"] = has_snapshot
            results.append(row_dict)
        return results

def get_fire_event_db(event_id: str):
    with sqlite3.connect(DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        cursor = conn.execute("SELECT id, camera, label, score, timestamp FROM fire_events WHERE id = ?", (event_id,))
        row = cursor.fetchone()
        if row:
            return dict(row)
    return None

def delete_fire_event_db(event_id: str) -> bool:
    with sqlite3.connect(DB_PATH) as conn:
        cursor = conn.execute("DELETE FROM fire_events WHERE id = ?", (event_id,))
        conn.commit()
        if cursor.rowcount > 0:
            snap_path = os.path.join(SNAPSHOT_DIR, f"{event_id}.jpg")
            if os.path.exists(snap_path):
                try:
                    os.remove(snap_path)
                except OSError:
                    pass
            return True
    return False
