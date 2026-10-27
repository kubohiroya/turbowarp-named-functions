# TurboWarp-Named-Functions

<img src="assets/block-icon.svg" alt="" width="48" height="48">

[English](README.md) | [日本語](README.ja.md)

JSONの引数を受け取りJSONの結果を返す「名前を持つ関数」を定義するTurboWarp機能拡張です。スクリプトから名前で呼び出して結果を待つことも、いくつか開始しておいてあとでまとめて待つこともできます。ツールとして公開する印を付けると、AIのツール呼び出しなど、ほかの拡張から使えるようになります。

**利用ガイド:** [English](https://kubohiroya.github.io/turbowarp-named-functions/) | [日本語](https://kubohiroya.github.io/turbowarp-named-functions/ja/)

## 実行できるサンプル

[**TurboWarp Editorでデモを開く**](https://turbowarp.org/editor?project_url=https%3A%2F%2Fkubohiroya.github.io%2Fturbowarp-named-functions%2Fsamples%2Fcall-greeting-function.sb3) · [SB3をダウンロード](https://kubohiroya.github.io/turbowarp-named-functions/samples/call-greeting-function.sb3)

**Run without sandbox**を選んで**Allow**し、緑の旗を押します。
`defineFunction`で引数を受け、`functionArgument`・`returnValue`・`callFunction`で挨拶を返す。サンプルの元データと期待結果は[`samples/README.md`](samples/README.md)に記載しています。

`pnpm run samples:build`でSB3を再生成し、`pnpm run samples:check`で更新漏れと生成処理を確認します。

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
pnpm add --save-exact @kubohiroya/turbowarp-named-functions@0.3.0
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

### `define function [NAME] description [DESCRIPTION] args schema [SCHEMA] returns schema [RETURNS] export as [EXPORT]`

名前を持つ関数を定義します。NAME、DESCRIPTION、SCHEMAには文字列を直接書く必要があります。SCHEMAとRETURNSには、JSON Schema文字列、または`define schema`ハットの名前（Name@1.0.0の形でバージョン固定も可）を書けます。RETURNSは任意で、空欄なら戻り値を検証しません。

| 項目 | 値 |
|---|---|
| 種類 | ハット |
| Opcode | `defineFunction` |
| `NAME` | 文字列, 既定値: `add` |
| `DESCRIPTION` | 文字列, 既定値: `Adds two numbers.` |
| `SCHEMA` | 文字列, 既定値: `{"type":"object","properties":{"a":{"type":"number"},"b":{"type":"number"}},"required":["a","b"]}` |
| `RETURNS` | 文字列, 既定値: `` |
| `EXPORT` | 文字列, 既定値: `none`, 選択肢: `none`, `tool` |

### `define schema [NAME] version [VERSION]`

下に積まれたpropertyブロックから、名前付きJSON Schemaを宣言します。NAMEとVERSIONには文字列を直接書く必要があり、VERSIONは完全なSemVer値でなければなりません。この積み木は宣言として読まれるだけで実行されず、結果はSchema文字列と同じcanonical JSON Schemaになります。

| 項目 | 値 |
|---|---|
| 種類 | ハット |
| Opcode | `defineSchema` |
| `NAME` | 文字列, 既定値: `Player` |
| `VERSION` | 文字列, 既定値: `1.0.0` |

### `property [NAME] type [TYPE] [PRESENCE]`

`define schema`の積み木の中で、Schemaのプロパティを1つ宣言します。

| 項目 | 値 |
|---|---|
| 種類 | コマンド |
| Opcode | `schemaProperty` |
| `NAME` | 文字列, 既定値: `name` |
| `TYPE` | 文字列, 既定値: `string`, 選択肢: `string`, `number`, `integer`, `boolean`, `null`, `object`, `array`, `array of string`, `array of number`, `array of integer`, `array of boolean`, `array of object` |
| `PRESENCE` | 文字列, 既定値: `required`, 選択肢: `required`, `optional` |

### `property [NAME] schema [SCHEMA] [PRESENCE]`

別の名前付きSchemaに従う値を持つプロパティを宣言します。SCHEMAには`define schema`の名前を書き、Name@1.0.0の形でバージョンを固定できます。

| 項目 | 値 |
|---|---|
| 種類 | コマンド |
| Opcode | `schemaPropertySchema` |
| `NAME` | 文字列, 既定値: `profile` |
| `SCHEMA` | 文字列, 既定値: `Profile` |
| `PRESENCE` | 文字列, 既定値: `required`, 選択肢: `required`, `optional` |

### `property [NAME] array of schema [SCHEMA] [PRESENCE]`

項目が別の名前付きSchemaに従う配列を持つプロパティを宣言します。

| 項目 | 値 |
|---|---|
| 種類 | コマンド |
| Opcode | `schemaPropertyArraySchema` |
| `NAME` | 文字列, 既定値: `items` |
| `SCHEMA` | 文字列, 既定値: `Item` |
| `PRESENCE` | 文字列, 既定値: `optional`, 選択肢: `required`, `optional` |

### `limit [KEYWORD] to [VALUE]`

すぐ上で宣言したプロパティに制約を加えます。`minItems`と`maxItems`は配列そのものに、その他の制約は配列の各項目に適用されます。

| 項目 | 値 |
|---|---|
| 種類 | コマンド |
| Opcode | `schemaConstraint` |
| `KEYWORD` | 文字列, 既定値: `minimum`, 選択肢: `minimum`, `maximum`, `minLength`, `maxLength`, `minItems`, `maxItems` |
| `VALUE` | 数値, 既定値: `0` |

### `allowed values [VALUES]`

すぐ上で宣言したプロパティの値をenumに制限します。VALUESにはJSON配列、またはカンマ区切りの文字列を書きます。

| 項目 | 値 |
|---|---|
| 種類 | コマンド |
| Opcode | `schemaAllowedValues` |
| `VALUES` | 文字列, 既定値: `red, green, blue` |

### `allow undeclared properties [ALLOW]`

宣言していないプロパティをSchemaが受け入れるかどうかを設定します。省略した場合は、JSON Schemaと同じく受け入れます。

| 項目 | 値 |
|---|---|
| 種類 | コマンド |
| Opcode | `schemaAdditionalProperties` |
| `ALLOW` | 文字列, 既定値: `no`, 選択肢: `no`, `yes` |

### `schema [NAME] JSON`

`define schema`ハットが変換されたcanonical JSON Schemaを返します。未定義または不正な場合は空文字列を返します。

| 項目 | 値 |
|---|---|
| 種類 | 値ブロック |
| Opcode | `schemaJson` |
| `NAME` | 文字列, 既定値: `Player` |

### `schema [NAME] defined?`

その名前の正しい`define schema`ハットがあればtrueを返します。Name@1.0.0の形でバージョンを固定できます。

| 項目 | 値 |
|---|---|
| 種類 | 真偽値ブロック |
| Opcode | `isSchemaDefined` |
| `NAME` | 文字列, 既定値: `Player` |

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
| 戻り値がreturns schemaに合わない | 呼び出しが失敗し、`last function error`に期待型とJSON pathが表示される。`return`なしの終了も`null`として検証される |
| 関数が30秒以内に終わらない | タイムアウトで失敗する |
| `start function`で同時に9個以上開始した | 空きが出るまで待つ（同時に実行するのは8個まで） |
| プロジェクトの停止 | 実行中の呼び出しは失敗し、Promiseへの参照は消去される |
| `define function`ハットが不正（文字列の直書きでない、スキーマが不正、名前の重複） | 関数は定義されない。`function [NAME] defined?`はfalseを返す |

## ブロックでSchemaを組み立てる

Schemaは従来どおりJSON文字列で書けますし、ブロックで組み立てることもできます。`define schema`ハットの下にpropertyブロックを積むと、名前付きSchemaを宣言できます。

```text
define schema [Player] version [1.0.0]
  property [name] type [string] required
  property [score] type [number] required
  limit [minimum] to (0)
  property [tags] type [array of string] optional
```

この積み木は、文字列で書いた場合とまったく同じJSON Schemaへ変換されます。

```json
{
  "type": "object",
  "properties": {
    "name": {"type": "string"},
    "score": {"type": "number", "minimum": 0},
    "tags": {"type": "array", "items": {"type": "string"}}
  },
  "required": ["name", "score"]
}
```

`schema [NAME] JSON`はこのcanonical schemaを返すので、変換結果をプロジェクト上で確認できます。

`define schema`の積み木はスクリプトではなく宣言です。実行前に読み取られ、ハットは起動せず、積み木をクリックしても下のブロックは何もしません。読み取る項目はすべて文字列の直書きである必要があり、値ブロックを差し込んだ場合は評価せずにエラーとして報告します。

### 関数で名前付きSchemaを使う

`args schema`と`returns schema`には、JSON文字列のほかに`define schema`ハットの名前を書けます。`args schema [Player]`と書けば、上のSchemaで呼び出しを検証します。`Player@1.0.0`の形でバージョンを固定できます。JSONとして解釈できない文字列は名前として読むため、JSON文字列を使っている既存プロジェクトはそのまま動き、名前で指定した場合も文字列と同じ`validateAgainstSchema`のsubsetを通ります。

### どのブロックが何になるか

| ブロック | 変換結果 |
|---|---|
| `property [NAME] type [TYPE] [PRESENCE]` | その型のproperty。`required`なら`required`に追加します。 |
| `property [NAME] schema [SCHEMA] [PRESENCE]` | 名前付きSchemaをそのまま展開したproperty。 |
| `property [NAME] array of schema [SCHEMA] [PRESENCE]` | `{"type": "array", "items": <名前付きSchema>}`。 |
| `limit [KEYWORD] to (VALUE)` | すぐ上のpropertyへの`minimum`、`maximum`、`minLength`、`maxLength`、`minItems`、`maxItems`。 |
| `allowed values [VALUES]` | JSON配列またはカンマ区切りの一覧からの`enum`。 |
| `allow undeclared properties [ALLOW]` | `additionalProperties`。省略した場合は宣言していないpropertyを受け入れます。 |

`minItems`と`maxItems`は配列そのものを、その他の制約は配列の各項目を対象とします。したがって`array of number`に`limit minimum to 0`を付けると、各項目が0以上であることを要求します。`allowed values`の値は、propertyの宣言した型と一致している必要があります。

### Schemaの診断

読み取れないSchemaは、それを含むスプライトとブロックとともに報告され、未定義として扱われます。その場合`schema [NAME] defined?`はfalseを返し、他のSchemaはそのまま使えます。propertyの名前の重複、`name@version`の重複、propertyの上にない制約やallowed values、積み木に属さないブロック、未知のSchema名、参照の循環は、いずれも定義エラーです。複数バージョンがある名前をバージョン指定なしで参照した場合は、推測せずに曖昧として失敗し、未知のバージョンは別バージョンへfallbackせずに失敗します。

ブロックのmutation UIやネストSchemaの編集体験は別の作業です。ネストは現在、別の名前付きSchemaを参照する形で表現します。

### named dataとのSchema identity

named-dataが運ぶのはstructured valueの`{id, version}` identityだけです。IDは`^[a-z][a-z0-9.-]{0,127}$`に一致し、versionは完全なSemVerである必要があります。Schema catalogはconsumerが所有します。戻されたJSON値を検証する前にidentityと完全一致するSchemaを解決してください。IDやversionが見つからない場合は明示的に失敗し、別versionへfallbackしません。このpackage内でも`define schema`の名前は同じ`name@version` identityと完全SemVerの規則に従い、関数の引数と戻り値は、その名前と文字列形式のどちらからも得られるcanonical JSON Schemaを使います。対応subsetは`type`、`properties`、`required`、Boolean形式の`additionalProperties`、`items`、`enum`、`const`、`minimum`、`maximum`、`minLength`、`maxLength`、`minItems`、`maxItems`です。その他のkeywordは検証動作を追加しません。

## Composition API

Composition APIをimportしても、単独のTurboWarp機能拡張は登録されません。利用する側の拡張が自分のブロックと`define function`ハットのopcodeを持ち、ハットの条件判定と、引数・戻り値のブロックの処理をこのAPIに渡します。使い方は[英語版README](README.md#composition-api)を参照してください。

## 開発

Node.js 24以上と、`packageManager`で指定したpnpmを使います。

```bash
npm install --global corepack@latest
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

## 固定引数の編集フォーム（S3-4）

共通エディターの起動時フラグ `blockEditorFixedInputs` とDialogsがONのGUIでは、`defineFunction` の `EXPORT` だけを固定フォームとして登録します。旧GUI・フラグOFFでは追加登録を行いません。Schemaの正本は `schemas/block-editor-fixed-inputs.schema.json#/$defs/defineFunction/properties/EXPORT`、codecと登録は `src/fixed-input-editors.ts` です。既存raw値・未変更alias・未知enumは無操作保存で書き換えず、reporterを評価しません。明示変更だけを検査し、他の引数やブロック宣言、保存形式を変更しません。

HATの直付けEXPORT dropdownはnone/toolを保存値として使用します。NAME/DESCRIPTION/SCHEMA/RETURNSを編集・実行せず、関数探索・HAT開始・tool公開はフォームの検査から呼びません。

登録はoptional API（apiVersion:1）に限定し、RUNTIME_DISPOSED/明示disposeで解除します。起動フラグOFF＋再読込で従来経路へ切り戻せます。依存を戻す場合はmanifest/lock/実解決を一組で復旧します。npm公開や後続段階の動的候補は含みません。

Schemaが記述する契約の根拠は実getInfoの宣言と既存の純粋なruntime変換です。SchemaBundleのretrievalUriはこのローカル文書の識別子であり、URL配信済み・HTTP取得によるref解決を意味しません。Schemaは同梱文書だけでcompileします。

登録は拡張インスタンスの構築時に存在する任意の editor API を使用します。後からの API 追加や差し替えには自動追従しません。起動設定を変更した場合は GUI を再読み込みし、拡張インスタンスを再構築してください。
