#!/usr/bin/env python3
"""EntropIA spaCy NER subprocess.

Reads UTF-8 text from stdin and emits JSON entities between sentinel markers.
Default model: es_core_news_sm.
"""

from __future__ import annotations

import argparse
import json
import sys

BEGIN = "===SPACY_NER_JSON_BEGIN==="
END = "===SPACY_NER_JSON_END==="

LABEL_MAP = {
    "PER": "person",
    "PERSON": "person",
    "LOC": "place",
    "GPE": "place",
    "ORG": "organization",
    "DATE": "date",
    "MISC": "misc",
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Extract Spanish NER with spaCy")
    parser.add_argument("--model", default="es_core_news_sm")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    text = sys.stdin.read()
    if not text.strip():
        print(BEGIN)
        print("[]")
        print(END)
        return 0

    try:
        import spacy
    except Exception as exc:  # pragma: no cover - runtime diagnostic
        print(f"spaCy no disponible: {exc}", file=sys.stderr)
        return 2

    try:
        nlp = spacy.load(args.model)
    except Exception as exc:  # pragma: no cover - runtime diagnostic
        print(f"Modelo spaCy '{args.model}' no disponible: {exc}", file=sys.stderr)
        return 3

    doc = nlp(text)
    entities = []
    seen = set()
    for ent in doc.ents:
        entity_type = LABEL_MAP.get(ent.label_.upper())
        value = ent.text.strip()
        if not entity_type or not value:
            continue
        key = (value.casefold(), entity_type, ent.start_char, ent.end_char)
        if key in seen:
            continue
        seen.add(key)
        entities.append(
            {
                "value": value,
                "type": entity_type,
                "start_offset": ent.start_char,
                "end_offset": ent.end_char,
                "confidence": 0.85,
            }
        )

    print(BEGIN)
    print(json.dumps(entities, ensure_ascii=False))
    print(END)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
