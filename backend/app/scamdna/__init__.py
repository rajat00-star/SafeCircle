"""Scam DNA: case-level reconstruction of multi-stage financial scams.

Modules (each independently testable, no database access):
  tactics.py     financial tactic taxonomy + transparent rules on top of the base detector
  evidence.py    redaction and indicator extraction for stored evidence
  assessment.py  case-level risk, uncertainty, attack chain and change explanation
  alerts.py      alert decision with duplicate suppression
  campaigns.py   correlation of related cases into potential campaigns
  ocr.py         safe screenshot validation and local OCR (Tesseract)
  demo.py        clearly labelled synthetic DEMO DATA scenarios
"""
