import { dirname, join } from "node:path";

const LOGIN_ITEM_ID = "com.webshoten.bridge-app";

function escapeXML(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function findAppBundlePath(executablePath: string): string | null {
  let current = executablePath;
  while (current !== dirname(current)) {
    if (current.endsWith(".app")) {
      return current;
    }
    current = dirname(current);
  }
  return null;
}

/*
 * # macOSログイン時起動設定
 *
 * ## 目的
 * 初回設定後はユーザーがdaemon操作をせず、macOSログイン後にBridge appを利用可能な状態へ戻す。
 *
 * ## 説明
 * LaunchAgentはBridge appを開くだけに使い、MCPやChrome接続の実体は常にapp本体が所有する。
 */
export class LoginItemService {
  readonly #plistPath: string | null;
  readonly #appBundlePath: string | null;

  constructor(
    home = Deno.env.get("HOME"),
    executablePath = Deno.execPath(),
  ) {
    this.#plistPath = home
      ? join(home, "Library", "LaunchAgents", `${LOGIN_ITEM_ID}.plist`)
      : null;
    this.#appBundlePath = findAppBundlePath(executablePath);
  }

  get supported(): boolean {
    return Deno.build.os === "darwin" && this.#plistPath !== null &&
      this.#appBundlePath !== null;
  }

  async isEnabled(): Promise<boolean> {
    if (!this.supported) {
      return false;
    }
    try {
      const plist = await Deno.readTextFile(this.#plistPath!);
      return plist.includes(escapeXML(this.#appBundlePath!));
    } catch (error) {
      if (error instanceof Deno.errors.NotFound) {
        return false;
      }
      throw error;
    }
  }

  async setEnabled(enabled: boolean): Promise<void> {
    if (!this.supported) {
      throw new Error(
        "login item is available only from the packaged macOS app",
      );
    }
    if (!enabled) {
      try {
        await Deno.remove(this.#plistPath!);
      } catch (error) {
        if (!(error instanceof Deno.errors.NotFound)) {
          throw error;
        }
      }
      return;
    }

    await Deno.mkdir(dirname(this.#plistPath!), { recursive: true });
    await Deno.writeTextFile(this.#plistPath!, this.#buildPlist());
  }

  #buildPlist(): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LOGIN_ITEM_ID}</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/bin/open</string>
    <string>-gj</string>
    <string>${escapeXML(this.#appBundlePath!)}</string>
    <string>--args</string>
    <string>--background</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
</dict>
</plist>
`;
  }
}
