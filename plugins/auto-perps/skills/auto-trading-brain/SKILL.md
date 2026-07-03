---
name: auto-trading-brain
description: Use to maintain a local trading journal, research vault, watchlists, playbooks, lessons, and weekly reviews.
---

# Auto Trading Brain

Use a markdown brain when the client has filesystem access. If no filesystem is available, degrade to chat-rendered notes and tell the user what to save.

## First Run

Offer to scaffold:

```text
brain/
  journal/
  research/
  watchlists/
  playbooks/
  weekly/
  lessons.md
```

Use Obsidian-friendly markdown: YAML frontmatter, clear headings, and `[[wikilinks]]`.

## Journal Frontmatter

```yaml
---
type: trade
venue: hyperliquid
symbol: BTC
size: "$150 notional"
r_multiple: 2.1
outcome: open
---
```

For bets, use `type: bet`, `venue: polymarket`, `symbol:` as the market title, and `outcome:` as open/won/lost/sold/redeemed.

## Soft Rules

- Journal before and after every write.
- Re-read `brain/lessons.md` before new writes.
- Cite applied lessons in the pre-trade note.
- Link research notes to journal entries.
- Add one lesson after a meaningful win, loss, mistake, or avoided trade.

## Weekly Review

Summarize win rate, average R, worst mistake, best process, recurring setup, and one rule to change. Keep it short enough to reread before trading.
