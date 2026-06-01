#!/usr/bin/env python3
"""Decode raw CCG NMEA files into SQLite via aisdb, no filtering."""

import glob
import os
import tempfile
from pathlib import Path

import aisdb

CCG_DIR = "/home/shared/ccg_ais_claudio/ais_comp/streaming"
SQLITE_PATH = Path(__file__).parent / "data" / "decode_raw.db"


def decode():
    csv_files = sorted(glob.glob(f"{CCG_DIR}/CCG_AIS_UTC_Log_*.csv"))
    if not csv_files:
        print("No CCG files found.")
        return

    print(f"Decoding {len(csv_files)} file(s)...")

    with tempfile.TemporaryDirectory() as tmpdir:
        nm4_files = []
        # Symlink .csv → .nm4 so aisdb treats them as raw NMEA instead of decoded tabular
        for csv_path in csv_files:
            nm4_path = os.path.join(tmpdir, f"{Path(csv_path).stem}.nm4")
            os.symlink(os.path.abspath(csv_path), nm4_path)
            nm4_files.append(nm4_path)

        with aisdb.SQLiteDBConn(str(SQLITE_PATH)) as dbconn:
            aisdb.decode_msgs(
                filepaths=nm4_files,
                dbconn=dbconn,
                source="CCG_terrestrial",
                skip_checksum=True,
                type_preference="nmea",
            )

    print("Done.")


if __name__ == "__main__":
    SQLITE_PATH.parent.mkdir(parents=True, exist_ok=True)
    decode()

