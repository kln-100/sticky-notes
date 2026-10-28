# sticky-notes

Quick notes panel for Claude Code. Notes stick to the project + branch you're working on.

## install

```
/plugin install sticky-notes --marketplace kln-100/sticky-notes
```

## features

### notes
- `/notes` or `n` hotkey to open panel
- notes saved per project/branch
- persists between sessions
- **bold**, *italic*, `code` markdown support
- #tags for organization
- pin important notes to top
- quick select with 1-9 keys
- duplicate, copy, reorder notes
- character counter while typing

### folders
- organize notes into folders
- rename folders inline
- 12 custom icons per folder
- filter by folder

### archive
- archive instead of delete
- restore archived notes
- permanent delete with confirmation

### undo
- undo last action (add, archive, edit)

### import/export
- `/notes-export` → save as .md file
- `/notes-import file.md` → import notes from markdown

### customization
- background color
- title color  
- note text color

## usage

| action | how |
|--------|-----|
| open panel | `/notes` or `n` |
| add note | type + enter |
| select note | click or press 1-9 |
| see actions | select a note |
| pin | 📌 button |
| edit | ✏️ button |
| copy | 📋 button |
| duplicate | ⧉ button |
| archive | 🗃️ button |
| move up/down | ↑ ↓ buttons |
| move to position | click position number |
| move to folder | 📁 dropdown |
| undo | ↩️ in header |

## how it stores data

notes keyed by `path::branch` in claude's plugin store

## license

MIT
