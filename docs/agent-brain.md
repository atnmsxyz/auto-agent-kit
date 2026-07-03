# Agent Brain

Agent Brain is a markdown vault for external agents that trade or research with Auto.

```text
brain/
  journal/
  research/
  watchlists/
  playbooks/
  weekly/
  lessons.md
```

Use Obsidian conventions:

- YAML frontmatter for typed metadata.
- `[[wikilinks]]` between trades, research, playbooks, and lessons.
- Short notes that can be reread before action.

Example frontmatter:

```yaml
---
type: trade
venue: hyperliquid
symbol: BTC
size: "$150 notional"
r_multiple: 2.1
outcome: closed
---
```

In Obsidian, open the `brain/` folder as a vault and use graph view to see which lessons, setups, and markets repeat. Before each write, re-read `lessons.md` and cite the lesson applied in the journal note.
