export type Note = {
  id: string
  text: string
  createdAt: number
  pinned?: boolean
  tags?: string[]
  folder?: string
  archivedAt?: number
}

export type Folder = {
  id: string
  name: string
  collapsed?: boolean
  icon?: string
}

export type ProjectInfo = {
  projectName: string
  branch: string
  cwd: string
}

declare module 'claude-code' {
  interface PluginState {
    'sticky-notes': {
      notes: Shaped<Note[]>
      archive: Shaped<Note[]>
      folders: Shaped<Folder[]>
      editing: Shaped<string | null>
      editingFolder: Shaped<string | null>
      draft: Shaped<string>
      folderDraft: Shaped<string>
      projectInfo: Shaped<ProjectInfo | null>
      currentAccent: Shaped<string>
      currentNoteColor: Shaped<string>
      currentBgColor: Shaped<string>
      searchQuery: Shaped<string>
      currentFolder: Shaped<string | null>
      selectedNote: Shaped<string | null>
      showMoveMenu: Shaped<boolean>
      activeTab: Shaped<'notes' | 'folders' | 'archive' | 'settings'>
      lastAction: Shaped<{ type: string, data: unknown } | null>
      confirmDelete: Shaped<string | null>
      showPreview: Shaped<boolean>
    }
  }
}
