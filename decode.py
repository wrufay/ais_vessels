#!/usr/bin/env python3
"""
decode.py — Decode raw CCG AIS NMEA data into SQLite using aisdb.

PURPOSE
-------
This script is one half of a decoder comparison study. It uses the aisdb
library to decode raw AIS NMEA messages from CCG (Canadian Coast Guard) data
into a SQLite database. The output can then be compared against the output of
a second decoder (Jinshan's Process_AIS_Serial.py) to evaluate differences in
unique vessel counts and position (lat/lon) data.

INPUT FORMATS
-------------
There are two raw input sources, both containing the same data in different
packaging:

  1. streaming  — A single large CSV file that accumulates all AIS messages
                  for the day in real time. Located at:
                  /home/shared/ccg_ais_claudio/ais_comp/streaming/
                  Despite the .csv extension, the file contains raw NMEA
                  sentences (e.g. !AIVDM,...), not tabular data.

  2. nm4        — The same day's data split into 5-minute chunks, stored as
                  zipped .nmea files. Located at:
                  /home/shared/ccg_ais_claudio/ais_comp/NM4/
                  288 files cover a full 24-hour day (288 × 5 min = 24 hrs).

NOTE: The ais_comp/csv/ folder contains pre-decoded tabular CSVs — these are
NOT processed by this script. They serve as a reference output to compare
against.

OUTPUT
------
Each source is decoded into its own SQLite database so results can be compared
independently:
  - data/decode_streaming.db  (from streaming source)
  - data/decode_nm4.db        (from NM4 source)

AISDB SYMLINK TRICK
-------------------
aisdb determines how to decode a file based on its extension:
  - .nm4 / .nmea  → treated as raw NMEA (what we want)
  - .csv          → treated as pre-decoded tabular data (wrong for our files)

Since the streaming file has a .csv extension but contains raw NMEA, we
create a temporary symlink with a .nm4 extension pointing to the original
file. This tricks aisdb into decoding it correctly without copying the file.

USAGE
-----
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

# Path to the full-day accumulating raw NMEA CSV
STREAMING_DIR = "/home/shared/ccg_ais_claudio/ais_comp/streaming"

# Path to the 5-minute chunked NM4 zip files
NM4_DIR = "/home/shared/ccg_ais_claudio/ais_comp/NM4"

# Output directory for decoded SQLite databases
DATA_DIR = Path(__file__).parent / "data"


def decode_streaming():
    """
    Decode the full-day CCG streaming CSV into SQLite.

    The streaming file is a single large CSV containing raw NMEA sentences
    for an entire day. Because aisdb misidentifies .csv files as tabular data,
    we symlink each file to a .nm4 path in a temp directory before decoding.

    Output: data/decode_streaming.db
    """
    csv_files = sorted(glob.glob(f"{STREAMING_DIR}/CCG_AIS_UTC_Log_*.csv"))
    if not csv_files:
        print("No streaming files found.")
        return

    print(f"Decoding {len(csv_files)} streaming file(s)...")
    db_path = DATA_DIR / "decode_streaming.db"

    with tempfile.TemporaryDirectory() as tmpdir:
        nm4_files = []

        for csv_path in csv_files:
            # Create a .nm4 symlink so aisdb treats the file as raw NMEA
            nm4_path = os.path.join(tmpdir, f"{Path(csv_path).stem}.nm4")
            os.symlink(os.path.abspath(csv_path), nm4_path)
            nm4_files.append(nm4_path)

        with aisdb.SQLiteDBConn(str(db_path)) as dbconn:
            aisdb.decode_msgs(
                filepaths=nm4_files,
                dbconn=dbconn,
                source="CCG_terrestrial",  # label stored in the DB for traceability
                skip_checksum=True,        # CCG messages sometimes have invalid checksums
                type_preference="nmea",    # force NMEA decoding path
            )

    print(f"Done. Output: {db_path}")


def decode_nm4():
    """
    Decode the 5-minute NM4 zip chunks into SQLite.

    Each zip file contains a single .nmea file covering a 5-minute window.
    All zips are extracted to a temp directory and decoded together in one
    aisdb call. The .nmea extension is recognised natively by aisdb so no
    symlinking is needed here.

    Output: data/decode_nm4.db
    """
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
                # Collect the extracted .nmea file paths
                for name in zf.namelist():
                    nmea_files.append(os.path.join(tmpdir, name))

        with aisdb.SQLiteDBConn(str(db_path)) as dbconn:
            aisdb.decode_msgs(
                filepaths=nmea_files,
                dbconn=dbconn,
                source="CCG_terrestrial",  # label stored in the DB for traceability
                skip_checksum=True,        # CCG messages sometimes have invalid checksums
                type_preference="nmea",    # force NMEA decoding path
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
