# list_tabs

## 目的

接続中のChrome profileにある通常windowとtabを列挙し、後続の`get_dom`で対象を明示できるようにする。

## 入力

```json
{}
```

## 出力

```json
{
  "windows": [
    {
      "windowId": 10,
      "focused": true,
      "incognito": false,
      "type": "normal",
      "tabs": [
        {
          "targetId": "page:browser-550e8400-e29b-41d4-a716-446655440000:42",
          "tabId": 42,
          "active": true,
          "pinned": false,
          "url": "https://example.com/",
          "title": "Example Domain"
        }
      ]
    }
  ]
}
```

`targetId`は接続とtabを組み合わせた一時IDで、Chrome profile間で同じ`tabId`が存在しても衝突しない。
daemon再起動、拡張再接続、またはtabを閉じた後は無効になるため、再度`list_tabs`を呼び直す。
