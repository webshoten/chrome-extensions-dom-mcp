import type { BrowserToolName } from "../protocol/types.ts";

export type BrowserToolRunner = {
  callTool(
    name: BrowserToolName,
    payload: unknown,
    signal: AbortSignal,
  ): Promise<string>;
};

export type MCPToolDefinition = {
  name: BrowserToolName;
  description: string;
  inputSchema: Record<string, unknown>;
};

const emptyObjectSchema = {
  type: "object",
  properties: {},
  additionalProperties: false,
};

export const MCP_TOOLS: MCPToolDefinition[] = [
  {
    name: "get_dom",
    description:
      "Capture the active Chrome tab DOM through the connected extension.",
    inputSchema: emptyObjectSchema,
  },
  {
    name: "get_network",
    description: "Search recent network requests from the active Chrome tab.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            "Substring to search across URL and available request metadata.",
        },
        failedOnly: {
          type: "boolean",
          description:
            "Return only requests with an error or HTTP status >= 400.",
        },
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 200,
          description: "Maximum number of requests to return.",
        },
        includeHeaders: {
          type: "boolean",
          description: "Include redacted request and response headers.",
        },
        includeBodyPreview: {
          type: "boolean",
          description: "Include redacted request body preview when available.",
        },
        maxPreviewBytes: {
          type: "integer",
          minimum: 0,
          maximum: 10000,
          description: "Maximum bytes for each body preview.",
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: "get_console",
    description:
      "Read recent console, page error, and unhandled rejection entries from the active Chrome tab.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Substring to search in console text.",
        },
        levels: {
          type: "array",
          items: {
            type: "string",
            enum: [
              "debug",
              "log",
              "info",
              "warn",
              "error",
              "pageerror",
              "unhandledrejection",
            ],
          },
          description: "Console levels to include.",
        },
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 200,
          description: "Maximum number of console entries to return.",
        },
        clear: {
          type: "boolean",
          description: "Clear the buffered console entries after reading.",
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: "click",
    description:
      "Click an element in the active Chrome tab by CSS selector or visible text.",
    inputSchema: {
      type: "object",
      properties: {
        selector: {
          type: "string",
          description: "CSS selector for the target element.",
        },
        text: {
          type: "string",
          description: "Visible text to search when selector is omitted.",
        },
        exact: {
          type: "boolean",
          description: "Require exact text match.",
        },
        visibleOnly: {
          type: "boolean",
          description: "Ignore hidden elements. Defaults to true.",
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: "fill",
    description:
      "Fill an input, textarea, select, or contenteditable element in the active Chrome tab.",
    inputSchema: {
      type: "object",
      required: ["value"],
      properties: {
        selector: {
          type: "string",
          description: "CSS selector for the target element.",
        },
        text: {
          type: "string",
          description:
            "Visible label or placeholder text to search when selector is omitted.",
        },
        exact: {
          type: "boolean",
          description: "Require exact text match.",
        },
        visibleOnly: {
          type: "boolean",
          description: "Ignore hidden elements. Defaults to true.",
        },
        value: {
          type: "string",
          description: "Value to input.",
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: "wait_for",
    description:
      "Wait until an element or text in the active Chrome tab is present, visible, or hidden.",
    inputSchema: {
      type: "object",
      properties: {
        selector: {
          type: "string",
          description: "CSS selector to wait for.",
        },
        text: {
          type: "string",
          description: "Visible text to wait for when selector is omitted.",
        },
        exact: {
          type: "boolean",
          description: "Require exact text match.",
        },
        visibleOnly: {
          type: "boolean",
          description: "Ignore hidden elements while matching text.",
        },
        state: {
          type: "string",
          enum: ["present", "visible", "hidden"],
          description: "State to wait for. Defaults to visible.",
        },
        timeoutMs: {
          type: "integer",
          minimum: 100,
          maximum: 9000,
          description: "Maximum wait time in milliseconds.",
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: "navigate",
    description: "Navigate the active Chrome tab to a URL.",
    inputSchema: {
      type: "object",
      required: ["url"],
      properties: {
        url: {
          type: "string",
          description: "Absolute http or https URL.",
        },
      },
      additionalProperties: false,
    },
  },
];

const TOOL_NAMES = new Set(MCP_TOOLS.map((tool) => tool.name));

// MCP requestから来たtool名を、Chrome拡張へ送れるtool名に限定します。
export function isKnownToolName(name: string): name is BrowserToolName {
  return TOOL_NAMES.has(name as BrowserToolName);
}

// MCP toolの実行をtransport非依存のbrowser tool callへ変換します。
export async function callMCPTool(
  runner: BrowserToolRunner,
  name: BrowserToolName,
  args: unknown,
  signal: AbortSignal,
): Promise<string> {
  return await runner.callTool(name, args ?? {}, signal);
}
