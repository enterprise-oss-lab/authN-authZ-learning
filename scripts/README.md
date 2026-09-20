# Scripts

`bootstrap-openfga.ts` は、OpenFGA の store と認可モデルを冪等に初期化する。実行はリポジトリルートで `pnpm bootstrap:openfga` を使う。

後続フェーズで Zitadel の初期化と、開発用データを再作成する `reset:demo` を追加する。
