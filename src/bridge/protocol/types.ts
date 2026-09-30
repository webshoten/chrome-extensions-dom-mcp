// Chrome拡張側で失敗したtool実行を、daemon/MCPへ返すための共通エラー形式です。
export type MessageError = {
  code: string;
  message: string;
};

// daemonとChrome拡張のWebSocket上で流れる基本messageです。
// idでrequest/responseを対応付け、payloadはtoolごとのI/Fに委ねます。
export type BridgeMessage = {
  id?: string;
  type: string;
  payload?: unknown;
  error?: MessageError;
};

// MCPから公開し、daemon経由でChrome拡張へ送れるbrowser tool名です。
export type BrowserToolName =
  | "list_tabs"
  | "get_dom"
  | "get_network"
  | "get_console"
  | "click"
  | "double_click"
  | "drag"
  | "fill"
  | "wait_for"
  | "navigate"
  | "take_screenshot";

// list_tabsで取得した一時targetを、後続のDOM取得へ引き渡します。
export type GetDOMInput = {
  targetId?: string;
};

// Network履歴をAIのデバッグ用途で検索・要約するための入力です。
export type NetworkQuery = {
  query?: string;
  failedOnly?: boolean;
  limit?: number;
  includeHeaders?: boolean;
  includeBodyPreview?: boolean;
  maxPreviewBytes?: number;
};

// Console履歴をAIのデバッグ用途で検索・絞り込みするための入力です。
export type ConsoleQuery = {
  query?: string;
  levels?: string[];
  limit?: number;
  clear?: boolean;
};

// 操作系toolが対象要素を探すための共通指定です。
export type ElementTarget = {
  selector?: string;
  text?: string;
  exact?: boolean;
  visibleOnly?: boolean;
};

export type ClickInput = ElementTarget;

export type FillInput = ElementTarget & {
  value?: string;
};

export type WaitForInput = ElementTarget & {
  state?: "present" | "visible" | "hidden";
  timeoutMs?: number;
};

export type NavigateInput = {
  url?: string;
};

// 現在タブの表示範囲を撮影するときの画像形式です。
export type ScreenshotInput = {
  format?: "png" | "jpeg";
  quality?: number;
};

// Chrome拡張からMCP層へ渡す、base64画像と撮影時のタブ情報です。
export type ScreenshotResult = {
  tabId: number;
  url: string;
  title: string;
  capturedAt: string;
  mimeType: "image/png" | "image/jpeg";
  data: string;
};
