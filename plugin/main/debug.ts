// Toggleable plugin logging (visible in Figma developer console:
// Menu > Plugins > Development > Open Console).
// PLUGIN_DEBUG=true: verbose per-task payloads. Lifecycle lines
// (START_TASK received, TASK_FINISHED/FAILED sent) always print so a
// hanging task is diagnosable with zero setup.
export const PLUGIN_DEBUG = true;

export function pluginLog(...args: unknown[]): void {
  console.log("[fimake]", ...args);
}

export function pluginDebug(...args: unknown[]): void {
  if (PLUGIN_DEBUG) console.log("[fimake:debug]", ...args);
}
