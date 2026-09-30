(function () {
  /*
   * # CDP drag tool
   *
   * ## 目的
   * AI Agentのdrag requestを、指定したChromeタブへブラウザ入力として届ける。
   *
   * ## 説明
   * selectorと座標はページ内で解決し、入力はchrome.debugger経由で送る。
   * attach後は成功・失敗にかかわらずdetachを試みる。
   */
  const DEBUGGER_PROTOCOL_VERSION = "1.3";
  const MODIFIER_BITS = {
    Alt: 1,
    Control: 2,
    Meta: 4,
    Shift: 8,
  };
  const KEY_DETAILS = {
    Alt: { code: "AltLeft", keyCode: 18 },
    Control: { code: "ControlLeft", keyCode: 17 },
    Meta: { code: "MetaLeft", keyCode: 91 },
    Shift: { code: "ShiftLeft", keyCode: 16 },
  };

  function boundedInteger(value, fallback, minimum, maximum, label) {
    if (value === undefined) {
      return fallback;
    }
    if (!Number.isInteger(value) || value < minimum || value > maximum) {
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

    const modifiers = [];
    for (const modifier of value) {
      if (!(modifier in MODIFIER_BITS)) {
        throw new Error(`unsupported modifier: ${modifier}`);
      }
      if (!modifiers.includes(modifier)) {
        modifiers.push(modifier);
      }
    }
    return modifiers;
  }

  function modifierMask(modifiers) {
    return modifiers.reduce(
      (mask, modifier) => mask | MODIFIER_BITS[modifier],
      0,
    );
  }

  function errorMessage(error) {
    return error instanceof Error ? error.message : String(error);
  }

  function delay(milliseconds) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
  }

  async function sendKeyEvent(debuggee, type, modifier, modifiers) {
    const details = KEY_DETAILS[modifier];
    await chrome.debugger.sendCommand(debuggee, "Input.dispatchKeyEvent", {
      type,
      modifiers: modifierMask(modifiers),
      key: modifier,
      code: details.code,
      windowsVirtualKeyCode: details.keyCode,
      nativeVirtualKeyCode: details.keyCode,
      location: 1,
    });
  }

  async function sendMouseEvent(debuggee, type, point, options) {
    await chrome.debugger.sendCommand(debuggee, "Input.dispatchMouseEvent", {
      type,
      x: point.x,
      y: point.y,
      modifiers: options.modifiers,
      button: options.button,
      buttons: options.buttons,
      clickCount: options.clickCount,
      pointerType: "mouse",
    });
  }

  async function safeSendMouseRelease(debuggee, point, modifiers) {
    try {
      await sendMouseEvent(debuggee, "mouseReleased", point, {
        modifiers: modifierMask(modifiers),
        button: "left",
        buttons: 0,
        clickCount: 1,
      });
    } catch (_error) {
      // 元の操作エラーを優先します。
    }
  }

  async function safeReleaseModifiers(debuggee, pressedModifiers) {
    while (pressedModifiers.length > 0) {
      const modifier = pressedModifiers.pop();
      try {
        await sendKeyEvent(
          debuggee,
          "keyUp",
          modifier,
          pressedModifiers,
        );
      } catch (_error) {
        // 元の操作エラーを優先します。
      }
    }
  }

  function resolvePageDragPoints(sourceInput, destinationInput) {
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
      return normalizeText(
        [
          element.innerText,
          element.textContent,
          element.getAttribute("aria-label"),
          element.getAttribute("placeholder"),
          element.getAttribute("name"),
          element.getAttribute("value"),
        ].filter(Boolean).join(" "),
      );
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

    function readableTextSelector() {
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

    function findByText(text, options) {
      const needle = normalizeText(text);
      if (needle === "") {
        return null;
      }
      const candidates = [...document.querySelectorAll(
        readableTextSelector(),
      )];
      return candidates.find((element) => {
        if (options.visibleOnly !== false && !isVisible(element)) {
          return false;
        }
        const value = elementText(element);
        return options.exact === true
          ? value === needle
          : value.includes(needle);
      }) || null;
    }

    function resolveLocation(locator, label) {
      if (!locator || typeof locator !== "object") {
        throw new Error(`${label} is required`);
      }

      const hasX = Number.isFinite(locator.x);
      const hasY = Number.isFinite(locator.y);
      if (hasX || hasY) {
        if (!hasX || !hasY) {
          throw new Error(`${label}.x and ${label}.y must be used together`);
        }
        return { kind: "point", x: locator.x, y: locator.y };
      }

      let element;
      if (
        typeof locator.selector === "string" && locator.selector.trim() !== ""
      ) {
        const candidates = [...document.querySelectorAll(locator.selector)];
        element = locator.visibleOnly === false
          ? candidates[0]
          : candidates.find(isVisible);
      } else if (
        typeof locator.text === "string" && locator.text.trim() !== ""
      ) {
        element = findByText(locator.text, locator);
      } else {
        throw new Error(`${label} requires selector, text, or x/y`);
      }

      if (!element) {
        throw new Error(`${label} element was not found`);
      }
      return { kind: "element", element };
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
      const element = location.kind === "element"
        ? location.element
        : eventTarget;
      return { x, y, element: describeElement(element) };
    }

    const source = resolveLocation(sourceInput, "source");
    const destination = resolveLocation(destinationInput, "destination");
    if (source.kind === "element") {
      source.element.scrollIntoView({ block: "center", inline: "center" });
    }
    if (destination.kind === "element") {
      const rect = destination.element.getBoundingClientRect();
      const inViewport = rect.left >= 0 && rect.top >= 0 &&
        rect.right <= globalThis.innerWidth &&
        rect.bottom <= globalThis.innerHeight;
      if (!inViewport) {
        destination.element.scrollIntoView({
          block: "nearest",
          inline: "nearest",
        });
      }
    }

    return {
      source: locationPoint(source, "source"),
      destination: locationPoint(destination, "destination"),
    };
  }

  async function resolveDragPoints(tabId, input) {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: resolvePageDragPoints,
      args: [input.source, input.destination],
    });
    if (results.length === 0 || results[0].result === undefined) {
      throw new Error("drag locations returned no result");
    }
    return results[0].result;
  }

  async function drag(input) {
    if (!input || !Number.isInteger(input.tabId)) {
      throw new Error("targetId is required; call list_tabs again");
    }
    const modifiers = normalizeModifiers(input.modifiers);
    const steps = boundedInteger(input.steps, 12, 1, 100, "steps");
    const durationMs = boundedInteger(
      input.durationMs,
      500,
      0,
      5_000,
      "durationMs",
    );
    const tab = await globalThis.BridgeActiveTab.getTargetTab(input.tabId);
    const points = await resolveDragPoints(tab.id, input);
    const debuggee = { tabId: tab.id };
    const pressedModifiers = [];
    let attached = false;
    let mouseDown = false;
    let lastPoint = points.source;
    let failure;
    let result;

    try {
      try {
        await chrome.debugger.attach(debuggee, DEBUGGER_PROTOCOL_VERSION);
        attached = true;
      } catch (error) {
        throw new Error(
          `CDP drag could not attach to tab ${tab.id}: ${
            errorMessage(error)
          }. Close DevTools for that tab and retry.`,
        );
      }

      for (const modifier of modifiers) {
        pressedModifiers.push(modifier);
        await sendKeyEvent(
          debuggee,
          "rawKeyDown",
          modifier,
          pressedModifiers,
        );
      }

      const modifiersMask = modifierMask(pressedModifiers);
      await sendMouseEvent(debuggee, "mouseMoved", points.source, {
        modifiers: modifiersMask,
        button: "none",
        buttons: 0,
        clickCount: 0,
      });
      await sendMouseEvent(debuggee, "mousePressed", points.source, {
        modifiers: modifiersMask,
        button: "left",
        buttons: 1,
        clickCount: 1,
      });
      mouseDown = true;

      const stepDelayMs = durationMs / steps;
      for (let step = 1; step <= steps; step += 1) {
        if (stepDelayMs > 0) {
          await delay(stepDelayMs);
        }
        const progress = step / steps;
        lastPoint = {
          x: points.source.x +
            (points.destination.x - points.source.x) * progress,
          y: points.source.y +
            (points.destination.y - points.source.y) * progress,
        };
        await sendMouseEvent(debuggee, "mouseMoved", lastPoint, {
          modifiers: modifiersMask,
          button: "left",
          buttons: 1,
          clickCount: 0,
        });
      }

      await sendMouseEvent(debuggee, "mouseReleased", points.destination, {
        modifiers: modifiersMask,
        button: "left",
        buttons: 0,
        clickCount: 1,
      });
      mouseDown = false;
      while (pressedModifiers.length > 0) {
        const modifier = pressedModifiers.pop();
        await sendKeyEvent(
          debuggee,
          "keyUp",
          modifier,
          pressedModifiers,
        );
      }

      result = {
        ...globalThis.BridgeActiveTab.tabMeta(tab),
        action: "drag",
        ok: true,
        actedAt: new Date().toISOString(),
        eventMode: "cdp",
        modifiers,
        steps,
        durationMs,
        source: points.source,
        destination: points.destination,
      };
    } catch (error) {
      failure = error instanceof Error && error.message.startsWith("CDP drag")
        ? error
        : new Error(`CDP drag failed: ${errorMessage(error)}`);
    } finally {
      if (attached && mouseDown) {
        await safeSendMouseRelease(debuggee, lastPoint, pressedModifiers);
      }
      if (attached) {
        await safeReleaseModifiers(debuggee, pressedModifiers);
        try {
          await chrome.debugger.detach(debuggee);
        } catch (error) {
          failure ??= new Error(
            `CDP drag could not detach from tab ${tab.id}: ${
              errorMessage(error)
            }`,
          );
        }
      }
    }

    if (failure) {
      throw failure;
    }
    return result;
  }

  globalThis.BridgeDragTools = { drag };
})();
