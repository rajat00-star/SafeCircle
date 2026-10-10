# Evaluation

```bash
pip install -r backend/requirements-dev.txt
# 1. Benign hostnames (not redistributed): download and sample
curl -sO http://s3-us-west-1.amazonaws.com/umbrella-static/top-1m.csv.zip && unzip top-1m.csv.zip
python evaluation/prepare_benign.py top-1m.csv /tmp/benign      # writes benign_hosts_sample.txt, dev_benign.txt
# 2. (Re)train models (optional; trained artifacts are committed)
python evaluation/train_message_model.py
python evaluation/train_url_model.py --phish evaluation/data/phishing_urls_dev.txt --benign /tmp/benign/dev_benign.txt
# 3. Evaluate on held-out test data
python evaluation/evaluate.py --benign-hosts /tmp/benign/benign_hosts_sample.txt
```

Outputs: `results/metrics.json` (all metrics, confusion matrices, latency, error examples), confusion-matrix PNGs,
and `backend/app/detector/models/evaluation_summary.json` (served at `/api/v1/meta/model-card`).

Data in `data/`:
- `sms_spam_collection.tsv`: SMS Spam Collection, Almeida & Gómez Hidalgo, UCI ML Repository, CC BY 4.0
  (doi:10.24432/C5CC84). Mirror used: github.com/justmarkham/pycon-2016-tutorial.
- `sms_split.json`: the exact train/test indices (seed 42).
- `phishing_urls_sample.txt` (test, 5,000) and `phishing_urls_dev.txt` (dev, 20,000): random samples of
  `phishing-links-ACTIVE.txt` from github.com/mitchellkrogza/Phishing.Database (MIT), snapshot 2026-10-10.
  These are live malicious URLs: do not open them.

The Umbrella list changes daily, so a later download gives different benign samples and slightly different numbers.
See `docs/methodology.md` for protocol and limitations.
