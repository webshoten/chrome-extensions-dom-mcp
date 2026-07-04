(function () {
  const EVENT_NAME = "chrome-bridge-console-entry";

  if (window.__chromeBridgeConsoleHookInstalled) {
    return;
  }
  window.__chromeBridgeConsoleHookInstalled = true;

  function serialize(value, depth) {
    if (depth > 2) {
      return "[MaxDepth]";
    }
    if (value instanceof Error) {
      return {
        name: value.name,
        message: value.message,
        stack: value.stack || "",
      };
    }
    if (value instanceof Element) {
      return value.outerHTML.slice(0, 500);
    }
    if (value === null || typeof value !== "object") {
      return value;
    }
    if (Array.isArray(value)) {
      return value.slice(0, 20).map((item) => serialize(item, depth + 1));
    }

    const result = {};
    for (const key of Object.keys(value).slice(0, 20)) {
      try {
        result[key] = serialize(value[key], depth + 1);
      } catch (_error) {
        result[key] = "[Unserializable]";
      }
    }
    return result;
  }

  function stringify(value) {
    if (typeof value === "string") {
      return value;
    }
    if (value instanceof Error) {
      return `${value.name}: ${value.message}`;
    }
    try {
      return JSON.stringify(serialize(value, 0));
    } catch (_error) {
      return String(value);
    }
  }

  function emit(level, args) {
    const entry = {
      level,
      text: args.map(stringify).join(" "),
      values: args.map((value) => serialize(value, 0)),
      timestamp: new Date().toISOString(),
      url: location.href,
    };
    window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: JSON.stringify(entry) }));
  }

  for (const level of ["debug", "log", "info", "warn", "error"]) {
    const original = console[level];
    console[level] = function (...args) {
      try {
        emit(level, args);
      } catch (_error) {
        // Keep page console behavior intact even if capture fails.
      }
      return original.apply(this, args);
    };
  }

  window.addEventListener("error", (event) => {
    emit("pageerror", [
      event.message,
      {
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        error: event.error,
      },
    ]);
  });

  window.addEventListener("unhandledrejection", (event) => {
    emit("unhandledrejection", [event.reason]);
  });
})();
