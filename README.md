# sticky-notes

Quick notes panel for Claude Code. Notes stick to the project + branch you're working on.

## what it does

- `/notes` opens a side panel
- notes are saved per project/branch combo
- persists between sessions
- `n` hotkey when prompt is empty

## install

```
/plugin install sticky-notes --marketplace kln-100/sticky-notes
```

## usage

open with `/notes` or press `n`

in the panel:
- type + enter to add
- ✏️ edit, 🗑️ delete
- `a` add, `s` save, `c` cancel

notes live in claude's plugin store keyed by `path::branch`

## license

MIT
