import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'
import type { Note, ProjectInfo } from '../types'

const PANE = 'sticky-notes'

const notes = atom({ plugin: 'sticky-notes', key: 'notes' } as const, [] as Note[], {
  shape: 'notes-2',
})

const editing = atom({ plugin: 'sticky-notes', key: 'editing' } as const, null as string | null, {
  shape: 'editing-1',
})

const draft = atom({ plugin: 'sticky-notes', key: 'draft' } as const, '', {
  shape: 'draft-1',
})

const projectInfo = atom({ plugin: 'sticky-notes', key: 'projectInfo' } as const, null as ProjectInfo | null, {
  shape: 'projectInfo-1',
})

const currentAccent = atom({ plugin: 'sticky-notes', key: 'currentAccent' } as const, 'yellow', {
  shape: 'accent-1',
})

const currentNoteColor = atom({ plugin: 'sticky-notes', key: 'currentNoteColor' } as const, 'white', {
  shape: 'notecolor-1',
})

const currentBgColor = atom({ plugin: 'sticky-notes', key: 'currentBgColor' } as const, '', {
  shape: 'bgcolor-1',
})

const showColorPicker = atom({ plugin: 'sticky-notes', key: 'showColorPicker' } as const, false, {
  shape: 'picker-1',
})

const COLORS = ['yellow', 'cyan', 'green', 'magenta', 'blue', 'red', 'white'] as const
const BG_COLORS = ['', 'black', 'blue', 'cyan', 'green', 'magenta', 'red', 'yellow'] as const

async function getProjectInfo($: { session: { root: () => Promise<string> }, process: { run: (argv: readonly string[], init?: { cwd?: string }) => Promise<{ exitCode: number, stdout: string }> } }): Promise<ProjectInfo> {
  const cwd = await $.session.root()
  const projectName = cwd.split('/').pop() || 'unknown'

  // Try to get git branch
  let branch = 'main'
  try {
    const result = await $.process.run(['git', 'rev-parse', '--abbrev-ref', 'HEAD'], { cwd })
    if (result.exitCode === 0) {
      branch = result.stdout.trim()
    }
  } catch {
    // Not a git repo, use default
  }

  return { projectName, branch, cwd }
}

function getProjectKey(info: ProjectInfo): string {
  return `${info.cwd}::${info.branch}`
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const info = await getProjectInfo($)
    await update($, projectInfo, () => info)

    // Load notes for this project from store
    const key = getProjectKey(info)
    const allNotes = (await $.store.get('projectNotes')) as Record<string, Note[]> | undefined
    if (allNotes && allNotes[key]) {
      await update($, notes, () => allNotes[key])
    }

    // Load saved colors
    const savedAccent = await $.store.get('accentColor') as string | undefined
    const savedNoteColor = await $.store.get('noteColor') as string | undefined
    const savedBgColor = await $.store.get('bgColor') as string | undefined
    if (savedAccent) await update($, currentAccent, () => savedAccent)
    if (savedNoteColor) await update($, currentNoteColor, () => savedNoteColor)
    if (savedBgColor) await update($, currentBgColor, () => savedBgColor)

    await $.command.register({
      name: 'notes',
      description: 'Open the project notes panel',
    })

    return next(e)
  })

  on('command.run', { command: 'notes' }, async ($) => {
    const info = await read($, projectInfo)
    const title = info ? `Notes: ${info.projectName}/${info.branch}` : 'Notes'
    await $.ui.open({ id: PANE, title })
    return { text: 'Notes panel opened.' }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e) => {
    const { Box, Button, Text } = $.ui.resolve(e)
    const info = await read($, projectInfo)
    const list = await read($, notes)

    return (
      <Box>
        <Button
          key="open-notes"
          hotkey="n"
          plain
          onPress={async () => {
            const title = info ? `Notes: ${info.projectName}/${info.branch}` : 'Notes'
            await $.ui.open({ id: PANE, title })
          }}
        >
          📝{list.length > 0 ? <Text dimColor> {list.length}</Text> : null}
        </Button>
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button, Input } = $.ui.resolve(e)
    const list = await read($, notes)
    const editingId = await read($, editing)
    const draftText = await read($, draft)
    const info = await read($, projectInfo)
    const accentColor = await read($, currentAccent)
    const noteColor = await read($, currentNoteColor)
    const bgColor = await read($, currentBgColor)
    const pickerOpen = await read($, showColorPicker)
    const room = Math.max(1, (e.viewport?.rows ?? 24) - 12)

    const saveNotes = async (newNotes: Note[]) => {
      if (!info) return
      const key = getProjectKey(info)
      const allNotes = ((await $.store.get('projectNotes')) as Record<string, Note[]>) || {}
      allNotes[key] = newNotes
      await $.store.set('projectNotes', allNotes)
    }

    const addNote = async () => {
      if (!draftText.trim()) return
      const newNote: Note = {
        id: crypto.randomUUID(),
        text: draftText.trim(),
        createdAt: await $.clock.now(),
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
    }

    const startEdit = async (id: string) => {
      const note = list.find(n => n.id === id)
      if (note) {
        await update($, editing, () => id)
        await update($, draft, () => note.text)
      }
    }

    const saveEdit = async () => {
      if (!editingId) return
      await update($, notes, old => {
        const updated = old.map(n =>
          n.id === editingId ? { ...n, text: draftText.trim() } : n
        )
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

    return (
      <Box flexDirection="column" padding={1} backgroundColor={bgColor || undefined} minHeight="100%" width="100%">
        <Box marginBottom={1}>
          <Text bold color={accentColor}>📝 Project Notes</Text>
          {info && (
            <Text dimColor> — {info.projectName}/{info.branch}</Text>
          )}
        </Box>

        {/* Input area */}
        <Box marginBottom={1}>
          <Input
            key="note-input"
            placeholder={editingId ? 'Edit note...' : 'Add a note...'}
            value={draftText}
            onInput={async text => {
              await update($, draft, () => text)
            }}
            onSubmit={editingId ? saveEdit : addNote}
          />
        </Box>

        <Box marginBottom={1}>
          {editingId ? (
            <>
              <Button key="save" hotkey="s" onPress={saveEdit}>Save</Button>
              <Text> </Text>
              <Button key="cancel" hotkey="c" dimColor onPress={cancelEdit}>Cancel</Button>
            </>
          ) : (
            <Button key="add" hotkey="a" onPress={addNote}>Add</Button>
          )}
        </Box>

        {/* Notes list */}
        {list.length === 0 && <Text dimColor>No notes yet for this project/branch.</Text>}

        <Box flexDirection="column">
          {list.slice(-room).map((note, i) => (
            <Box key={note.id} marginBottom={0}>
              <Text dimColor>{i + 1}. </Text>
              <Text wrap="wrap" color={noteColor}>{note.text}</Text>
              <Text> </Text>
              <Button
                key={`edit-${note.id}`}
                dimColor
                plain
                onPress={() => startEdit(note.id)}
              >
                ✏️
              </Button>
              <Button
                key={`del-${note.id}`}
                dimColor
                plain
                onPress={() => deleteNote(note.id)}
              >
                🗑️
              </Button>
            </Box>
          ))}
        </Box>

        {/* Color wheel toggle */}
        <Box marginTop={1}>
          <Button
            key="color-toggle"
            plain
            onPress={async () => {
              await update($, showColorPicker, v => !v)
            }}
          >
            🎨{pickerOpen ? ' ▼' : ' ▶'}
          </Button>
        </Box>

        {/* Expanded color picker */}
        {pickerOpen && (
          <Box flexDirection="column" marginTop={1}>
            <Box>
              <Text dimColor>Bg: </Text>
              {BG_COLORS.map(c => (
                <Button
                  key={`bg-${c || 'none'}`}
                  plain
                  onPress={async () => {
                    await update($, currentBgColor, () => c)
                    await $.store.set('bgColor', c)
                  }}
                >
                  <Text backgroundColor={c || undefined} color={c === bgColor ? 'green' : undefined}>
                    {c === bgColor ? '●' : '○'}
                  </Text>
                </Button>
              ))}
            </Box>
            <Box>
              <Text dimColor>Title: </Text>
              {COLORS.map(c => (
                <Button
                  key={`accent-${c}`}
                  plain
                  onPress={async () => {
                    await update($, currentAccent, () => c)
                    await $.store.set('accentColor', c)
                  }}
                >
                  <Text color={c}>{c === accentColor ? '●' : '○'}</Text>
                </Button>
              ))}
            </Box>
            <Box>
              <Text dimColor>Notes: </Text>
              {COLORS.map(c => (
                <Button
                  key={`note-${c}`}
                  plain
                  onPress={async () => {
                    await update($, currentNoteColor, () => c)
                    await $.store.set('noteColor', c)
                  }}
                >
                  <Text color={c}>{c === noteColor ? '●' : '○'}</Text>
                </Button>
              ))}
            </Box>
          </Box>
        )}
      </Box>
    )
  })
}
