(function () {
  /*
   * # 操作系browser tools
   *
   * ## 目的
   * AI Agentが現在タブ上でクリック、ダブルクリック、ドラッグ、入力、待機、URL遷移を実行できるようにする。
   *
   * ## 説明
   * DOM操作はページ内で実行する必要があるため、backgroundから対象タブへscriptを注入して実行する。
   */
  const MAX_WAIT_MS = 9_000;

  // Chrome APIで対象タブへ処理を渡し、ページ内実行結果にtab metaを付けて返します。
  async function runPageCommand(command, tabId) {
    const tab = await globalThis.BridgeActiveTab.getTargetTab(tabId);
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

  function splitTargetTab(input) {
    if (!input || typeof input !== "object") {
      return { tabId: undefined, pageInput: input };
    }
    const { tabId, ...pageInput } = input;
    return { tabId, pageInput };
  }

  // 対象ページ内で実行される操作本体です。Chrome APIや拡張状態には依存させません。
  async function executePageCommand(command) {
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
        className: typeof element.className === "string"
          ? element.className
          : "",
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

    // click/fillは操作可能な要素を優先し、単なる表示テキストへの誤操作を避けます。
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

    // wait_forは表示確認が目的なので、見出しや本文テキストも検索対象に含めます。
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

    function findTarget(
      options,
      textSelector = interactiveTextSelector(),
    ) {
      if (
        typeof options.selector === "string" && options.selector.trim() !== ""
      ) {
        const candidates = [...document.querySelectorAll(options.selector)];
        const target = options.visibleOnly === false
          ? candidates[0]
          : candidates.find(isVisible);
        if (!target) {
          throw new Error(
            `element not found for selector: ${options.selector}`,
          );
        }
        return target;
      }

      if (typeof options.text === "string" && options.text.trim() !== "") {
        const target = findByText(options.text, options, textSelector);
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
      const nested = element.querySelector(
        "input, textarea, select, [contenteditable='true']",
      );
      if (nested) {
        return nested;
      }
      throw new Error("matched element is not fillable");
    }

    function boundedInteger(value, fallback, minimum, maximum, label) {
      if (value === undefined) {
        return fallback;
      }
      if (
        !Number.isInteger(value) || value < minimum || value > maximum
      ) {
        throw new Error(
          `${label} must be an integer from ${minimum} to ${maximum}`,
        );
      }
      return value;
    }

    function normalizeModifiers(value) {
      if (value === undefined) {
        return [];
      }
      if (!Array.isArray(value)) {
        throw new Error("modifiers must be an array");
      }

      const allowed = new Set(["Alt", "Control", "Meta", "Shift"]);
      const modifiers = [];
      for (const modifier of value) {
        if (!allowed.has(modifier)) {
          throw new Error(`unsupported modifier: ${modifier}`);
        }
        if (!modifiers.includes(modifier)) {
          modifiers.push(modifier);
        }
      }
      return modifiers;
    }

    function modifierFlags(modifiers) {
      return {
        altKey: modifiers.includes("Alt"),
        ctrlKey: modifiers.includes("Control"),
        metaKey: modifiers.includes("Meta"),
        shiftKey: modifiers.includes("Shift"),
      };
    }

    function resolveDragLocation(locator, label) {
      if (!locator || typeof locator !== "object") {
        throw new Error(`${label} is required`);
      }

      const hasX = Number.isFinite(locator.x);
      const hasY = Number.isFinite(locator.y);
      if (hasX || hasY) {
        if (!hasX || !hasY) {
          throw new Error(`${label}.x and ${label}.y must be used together`);
        }
        return {
          kind: "point",
          x: locator.x,
          y: locator.y,
        };
      }

      return {
        kind: "element",
        element: findTarget(locator, readableTextSelector()),
      };
    }

    function locationPoint(location, label) {
      const rect = location.kind === "element"
        ? location.element.getBoundingClientRect()
        : null;
      const x = rect ? rect.left + rect.width / 2 : location.x;
      const y = rect ? rect.top + rect.height / 2 : location.y;

      if (
        x < 0 || y < 0 || x >= globalThis.innerWidth ||
        y >= globalThis.innerHeight
      ) {
        throw new Error(`${label} is outside the visible viewport`);
      }

      const eventTarget = document.elementFromPoint(x, y);
      if (!(eventTarget instanceof Element)) {
        throw new Error(`${label} does not resolve to a visible element`);
      }
      return {
        x,
        y,
        element: location.kind === "element" ? location.element : eventTarget,
        eventTarget,
      };
    }

    function pointerInit(point, modifiers, buttons, button, detail = 0) {
      return {
        bubbles: true,
        cancelable: true,
        composed: true,
        view: globalThis,
        clientX: point.x,
        clientY: point.y,
        screenX: point.x,
        screenY: point.y,
        button,
        buttons,
        detail,
        ...modifierFlags(modifiers),
      };
    }

    function dispatchPointerAndMouse(
      target,
      pointerType,
      mouseType,
      point,
      modifiers,
      buttons,
      button,
      detail = 0,
    ) {
      const init = pointerInit(point, modifiers, buttons, button, detail);
      target.dispatchEvent(
        new PointerEvent(pointerType, {
          ...init,
          pointerId: 1,
          pointerType: "mouse",
          isPrimary: true,
          width: 1,
          height: 1,
          pressure: buttons === 0 ? 0 : 0.5,
        }),
      );
      target.dispatchEvent(new MouseEvent(mouseType, init));
    }

    function dispatchDragEvent(
      target,
      type,
      point,
      modifiers,
      dataTransfer,
    ) {
      target.dispatchEvent(
        new DragEvent(type, {
          ...pointerInit(point, modifiers, 1, 0),
          dataTransfer,
        }),
      );
    }

    function dispatchModifierEvent(target, type, modifier, activeModifiers) {
      const keyDetails = {
        Alt: { code: "AltLeft", keyCode: 18 },
        Control: { code: "ControlLeft", keyCode: 17 },
        Meta: { code: "MetaLeft", keyCode: 91 },
        Shift: { code: "ShiftLeft", keyCode: 16 },
      }[modifier];
      target.dispatchEvent(
        new KeyboardEvent(type, {
          bubbles: true,
          cancelable: true,
          composed: true,
          key: modifier,
          code: keyDetails.code,
          keyCode: keyDetails.keyCode,
          which: keyDetails.keyCode,
          ...modifierFlags(activeModifiers),
        }),
      );
    }

    function pressModifierKeys(target, modifiers) {
      const pressed = [];
      for (const modifier of modifiers) {
        pressed.push(modifier);
        dispatchModifierEvent(target, "keydown", modifier, pressed);
      }
      return pressed;
    }

    // 操作が途中で失敗しても、ページ側へmodifierの押下状態を残さないようにします。
    function releaseModifierKeys(target, pressed) {
      for (let index = pressed.length - 1; index >= 0; index -= 1) {
        try {
          dispatchModifierEvent(
            target,
            "keyup",
            pressed[index],
            pressed.slice(0, index),
          );
        } catch (_error) {
          // 元の操作エラーを優先します。
        }
      }
    }

    async function doubleClickElement() {
      const location = resolveDragLocation(input, "target");
      const modifiers = normalizeModifiers(input.modifiers);
      const intervalMs = boundedInteger(
        input.intervalMs,
        80,
        0,
        500,
        "intervalMs",
      );

      if (location.kind === "element") {
        location.element.scrollIntoView({
          block: "center",
          inline: "center",
        });
      }
      const point = locationPoint(location, "target");
      if (typeof point.element.focus === "function") {
        point.element.focus({ preventScroll: true });
      }

      const keyboardTarget = document.activeElement || document.body ||
        document.documentElement;
      const pressedModifiers = pressModifierKeys(keyboardTarget, modifiers);
      try {
        for (let detail = 1; detail <= 2; detail += 1) {
          dispatchPointerAndMouse(
            point.eventTarget,
            "pointerdown",
            "mousedown",
            point,
            modifiers,
            1,
            0,
            detail,
          );
          dispatchPointerAndMouse(
            point.eventTarget,
            "pointerup",
            "mouseup",
            point,
            modifiers,
            0,
            0,
            detail,
          );
          point.eventTarget.dispatchEvent(
            new MouseEvent("click", {
              ...pointerInit(point, modifiers, 0, 0, detail),
            }),
          );
          if (detail === 1 && intervalMs > 0) {
            await new Promise((resolve) => setTimeout(resolve, intervalMs));
          }
        }
        point.eventTarget.dispatchEvent(
          new MouseEvent("dblclick", {
            ...pointerInit(point, modifiers, 0, 0, 2),
          }),
        );

        return {
          action: "double_click",
          ok: true,
          actedAt: new Date().toISOString(),
          eventMode: "synthetic",
          modifiers,
          intervalMs,
          x: point.x,
          y: point.y,
          element: describeElement(point.element),
        };
      } finally {
        releaseModifierKeys(keyboardTarget, pressedModifiers);
      }
    }

    // debugger権限を増やさず、一般的なPointer/Mouse/HTML5 DnDの各listenerへ同じ軌跡を届けます。
    async function dragElement() {
      const sourceLocation = resolveDragLocation(input.source, "source");
      const destinationLocation = resolveDragLocation(
        input.destination,
        "destination",
      );
      const modifiers = normalizeModifiers(input.modifiers);
      const steps = boundedInteger(input.steps, 12, 1, 100, "steps");
      const durationMs = boundedInteger(
        input.durationMs,
        500,
        0,
        5_000,
        "durationMs",
      );

      if (sourceLocation.kind === "element") {
        sourceLocation.element.scrollIntoView({
          block: "center",
          inline: "center",
        });
      }
      if (destinationLocation.kind === "element") {
        const rect = destinationLocation.element.getBoundingClientRect();
        const inViewport = rect.left >= 0 && rect.top >= 0 &&
          rect.right <= globalThis.innerWidth &&
          rect.bottom <= globalThis.innerHeight;
        if (!inViewport) {
          destinationLocation.element.scrollIntoView({
            block: "nearest",
            inline: "nearest",
          });
        }
      }

      const start = locationPoint(sourceLocation, "source");
      const end = locationPoint(destinationLocation, "destination");
      if (typeof start.element.focus === "function") {
        start.element.focus({ preventScroll: true });
      }

      const keyboardTarget = document.activeElement || document.body ||
        document.documentElement;
      const pressedModifiers = pressModifierKeys(keyboardTarget, modifiers);
      let lastPoint = start;
      let lastTarget = start.eventTarget;
      let pointerActive = false;
      let dragActive = false;
      let dataTransfer;
      try {
        dataTransfer = new DataTransfer();
      } catch (_error) {
        dataTransfer = undefined;
      }

      try {
        dispatchPointerAndMouse(
          lastTarget,
          "pointerdown",
          "mousedown",
          start,
          modifiers,
          1,
          0,
        );
        pointerActive = true;
        dispatchDragEvent(
          start.eventTarget,
          "dragstart",
          start,
          modifiers,
          dataTransfer,
        );
        dragActive = true;

        const delayMs = durationMs / steps;
        for (let step = 1; step <= steps; step += 1) {
          if (delayMs > 0) {
            await new Promise((resolve) => setTimeout(resolve, delayMs));
          }
          const progress = step / steps;
          const point = {
            x: start.x + (end.x - start.x) * progress,
            y: start.y + (end.y - start.y) * progress,
          };
          const moveTarget = document.elementFromPoint(point.x, point.y) ||
            lastTarget;

          dispatchPointerAndMouse(
            moveTarget,
            "pointermove",
            "mousemove",
            point,
            modifiers,
            1,
            -1,
          );
          if (moveTarget !== lastTarget) {
            dispatchDragEvent(
              lastTarget,
              "dragleave",
              point,
              modifiers,
              dataTransfer,
            );
            dispatchDragEvent(
              moveTarget,
              "dragenter",
              point,
              modifiers,
              dataTransfer,
            );
          }
          dispatchDragEvent(
            moveTarget,
            "dragover",
            point,
            modifiers,
            dataTransfer,
          );
          lastPoint = point;
          lastTarget = moveTarget;
        }

        const finalTarget = document.elementFromPoint(end.x, end.y) ||
          end.eventTarget;
        dispatchDragEvent(
          finalTarget,
          "drop",
          end,
          modifiers,
          dataTransfer,
        );
        dispatchPointerAndMouse(
          finalTarget,
          "pointerup",
          "mouseup",
          end,
          modifiers,
          0,
          0,
        );
        pointerActive = false;
        dispatchDragEvent(
          start.eventTarget,
          "dragend",
          end,
          modifiers,
          dataTransfer,
        );
        dragActive = false;

        return {
          action: "drag",
          ok: true,
          actedAt: new Date().toISOString(),
          eventMode: "synthetic",
          modifiers,
          steps,
          durationMs,
          source: {
            x: start.x,
            y: start.y,
            element: describeElement(start.element),
          },
          destination: {
            x: end.x,
            y: end.y,
            element: describeElement(end.element),
          },
        };
      } finally {
        if (pointerActive) {
          try {
            dispatchPointerAndMouse(
              lastTarget,
              "pointerup",
              "mouseup",
              lastPoint,
              modifiers,
              0,
              0,
            );
          } catch (_error) {
            // 元の操作エラーを優先します。
          }
        }
        if (dragActive) {
          try {
            dispatchDragEvent(
              start.eventTarget,
              "dragend",
              lastPoint,
              modifiers,
              dataTransfer,
            );
          } catch (_error) {
            // 元の操作エラーを優先します。
          }
        }
        releaseModifierKeys(keyboardTarget, pressedModifiers);
      }
    }

    // React等がvalue setterをhookしている場合でも、通常のinputイベントとして検知されやすくします。
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
      element.dispatchEvent(
        new InputEvent("input", { bubbles: true, inputType: "insertText" }),
      );
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
        element =
          typeof options.selector === "string" && options.selector.trim() !== ""
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
      case "double_click":
        return await doubleClickElement();
      case "drag":
        return await dragElement();
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

  async function doubleClick(input) {
    const { tabId, pageInput } = splitTargetTab(input);
    return await runPageCommand(
      { name: "double_click", input: pageInput },
      tabId,
    );
  }

  async function drag(input) {
    const { tabId, pageInput } = splitTargetTab(input);
    return await runPageCommand({ name: "drag", input: pageInput }, tabId);
  }

  async function fill(input) {
    return await runPageCommand({ name: "fill", input });
  }

  // 待機ループはservice worker側で管理し、ページ内scriptは毎回1回の状態確認だけを行います。
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
    doubleClick,
    drag,
    fill,
    waitFor,
    navigate,
  };
})();
