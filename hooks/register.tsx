import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'
import type { Note, Folder, ProjectInfo } from '../types'

const PANE = 'sticky-notes'

// State atoms
const notes = atom({ plugin: 'sticky-notes', key: 'notes' } as const, [] as Note[], { shape: 'notes-4' })
const archive = atom({ plugin: 'sticky-notes', key: 'archive' } as const, [] as Note[], { shape: 'archive-1' })
const folders = atom({ plugin: 'sticky-notes', key: 'folders' } as const, [] as Folder[], { shape: 'folders-2' })
const editing = atom({ plugin: 'sticky-notes', key: 'editing' } as const, null as string | null, { shape: 'editing-1' })
const editingFolder = atom({ plugin: 'sticky-notes', key: 'editingFolder' } as const, null as string | null, { shape: 'editfolder-1' })
const draft = atom({ plugin: 'sticky-notes', key: 'draft' } as const, '', { shape: 'draft-1' })
const folderDraft = atom({ plugin: 'sticky-notes', key: 'folderDraft' } as const, '', { shape: 'folderdraft-1' })
const projectInfo = atom({ plugin: 'sticky-notes', key: 'projectInfo' } as const, null as ProjectInfo | null, { shape: 'projectInfo-1' })
const currentAccent = atom({ plugin: 'sticky-notes', key: 'currentAccent' } as const, 'yellow', { shape: 'accent-1' })
const currentNoteColor = atom({ plugin: 'sticky-notes', key: 'currentNoteColor' } as const, 'white', { shape: 'notecolor-1' })
const currentBgColor = atom({ plugin: 'sticky-notes', key: 'currentBgColor' } as const, '', { shape: 'bgcolor-1' })
const searchQuery = atom({ plugin: 'sticky-notes', key: 'searchQuery' } as const, '', { shape: 'search-1' })
const currentFolder = atom({ plugin: 'sticky-notes', key: 'currentFolder' } as const, null as string | null, { shape: 'folder-1' })
const selectedNote = atom({ plugin: 'sticky-notes', key: 'selectedNote' } as const, null as string | null, { shape: 'selected-1' })
const showMoveMenu = atom({ plugin: 'sticky-notes', key: 'showMoveMenu' } as const, false, { shape: 'movemenu-1' })
const activeTab = atom({ plugin: 'sticky-notes', key: 'activeTab' } as const, 'notes' as 'notes' | 'folders' | 'archive' | 'settings', { shape: 'tab-2' })
const lastAction = atom({ plugin: 'sticky-notes', key: 'lastAction' } as const, null as { type: string, data: unknown } | null, { shape: 'undo-1' })
const confirmDelete = atom({ plugin: 'sticky-notes', key: 'confirmDelete' } as const, null as string | null, { shape: 'confirm-1' })
const showPreview = atom({ plugin: 'sticky-notes', key: 'showPreview' } as const, false, { shape: 'preview-1' })

const COLORS = ['yellow', 'cyan', 'green', 'magenta', 'blue', 'red', 'white'] as const
const BG_COLORS = ['', 'black', 'blue', 'cyan', 'green', 'magenta', 'red', 'yellow'] as const
const FOLDER_ICONS = ['📁', '📂', '🗂️', '📚', '💼', '🎯', '⭐', '🔥', '💡', '🎨', '🛠️', '📌'] as const

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
  if (diff < 172800000) return 'yesterday'
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

function isRecent(ts: number): boolean {
  return Date.now() - ts < 3600000 // 1 hour
}

// Simple markdown rendering for terminal
function renderMarkdown(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '«$1»')  // bold -> «text»
    .replace(/\*(.+?)\*/g, '_$1_')       // italic -> _text_
    .replace(/`(.+?)`/g, '[$1]')         // code -> [code]
    .replace(/^- /gm, '• ')              // lists
    .replace(/^(\d+)\. /gm, '$1) ')      // numbered lists
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const info = await getProjectInfo($)
    await update($, projectInfo, () => info)

    const key = getProjectKey(info)
    const allNotes = (await $.store.get('projectNotes')) as Record<string, Note[]> | undefined
    const allFolders = (await $.store.get('projectFolders')) as Record<string, Folder[]> | undefined
    const allArchive = (await $.store.get('projectArchive')) as Record<string, Note[]> | undefined
    if (allNotes?.[key]) await update($, notes, () => allNotes[key])
    if (allFolders?.[key]) await update($, folders, () => allFolders[key])
    if (allArchive?.[key]) await update($, archive, () => allArchive[key])

    const savedAccent = await $.store.get('accentColor') as string | undefined
    const savedNoteColor = await $.store.get('noteColor') as string | undefined
    const savedBgColor = await $.store.get('bgColor') as string | undefined
    if (savedAccent) await update($, currentAccent, () => savedAccent)
    if (savedNoteColor) await update($, currentNoteColor, () => savedNoteColor)
    if (savedBgColor) await update($, currentBgColor, () => savedBgColor)

    await $.command.register({ name: 'notes', description: 'Open the project notes panel' })
    await $.command.register({ name: 'notes-export', description: 'Export notes to markdown file' })
    await $.command.register({ name: 'notes-import', description: 'Import notes from a markdown file' })

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
        md += `## ${folder.icon || '📁'} ${folder.name}\n\n`
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

  on('command.run', { command: 'notes-import' }, async ($, e) => {
    const info = await read($, projectInfo)
    if (!info) return { text: 'No project info.' }

    const filepath = e.args?.[0]
    if (!filepath) return { text: 'Usage: /notes-import <file.md>' }

    try {
      const result = await $.process.run(['cat', filepath], { cwd: info.cwd })
      if (result.exitCode !== 0) return { text: `File not found: ${filepath}` }

      const content = result.stdout
      const lines = content.split('\n')
      let imported = 0

      for (const line of lines) {
        const match = line.match(/^[-*]\s+(.+)$/)
        if (match) {
          const text = match[1].trim()
          if (text) {
            const tags = extractTags(text)
            const newNote: Note = {
              id: crypto.randomUUID(),
              text,
              createdAt: Date.now(),
              tags: tags.length ? tags : undefined,
            }
            await update($, notes, old => [...old, newNote])
            imported++
          }
        }
      }

      // Save
      const key = getProjectKey(info)
      const list = await read($, notes)
      const allNotes = ((await $.store.get('projectNotes')) as Record<string, Note[]>) || {}
      allNotes[key] = list
      await $.store.set('projectNotes', allNotes)

      return { text: `Imported ${imported} notes from ${filepath}` }
    } catch {
      return { text: `Error reading ${filepath}` }
    }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e) => {
    const { Box, Button, Text } = $.ui.resolve(e)
    const info = await read($, projectInfo)
    const list = await read($, notes)
    const recentCount = list.filter(n => isRecent(n.createdAt)).length

    return (
      <Box>
        <Button key="open-notes" hotkey="n" plain onPress={async () => {
          const title = info ? `Notes: ${info.projectName}/${info.branch}` : 'Notes'
          await $.ui.open({ id: PANE, title })
        }}>
          📝{list.length > 0 && <Text dimColor> {list.length}</Text>}
          {recentCount > 0 && <Text color="green"> •</Text>}
        </Button>
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button, Input } = $.ui.resolve(e)
    const list = await read($, notes)
    const archived = await read($, archive)
    const folds = await read($, folders)
    const editingId = await read($, editing)
    const editingFolderId = await read($, editingFolder)
    const draftText = await read($, draft)
    const folderDraftText = await read($, folderDraft)
    const info = await read($, projectInfo)
    const accentColor = await read($, currentAccent)
    const noteColor = await read($, currentNoteColor)
    const bgColor = await read($, currentBgColor)
    const search = await read($, searchQuery)
    const folderFilter = await read($, currentFolder)
    const selected = await read($, selectedNote)
    const moveMenuOpen = await read($, showMoveMenu)
    const tab = await read($, activeTab)
    const lastAct = await read($, lastAction)
    const confirmDel = await read($, confirmDelete)
    const previewOpen = await read($, showPreview)

    const saveNotes = async (newNotes: Note[]) => {
      if (!info) return
      const key = getProjectKey(info)
      const allNotes = ((await $.store.get('projectNotes')) as Record<string, Note[]>) || {}
      allNotes[key] = newNotes
      await $.store.set('projectNotes', allNotes)
    }

    const saveArchive = async (newArchive: Note[]) => {
      if (!info) return
      const key = getProjectKey(info)
      const allArchive = ((await $.store.get('projectArchive')) as Record<string, Note[]>) || {}
      allArchive[key] = newArchive
      await $.store.set('projectArchive', allArchive)
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
        folder: folderFilter || undefined,
      }
      await update($, notes, old => {
        const updated = [...old, newNote]
        void saveNotes(updated)
        return updated
      })
      await update($, draft, () => '')
      await update($, lastAction, () => ({ type: 'add', data: newNote }))
    }

    const archiveNote = async (id: string) => {
      const note = list.find(n => n.id === id)
      if (!note) return
      await update($, notes, old => {
        const updated = old.filter(n => n.id !== id)
        void saveNotes(updated)
        return updated
      })
      await update($, archive, old => {
        const updated = [...old, { ...note, archivedAt: Date.now() }]
        void saveArchive(updated)
        return updated
      })
      await update($, lastAction, () => ({ type: 'archive', data: note }))
      await update($, selectedNote, () => null)
      await $.ui.toast('Archived')
    }

    const restoreNote = async (id: string) => {
      const note = archived.find(n => n.id === id)
      if (!note) return
      await update($, archive, old => {
        const updated = old.filter(n => n.id !== id)
        void saveArchive(updated)
        return updated
      })
      const { archivedAt, ...restoredNote } = note as Note & { archivedAt?: number }
      await update($, notes, old => {
        const updated = [...old, restoredNote]
        void saveNotes(updated)
        return updated
      })
      await $.ui.toast('Restored')
    }

    const deleteNotePermanent = async (id: string) => {
      await update($, archive, old => {
        const updated = old.filter(n => n.id !== id)
        void saveArchive(updated)
        return updated
      })
      await update($, confirmDelete, () => null)
      await $.ui.toast('Deleted permanently')
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

    const moveToPosition = async (id: string, pos: number) => {
      await update($, notes, old => {
        const idx = old.findIndex(n => n.id === id)
        if (idx === -1 || pos < 1 || pos > old.length) return old
        const updated = [...old]
        const [note] = updated.splice(idx, 1)
        updated.splice(pos - 1, 0, note)
        void saveNotes(updated)
        return updated
      })
      await $.ui.toast(`Moved to position ${pos}`)
    }

    const copyNote = async (text: string) => {
      await $.ui.copy({ text, surface: e.surface })
      await $.ui.toast('Copied!')
    }

    const duplicateNote = async (id: string) => {
      const note = list.find(n => n.id === id)
      if (!note) return
      const newNote: Note = {
        ...note,
        id: crypto.randomUUID(),
        createdAt: await $.clock.now(),
        text: note.text + ' (copy)',
      }
      await update($, notes, old => {
        const updated = [...old, newNote]
        void saveNotes(updated)
        return updated
      })
      await $.ui.toast('Duplicated')
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
      const oldNote = list.find(n => n.id === editingId)
      const tags = extractTags(draftText)
      await update($, notes, old => {
        const updated = old.map(n => n.id === editingId ? { ...n, text: draftText.trim(), tags: tags.length ? tags : undefined } : n)
        void saveNotes(updated)
        return updated
      })
      await update($, lastAction, () => ({ type: 'edit', data: oldNote }))
      await update($, editing, () => null)
      await update($, draft, () => '')
    }

    const cancelEdit = async () => {
      await update($, editing, () => null)
      await update($, draft, () => '')
    }

    const undo = async () => {
      if (!lastAct) return
      if (lastAct.type === 'add') {
        const note = lastAct.data as Note
        await update($, notes, old => {
          const updated = old.filter(n => n.id !== note.id)
          void saveNotes(updated)
          return updated
        })
        await $.ui.toast('Undid add')
      } else if (lastAct.type === 'archive') {
        const note = lastAct.data as Note
        await update($, notes, old => {
          const updated = [...old, note]
          void saveNotes(updated)
          return updated
        })
        await update($, archive, old => {
          const updated = old.filter(n => n.id !== note.id)
          void saveArchive(updated)
          return updated
        })
        await $.ui.toast('Undid archive')
      } else if (lastAct.type === 'edit') {
        const note = lastAct.data as Note
        await update($, notes, old => {
          const updated = old.map(n => n.id === note.id ? note : n)
          void saveNotes(updated)
          return updated
        })
        await $.ui.toast('Undid edit')
      }
      await update($, lastAction, () => null)
    }

    const addFolder = async () => {
      const name = `Folder ${folds.length + 1}`
      const newFolder: Folder = { id: crypto.randomUUID(), name, icon: '📁' }
      await update($, folders, old => {
        const updated = [...old, newFolder]
        void saveFolders(updated)
        return updated
      })
    }

    const startEditFolder = async (id: string) => {
      const folder = folds.find(f => f.id === id)
      if (folder) {
        await update($, editingFolder, () => id)
        await update($, folderDraft, () => folder.name)
      }
    }

    const saveEditFolder = async () => {
      if (!editingFolderId || !folderDraftText.trim()) return
      await update($, folders, old => {
        const updated = old.map(f => f.id === editingFolderId ? { ...f, name: folderDraftText.trim() } : f)
        void saveFolders(updated)
        return updated
      })
      await update($, editingFolder, () => null)
      await update($, folderDraft, () => '')
    }

    const setFolderIcon = async (folderId: string, icon: string) => {
      await update($, folders, old => {
        const updated = old.map(f => f.id === folderId ? { ...f, icon } : f)
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
      if (folderFilter === id) await update($, currentFolder, () => null)
    }

    const moveToFolder = async (noteId: string, folderId: string | null) => {
      await update($, notes, old => {
        const updated = old.map(n => n.id === noteId ? { ...n, folder: folderId || undefined } : n)
        void saveNotes(updated)
        return updated
      })
      await update($, showMoveMenu, () => false)
      await $.ui.toast(folderId ? 'Moved!' : 'Removed from folder')
    }

    const selectNote = async (id: string) => {
      await update($, selectedNote, old => old === id ? null : id)
      await update($, showMoveMenu, () => false)
      await update($, confirmDelete, () => null)
    }

    const selectByNumber = async (num: number) => {
      if (num < 1 || num > sortedNotes.length) return
      const note = sortedNotes[num - 1]
      await selectNote(note.id)
    }

    // Filter notes
    let filtered = list
    if (search) {
      const q = search.toLowerCase()
      filtered = filtered.filter(n => n.text.toLowerCase().includes(q) || n.tags?.some(t => t.toLowerCase().includes(q)))
    }
    if (folderFilter) {
      filtered = filtered.filter(n => n.folder === folderFilter)
    }

    // Sort: pinned first, then recent first
    const pinned = filtered.filter(n => n.pinned).sort((a, b) => b.createdAt - a.createdAt)
    const unpinned = filtered.filter(n => !n.pinned).sort((a, b) => b.createdAt - a.createdAt)
    const sortedNotes = [...pinned, ...unpinned]

    const room = Math.max(1, (e.viewport?.rows ?? 24) - 14)
    const selectedNoteData = selected ? list.find(n => n.id === selected) : null

    const Separator = ({ label }: { label?: string }) => (
      <Box marginTop={1} marginBottom={1}>
        <Text dimColor>{label ? `── ${label} ──────────────────` : '────────────────────────────'}</Text>
      </Box>
    )

    return (
      <Box flexDirection="column" padding={1} backgroundColor={bgColor || undefined} minHeight="100%" width="100%">

        {/* HEADER */}
        <Box>
          <Text bold color={accentColor}>📝 Project Notes</Text>
          {lastAct && (
            <>
              <Text>  </Text>
              <Button key="undo" plain dimColor onPress={undo}>↩️ Undo</Button>
            </>
          )}
        </Box>
        <Box marginBottom={1}>
          <Text dimColor>{info ? `${info.projectName} / ${info.branch}` : 'Loading...'}</Text>
          <Text dimColor>  •  </Text>
          <Text dimColor>{list.length} notes</Text>
          {archived.length > 0 && <Text dimColor> • {archived.length} archived</Text>}
        </Box>

        {/* TABS */}
        <Box marginBottom={1}>
          <Button key="tab-notes" plain onPress={async () => await update($, activeTab, () => 'notes')}>
            <Text color={tab === 'notes' ? 'green' : 'white'} bold={tab === 'notes'}>📋 Notes</Text>
          </Button>
          <Text>  </Text>
          <Button key="tab-folders" plain onPress={async () => await update($, activeTab, () => 'folders')}>
            <Text color={tab === 'folders' ? 'green' : 'white'} bold={tab === 'folders'}>📁 Folders</Text>
          </Button>
          <Text>  </Text>
          <Button key="tab-archive" plain onPress={async () => await update($, activeTab, () => 'archive')}>
            <Text color={tab === 'archive' ? 'green' : 'white'} bold={tab === 'archive'}>🗃️ Archive</Text>
            {archived.length > 0 && <Text dimColor> ({archived.length})</Text>}
          </Button>
          <Text>  </Text>
          <Button key="tab-settings" plain onPress={async () => await update($, activeTab, () => 'settings')}>
            <Text color={tab === 'settings' ? 'green' : 'white'} bold={tab === 'settings'}>⚙️</Text>
          </Button>
        </Box>

        <Separator />

        {/* TAB: NOTES */}
        {tab === 'notes' && (
          <Box flexDirection="column">
            {/* Search */}
            <Box marginBottom={1}>
              <Text dimColor>🔍 </Text>
              <Input key="search" placeholder="Search notes or #tags..." value={search}
                onInput={async t => await update($, searchQuery, () => t)} onSubmit={() => {}} />
            </Box>

            {/* Quick select hint */}
            <Box marginBottom={1}>
              <Text dimColor>Quick: </Text>
              {[1,2,3,4,5,6,7,8,9].slice(0, Math.min(9, sortedNotes.length)).map(n => (
                <Button key={`quick-${n}`} plain dimColor onPress={() => selectByNumber(n)}>{n} </Button>
              ))}
            </Box>

            {folderFilter && (
              <Box marginBottom={1}>
                <Text dimColor>In: </Text>
                <Text color="cyan">{folds.find(f => f.id === folderFilter)?.icon || '📁'} {folds.find(f => f.id === folderFilter)?.name}</Text>
                <Text>  </Text>
                <Button key="clear-filter" plain dimColor onPress={async () => await update($, currentFolder, () => null)}>[×]</Button>
              </Box>
            )}

            {/* Add note */}
            <Box marginBottom={1}>
              <Text dimColor>{editingId ? '✏️ ' : '➕ '}</Text>
              <Input key="note-input" placeholder="Write a note... (supports **bold**, *italic*, `code`)" value={draftText}
                onInput={async text => await update($, draft, () => text)}
                onSubmit={editingId ? saveEdit : addNote} />
              <Text dimColor> {draftText.length}</Text>
            </Box>
            <Box marginBottom={1}>
              {editingId ? (
                <>
                  <Button key="save" onPress={saveEdit}>💾 Save</Button>
                  <Text>  </Text>
                  <Button key="cancel" dimColor onPress={cancelEdit}>Cancel</Button>
                </>
              ) : (
                <Button key="add" onPress={addNote}>Add</Button>
              )}
            </Box>

            <Separator label={`Notes${sortedNotes.length > 0 ? ` (${sortedNotes.length})` : ''}`} />

            {sortedNotes.length === 0 && (
              <Text dimColor>{search ? 'No matches.' : 'No notes yet.'}</Text>
            )}

            <Box flexDirection="column">
              {sortedNotes.slice(0, room).map((note, i) => (
                <Box key={note.id} flexDirection="column" marginBottom={1}>
                  <Button key={`sel-${note.id}`} plain onPress={() => selectNote(note.id)}>
                    <Text color={selected === note.id ? 'green' : 'white'}>
                      {selected === note.id ? '▸' : ' '}
                      {note.pinned && <Text color="yellow">📌</Text>}
                      {isRecent(note.createdAt) && !note.pinned && <Text color="green">•</Text>}
                      {!note.pinned && !isRecent(note.createdAt) && ' '}
                      <Text dimColor>[{i + 1}]</Text>
                      <Text color={noteColor}> {renderMarkdown(note.text.length > 42 ? note.text.slice(0, 42) + '...' : note.text)}</Text>
                    </Text>
                  </Button>
                  <Box>
                    <Text>   </Text>
                    <Text dimColor>{formatTime(note.createdAt)}</Text>
                    {note.folder && <Text color="cyan"> {folds.find(f => f.id === note.folder)?.icon || '📁'}</Text>}
                    {note.tags?.map(t => <Text key={t} color="magenta"> #{t}</Text>)}
                  </Box>
                </Box>
              ))}
            </Box>

            {/* Actions panel */}
            {selected && selectedNoteData && (
              <>
                <Separator label="Actions" />

                {/* Preview toggle */}
                <Box marginBottom={1}>
                  <Button key="preview-toggle" plain onPress={async () => await update($, showPreview, v => !v)}>
                    {previewOpen ? '▼ Hide preview' : '▶ Show full text'}
                  </Button>
                </Box>
                {previewOpen && (
                  <Box marginBottom={1} flexDirection="column">
                    <Text color={noteColor}>{renderMarkdown(selectedNoteData.text)}</Text>
                  </Box>
                )}

                <Box>
                  <Text dimColor>Quick: </Text>
                  <Button key="act-pin" plain onPress={() => togglePin(selected)}>{selectedNoteData.pinned ? '📌−' : '📌+'}</Button>
                  <Text> </Text>
                  <Button key="act-copy" plain onPress={() => copyNote(selectedNoteData.text)}>📋</Button>
                  <Text> </Text>
                  <Button key="act-edit" plain onPress={() => startEdit(selected)}>✏️</Button>
                  <Text> </Text>
                  <Button key="act-dup" plain onPress={() => duplicateNote(selected)}>⧉</Button>
                </Box>
                <Box marginTop={1}>
                  <Text dimColor>Order: </Text>
                  <Button key="act-up" plain onPress={() => moveNote(selected, 'up')}>↑</Button>
                  <Text> </Text>
                  <Button key="act-down" plain onPress={() => moveNote(selected, 'down')}>↓</Button>
                  <Text>  </Text>
                  <Text dimColor>To #:</Text>
                  {[1,2,3,4,5].slice(0, Math.min(5, list.length)).map(n => (
                    <Button key={`pos-${n}`} plain dimColor onPress={() => moveToPosition(selected, n)}> {n}</Button>
                  ))}
                </Box>
                {folds.length > 0 && (
                  <Box marginTop={1}>
                    <Text dimColor>Folder: </Text>
                    <Button key="act-move" plain onPress={async () => await update($, showMoveMenu, v => !v)}>
                      {moveMenuOpen ? '▼' : '▶'}
                    </Button>
                    {moveMenuOpen && (
                      <>
                        <Text> </Text>
                        <Button key="mv-none" plain dimColor onPress={() => moveToFolder(selected, null)}>∅</Button>
                        {folds.map(f => (
                          <Button key={`mv-${f.id}`} plain onPress={() => moveToFolder(selected, f.id)}>
                            <Text color={selectedNoteData.folder === f.id ? 'green' : 'cyan'}> {f.icon || '📁'}</Text>
                          </Button>
                        ))}
                      </>
                    )}
                  </Box>
                )}
                <Box marginTop={1}>
                  <Text dimColor>Other: </Text>
                  <Button key="act-archive" plain onPress={() => archiveNote(selected)}>🗃️</Button>
                  <Text> </Text>
                  <Button key="deselect" plain dimColor onPress={async () => await update($, selectedNote, () => null)}>✕</Button>
                </Box>
              </>
            )}

            {!selected && <Text dimColor>💡 Click note or press 1-9</Text>}
          </Box>
        )}

        {/* TAB: FOLDERS */}
        {tab === 'folders' && (
          <Box flexDirection="column">
            <Text bold>Folders</Text>

            <Separator />

            <Box marginBottom={1}>
              <Button key="filter-all" plain onPress={async () => { await update($, currentFolder, () => null); await update($, activeTab, () => 'notes') }}>
                <Text color={!folderFilter ? 'green' : 'white'}>{!folderFilter ? '●' : '○'} 📋 All</Text>
              </Button>
              <Text dimColor> ({list.length})</Text>
            </Box>

            {folds.map(f => {
              const count = list.filter(n => n.folder === f.id).length
              const isEditing = editingFolderId === f.id
              return (
                <Box key={f.id} marginBottom={1} flexDirection="column">
                  <Box>
                    {isEditing ? (
                      <>
                        <Input key={`edit-folder-${f.id}`} value={folderDraftText}
                          onInput={async t => await update($, folderDraft, () => t)}
                          onSubmit={saveEditFolder} />
                        <Text> </Text>
                        <Button key={`save-folder-${f.id}`} plain onPress={saveEditFolder}>✓</Button>
                      </>
                    ) : (
                      <>
                        <Button key={`filter-${f.id}`} plain onPress={async () => { await update($, currentFolder, () => f.id); await update($, activeTab, () => 'notes') }}>
                          <Text color={folderFilter === f.id ? 'green' : 'cyan'}>
                            {folderFilter === f.id ? '●' : '○'} {f.icon || '📁'} {f.name}
                          </Text>
                        </Button>
                        <Text dimColor> ({count})</Text>
                        <Text> </Text>
                        <Button key={`rename-${f.id}`} plain dimColor onPress={() => startEditFolder(f.id)}>✏️</Button>
                        <Text> </Text>
                        <Button key={`del-${f.id}`} plain dimColor onPress={() => deleteFolder(f.id)}>🗑️</Button>
                      </>
                    )}
                  </Box>
                  {/* Icon picker for selected folder */}
                  {!isEditing && folderFilter === f.id && (
                    <Box marginTop={1}>
                      <Text dimColor>  Icon: </Text>
                      {FOLDER_ICONS.map(icon => (
                        <Button key={`icon-${f.id}-${icon}`} plain onPress={() => setFolderIcon(f.id, icon)}>
                          <Text color={f.icon === icon ? 'green' : undefined}>{icon} </Text>
                        </Button>
                      ))}
                    </Box>
                  )}
                </Box>
              )
            })}

            <Separator />

            <Button key="add-folder" onPress={addFolder}>
              <Text color="yellow">➕ New Folder</Text>
            </Button>
          </Box>
        )}

        {/* TAB: ARCHIVE */}
        {tab === 'archive' && (
          <Box flexDirection="column">
            <Text bold>Archive</Text>
            <Text dimColor>Archived notes can be restored or deleted permanently</Text>

            <Separator />

            {archived.length === 0 && <Text dimColor>No archived notes.</Text>}

            {archived.slice(0, room).map((note, i) => (
              <Box key={note.id} marginBottom={1} flexDirection="column">
                <Box>
                  <Text dimColor>[{i + 1}] </Text>
                  <Text>{note.text.length > 40 ? note.text.slice(0, 40) + '...' : note.text}</Text>
                </Box>
                <Box>
                  <Text>   </Text>
                  <Button key={`restore-${note.id}`} plain onPress={() => restoreNote(note.id)}>
                    <Text color="green">↩️ Restore</Text>
                  </Button>
                  <Text>  </Text>
                  {confirmDel === note.id ? (
                    <>
                      <Text color="red">Sure? </Text>
                      <Button key={`confirm-del-${note.id}`} plain onPress={() => deleteNotePermanent(note.id)}>
                        <Text color="red">Yes</Text>
                      </Button>
                      <Text> </Text>
                      <Button key={`cancel-del-${note.id}`} plain dimColor onPress={async () => await update($, confirmDelete, () => null)}>No</Button>
                    </>
                  ) : (
                    <Button key={`del-${note.id}`} plain dimColor onPress={async () => await update($, confirmDelete, () => note.id)}>🗑️</Button>
                  )}
                </Box>
              </Box>
            ))}
          </Box>
        )}

        {/* TAB: SETTINGS */}
        {tab === 'settings' && (
          <Box flexDirection="column">
            <Text bold>Settings</Text>

            <Separator />

            <Box marginBottom={1}><Text>Background</Text></Box>
            <Box marginBottom={1}>
              {BG_COLORS.map(c => (
                <Button key={`bg-${c || 'none'}`} plain onPress={async () => { await update($, currentBgColor, () => c); await $.store.set('bgColor', c) }}>
                  <Text backgroundColor={c || undefined} color={c === bgColor ? 'green' : undefined}>{c === bgColor ? '●' : '○'}</Text>
                </Button>
              ))}
            </Box>

            <Box marginBottom={1}><Text>Title</Text></Box>
            <Box marginBottom={1}>
              {COLORS.map(c => (
                <Button key={`accent-${c}`} plain onPress={async () => { await update($, currentAccent, () => c); await $.store.set('accentColor', c) }}>
                  <Text color={c}>{c === accentColor ? '●' : '○'}</Text>
                </Button>
              ))}
            </Box>

            <Box marginBottom={1}><Text>Notes</Text></Box>
            <Box marginBottom={1}>
              {COLORS.map(c => (
                <Button key={`note-${c}`} plain onPress={async () => { await update($, currentNoteColor, () => c); await $.store.set('noteColor', c) }}>
                  <Text color={c}>{c === noteColor ? '●' : '○'}</Text>
                </Button>
              ))}
            </Box>

            <Separator />

            <Text dimColor>Commands:</Text>
            <Text dimColor>• /notes-export → save as .md</Text>
            <Text dimColor>• /notes-import file.md → import</Text>
          </Box>
        )}

      </Box>
    )
  })
}
