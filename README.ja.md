# TurboWarp-Named-Functions

[English](README.md) | [日本語](README.ja.md)

JSONの引数を受け取りJSONの結果を返す「名前を持つ関数」を定義するTurboWarp機能拡張です。スクリプトから名前で呼び出して結果を待つことも、いくつか開始しておいてあとでまとめて待つこともできます。ツールとして公開する印を付けると、AIのツール呼び出しなど、ほかの拡張から使えるようになります。

**利用ガイド:** [English](https://kubohiroya.github.io/turbowarp-named-functions/)

## できること

- `define function`ハットで関数を定義する（名前、説明、引数のJSON Schema）
- 名前で呼び出して結果を待つ（`call function`）、または開始してあとで待つ（`start function`、`await`、`await all`）
- 関数を実行する前に、引数をスキーマで検査する（コード生成を使わない）
- 再入（関数が直接または間接に自分自身を呼ぶこと）を検出し、待ち続けずにエラーにする
- ほかの拡張が自分のブロックと組み合わせて同じ機能を使えるよう、Composition APIを提供する

## 動作条件と安全上の注意

- カスタム機能拡張を使えるTurboWarp DesktopまたはTurboWarp Web

> [!IMPORTANT]
> この機能拡張は、VMランタイムを通じて`define function`のスクリプトを起動するため、サンドボックスなしで実行する必要があります。
> 信頼できる配布元の機能拡張だけを読み込んでください。

- `define function`のNAME、DESCRIPTION、SCHEMAには、文字列を直接書く必要があります。ハットはスクリプトの実行前に読み取られます。
- ツールとして公開した関数は、AIのモデルなど、ほかのプログラムが選んだ引数で呼ばれることがあります。スキーマに合っていても、引数は信頼できない入力として扱ってください。

## インストール

1. [`dist/turbowarp-named-functions.js`](dist/turbowarp-named-functions.js?raw=1)をダウンロードします。
2. TurboWarpで**機能拡張**を開きます。
3. **カスタム機能拡張**からfileを読み込みます。
4. **サンドボックスなしで実行する**を有効にします。

npm packageとして使う場合は、検証済みのversionをexact pinします。

```bash
pnpm add --save-exact @kubohiroya/turbowarp-named-functions@0.1.0
```

## クイックスタート

```text
define function [add] description [Adds two numbers.] args schema [{"type":"object","properties":{"a":{"type":"number"},"b":{"type":"number"}},"required":["a","b"]}] export as [none]
return ((function argument [a]) + (function argument [b]))

when green flag clicked
say (call function [add] with [{"a":1,"b":2}])
```

## ブロックリファレンス

ブロックリファレンスは[`src/block-definitions.json`](src/block-definitions.json)から生成しています。生成された部分は手で編集しないでください。ブロックの表示文言はTurboWarp上の英語表記のままです。

<!-- BEGIN GENERATED BLOCKS -->

### `define function [NAME] description [DESCRIPTION] args schema [SCHEMA] export as [EXPORT]`

名前を持つ関数を定義します。NAME、DESCRIPTION、SCHEMAには文字列を直接書く必要があります。export asをtoolにすると、AIのツール呼び出しなどの利用側に公開する印になります。

| 項目 | 値 |
|---|---|
| 種類 | ハット |
| Opcode | `defineFunction` |
| `NAME` | 文字列, 既定値: `add` |
| `DESCRIPTION` | 文字列, 既定値: `Adds two numbers.` |
| `SCHEMA` | 文字列, 既定値: `{"type":"object","properties":{"a":{"type":"number"},"b":{"type":"number"}},"required":["a","b"]}` |
| `EXPORT` | 文字列, 既定値: `none`, 選択肢: `none`, `tool` |

### `function argument [PATH]`

関数の中で、aやitems.0.nameのようなドット区切りのパスにある引数を返します。

| 項目 | 値 |
|---|---|
| 種類 | 値ブロック |
| Opcode | `functionArgument` |
| `PATH` | 文字列, 既定値: `a` |

### `function arguments JSON`

関数の中で、すべての引数をJSONテキストとして返します。

| 項目 | 値 |
|---|---|
| 種類 | 値ブロック |
| Opcode | `functionArgumentsJson` |

### `return [VALUE]`

関数の中で値を返し、スクリプトを終了します。JSONテキストはJSONとして、それ以外のテキストは文字列として返します。

| 項目 | 値 |
|---|---|
| 種類 | コマンド |
| Opcode | `returnValue` |
| `VALUE` | 文字列, 既定値: `0` |

### `call function [NAME] with [ARGS]`

関数を呼び出し、結果を待って返します。ARGSはJSONテキストで、args schemaで検査されます。少なくとも1フレームかかります。

| 項目 | 値 |
|---|---|
| 種類 | 値ブロック |
| Opcode | `callFunction` |
| `NAME` | 文字列, 既定値: `add` |
| `ARGS` | 文字列, 既定値: `{"a":1,"b":2}` |

### `start function [NAME] with [ARGS]`

関数を待たずに開始し、Promiseへの参照をJSONテキストで返します。

| 項目 | 値 |
|---|---|
| 種類 | 値ブロック |
| Opcode | `startFunction` |
| `NAME` | 文字列, 既定値: `add` |
| `ARGS` | 文字列, 既定値: `{"a":1,"b":2}` |

### `await [PROMISE]`

start functionが返したPromiseへの参照を待ち、その結果を返します。

| 項目 | 値 |
|---|---|
| 種類 | 値ブロック |
| Opcode | `awaitResult` |
| `PROMISE` | 文字列, 既定値: `{"$promise":"p_1"}` |

### `await all [PROMISES]`

Promiseへの参照のJSON配列をすべて待ち、結果のJSON配列を返します。失敗した呼び出しは{"$error": メッセージ}になります。

| 項目 | 値 |
|---|---|
| 種類 | 値ブロック |
| Opcode | `awaitAll` |
| `PROMISES` | 文字列, 既定値: `[]` |

### `[PROMISE] settled?`

開始した関数が終わったかを、待たずに返します。

| 項目 | 値 |
|---|---|
| 種類 | 真偽値ブロック |
| Opcode | `isSettled` |
| `PROMISE` | 文字列, 既定値: `{"$promise":"p_1"}` |

### `function [NAME] defined?`

この名前の正しいdefine functionハットがあるかを返します。

| 項目 | 値 |
|---|---|
| 種類 | 真偽値ブロック |
| Opcode | `isDefined` |
| `NAME` | 文字列, 既定値: `add` |

### `last function error`

直近の関数のエラーを返します。エラーがなければ空文字列を返します。

| 項目 | 値 |
|---|---|
| 種類 | 値ブロック |
| Opcode | `lastError` |

<!-- END GENERATED BLOCKS -->

## 重要な動作

| 状況 | 動作 |
|---|---|
| 呼び出しの開始 | すべての`define function`ハットが起動され、NAMEが一致したものだけが実行を続ける |
| かかる時間 | 関数は独立したスクリプトとして動くため、1回の呼び出しに少なくとも1フレームかかる。細かいループや再帰には独自ブロックを使う |
| 同じ関数を続けて呼んだ | 1つずつ順番に実行する。異なる関数は並行して実行する |
| 関数が直接または別の関数を経由して自分自身を呼んだ | `Reentrant call: a -> b -> a`というエラーで失敗する。再帰には独自ブロックを使う |
| 引数がスキーマに合わない | スクリプトを起動する前に失敗する。どの項目が合わないかは`last function error`でわかる |
| スクリプトが`return`なしで終わった | 結果は空（`null`）になる |
| 関数が30秒以内に終わらない | タイムアウトで失敗する |
| `start function`で同時に9個以上開始した | 空きが出るまで待つ（同時に実行するのは8個まで） |
| プロジェクトの停止 | 実行中の呼び出しは失敗し、Promiseへの参照は消去される |
| `define function`ハットが不正（文字列の直書きでない、スキーマが不正、名前の重複） | 関数は定義されない。`function [NAME] defined?`はfalseを返す |

## Composition API

Composition APIをimportしても、単独のTurboWarp機能拡張は登録されません。利用する側の拡張が自分のブロックと`define function`ハットのopcodeを持ち、ハットの条件判定と、引数・戻り値のブロックの処理をこのAPIに渡します。使い方は[英語版README](README.md#composition-api)を参照してください。

## 開発

Node.js 22.18.0以上と、`packageManager`で指定したpnpmを使います。

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm check
```

本物のTurboWarp VMをブラウザなしで動かす結合テストも実行する場合：

```bash
SCRATCH_VM_PATH=/path/to/TurboWarp/scratch-vm pnpm test
```

## ライセンス

[Mozilla Public License 2.0](LICENSE) (SPDX: `MPL-2.0`).
