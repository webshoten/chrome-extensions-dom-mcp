(function () {
  const MAX_WAIT_MS = 9_000;

  async function runPageCommand(command) {
    const tab = await globalThis.BridgeActiveTab.getActiveTab();
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: executePageCommand,
      args: [command],
    });

    if (results.length === 0 || results[0].result === undefined) {
      throw new Error(`${command.name} returned no result`);
    }

    return {
      ...globalThis.BridgeActiveTab.tabMeta(tab),
      ...results[0].result,
    };
  }

  function executePageCommand(command) {
    const input = command.input && typeof command.input === "object"
      ? command.input
      : {};

    function normalizeText(value) {
      return String(value || "").replace(/\s+/g, " ").trim();
    }

    function isVisible(element) {
      if (!(element instanceof Element)) {
        return false;
      }
      const style = getComputedStyle(element);
      if (
        style.display === "none" ||
        style.visibility === "hidden" ||
        Number(style.opacity) === 0
      ) {
        return false;
      }
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    }

    function elementText(element) {
      const parts = [
        element.innerText,
        element.textContent,
        element.getAttribute("aria-label"),
        element.getAttribute("placeholder"),
        element.getAttribute("name"),
        element.getAttribute("value"),
      ];
      return normalizeText(parts.filter(Boolean).join(" "));
    }

    function describeElement(element) {
      return {
        tagName: element.tagName.toLowerCase(),
        id: element.id || "",
        className: typeof element.className === "string" ? element.className : "",
        text: elementText(element).slice(0, 160),
        visible: isVisible(element),
      };
    }

    function textMatches(haystack, needle, exact) {
      const left = normalizeText(haystack);
      const right = normalizeText(needle);
      if (right === "") {
        return false;
      }
      return exact ? left === right : left.includes(right);
    }

    function interactiveTextSelector() {
      return [
        "button",
        "a",
        "input",
        "textarea",
        "select",
        "label",
        "[role='button']",
        "[onclick]",
        "[contenteditable='true']",
        "[tabindex]",
      ].join(",");
    }

    function readableTextSelector() {
      return [
        interactiveTextSelector(),
        "h1",
        "h2",
        "h3",
        "h4",
        "h5",
        "h6",
        "p",
        "span",
        "div",
        "li",
        "td",
        "th",
      ].join(",");
    }

    function findByText(text, options, selector = interactiveTextSelector()) {
      const candidates = [...document.querySelectorAll(selector)];
      return candidates.find((element) => {
        if (options.visibleOnly !== false && !isVisible(element)) {
          return false;
        }
        return textMatches(elementText(element), text, options.exact === true);
      }) || null;
    }

    function findTarget(options) {
      if (typeof options.selector === "string" && options.selector.trim() !== "") {
        const candidates = [...document.querySelectorAll(options.selector)];
        const target = options.visibleOnly === false
          ? candidates[0]
          : candidates.find(isVisible);
        if (!target) {
          throw new Error(`element not found for selector: ${options.selector}`);
        }
        return target;
      }

      if (typeof options.text === "string" && options.text.trim() !== "") {
        const target = findByText(options.text, options);
        if (!target) {
          throw new Error(`element not found for text: ${options.text}`);
        }
        return target;
      }

      throw new Error("selector or text is required");
    }

    function toFillElement(element) {
      if (element instanceof HTMLLabelElement && element.control) {
        return element.control;
      }
      if (
        element instanceof HTMLInputElement ||
        element instanceof HTMLTextAreaElement ||
        element instanceof HTMLSelectElement ||
        element.isContentEditable
      ) {
        return element;
      }
      const nested = element.querySelector("input, textarea, select, [contenteditable='true']");
      if (nested) {
        return nested;
      }
      throw new Error("matched element is not fillable");
    }

    function setNativeValue(element, value) {
      const prototype = Object.getPrototypeOf(element);
      const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");
      if (descriptor && typeof descriptor.set === "function") {
        descriptor.set.call(element, value);
      } else {
        element.value = value;
      }
    }

    function clickElement() {
      const element = findTarget(input);
      element.scrollIntoView({ block: "center", inline: "center" });
      if (typeof element.focus === "function") {
        element.focus({ preventScroll: true });
      }
      element.click();
      return {
        action: "click",
        ok: true,
        actedAt: new Date().toISOString(),
        element: describeElement(element),
      };
    }

    function fillElement() {
      if (typeof input.value !== "string") {
        throw new Error("value is required");
      }

      const matched = findTarget(input);
      const element = toFillElement(matched);
      element.scrollIntoView({ block: "center", inline: "center" });
      if (typeof element.focus === "function") {
        element.focus({ preventScroll: true });
      }

      if (element.isContentEditable) {
        element.textContent = input.value;
      } else if (element instanceof HTMLSelectElement) {
        element.value = input.value;
      } else {
        setNativeValue(element, input.value);
      }
      element.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText" }));
      element.dispatchEvent(new Event("change", { bubbles: true }));

      return {
        action: "fill",
        ok: true,
        actedAt: new Date().toISOString(),
        element: describeElement(element),
      };
    }

    function checkElement() {
      const state = ["present", "visible", "hidden"].includes(input.state)
        ? input.state
        : "visible";
      let element = null;
      try {
        const options = {
          ...input,
          visibleOnly: state === "visible" ? true : input.visibleOnly,
        };
        element = typeof options.selector === "string" && options.selector.trim() !== ""
          ? findTarget(options)
          : findByText(options.text, options, readableTextSelector());
      } catch (_error) {
        element = null;
      }

      const visible = element ? isVisible(element) : false;
      const matched = state === "hidden"
        ? !element || !visible
        : state === "present"
        ? Boolean(element)
        : Boolean(element && visible);

      return {
        action: "wait_for",
        matched,
        state,
        element: element ? describeElement(element) : null,
      };
    }

    switch (command.name) {
      case "click":
        return clickElement();
      case "fill":
        return fillElement();
      case "wait_for":
        return checkElement();
      default:
        throw new Error(`unknown page command: ${command.name}`);
    }
  }

  async function click(input) {
    return await runPageCommand({ name: "click", input });
  }

  async function fill(input) {
    return await runPageCommand({ name: "fill", input });
  }

  async function waitFor(input) {
    const timeoutMs = Math.min(
      Math.max(Number(input?.timeoutMs) || 5_000, 100),
      MAX_WAIT_MS,
    );
    const startedAt = Date.now();

    while (Date.now() - startedAt <= timeoutMs) {
      const result = await runPageCommand({ name: "wait_for", input });
      if (result.matched === true) {
        return {
          ...result,
          ok: true,
          waitedMs: Date.now() - startedAt,
        };
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    throw new Error(`wait_for timed out after ${timeoutMs}ms`);
  }

  async function navigate(input) {
    if (!input || typeof input.url !== "string") {
      throw new Error("url is required");
    }
    const url = new URL(input.url);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error("url must use http or https");
    }

    const tab = await globalThis.BridgeActiveTab.getActiveTab();
    await chrome.tabs.update(tab.id, { url: url.href });
    return {
      ...globalThis.BridgeActiveTab.tabMeta(tab),
      action: "navigate",
      ok: true,
      url: url.href,
      actedAt: new Date().toISOString(),
      maxWaitMs: MAX_WAIT_MS,
    };
  }

  globalThis.BridgeActionTools = {
    click,
    fill,
    waitFor,
    navigate,
  };
})();
