# Deno Desktop Minimal

このフォルダは、既存の Bridge 実装と切り離して Deno Desktop の最小起動だけを確認するための実験用です。

```sh
deno desktop --no-config experiments/deno-desktop-minimal/main.ts
```

`.app` を作る場合:

```sh
deno desktop --no-config --output experiments/deno-desktop-minimal/dist/DenoDesktopMinimal.app experiments/deno-desktop-minimal/main.ts
```
