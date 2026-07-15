(function () {
  /*
   * # Network取得tool
   *
   * ## 目的
   * AI Agentが現在タブの通信履歴を、失敗調査やGraphQL調査に使える形で取得できるようにする。
   *
   * ## 説明
   * Chrome拡張のwebRequestイベントを短期bufferに保持し、MCP呼び出し時にredaction済みレポートへ整形する。
   */
  const MAX_NETWORK_ENTRIES = 500;
  const DEFAULT_NETWORK_LIMIT = 50;
  const MAX_NETWORK_LIMIT = 200;
  const DEFAULT_PREVIEW_BYTES = 2_000;
  const MAX_PREVIEW_BYTES = 10_000;
  const SENSITIVE_HEADER_NAMES = new Set([
    "authorization",
    "proxy-authorization",
    "cookie",
    "set-cookie",
    "x-api-key",
    "x-auth-token",
    "x-csrf-token",
    "x-xsrf-token",
  ]);
  const SENSITIVE_NAME_PARTS = [
    "token",
    "secret",
    "credential",
    "session",
    "api-key",
    "password",
    "passwd",
    "access_token",
    "refresh_token",
    "id_token",
    "code",
    "key",
    "signature",
    "csrf",
    "xsrf",
    "email",
    "phone",
    "address",
  ];

  let registered = false;
  const entries = [];
  const entryByRequestId = new Map();

  function toISOTime(timeStamp) {
    if (typeof timeStamp !== "number") {
      return new Date().toISOString();
    }

    return new Date(timeStamp).toISOString();
  }

  function prune() {
    while (entries.length > MAX_NETWORK_ENTRIES) {
      const removed = entries.shift();
      if (removed) {
        entryByRequestId.delete(removed.requestId);
      }
    }
  }

  // webRequestはrequest lifecycleごとに別イベントで届くため、requestId単位で1つのentryへ集約します。
  function ensureEntry(details) {
    let entry = entryByRequestId.get(details.requestId);
    if (entry) {
      return entry;
    }

    entry = {
      requestId: details.requestId,
      tabId: details.tabId,
      url: details.url,
      method: details.method || "",
      type: details.type || "",
      statusCode: null,
      error: "",
      startedAt: toISOTime(details.timeStamp),
      completedAt: null,
      durationMs: null,
      requestHeaders: [],
      responseHeaders: [],
      requestBody: null,
    };
    entries.push(entry);
    entryByRequestId.set(details.requestId, entry);
    prune();
    return entry;
  }

  function recordStart(details) {
    const entry = ensureEntry(details);
    entry.tabId = details.tabId;
    entry.url = details.url;
    entry.method = details.method || entry.method;
    entry.type = details.type || entry.type;
    entry.startedAt = toISOTime(details.timeStamp);
    entry.requestBody = readRequestBody(details.requestBody);
  }

  function recordRequestHeaders(details) {
    const entry = ensureEntry(details);
    entry.requestHeaders = details.requestHeaders || [];
  }

  function recordResponseHeaders(details) {
    const entry = ensureEntry(details);
    entry.responseHeaders = details.responseHeaders || [];
  }

  function recordComplete(details) {
    const entry = ensureEntry(details);
    entry.statusCode = details.statusCode ?? entry.statusCode;
    entry.completedAt = toISOTime(details.timeStamp);
    entry.durationMs = Date.parse(entry.completedAt) -
      Date.parse(entry.startedAt);
  }

  function recordError(details) {
    const entry = ensureEntry(details);
    entry.error = details.error || "unknown error";
    entry.completedAt = toISOTime(details.timeStamp);
    entry.durationMs = Date.parse(entry.completedAt) -
      Date.parse(entry.startedAt);
  }

  function normalizeQuery(rawQuery) {
    const query = rawQuery && typeof rawQuery === "object" ? rawQuery : {};
    let limit = Number.isInteger(query.limit)
      ? query.limit
      : DEFAULT_NETWORK_LIMIT;
    limit = Math.min(Math.max(limit, 1), MAX_NETWORK_LIMIT);

    let maxPreviewBytes = Number.isInteger(query.maxPreviewBytes)
      ? query.maxPreviewBytes
      : DEFAULT_PREVIEW_BYTES;
    maxPreviewBytes = Math.min(Math.max(maxPreviewBytes, 0), MAX_PREVIEW_BYTES);

    return {
      query: typeof query.query === "string" ? query.query.trim() : "",
      failedOnly: query.failedOnly === true,
      limit,
      includeHeaders: query.includeHeaders !== false,
      includeBodyPreview: query.includeBodyPreview !== false,
      maxPreviewBytes,
    };
  }

  // URL、header、bodyの値はAIへ渡る前にこのtool内でredactionします。
  function isSensitiveName(name) {
    const normalized = String(name || "").toLowerCase();
    return SENSITIVE_HEADER_NAMES.has(normalized) ||
      SENSITIVE_NAME_PARTS.some((part) => normalized.includes(part));
  }

  function redactHeaderList(headers, redactions, pathPrefix) {
    const result = {};
    for (const header of headers || []) {
      const name = String(header.name || "").toLowerCase();
      if (!name) {
        continue;
      }
      if (isSensitiveName(name)) {
        result[name] = "[REDACTED]";
        redactions.push(`${pathPrefix}.${name}`);
      } else {
        result[name] = String(header.value ?? "");
      }
    }
    return result;
  }

  function redactUrl(rawUrl, redactions) {
    try {
      const url = new URL(rawUrl);
      for (const [key] of url.searchParams.entries()) {
        if (isSensitiveName(key)) {
          url.searchParams.set(key, "[REDACTED]");
          redactions.push(`url.query.${key}`);
        }
      }
      return url.toString();
    } catch (_error) {
      return rawUrl;
    }
  }

  function redactText(value, redactions, path) {
    let text = String(value ?? "");
    const before = text;
    text = text.replace(
      /\bBearer\s+[A-Za-z0-9._~+/=-]+\b/gi,
      "Bearer [REDACTED]",
    );
    text = text.replace(
      /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
      "[REDACTED_EMAIL]",
    );
    text = text.replace(
      /\b(token|password|secret|session|api[_-]?key)=([^&\s]+)/gi,
      "$1=[REDACTED]",
    );
    if (text !== before) {
      redactions.push(path);
    }
    return text;
  }

  function redactJsonValue(value, redactions, path) {
    if (Array.isArray(value)) {
      return value.map((item, index) =>
        redactJsonValue(item, redactions, `${path}.${index}`)
      );
    }
    if (value && typeof value === "object") {
      const output = {};
      for (const [key, child] of Object.entries(value)) {
        const childPath = `${path}.${key}`;
        if (isSensitiveName(key)) {
          output[key] = "[REDACTED]";
          redactions.push(childPath);
        } else {
          output[key] = redactJsonValue(child, redactions, childPath);
        }
      }
      return output;
    }
    if (typeof value === "string") {
      return redactText(value, redactions, path);
    }
    return value;
  }

  function truncatePreview(text, maxPreviewBytes) {
    const encoder = new TextEncoder();
    const bytes = encoder.encode(text);
    if (bytes.byteLength <= maxPreviewBytes) {
      return {
        bodyPreview: text,
        bodySize: bytes.byteLength,
        bodyTruncated: false,
      };
    }

    const sliced = bytes.slice(0, maxPreviewBytes);
    return {
      bodyPreview: new TextDecoder().decode(sliced),
      bodySize: bytes.byteLength,
      bodyTruncated: true,
    };
  }

  function readRequestBody(requestBody) {
    if (!requestBody) {
      return null;
    }

    if (requestBody.formData) {
      return {
        kind: "formData",
        text: JSON.stringify(requestBody.formData),
      };
    }

    if (requestBody.raw && requestBody.raw.length > 0) {
      const decoder = new TextDecoder();
      let text = "";
      for (const part of requestBody.raw) {
        if (part.bytes) {
          text += decoder.decode(part.bytes, { stream: true });
        }
      }
      text += decoder.decode();
      return {
        kind: "raw",
        text,
      };
    }

    if (requestBody.error) {
      return {
        kind: "unavailable",
        error: requestBody.error,
      };
    }

    return null;
  }

  function parseGraphQL(json) {
    if (!json || typeof json !== "object" || Array.isArray(json)) {
      return null;
    }
    const query = typeof json.query === "string" ? json.query : "";
    const operationName = typeof json.operationName === "string"
      ? json.operationName
      : "";
    if (!query && !operationName) {
      return null;
    }

    const operationMatch = query.match(
      /\b(query|mutation|subscription)\s+([A-Za-z0-9_]+)?/,
    );
    const variables = json.variables && typeof json.variables === "object" &&
        !Array.isArray(json.variables)
      ? Object.keys(json.variables)
      : [];

    return {
      operationName: operationName || operationMatch?.[2] || "",
      operationType: operationMatch?.[1] || "",
      variableKeys: variables,
    };
  }

  function formatBody(body, maxPreviewBytes, redactions, pathPrefix) {
    if (!body) {
      return {
        bodyPreview: "",
        bodySize: null,
        bodyTruncated: false,
        bodyUnavailableReason: "not_available",
        graphql: null,
      };
    }
    if (body.kind === "unavailable") {
      return {
        bodyPreview: "",
        bodySize: null,
        bodyTruncated: false,
        bodyUnavailableReason: body.error || "unavailable",
        graphql: null,
      };
    }

    const text = body.text || "";
    try {
      const parsed = JSON.parse(text);
      const graphql = parseGraphQL(parsed);
      const redacted = redactJsonValue(parsed, redactions, pathPrefix);
      const serialized = JSON.stringify(redacted);
      return {
        ...truncatePreview(serialized, maxPreviewBytes),
        bodyUnavailableReason: "",
        graphql,
      };
    } catch (_error) {
      const redacted = redactText(text, redactions, pathPrefix);
      return {
        ...truncatePreview(redacted, maxPreviewBytes),
        bodyUnavailableReason: "",
        graphql: null,
      };
    }
  }

  function headerValue(headers, name) {
    const normalized = name.toLowerCase();
    for (const header of headers || []) {
      if (String(header.name || "").toLowerCase() === normalized) {
        return String(header.value || "");
      }
    }
    return "";
  }

  function buildSearchText(entry, formatted) {
    return [
      formatted.url,
      entry.method,
      entry.type,
      entry.statusCode,
      entry.error,
      Object.keys(formatted.request.headers || {}).join(" "),
      Object.keys(formatted.response.headers || {}).join(" "),
      headerValue(entry.requestHeaders, "content-type"),
      headerValue(entry.responseHeaders, "content-type"),
      formatted.request.bodyPreview,
      formatted.graphql?.operationName,
      formatted.graphql?.operationType,
      (formatted.graphql?.variableKeys || []).join(" "),
    ].filter((value) => value !== null && value !== undefined).join(" ")
      .toLowerCase();
  }

  // response bodyはwebRequestだけでは取れないため、CDPが必要な情報として明示します。
  function formatEntry(entry, query) {
    const redactions = [];
    const requestHeaders = redactHeaderList(
      entry.requestHeaders,
      redactions,
      "request.headers",
    );
    const responseHeaders = redactHeaderList(
      entry.responseHeaders,
      redactions,
      "response.headers",
    );
    const body = query.includeBodyPreview
      ? formatBody(
        entry.requestBody,
        query.maxPreviewBytes,
        redactions,
        "request.body",
      )
      : {
        bodyPreview: "",
        bodySize: null,
        bodyTruncated: false,
        bodyUnavailableReason: "not_requested",
        graphql: null,
      };

    const formatted = {
      requestId: entry.requestId,
      url: redactUrl(entry.url, redactions),
      method: entry.method,
      type: entry.type,
      statusCode: entry.statusCode,
      error: entry.error,
      startedAt: entry.startedAt,
      completedAt: entry.completedAt,
      durationMs: entry.durationMs,
      request: {
        headers: query.includeHeaders ? requestHeaders : {},
        bodyPreview: body.bodyPreview,
        bodySize: body.bodySize,
        bodyTruncated: body.bodyTruncated,
        bodyUnavailableReason: body.bodyUnavailableReason,
      },
      response: {
        headers: query.includeHeaders ? responseHeaders : {},
        bodyPreview: "",
        bodySize: null,
        bodyTruncated: false,
        bodyUnavailableReason: "requires_cdp",
      },
      graphql: body.graphql,
      redactions,
    };

    return {
      entry: formatted,
      searchText: buildSearchText(entry, formatted),
    };
  }

  // Chromeの環境差でextraHeadersが拒否される場合は、取得できる範囲へ落として登録します。
  function addWebRequestListener(event, listener, filter, extraInfoSpec) {
    try {
      event.addListener(listener, filter, extraInfoSpec);
    } catch (error) {
      if (!extraInfoSpec.includes("extraHeaders")) {
        throw error;
      }
      event.addListener(
        listener,
        filter,
        extraInfoSpec.filter((item) => item !== "extraHeaders"),
      );
    }
  }

  // 現在タブのNetwork bufferを検索し、AIが読める件数制限付きレポートへ変換します。
  async function getNetwork(rawQuery) {
    const tab = await globalThis.BridgeActiveTab.getActiveTab();
    const query = normalizeQuery(rawQuery);
    const needle = query.query.toLowerCase();
    const tabEntries = entries.filter((entry) => entry.tabId === tab.id);
    const formatted = tabEntries.map((entry) => formatEntry(entry, query));
    const matched = formatted.filter((item) => {
      if (needle !== "" && !item.searchText.includes(needle)) {
        return false;
      }
      if (
        query.failedOnly &&
        item.entry.error === "" &&
        Number(item.entry.statusCode) < 400
      ) {
        return false;
      }
      return true;
    });
    const resultEntries = matched.slice(-query.limit).reverse().map((item) =>
      item.entry
    );

    return {
      ...globalThis.BridgeActiveTab.tabMeta(tab),
      capturedAt: new Date().toISOString(),
      source: "webRequest",
      query: query.query,
      failedOnly: query.failedOnly,
      includeHeaders: query.includeHeaders,
      includeBodyPreview: query.includeBodyPreview,
      maxPreviewBytes: query.maxPreviewBytes,
      totalCount: tabEntries.length,
      matchedCount: matched.length,
      returnedCount: resultEntries.length,
      entries: resultEntries,
    };
  }

  // background service worker起動時に、Network履歴を貯めるためのイベント購読を登録します。
  function register() {
    if (registered) {
      return;
    }
    registered = true;

    addWebRequestListener(chrome.webRequest.onBeforeRequest, recordStart, {
      urls: ["<all_urls>"],
    }, ["requestBody"]);
    addWebRequestListener(
      chrome.webRequest.onBeforeSendHeaders,
      recordRequestHeaders,
      {
        urls: ["<all_urls>"],
      },
      ["requestHeaders", "extraHeaders"],
    );
    addWebRequestListener(
      chrome.webRequest.onHeadersReceived,
      recordResponseHeaders,
      {
        urls: ["<all_urls>"],
      },
      ["responseHeaders", "extraHeaders"],
    );
    chrome.webRequest.onCompleted.addListener(recordComplete, {
      urls: ["<all_urls>"],
    });
    chrome.webRequest.onErrorOccurred.addListener(recordError, {
      urls: ["<all_urls>"],
    });
  }

  globalThis.BridgeNetworkTools = {
    getNetwork,
    register,
  };
})();
