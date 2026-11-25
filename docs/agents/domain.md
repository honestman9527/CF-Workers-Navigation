# Domain Docs

How engineering skills consume this repo's domain documentation.

## Before exploring, read these

- **`GLOSSARY.md`** at the repo root (`single-context` layout).
- **`docs/adr/`**: read ADRs that touch the area you're about to work in, if any exist.

If any of these files don't exist, **proceed silently**. Don't flag their absence; don't suggest creating them upfront.

## File structure

```text
/
├── GLOSSARY.md
├── docs/adr/        # optional, created lazily when architectural decisions are recorded
└── src/
```

## Use the glossary's vocabulary

When naming a domain concept (in an issue title, refactor proposal, hypothesis, or test name), use the term as defined in `GLOSSARY.md` and avoid synonyms the glossary excludes.

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR-0007 (...), but worth reopening because…_
