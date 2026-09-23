import { vi } from "vitest";
import type { Mock } from "vitest";
import type { ToolResult } from "../main/tools/tool-result";

// ---------------------------------------------------------------------------
// figma global mock
// ---------------------------------------------------------------------------

export interface MockFigmaCurrentPage {
  appendChild: Mock;
  selection: SceneNode[];
}

export interface MockFigmaRoot {
  findAllWithCriteria: Mock;
}

/**
 * Minimal `PluginAPI` surface the plugin tools touch.
 * Extra keys are allowed via the index signature so individual tests can add
 * nodes without redeclaring the whole API.
 */
export interface MockFigma {
  mixed: symbol;
  currentPage: MockFigmaCurrentPage;
  root: MockFigmaRoot;
  loadAllPagesAsync: Mock;
  loadFontAsync: Mock;
  getNodeByIdAsync: Mock;
  createRectangle: Mock;
  createFrame: Mock;
  createText: Mock;
  createComponent: Mock;
  createImage: Mock;
  createNodeFromSvg: Mock;
  base64Encode: Mock;
  [key: string]: unknown;
}

export interface FigmaGlobal {
  figma: MockFigma;
}

export function setupFigma(overrides: Partial<MockFigma> = {}): MockFigma {
  const base: MockFigma = {
    mixed: Symbol("figma.mixed"),
    currentPage: { appendChild: vi.fn(), selection: [] },
    root: { findAllWithCriteria: vi.fn(() => []) },
    loadAllPagesAsync: vi.fn(async () => {}),
    loadFontAsync: vi.fn(async () => {}),
    getNodeByIdAsync: vi.fn(async () => null),
    createRectangle: vi.fn(),
    createFrame: vi.fn(),
    createText: vi.fn(),
    createComponent: vi.fn(),
    createImage: vi.fn(() => ({ hash: "h1" })),
    createNodeFromSvg: vi.fn(),
    base64Encode: vi.fn(() => "base64data"),
    ...overrides,
  };
  (globalThis as unknown as FigmaGlobal).figma = base;
  return base;
}

/** Read back the mocked global (fully typed). */
export function getFigma(): MockFigma {
  return (globalThis as unknown as FigmaGlobal).figma;
}

/**
 * The `figma.mixed` sentinel serializers compare against.
 */
export function figmaMixed(): typeof figma.mixed {
  return getFigma().mixed as unknown as typeof figma.mixed;
}

// ---------------------------------------------------------------------------
// Scene-node stubs (structural, reusable across tools + serializers)
// ---------------------------------------------------------------------------

/**
 * Structural stand-in for a `SceneNode`: the identity fields are required,
 * everything else is an untyped slot so tests only declare what they exercise.
 * Convert to a real Figma type at the call site with `asSceneNode` / `cast`.
 */
export type SceneNodeStub = {
  id: string;
  name: string;
  type: string;
  [key: string]: unknown;
};

export function sceneNodeStub(overrides: Partial<SceneNodeStub> = {}): SceneNodeStub {
  return {
    id: "1:1",
    name: "N",
    type: "RECTANGLE",
    x: 0,
    y: 0,
    width: 10,
    height: 10,
    parent: null,
    ...overrides,
  };
}

/** Narrow a stub to the `SceneNode` a serializer/tool signature expects. */
export function asSceneNode(stub: SceneNodeStub): SceneNode {
  return stub as unknown as SceneNode;
}

/** Captured `{ id, name, type }` child stub used in depth-0 assertions. */
export interface ChildStub {
  id: string;
  name: string;
  type: string;
  _truncated?: boolean;
  _circular?: boolean;
}

// ---------------------------------------------------------------------------
// Serialized output (mirrors `serializeNode`'s lean JSON shape)
// ---------------------------------------------------------------------------

export type SerializedNode = Record<string, unknown> & {
  id: string;
  name: string;
  type: string;
};

export function serializedChildren(node: SerializedNode): SerializedNode[] {
  return (node["children"] ?? []) as SerializedNode[];
}

export function fullChildren(node: SerializedNode): SerializedNode[] {
  return serializedChildren(node).filter((c) => c["_truncated"] !== true);
}

// ---------------------------------------------------------------------------
// ToolResult helpers (plugin `ToolResult.content` is untyped by design,
// so narrow it at the assertion site instead of annotating loosely)
// ---------------------------------------------------------------------------

export function contentOf<T>(res: ToolResult): T {
  return res.content as T;
}

export function contentRecord(res: ToolResult): Record<string, unknown> {
  return res.content as Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Paint / fill stubs (real Figma paint types throughout)
// ---------------------------------------------------------------------------

export function solidPaint(color: RGB = { r: 1, g: 0, b: 0 }): SolidPaint {
  return { type: "SOLID", color } as SolidPaint;
}

export function solidPaints(color: RGB = { r: 1, g: 0, b: 0 }): Paint[] {
  return [solidPaint(color)];
}
