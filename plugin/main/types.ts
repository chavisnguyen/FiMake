import { EventHandler } from '@create-figma-plugin/utilities'
import { FromPluginMessage } from '@shared/types'


export interface StartTaskHandler extends EventHandler {
  name: 'START_TASK'
  taskId: string
  command: string
  args: unknown
}

export interface TaskFinishedHandler extends EventHandler, FromPluginMessage {
  name: 'TASK_FINISHED'
}

export interface TaskFailedHandler extends EventHandler, FromPluginMessage {
  name: 'TASK_FAILED'
}

/** UI -> main-thread requests (dot expand / console collapse). */
export interface UiResizeRequest {
  type: 'expand' | 'collapse'
}

/** Main -> UI: which Figma file this plugin window is attached to.
 *  The UI iframe can't read it directly, so main posts it once on startup.
 *  `fileKey` is stable across renames, `fileName` is what we display. */
export interface FileInfoHandler extends EventHandler {
  name: 'FILE_INFO'
  fileName: string
  fileKey?: string
}