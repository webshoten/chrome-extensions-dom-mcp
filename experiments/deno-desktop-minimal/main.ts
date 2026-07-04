const startedAt = new Date().toISOString();

Deno.serve((_request) => {
  const html = `<!doctype html>
<html lang="ja">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Deno Desktop Minimal</title>
    <style>
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        font-family: system-ui, sans-serif;
        background: #f6f7f9;
        color: #202124;
      }

      main {
        width: min(520px, calc(100vw - 32px));
        padding: 24px;
        border: 1px solid #d8dde6;
        border-radius: 8px;
        background: white;
      }

      h1 {
        margin: 0 0 12px;
        font-size: 24px;
        line-height: 1.25;
      }

      p {
        margin: 8px 0 0;
        line-height: 1.6;
      }

      code {
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>Deno Desktop Minimal</h1>
      <p>この画面が見えれば、最小構成の Desktop app は起動しています。</p>
      <p>startedAt: <code>${startedAt}</code></p>
    </main>
  </body>
</html>`;

  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
    },
  });
});
