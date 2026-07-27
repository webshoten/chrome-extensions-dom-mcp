export type FixedHttpServer = {
  finished: Promise<void>;
  close(): void;
};

/*
 * # 固定ポートHTTP server
 *
 * ## 目的
 * Chrome拡張とMCP clientが既知のlocalhost URLへ接続できるよう、Desktop UIとは別に固定ポートを公開する。
 *
 * ## 説明
 * Deno Desktopは環境変数でDeno.serveをUI用portへ誘導する。固定serverのbind時だけ値を退避し、UI開始前に戻す。
 */
export function serveFixedHttp(
  addr: string,
  handler: (request: Request) => Response | Promise<Response>,
): FixedHttpServer {
  const [hostname, rawPort] = addr.split(":");
  const desktopServeAddress = Deno.env.get("DENO_SERVE_ADDRESS");

  try {
    if (desktopServeAddress !== undefined) {
      Deno.env.delete("DENO_SERVE_ADDRESS");
    }
    const server = Deno.serve(
      {
        hostname,
        port: Number(rawPort),
        onListen: () => {},
      },
      handler,
    );
    return {
      finished: server.finished,
      close: () => void server.shutdown(),
    };
  } finally {
    if (desktopServeAddress !== undefined) {
      Deno.env.set("DENO_SERVE_ADDRESS", desktopServeAddress);
    }
  }
}
