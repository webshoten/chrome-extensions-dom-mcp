import type { BrowserToolName } from "../protocol/types.ts";

// MCP層がdaemonやテスト実装を同じ形で呼べるようにするbrowser tool実行境界です。
export type BrowserToolRunner = {
  callTool(
    name: BrowserToolName,
    payload: unknown,
    signal: AbortSignal,
  ): Promise<unknown>;
};

// AI Agentへ公開するMCP toolの名前、説明、入力schemaです。
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

// AI Agentに見せる公開tool一覧です。実行本体ではなく、外部I/Fの契約だけをここに置きます。
export const MCP_TOOLS: MCPToolDefinition[] = [
  {
    name: "list_tabs",
    description:
      "List open Chrome windows and tabs. Returns a temporary targetId for explicit DOM capture.",
    inputSchema: emptyObjectSchema,
  },
  {
    name: "get_dom",
    description:
      "Capture a Chrome tab DOM. Pass a targetId from list_tabs, or omit it to use the active tab.",
    inputSchema: {
      type: "object",
      properties: {
        targetId: {
          type: "string",
          description:
            "Temporary tab target returned by list_tabs. Omit to use the active tab.",
        },
      },
      additionalProperties: false,
    },
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
  {
    name: "take_screenshot",
    description:
      "Capture the visible viewport of the active Chrome tab and return it as an image.",
    inputSchema: {
      type: "object",
      properties: {
        format: {
          type: "string",
          enum: ["png", "jpeg"],
          description: "Image format. Defaults to png.",
        },
        quality: {
          type: "integer",
          minimum: 1,
          maximum: 100,
          description:
            "JPEG quality from 1 to 100. Ignored for png. Defaults to 90.",
        },
      },
      additionalProperties: false,
    },
  },
];

const TOOL_NAMES = new Set(MCP_TOOLS.map((tool) => tool.name));

// MCP request由来の任意文字列を、公開済みbrowser tool名だけへ絞り込みます。
export function isKnownToolName(name: string): name is BrowserToolName {
  return TOOL_NAMES.has(name as BrowserToolName);
}

// MCP固有のarguments形式を、daemon/拡張へ送るbrowser tool callへ変換します。
export async function callMCPTool(
  runner: BrowserToolRunner,
  name: BrowserToolName,
  args: unknown,
  signal: AbortSignal,
): Promise<unknown> {
  return await runner.callTool(name, args ?? {}, signal);
}
