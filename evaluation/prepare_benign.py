"""Recreate the benign hostname samples from the Cisco Umbrella top-1M list.

The list is published daily at
http://s3-us-west-1.amazonaws.com/umbrella-static/top-1m.csv.zip and is not
redistributed in this repository. Our evaluation used the snapshot downloaded
on 2026-10-10; a later snapshot will give slightly different samples.

Usage: python evaluation/prepare_benign.py top-1m.csv out_dir/
Writes benign_hosts_sample.txt (test, 5,000) and dev_benign.txt (dev, 20,000).
"""
import csv
import random
import sys
from pathlib import Path

src, out = Path(sys.argv[1]), Path(sys.argv[2])
out.mkdir(parents=True, exist_ok=True)
hosts = [r[1].strip().lower() for r in csv.reader(src.open())]
random.seed(20261010)
test = random.sample(hosts, 5000)
(out / "benign_hosts_sample.txt").write_text("\n".join(test) + "\n")
test_set = set(test)
random.seed(777)
pool = [h for h in hosts if h not in test_set]
(out / "dev_benign.txt").write_text("\n".join(random.sample(pool, 20000)) + "\n")
print("wrote", out)
