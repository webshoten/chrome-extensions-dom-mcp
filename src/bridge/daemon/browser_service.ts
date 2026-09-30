import type { BridgeMessage, BrowserToolName } from "../protocol/types.ts";
import type { WebSocketBridge } from "./ws_bridge.ts";

// WebSocket上でtool request/responseを対応付けるため、tool名を含む一意なidを作ります。
function buildRequestId(prefix: string): string {
  return `${prefix}-${Date.now()}-${crypto.randomUUID()}`;
}

type BrowserBridge = Pick<WebSocketBridge, "request" | "requestAll">;

type ExtensionTab = {
  tabId: number;
  active: boolean;
  pinned: boolean;
  url: string;
  title: string;
};

type ExtensionWindow = {
  windowId: number;
  focused: boolean;
  incognito: boolean;
  type: string;
  tabs: ExtensionTab[];
};

type ExtensionTabList = {
  windows: ExtensionWindow[];
};

type ListedWindow = Omit<ExtensionWindow, "tabs"> & {
  browserId: string;
  tabs: Array<ExtensionTab & { targetId: string }>;
};

type TargetInput = {
  targetId?: unknown;
};

const TARGETABLE_TOOLS = new Set<BrowserToolName>([
  "get_dom",
  "double_click",
  "drag",
]);

function isExtensionTabList(value: unknown): value is ExtensionTabList {
  return typeof value === "object" && value !== null &&
    Array.isArray((value as Partial<ExtensionTabList>).windows);
}

function buildTargetId(clientId: string, tabId: number): string {
  return `page:${clientId}:${tabId}`;
}

function parseTargetId(payload: unknown):
  | { clientId: string; tabId: number }
  | undefined {
  const input = typeof payload === "object" && payload !== null
    ? payload as TargetInput
    : {};
  if (input.targetId === undefined) {
    return undefined;
  }
  if (typeof input.targetId !== "string") {
    throw new Error("targetId must be a string");
  }

  const match = /^page:(browser-[^:]+):(\d+)$/.exec(input.targetId);
  const tabId = match ? Number(match[2]) : Number.NaN;
  if (!match || !Number.isSafeInteger(tabId)) {
    throw new Error("invalid targetId; call list_tabs again");
  }
  return { clientId: match[1], tabId };
}

function routePayload(
  name: BrowserToolName,
  payload: unknown,
  target: { tabId: number } | undefined,
): unknown {
  if (name === "get_dom") {
    return target ? { tabId: target.tabId } : {};
  }
  if (!target || typeof payload !== "object" || payload === null) {
    return payload;
  }

  const { targetId: _targetId, ...input } = payload as Record<string, unknown>;
  return { ...input, tabId: target.tabId };
}

/*
 * # Browser tool実行サービス
 *
 * ## 目的
 * daemon内のHTTP requestを、Chrome拡張上で実行されるbrowser tool requestへ変換する境界。
 *
 * ## 説明
 * daemonはDOMやConsoleを直接読まない。Chrome APIが必要な処理はWebSocket経由で拡張へ渡す。
 */
export class BrowserService {
  constructor(private readonly bridge: BrowserBridge) {}

  async callTool(
    name: BrowserToolName,
    payload: unknown,
    signal: AbortSignal,
  ): Promise<unknown> {
    if (name === "list_tabs") {
      return await this.#listTabs(signal);
    }

    const target = TARGETABLE_TOOLS.has(name)
      ? parseTargetId(payload)
      : undefined;
    const response = await this.bridge.request(
      {
        id: buildRequestId(name.replaceAll("_", "-")),
        type: name,
        payload: routePayload(name, payload, target),
      },
      signal,
      target?.clientId,
    );
    if (response.error) {
      throw new Error(`${response.error.code}: ${response.error.message}`);
    }
    return response.payload;
  }

  async #listTabs(signal: AbortSignal): Promise<unknown> {
    const responses = await this.bridge.requestAll({
      id: buildRequestId("list-tabs"),
      type: "list_tabs",
      payload: {},
    }, signal);
    const windows: ListedWindow[] = [];
    let firstError: BridgeMessage["error"];

    for (const { clientId, message } of responses) {
      if (message.error) {
        firstError ??= message.error;
        continue;
      }
      if (!isExtensionTabList(message.payload)) {
        throw new Error("invalid list_tabs response from chrome extension");
      }

      for (const browserWindow of message.payload.windows) {
        windows.push({
          ...browserWindow,
          browserId: clientId,
          tabs: browserWindow.tabs.map((tab) => ({
            ...tab,
            targetId: buildTargetId(clientId, tab.tabId),
          })),
        });
      }
    }

    if (windows.length === 0 && firstError) {
      throw new Error(`${firstError.code}: ${firstError.message}`);
    }
    windows.sort((left, right) => Number(right.focused) - Number(left.focused));
    return { windows };
  }
}

export type BrowserToolResult = BridgeMessage;
