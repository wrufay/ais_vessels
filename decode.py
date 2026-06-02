#!/usr/bin/env python3
"""Decode raw CCG NMEA files into SQLite via aisdb, no filtering.

Usage:
    python decode.py streaming   # decode the full-day streaming CSV
    python decode.py nm4         # decode the 5-minute NM4 zip chunks
"""

import glob
import os
import sys
import tempfile
import zipfile
from pathlib import Path

import aisdb

STREAMING_DIR = "/home/shared/ccg_ais_claudio/ais_comp/streaming"
NM4_DIR = "/home/shared/ccg_ais_claudio/ais_comp/NM4"
DATA_DIR = Path(__file__).parent / "data"


def decode_streaming():
    csv_files = sorted(glob.glob(f"{STREAMING_DIR}/CCG_AIS_UTC_Log_*.csv"))
    if not csv_files:
        print("No streaming files found.")
        return

    print(f"Decoding {len(csv_files)} streaming file(s)...")
    db_path = DATA_DIR / "decode_streaming.db"

    with tempfile.TemporaryDirectory() as tmpdir:
        nm4_files = []
        # Symlink .csv → .nm4 so aisdb treats them as raw NMEA instead of decoded tabular
        for csv_path in csv_files:
            nm4_path = os.path.join(tmpdir, f"{Path(csv_path).stem}.nm4")
            os.symlink(os.path.abspath(csv_path), nm4_path)
            nm4_files.append(nm4_path)

        with aisdb.SQLiteDBConn(str(db_path)) as dbconn:
            aisdb.decode_msgs(
                filepaths=nm4_files,
                dbconn=dbconn,
                source="CCG_terrestrial",
                skip_checksum=True,
                type_preference="nmea",
            )

    print(f"Done. Output: {db_path}")


def decode_nm4():
    zip_files = sorted(glob.glob(f"{NM4_DIR}/*.nmea.zip"))
    if not zip_files:
        print("No NM4 zip files found.")
        return

    print(f"Decoding {len(zip_files)} NM4 zip file(s)...")
    db_path = DATA_DIR / "decode_nm4.db"

    with tempfile.TemporaryDirectory() as tmpdir:
        nmea_files = []
        for zip_path in zip_files:
            with zipfile.ZipFile(zip_path) as zf:
                zf.extractall(tmpdir)
                for name in zf.namelist():
                    nmea_files.append(os.path.join(tmpdir, name))

        with aisdb.SQLiteDBConn(str(db_path)) as dbconn:
            aisdb.decode_msgs(
                filepaths=nmea_files,
                dbconn=dbconn,
                source="CCG_terrestrial",
                skip_checksum=True,
                type_preference="nmea",
            )

    print(f"Done. Output: {db_path}")


if __name__ == "__main__":
    if len(sys.argv) != 2 or sys.argv[1] not in ("streaming", "nm4"):
        print("Usage: python decode.py [streaming|nm4]")
        sys.exit(1)

    DATA_DIR.mkdir(parents=True, exist_ok=True)

    if sys.argv[1] == "streaming":
        decode_streaming()
    else:
        decode_nm4()
