export type Note = {
  id: string
  text: string
  createdAt: number
  pinned?: boolean
  tags?: string[]
  folder?: string
}

export type Folder = {
  id: string
  name: string
  collapsed?: boolean
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
      folders: Shaped<Folder[]>
      editing: Shaped<string | null>
      draft: Shaped<string>
      projectInfo: Shaped<ProjectInfo | null>
      currentAccent: Shaped<string>
      currentNoteColor: Shaped<string>
      currentBgColor: Shaped<string>
      showColorPicker: Shaped<boolean>
      searchQuery: Shaped<string>
      currentFolder: Shaped<string | null>
      showFolders: Shaped<boolean>
      selectedNote: Shaped<string | null>
      showMoveMenu: Shaped<boolean>
    }
  }
}
