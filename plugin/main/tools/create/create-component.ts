import { CreateComponentParams } from "@shared/types";
import { serializeComponent } from "serialization/serialize-component";
import { ToolResult } from "tools/tool-result";
import { appendToParent } from "../node-helper";

export async function createComponent(args: CreateComponentParams): Promise<ToolResult> {
    const component = figma.createComponent();
    component.name = args.name;

    const err = await appendToParent(component, args.parentId);
    if (err) return err;
    return { isError: false, content: serializeComponent(component) };
}
