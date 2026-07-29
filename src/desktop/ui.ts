import type { DOMServer } from "../bridge/daemon/http_api.ts";
import { type AgentName, AgentSetupService } from "./agent_setup.ts";
import { LoginItemService } from "./login_item.ts";

const HTML = `<!doctype html>
<html lang="ja">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Bridge</title>
    <link rel="stylesheet" href="/app.css">
  </head>
  <body>
    <main class="app-shell">
      <header class="app-header">
        <div class="brand-mark" aria-hidden="true">
          <svg viewBox="0 0 24 24"><rect x="1.5" y="10" width="9" height="8.5" rx="1.5"/><path d="M4 13l2.2 1.7L4 16.4"/><rect x="13.5" y="10" width="9" height="8.5" rx="1.5"/><path d="M13.5 13h9"/><path d="M6 10C6 3.5 18 3.5 18 10"/></svg>
        </div>
        <div class="brand-copy">
          <h1>Bridge</h1>
          <p id="headerSummary">状態を確認しています</p>
        </div>
        <span id="headerDot" class="status-dot checking" aria-hidden="true"></span>
      </header>

      <nav class="tabs" aria-label="Bridge">
        <button type="button" class="tab active" data-tab="status">現在</button>
        <button type="button" class="tab" data-tab="setup">MCP導入</button>
      </nav>

      <section class="tab-panel active" data-panel="status">
        <dl class="status-list">
          <div><dt>Bridge</dt><dd id="bridgeStatus">確認中</dd></div>
          <div><dt>Chrome拡張</dt><dd id="extensionStatus">確認中</dd></div>
          <div><dt>MCP</dt><dd id="mcpStatus">確認中</dd></div>
        </dl>
        <div class="endpoint-row">
          <span>接続先</span>
          <code>http://127.0.0.1:9333/mcp</code>
        </div>
      </section>

      <section class="tab-panel" data-panel="setup" hidden>
        <div class="setting-row">
          <div>
            <strong>ログイン時に起動</strong>
            <span>macOSへのログイン後にBridgeを開始</span>
          </div>
          <label class="switch">
            <input id="loginToggle" type="checkbox">
            <span aria-hidden="true"></span>
          </label>
        </div>
        <div class="agent-list">
          <div class="agent-row">
            <div><strong>Codex</strong><span id="codexStatus">確認中</span></div>
            <button id="codexButton" class="command-button" type="button">
              <svg viewBox="0 0 24 24"><path d="M5 12h14M12 5v14"/></svg>
              <span>追加</span>
            </button>
          </div>
          <div class="agent-row">
            <div><strong>Claude Code</strong><span id="claudeStatus">確認中</span></div>
            <button id="claudeButton" class="command-button" type="button">
              <svg viewBox="0 0 24 24"><path d="M5 12h14M12 5v14"/></svg>
              <span>追加</span>
            </button>
          </div>
        </div>
        <p id="setupMessage" class="message" role="status"></p>
      </section>

    </main>
    <script src="/app.js"></script>
  </body>
</html>`;

const CSS = `
* { box-sizing: border-box; }
:root {
  color-scheme: light;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  color: #172033;
  background: #f4f6f8;
  letter-spacing: 0;
}
body { margin: 0; min-width: 360px; min-height: 100vh; background: #f4f6f8; }
button, input { font: inherit; }
button { letter-spacing: 0; }
.app-shell { width: min(100%, 560px); min-height: 100vh; margin: 0 auto; background: #fff; }
.app-header { display: grid; grid-template-columns: 38px 1fr auto; align-items: center; gap: 12px; padding: 22px 24px 18px; border-bottom: 1px solid #e1e5ea; }
.brand-mark { width: 38px; height: 38px; display: grid; place-items: center; color: #fff; background: #1d5f54; border-radius: 8px; }
.brand-mark svg { width: 23px; height: 23px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
.brand-copy h1 { margin: 0; font-size: 19px; line-height: 1.2; font-weight: 720; }
.brand-copy p { margin: 3px 0 0; color: #657083; font-size: 12px; }
.status-dot { width: 11px; height: 11px; border-radius: 50%; background: #9aa3ae; }
.status-dot.ready { background: #20834d; box-shadow: 0 0 0 3px #e4f3e9; }
.status-dot.warning { background: #b96712; box-shadow: 0 0 0 3px #fff0dd; }
.status-dot.error { background: #c33b3b; box-shadow: 0 0 0 3px #fbe7e7; }
.tabs { display: grid; grid-template-columns: repeat(2, 1fr); height: 44px; padding: 0 16px; border-bottom: 1px solid #e1e5ea; }
.tab { position: relative; border: 0; color: #697386; background: transparent; cursor: pointer; font-size: 13px; font-weight: 650; }
.tab.active { color: #173c36; }
.tab.active::after { content: ""; position: absolute; left: 18px; right: 18px; bottom: -1px; height: 2px; background: #1d6f60; }
.tab-panel { padding: 20px 24px 24px; }
.status-list { margin: 0; border-top: 1px solid #e2e6eb; }
.status-list div { display: grid; grid-template-columns: 120px 1fr; align-items: center; min-height: 54px; border-bottom: 1px solid #e2e6eb; }
.status-list dt { color: #657083; font-size: 13px; }
.status-list dd { margin: 0; text-align: right; font-size: 13px; font-weight: 680; }
.endpoint-row { margin-top: 18px; }
.endpoint-row span { display: block; margin-bottom: 7px; color: #657083; font-size: 12px; }
.endpoint-row code { display: block; padding: 10px 12px; overflow: hidden; color: #344054; background: #f2f4f6; border: 1px solid #e1e5ea; border-radius: 6px; font: 12px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace; text-overflow: ellipsis; white-space: nowrap; }
.setting-row, .agent-row { display: flex; align-items: center; justify-content: space-between; gap: 16px; min-height: 64px; border-bottom: 1px solid #e2e6eb; }
.setting-row > div, .agent-row > div { min-width: 0; }
.setting-row strong, .agent-row strong { display: block; font-size: 13px; }
.setting-row span, .agent-row span { display: block; margin-top: 3px; color: #657083; font-size: 12px; }
.switch { position: relative; flex: 0 0 auto; width: 38px; height: 22px; }
.switch input { position: absolute; opacity: 0; pointer-events: none; }
.switch span { display: block; width: 100%; height: 100%; margin: 0; border-radius: 11px; background: #b7bec8; transition: background .15s ease; }
.switch span::after { content: ""; position: absolute; top: 3px; left: 3px; width: 16px; height: 16px; border-radius: 50%; background: #fff; box-shadow: 0 1px 3px #0003; transition: transform .15s ease; }
.switch input:checked + span { background: #1d6f60; }
.switch input:checked + span::after { transform: translateX(16px); }
.switch input:focus-visible + span { outline: 2px solid #2b74c7; outline-offset: 2px; }
.agent-list { border-top: 1px solid #e2e6eb; margin-top: 18px; }
.command-button { display: inline-flex; align-items: center; gap: 6px; min-width: 82px; height: 34px; justify-content: center; color: #fff; border: 0; border-radius: 6px; background: #1d5f54; cursor: pointer; font-size: 12px; font-weight: 680; }
.command-button span { margin: 0; color: inherit; font-size: 12px; }
.command-button svg { width: 17px; height: 17px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
.command-button:disabled { color: #7d8797; background: #e7eaee; cursor: default; }
.message { min-height: 20px; margin: 14px 0 0; color: #495568; font-size: 12px; }
.message.error { color: #ad2f2f; }
`;

const JAVASCRIPT = `
const $ = (id) => document.getElementById(id);
const tabs = [...document.querySelectorAll('[data-tab]')];
const panels = [...document.querySelectorAll('[data-panel]')];

tabs.forEach((tab) => tab.addEventListener('click', () => {
  tabs.forEach((item) => item.classList.toggle('active', item === tab));
  panels.forEach((panel) => {
    const active = panel.dataset.panel === tab.dataset.tab;
    panel.classList.toggle('active', active);
    panel.hidden = !active;
  });
}));

const initialTab = new URLSearchParams(location.search).get('tab');
const initialButton = tabs.find((tab) => tab.dataset.tab === initialTab);
if (initialButton) initialButton.click();

async function requestJson(path, options) {
  const response = await fetch(path, { cache: 'no-store', ...options });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || 'request failed');
  return body;
}

async function refreshStatus() {
  try {
    const status = await requestJson('/api/status');
    const connected = Number(status.extensionConnections || 0) > 0;
    $('bridgeStatus').textContent = '起動中';
    $('extensionStatus').textContent = connected ? '接続済み' : '未接続';
    $('mcpStatus').textContent = '待受中';
    $('headerSummary').textContent = connected ? '利用できます' : 'Chrome拡張を待っています';
    $('headerDot').className = 'status-dot ' + (connected ? 'ready' : 'warning');
  } catch (error) {
    $('bridgeStatus').textContent = 'エラー';
    $('extensionStatus').textContent = '未接続';
    $('mcpStatus').textContent = '停止';
    $('headerSummary').textContent = error.message;
    $('headerDot').className = 'status-dot error';
  }
}

function renderAgent(agent, status) {
  const label = $(agent + 'Status');
  const button = $(agent + 'Button');
  if (!status.available) {
    label.textContent = '未検出';
    button.disabled = true;
    return;
  }
  label.textContent = status.registered ? '接続済み' : '未登録';
  button.disabled = status.registered;
  button.querySelector('span').textContent = status.registered ? '追加済み' : '追加';
}

async function refreshSetup() {
  try {
    const setup = await requestJson('/api/setup');
    $('loginToggle').checked = setup.loginItem.enabled;
    $('loginToggle').disabled = !setup.loginItem.supported;
    renderAgent('codex', setup.agents.codex);
    renderAgent('claude', setup.agents.claude);
  } catch (error) {
    $('setupMessage').textContent = error.message;
    $('setupMessage').className = 'message error';
  }
}

async function registerAgent(agent) {
  const button = $(agent + 'Button');
  button.disabled = true;
  $('setupMessage').textContent = '登録しています';
  $('setupMessage').className = 'message';
  try {
    const status = await requestJson('/api/setup/agent', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ agent })
    });
    renderAgent(agent, status);
    $('setupMessage').textContent = (agent === 'codex' ? 'Codex' : 'Claude Code') + 'へ追加しました';
  } catch (error) {
    button.disabled = false;
    $('setupMessage').textContent = error.message;
    $('setupMessage').className = 'message error';
  }
}

$('codexButton').addEventListener('click', () => registerAgent('codex'));
$('claudeButton').addEventListener('click', () => registerAgent('claude'));
$('loginToggle').addEventListener('change', async (event) => {
  event.target.disabled = true;
  try {
    await requestJson('/api/setup/login-item', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ enabled: event.target.checked })
    });
    $('setupMessage').textContent = event.target.checked
      ? '次回のログインから自動起動します' : 'ログイン時の起動を解除しました';
  } catch (error) {
    event.target.checked = !event.target.checked;
    $('setupMessage').textContent = error.message;
    $('setupMessage').className = 'message error';
  } finally {
    event.target.disabled = false;
  }
});

refreshStatus();
refreshSetup();
setInterval(refreshStatus, 5000);
`;

function jsonResponse(payload: unknown, status = 200): Response {
  return Response.json(payload, {
    status,
    headers: { "cache-control": "no-store" },
  });
}

/*
 * # Desktop UI HTTP handler
 *
 * ## 目的
 * メニューバーから開く状態画面と、初回のMCP登録・ログイン時起動設定を提供する。
 *
 * ## 説明
 * browser toolの通信は固定ポート側へ分離し、ここではapp自身の管理操作だけを受け付ける。
 */
export class DesktopUI {
  constructor(
    private readonly bridgeServer: DOMServer,
    private readonly agentSetup: AgentSetupService,
    private readonly loginItem: LoginItemService,
  ) {}

  async handleRequest(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/") {
      return new Response(HTML, {
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
    if (request.method === "GET" && url.pathname === "/app.css") {
      return new Response(CSS, {
        headers: { "content-type": "text/css; charset=utf-8" },
      });
    }
    if (request.method === "GET" && url.pathname === "/app.js") {
      return new Response(JAVASCRIPT, {
        headers: { "content-type": "text/javascript; charset=utf-8" },
      });
    }
    if (request.method === "GET" && url.pathname === "/api/status") {
      return jsonResponse(this.bridgeServer.getStatus());
    }
    if (request.method === "GET" && url.pathname === "/api/setup") {
      return await this.#getSetup();
    }
    if (request.method === "POST" && url.pathname === "/api/setup/agent") {
      return await this.#registerAgent(request);
    }
    if (request.method === "POST" && url.pathname === "/api/setup/login-item") {
      return await this.#setLoginItem(request);
    }
    return new Response("not found\n", { status: 404 });
  }

  async #getSetup(): Promise<Response> {
    const [codex, claude, loginEnabled] = await Promise.all([
      this.agentSetup.getStatus("codex"),
      this.agentSetup.getStatus("claude"),
      this.loginItem.isEnabled(),
    ]);
    return jsonResponse({
      agents: { codex, claude },
      loginItem: { supported: this.loginItem.supported, enabled: loginEnabled },
    });
  }

  async #registerAgent(request: Request): Promise<Response> {
    try {
      const body = await request.json() as { agent?: AgentName };
      if (body.agent !== "codex" && body.agent !== "claude") {
        return jsonResponse({ error: "unknown AI Agent" }, 400);
      }
      return jsonResponse(await this.agentSetup.register(body.agent));
    } catch (error) {
      return jsonResponse({
        error: error instanceof Error ? error.message : String(error),
      }, 500);
    }
  }

  async #setLoginItem(request: Request): Promise<Response> {
    try {
      const body = await request.json() as { enabled?: unknown };
      if (typeof body.enabled !== "boolean") {
        return jsonResponse({ error: "enabled must be boolean" }, 400);
      }
      await this.loginItem.setEnabled(body.enabled);
      return jsonResponse({ enabled: await this.loginItem.isEnabled() });
    } catch (error) {
      return jsonResponse({
        error: error instanceof Error ? error.message : String(error),
      }, 500);
    }
  }
}
