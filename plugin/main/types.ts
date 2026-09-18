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