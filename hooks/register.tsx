import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'
import type { Note, Folder, ProjectInfo } from '../types'

const PANE = 'sticky-notes'

// State atoms
const notes = atom({ plugin: 'sticky-notes', key: 'notes' } as const, [] as Note[], { shape: 'notes-3' })
const folders = atom({ plugin: 'sticky-notes', key: 'folders' } as const, [] as Folder[], { shape: 'folders-1' })
const editing = atom({ plugin: 'sticky-notes', key: 'editing' } as const, null as string | null, { shape: 'editing-1' })
const draft = atom({ plugin: 'sticky-notes', key: 'draft' } as const, '', { shape: 'draft-1' })
const projectInfo = atom({ plugin: 'sticky-notes', key: 'projectInfo' } as const, null as ProjectInfo | null, { shape: 'projectInfo-1' })
const currentAccent = atom({ plugin: 'sticky-notes', key: 'currentAccent' } as const, 'yellow', { shape: 'accent-1' })
const currentNoteColor = atom({ plugin: 'sticky-notes', key: 'currentNoteColor' } as const, 'white', { shape: 'notecolor-1' })
const currentBgColor = atom({ plugin: 'sticky-notes', key: 'currentBgColor' } as const, '', { shape: 'bgcolor-1' })
const showColorPicker = atom({ plugin: 'sticky-notes', key: 'showColorPicker' } as const, false, { shape: 'picker-1' })
const searchQuery = atom({ plugin: 'sticky-notes', key: 'searchQuery' } as const, '', { shape: 'search-1' })
const currentFolder = atom({ plugin: 'sticky-notes', key: 'currentFolder' } as const, null as string | null, { shape: 'folder-1' })
const showFolders = atom({ plugin: 'sticky-notes', key: 'showFolders' } as const, false, { shape: 'showfolders-1' })
const selectedNote = atom({ plugin: 'sticky-notes', key: 'selectedNote' } as const, null as string | null, { shape: 'selected-1' })
const showMoveMenu = atom({ plugin: 'sticky-notes', key: 'showMoveMenu' } as const, false, { shape: 'movemenu-1' })

const COLORS = ['yellow', 'cyan', 'green', 'magenta', 'blue', 'red', 'white'] as const
const BG_COLORS = ['', 'black', 'blue', 'cyan', 'green', 'magenta', 'red', 'yellow'] as const

async function getProjectInfo($: { session: { root: () => Promise<string> }, process: { run: (argv: readonly string[], init?: { cwd?: string }) => Promise<{ exitCode: number, stdout: string }> } }): Promise<ProjectInfo> {
  const cwd = await $.session.root()
  const projectName = cwd.split('/').pop() || 'unknown'
  let branch = 'main'
  try {
    const result = await $.process.run(['git', 'rev-parse', '--abbrev-ref', 'HEAD'], { cwd })
    if (result.exitCode === 0) branch = result.stdout.trim()
  } catch { /* not a git repo */ }
  return { projectName, branch, cwd }
}

function getProjectKey(info: ProjectInfo): string {
  return `${info.cwd}::${info.branch}`
}

function extractTags(text: string): string[] {
  const matches = text.match(/#\w+/g)
  return matches ? matches.map(t => t.slice(1)) : []
}

function formatTime(ts: number): string {
  const d = new Date(ts)
  const now = new Date()
  const diff = now.getTime() - ts
  if (diff < 60000) return 'now'
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const info = await getProjectInfo($)
    await update($, projectInfo, () => info)

    const key = getProjectKey(info)
    const allNotes = (await $.store.get('projectNotes')) as Record<string, Note[]> | undefined
    const allFolders = (await $.store.get('projectFolders')) as Record<string, Folder[]> | undefined
    if (allNotes?.[key]) await update($, notes, () => allNotes[key])
    if (allFolders?.[key]) await update($, folders, () => allFolders[key])

    const savedAccent = await $.store.get('accentColor') as string | undefined
    const savedNoteColor = await $.store.get('noteColor') as string | undefined
    const savedBgColor = await $.store.get('bgColor') as string | undefined
    if (savedAccent) await update($, currentAccent, () => savedAccent)
    if (savedNoteColor) await update($, currentNoteColor, () => savedNoteColor)
    if (savedBgColor) await update($, currentBgColor, () => savedBgColor)

    await $.command.register({ name: 'notes', description: 'Open the project notes panel' })
    await $.command.register({ name: 'notes-export', description: 'Export notes to markdown file' })

    return next(e)
  })

  on('command.run', { command: 'notes' }, async ($) => {
    const info = await read($, projectInfo)
    const title = info ? `Notes: ${info.projectName}/${info.branch}` : 'Notes'
    await $.ui.open({ id: PANE, title })
    return { text: 'Notes panel opened.' }
  })

  on('command.run', { command: 'notes-export' }, async ($) => {
    const info = await read($, projectInfo)
    const list = await read($, notes)
    const folds = await read($, folders)
    if (!info) return { text: 'No project info.' }

    let md = `# Notes: ${info.projectName}/${info.branch}\n\n`
    const pinnedNotes = list.filter(n => n.pinned)
    const unpinnedNotes = list.filter(n => !n.pinned)

    if (pinnedNotes.length) {
      md += `## 📌 Pinned\n\n`
      pinnedNotes.forEach(n => { md += `- ${n.text}\n` })
      md += '\n'
    }

    for (const folder of folds) {
      const folderNotes = unpinnedNotes.filter(n => n.folder === folder.id)
      if (folderNotes.length) {
        md += `## 📁 ${folder.name}\n\n`
        folderNotes.forEach(n => { md += `- ${n.text}\n` })
        md += '\n'
      }
    }

    const uncategorized = unpinnedNotes.filter(n => !n.folder)
    if (uncategorized.length) {
      md += `## Notes\n\n`
      uncategorized.forEach(n => { md += `- ${n.text}\n` })
    }

    const filename = `notes-${info.projectName}-${info.branch}.md`.replace(/[^a-z0-9.-]/gi, '-')
    await $.process.run(['bash', '-c', `cat > "${filename}" << 'NOTES_EOF'\n${md}\nNOTES_EOF`], { cwd: info.cwd })
    return { text: `Exported to ${filename}` }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e) => {
    const { Box, Button, Text } = $.ui.resolve(e)
    const info = await read($, projectInfo)
    const list = await read($, notes)

    return (
      <Box>
        <Button key="open-notes" hotkey="n" plain onPress={async () => {
          const title = info ? `Notes: ${info.projectName}/${info.branch}` : 'Notes'
          await $.ui.open({ id: PANE, title })
        }}>
          📝{list.length > 0 && <Text dimColor> {list.length}</Text>}
        </Button>
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button, Input } = $.ui.resolve(e)
    const list = await read($, notes)
    const folds = await read($, folders)
    const editingId = await read($, editing)
    const draftText = await read($, draft)
    const info = await read($, projectInfo)
    const accentColor = await read($, currentAccent)
    const noteColor = await read($, currentNoteColor)
    const bgColor = await read($, currentBgColor)
    const pickerOpen = await read($, showColorPicker)
    const search = await read($, searchQuery)
    const activeFolder = await read($, currentFolder)
    const foldersOpen = await read($, showFolders)
    const selected = await read($, selectedNote)
    const moveMenuOpen = await read($, showMoveMenu)

    const saveNotes = async (newNotes: Note[]) => {
      if (!info) return
      const key = getProjectKey(info)
      const allNotes = ((await $.store.get('projectNotes')) as Record<string, Note[]>) || {}
      allNotes[key] = newNotes
      await $.store.set('projectNotes', allNotes)
    }

    const saveFolders = async (newFolders: Folder[]) => {
      if (!info) return
      const key = getProjectKey(info)
      const allFolders = ((await $.store.get('projectFolders')) as Record<string, Folder[]>) || {}
      allFolders[key] = newFolders
      await $.store.set('projectFolders', allFolders)
    }

    const addNote = async () => {
      if (!draftText.trim()) return
      const tags = extractTags(draftText)
      const newNote: Note = {
        id: crypto.randomUUID(),
        text: draftText.trim(),
        createdAt: await $.clock.now(),
        tags: tags.length ? tags : undefined,
        folder: activeFolder || undefined,
      }
      await update($, notes, old => {
        const updated = [...old, newNote]
        void saveNotes(updated)
        return updated
      })
      await update($, draft, () => '')
    }

    const deleteNote = async (id: string) => {
      await update($, notes, old => {
        const updated = old.filter(n => n.id !== id)
        void saveNotes(updated)
        return updated
      })
      if (selected === id) await update($, selectedNote, () => null)
    }

    const togglePin = async (id: string) => {
      await update($, notes, old => {
        const updated = old.map(n => n.id === id ? { ...n, pinned: !n.pinned } : n)
        void saveNotes(updated)
        return updated
      })
    }

    const moveNote = async (id: string, direction: 'up' | 'down') => {
      await update($, notes, old => {
        const idx = old.findIndex(n => n.id === id)
        if (idx === -1) return old
        const newIdx = direction === 'up' ? idx - 1 : idx + 1
        if (newIdx < 0 || newIdx >= old.length) return old
        const updated = [...old]
        const temp = updated[idx]
        updated[idx] = updated[newIdx]
        updated[newIdx] = temp
        void saveNotes(updated)
        return updated
      })
    }

    const copyNote = async (text: string) => {
      await $.ui.copy({ text, surface: e.surface })
      await $.ui.toast('Copied!')
    }

    const startEdit = async (id: string) => {
      const note = list.find(n => n.id === id)
      if (note) {
        await update($, editing, () => id)
        await update($, draft, () => note.text)
        await update($, selectedNote, () => null)
      }
    }

    const saveEdit = async () => {
      if (!editingId) return
      const tags = extractTags(draftText)
      await update($, notes, old => {
        const updated = old.map(n => n.id === editingId ? { ...n, text: draftText.trim(), tags: tags.length ? tags : undefined } : n)
        void saveNotes(updated)
        return updated
      })
      await update($, editing, () => null)
      await update($, draft, () => '')
    }

    const cancelEdit = async () => {
      await update($, editing, () => null)
      await update($, draft, () => '')
    }

    const addFolder = async () => {
      const name = `Folder ${folds.length + 1}`
      const newFolder: Folder = { id: crypto.randomUUID(), name }
      await update($, folders, old => {
        const updated = [...old, newFolder]
        void saveFolders(updated)
        return updated
      })
    }

    const deleteFolder = async (id: string) => {
      await update($, folders, old => {
        const updated = old.filter(f => f.id !== id)
        void saveFolders(updated)
        return updated
      })
      await update($, notes, old => {
        const updated = old.map(n => n.folder === id ? { ...n, folder: undefined } : n)
        void saveNotes(updated)
        return updated
      })
      if (activeFolder === id) await update($, currentFolder, () => null)
    }

    const moveToFolder = async (noteId: string, folderId: string | null) => {
      await update($, notes, old => {
        const updated = old.map(n => n.id === noteId ? { ...n, folder: folderId || undefined } : n)
        void saveNotes(updated)
        return updated
      })
      await update($, showMoveMenu, () => false)
      await $.ui.toast(folderId ? 'Moved to folder' : 'Removed from folder')
    }

    const selectNote = async (id: string) => {
      await update($, selectedNote, old => old === id ? null : id)
      await update($, showMoveMenu, () => false)
    }

    // Filter notes
    let filtered = list
    if (search) {
      const q = search.toLowerCase()
      filtered = filtered.filter(n => n.text.toLowerCase().includes(q) || n.tags?.some(t => t.toLowerCase().includes(q)))
    }
    if (activeFolder) {
      filtered = filtered.filter(n => n.folder === activeFolder)
    }

    // Sort: pinned first
    const pinned = filtered.filter(n => n.pinned)
    const unpinned = filtered.filter(n => !n.pinned)
    const sortedNotes = [...pinned, ...unpinned]

    const room = Math.max(1, (e.viewport?.rows ?? 24) - 18)
    const selectedNoteData = selected ? list.find(n => n.id === selected) : null

    return (
      <Box flexDirection="column" padding={1} backgroundColor={bgColor || undefined} minHeight="100%" width="100%">
        {/* Header */}
        <Box marginBottom={1}>
          <Text bold color={accentColor}>📝 Project Notes</Text>
          {info && <Text dimColor> — {info.projectName}/{info.branch}</Text>}
        </Box>

        {/* Search bar */}
        <Box marginBottom={1}>
          <Input key="search" placeholder="🔍 Search notes or #tags..." value={search}
            onInput={async t => await update($, searchQuery, () => t)} onSubmit={() => {}} />
        </Box>

        {/* Toolbar */}
        <Box marginBottom={1}>
          <Button key="folders-toggle" plain onPress={async () => await update($, showFolders, v => !v)}>
            📁 Folders{foldersOpen ? ' ▼' : ' ▶'}
          </Button>
          <Text>  </Text>
          <Button key="colors-toggle" plain onPress={async () => await update($, showColorPicker, v => !v)}>
            🎨 Colors{pickerOpen ? ' ▼' : ' ▶'}
          </Button>
          <Text>  </Text>
          <Text dimColor>({list.length} notes)</Text>
        </Box>

        {/* Folders panel */}
        {foldersOpen && (
          <Box flexDirection="column" marginBottom={1}>
            <Box>
              <Button key="all-notes" plain onPress={async () => await update($, currentFolder, () => null)}>
                <Text color={!activeFolder ? 'green' : 'white'}>📋 All</Text>
              </Button>
              {folds.map(f => (
                <Box key={f.id}>
                  <Text>  </Text>
                  <Button key={`fold-${f.id}`} plain onPress={async () => await update($, currentFolder, () => f.id)}>
                    <Text color={activeFolder === f.id ? 'green' : 'cyan'}>📁 {f.name}</Text>
                  </Button>
                  <Button key={`del-fold-${f.id}`} plain dimColor onPress={() => deleteFolder(f.id)}> ✕</Button>
                </Box>
              ))}
              <Text>  </Text>
              <Button key="add-folder" plain onPress={addFolder}>
                <Text color="yellow">+ New Folder</Text>
              </Button>
            </Box>
            {activeFolder && (
              <Box marginTop={1}>
                <Text dimColor>Viewing: </Text>
                <Text color="cyan">{folds.find(f => f.id === activeFolder)?.name}</Text>
                <Text>  </Text>
                <Button key="clear-filter" plain dimColor onPress={async () => await update($, currentFolder, () => null)}>
                  Show all
                </Button>
              </Box>
            )}
          </Box>
        )}

        {/* Color picker */}
        {pickerOpen && (
          <Box flexDirection="column" marginBottom={1}>
            <Box><Text dimColor>Background: </Text>{BG_COLORS.map(c => (
              <Button key={`bg-${c || 'none'}`} plain onPress={async () => { await update($, currentBgColor, () => c); await $.store.set('bgColor', c) }}>
                <Text backgroundColor={c || undefined} color={c === bgColor ? 'green' : undefined}>{c === bgColor ? ' ● ' : ' ○ '}</Text>
              </Button>
            ))}</Box>
            <Box><Text dimColor>Title: </Text>{COLORS.map(c => (
              <Button key={`accent-${c}`} plain onPress={async () => { await update($, currentAccent, () => c); await $.store.set('accentColor', c) }}>
                <Text color={c}>{c === accentColor ? ' ● ' : ' ○ '}</Text>
              </Button>
            ))}</Box>
            <Box><Text dimColor>Notes: </Text>{COLORS.map(c => (
              <Button key={`note-${c}`} plain onPress={async () => { await update($, currentNoteColor, () => c); await $.store.set('noteColor', c) }}>
                <Text color={c}>{c === noteColor ? ' ● ' : ' ○ '}</Text>
              </Button>
            ))}</Box>
          </Box>
        )}

        {/* Add note input */}
        <Box marginBottom={1}>
          <Input key="note-input" placeholder={editingId ? '✏️ Edit note...' : '➕ Add note... (use #tags)'} value={draftText}
            onInput={async text => await update($, draft, () => text)}
            onSubmit={editingId ? saveEdit : addNote} />
        </Box>
        <Box marginBottom={1}>
          {editingId ? (
            <>
              <Button key="save" onPress={saveEdit}>💾 Save</Button>
              <Text>  </Text>
              <Button key="cancel" dimColor onPress={cancelEdit}>Cancel</Button>
            </>
          ) : (
            <Button key="add" onPress={addNote}>➕ Add Note</Button>
          )}
        </Box>

        {/* Selected note actions */}
        {selected && selectedNoteData && (
          <Box marginBottom={1} flexDirection="column">
            <Text dimColor>━━━ Actions for note {list.findIndex(n => n.id === selected) + 1} ━━━</Text>
            <Box marginTop={1}>
              <Button key="act-pin" plain onPress={() => togglePin(selected)}>
                {selectedNoteData.pinned ? '📌 Unpin' : '📌 Pin'}
              </Button>
              <Text>  </Text>
              <Button key="act-edit" plain onPress={() => startEdit(selected)}>✏️ Edit</Button>
              <Text>  </Text>
              <Button key="act-copy" plain onPress={() => copyNote(selectedNoteData.text)}>📋 Copy</Button>
              <Text>  </Text>
              <Button key="act-up" plain onPress={() => moveNote(selected, 'up')}>⬆️ Up</Button>
              <Text>  </Text>
              <Button key="act-down" plain onPress={() => moveNote(selected, 'down')}>⬇️ Down</Button>
              <Text>  </Text>
              <Button key="act-del" plain onPress={() => deleteNote(selected)}>🗑️ Delete</Button>
            </Box>
            {folds.length > 0 && (
              <Box marginTop={1}>
                <Button key="act-move" plain onPress={async () => await update($, showMoveMenu, v => !v)}>
                  📁 Move to folder{moveMenuOpen ? ' ▼' : ' ▶'}
                </Button>
                {moveMenuOpen && (
                  <>
                    <Text>  </Text>
                    <Button key="move-none" plain dimColor onPress={() => moveToFolder(selected, null)}>None</Button>
                    {folds.map(f => (
                      <Box key={`mv-${f.id}`}>
                        <Text>  </Text>
                        <Button key={`move-${f.id}`} plain onPress={() => moveToFolder(selected, f.id)}>
                          <Text color={selectedNoteData.folder === f.id ? 'green' : 'cyan'}>{f.name}</Text>
                        </Button>
                      </Box>
                    ))}
                  </>
                )}
              </Box>
            )}
            <Box marginTop={1}>
              <Button key="deselect" plain dimColor onPress={async () => await update($, selectedNote, () => null)}>
                ✕ Close actions
              </Button>
            </Box>
          </Box>
        )}

        {/* Notes list */}
        {sortedNotes.length === 0 && <Text dimColor>{search ? 'No matches found.' : 'No notes yet. Add one above!'}</Text>}

        <Box flexDirection="column">
          {sortedNotes.slice(0, room).map((note, i) => (
            <Box key={note.id} marginBottom={0}>
              <Button key={`sel-${note.id}`} plain onPress={() => selectNote(note.id)}>
                <Text color={selected === note.id ? 'green' : 'white'}>
                  {selected === note.id ? '▶' : ' '}
                  {note.pinned ? '📌' : '  '}
                  <Text dimColor>{i + 1}. </Text>
                  <Text color={noteColor}>{note.text.length > 50 ? note.text.slice(0, 50) + '...' : note.text}</Text>
                  <Text dimColor> {formatTime(note.createdAt)}</Text>
                  {note.folder && <Text color="cyan"> 📁</Text>}
                </Text>
              </Button>
            </Box>
          ))}
        </Box>

        {/* Help */}
        <Box marginTop={1}>
          <Text dimColor>Click a note to see actions • /notes-export to save as .md</Text>
        </Box>
      </Box>
    )
  })
}
