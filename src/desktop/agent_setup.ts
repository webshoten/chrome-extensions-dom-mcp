import { join } from "node:path";

export type AgentName = "codex" | "claude";

export type AgentStatus = {
  available: boolean;
  registered: boolean;
  detail: string | null;
};

type CommandResult = {
  success: boolean;
  stdout: string;
  stderr: string;
};

const SERVER_NAME = "chrome-bridge";

async function isExecutable(path: string): Promise<boolean> {
  try {
    return (await Deno.stat(path)).isFile;
  } catch {
    return false;
  }
}

/*
 * # AI Agent MCP登録
 *
 * ## 目的
 * 初回セットアップ画面の操作だけで、Codex/ClaudeをDesktop appのHTTP MCP endpointへ接続する。
 *
 * ## 説明
 * GUI起動時はshellのPATHが短いため、一般的なinstall先を含めて実行ファイルを解決する。
 */
export class AgentSetupService {
  constructor(
    private readonly endpoint: string,
    private readonly home = Deno.env.get("HOME") ?? "",
  ) {}

  async getStatus(agent: AgentName): Promise<AgentStatus> {
    const executable = await this.#findExecutable(agent);
    if (!executable) {
      return { available: false, registered: false, detail: null };
    }

    const result = agent === "codex"
      ? await this.#run(executable, ["mcp", "get", SERVER_NAME, "--json"])
      : await this.#run(executable, ["mcp", "get", SERVER_NAME]);
    if (!result.success) {
      return { available: true, registered: false, detail: null };
    }

    const output = `${result.stdout}\n${result.stderr}`;
    return {
      available: true,
      registered: output.includes(this.endpoint),
      detail: output.includes(this.endpoint)
        ? this.endpoint
        : "別の接続先を登録済み",
    };
  }

  async register(agent: AgentName): Promise<AgentStatus> {
    const executable = await this.#findExecutable(agent);
    if (!executable) {
      throw new Error(`${agent} command was not found`);
    }

    const current = await this.getStatus(agent);
    if (current.registered) {
      return current;
    }

    if (current.detail !== null) {
      const removeArgs = agent === "codex"
        ? ["mcp", "remove", SERVER_NAME]
        : ["mcp", "remove", SERVER_NAME];
      const removed = await this.#run(executable, removeArgs);
      if (!removed.success) {
        throw new Error(
          removed.stderr.trim() || "remove existing MCP registration failed",
        );
      }
    }

    const addArgs = agent === "codex"
      ? ["mcp", "add", SERVER_NAME, "--url", this.endpoint]
      : [
        "mcp",
        "add",
        "--transport",
        "http",
        "--scope",
        "user",
        SERVER_NAME,
        this.endpoint,
      ];
    const added = await this.#run(executable, addArgs);
    if (!added.success) {
      throw new Error(added.stderr.trim() || "MCP registration failed");
    }
    return await this.getStatus(agent);
  }

  async #findExecutable(agent: AgentName): Promise<string | null> {
    const pathCandidates = (Deno.env.get("PATH") ?? "")
      .split(":")
      .filter(Boolean)
      .map((directory) => join(directory, agent));
    const candidates = [
      ...pathCandidates,
      "/usr/local/bin/" + agent,
      "/opt/homebrew/bin/" + agent,
      join(this.home, ".local", "bin", agent),
      join(this.home, ".deno", "bin", agent),
    ];

    for (const candidate of new Set(candidates)) {
      if (await isExecutable(candidate)) {
        return candidate;
      }
    }
    return null;
  }

  async #run(executable: string, args: string[]): Promise<CommandResult> {
    const command = new Deno.Command(executable, {
      args,
      stdout: "piped",
      stderr: "piped",
    });
    const output = await command.output();
    const decoder = new TextDecoder();
    return {
      success: output.success,
      stdout: decoder.decode(output.stdout),
      stderr: decoder.decode(output.stderr),
    };
  }
}
