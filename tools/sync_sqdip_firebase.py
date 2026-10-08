#!/usr/bin/env python3
"""Sync the latest SQDIP workbook snapshot into PDTIII Firebase."""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import extract_sqdip  # noqa: E402

FIREBASE_URL = "https://dm111-e8a7d-default-rtdb.firebaseio.com/sqdip.json?print=silent"
BKK = timezone(timedelta(hours=7), name="Asia/Bangkok")
DIMS = extract_sqdip.DIMS


def digest(path: Path) -> str:
    value = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            value.update(block)
    return value.hexdigest()


def load_manifest(path: Path) -> dict:
    with path.open("r", encoding="utf-8-sig") as stream:
        manifest = json.load(stream)
    if not manifest.get("period") or len(manifest.get("files", {})) != len(extract_sqdip.SHEETS):
        raise ValueError("Source manifest is incomplete; all five Pro workbooks are required.")
    return manifest


def load_state(path: Path) -> dict:
    try:
        with path.open("r", encoding="utf-8") as stream:
            return json.load(stream)
    except FileNotFoundError:
        return {}


def build_payload(manifest: dict, input_dir: Path) -> tuple[dict, dict]:
    plants = []
    file_metadata = {}
    for plant_id, (alias, _) in extract_sqdip.SHEETS.items():
        source = manifest["files"].get(alias)
        if not source:
            raise ValueError(f"Missing source file for {plant_id}.")
        path = input_dir / alias
        if not path.is_file() or path.stat().st_size == 0:
            raise FileNotFoundError(f"Staged source file is missing or empty: {alias}")
        book, groups = extract_sqdip.read_workbook(plant_id, input_dir)
        grouped = {dim: [] for dim in DIMS}
        for group in groups:
            grouped[group["dimension"]].append(group)
        plants.append({"id": plant_id, "source": source["name"], "groups": grouped})
        if hasattr(book, "release_resources"):
            book.release_resources()
        elif hasattr(book, "close"):
            book.close()
        file_metadata[plant_id] = {
            "name": source["name"],
            "size": path.stat().st_size,
            "lastWriteUtc": source["lastWriteUtc"],
            "sha256": digest(path),
        }

    expected = list(extract_sqdip.SHEETS)
    if [plant["id"] for plant in plants] != expected:
        raise ValueError("Not all five SQDIP plants were parsed.")
    for plant in plants:
        if set(plant["groups"]) != set(DIMS):
            raise ValueError(f"SQDIP dimensions missing for {plant['id']}.")

    imported_at = datetime.now(BKK).isoformat(timespec="seconds")
    payload = {
        "period": manifest["period"],
        "plants": plants,
        "_sync": {
            "updatedAt": imported_at,
            "source": "monthly SQDIP workbooks",
            "files": [
                {"plant": plant_id, **details}
                for plant_id, details in file_metadata.items()
            ],
        },
    }
    return payload, file_metadata


def write_firebase(payload: dict) -> None:
    period = payload["period"]
    update = {"current": payload, "periods": {period: payload}}
    data = json.dumps(update, ensure_ascii=False, separators=(",", ":"), allow_nan=False).encode("utf-8")
    request = Request(FIREBASE_URL, data=data, method="PATCH", headers={"Content-Type": "application/json; charset=utf-8"})
    try:
        with urlopen(request, timeout=45) as response:
            if response.status not in (200, 204):
                raise RuntimeError(f"Firebase returned HTTP {response.status}.")
    except HTTPError as error:
        detail = error.read(400).decode("utf-8", "replace")
        raise RuntimeError(f"Firebase rejected the SQDIP update (HTTP {error.code}): {detail}") from error
    except URLError as error:
        raise RuntimeError(f"Firebase is unavailable: {error.reason}") from error


def save_state(path: Path, manifest: dict, file_metadata: dict, uploaded_at: str) -> None:
    state = {
        "period": manifest["period"],
        "files": file_metadata,
        "uploadedAt": uploaded_at,
    }
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")
    temporary.replace(path)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", required=True, type=Path)
    parser.add_argument("--stage-dir", required=True, type=Path)
    parser.add_argument("--dry-run", action="store_true", help="parse and validate without writing Firebase")
    args = parser.parse_args()

    manifest = load_manifest(args.manifest)
    input_dir = args.stage_dir / "input"
    state_path = args.stage_dir / "sync-state.json"
    payload, file_metadata = build_payload(manifest, input_dir)
    state = load_state(state_path)
    if not args.dry_run and state.get("period") == manifest["period"] and state.get("files") == file_metadata:
        print(f"No workbook content changed for {manifest['period']}; Firebase update skipped.")
        return 0

    counts = [f"{plant['id']} " + ", ".join(f"{dim}:{len(plant['groups'][dim])}" for dim in DIMS) for plant in payload["plants"]]
    print(f"Parsed {manifest['period']}: " + " | ".join(counts))
    if args.dry_run:
        print("Dry run complete; Firebase was not changed.")
        return 0

    write_firebase(payload)
    uploaded_at = datetime.now(BKK).isoformat(timespec="seconds")
    save_state(state_path, manifest, file_metadata, uploaded_at)
    print(f"Firebase SQDIP snapshot updated for {manifest['period']} at {uploaded_at}.")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        print(f"SQDIP sync failed: {error}", file=sys.stderr)
        raise SystemExit(1)
