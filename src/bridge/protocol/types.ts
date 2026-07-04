export type MessageError = {
  code: string;
  message: string;
};

export type BridgeMessage = {
  id?: string;
  type: string;
  payload?: unknown;
  error?: MessageError;
};

export type BrowserToolName =
  | "get_dom"
  | "get_network"
  | "get_console"
  | "click"
  | "fill"
  | "wait_for"
  | "navigate";

export type NetworkQuery = {
  query?: string;
  failedOnly?: boolean;
  limit?: number;
  includeHeaders?: boolean;
  includeBodyPreview?: boolean;
  maxPreviewBytes?: number;
};

export type ConsoleQuery = {
  query?: string;
  levels?: string[];
  limit?: number;
  clear?: boolean;
};

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
