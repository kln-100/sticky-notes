export type Note = {
  id: string
  text: string
  createdAt: number
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
      editing: Shaped<string | null>
      draft: Shaped<string>
      projectInfo: Shaped<ProjectInfo | null>
      currentAccent: Shaped<string>
      currentNoteColor: Shaped<string>
      currentBgColor: Shaped<string>
      showColorPicker: Shaped<boolean>
    }
  }
}
