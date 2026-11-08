# CLAUDE.md

埼玉大学 生命適応科学研究室の公式サイト。Astro製の静的サイトで、GitHub Pages（d-takahashi-lab/d-takahashi-lab.github.io）で公開している。ChatGPT・Claudeアプリで開発してきたものを引き継いだ。

## 公開・ドメイン

- main へのpushで [.github/workflows/deploy.yml](.github/workflows/deploy.yml) が `npm run check` → `npm run build` → Pages へデプロイ（数分〜10分）。毎日0:05（日本時間）にも自動で再ビルドし、日付が来た予約投稿の News を掲載する（未来の日付の記事は [src/data/news.ts](src/data/news.ts) でビルド時に除外）。
- `SITE_URL` / `BASE_PATH` はActionsが設定する（[astro.config.mjs](astro.config.mjs)）。`trailingSlash: 'always'`。内部リンクは `import.meta.env.BASE_URL` と `pageUrl()`（[src/lib/i18n.ts](src/lib/i18n.ts)）で組み立て、絶対パスを直書きしない。
- 独自ドメイン www.adaptationbiology.com で公開中（2026-11-07 に切り替え）。ドメインの取得・更新とDNSはWixで管理（A: 185.199.108–111.153、CNAME www → d-takahashi-lab.github.io）。ドメインはWixで毎年更新が必要（次回 2027-04-03）。旧サイト（Wix製）の内容を移行した照合記録は [docs/content-audit.md](docs/content-audit.md)。

## コマンド

- `npm run dev`：ローカル確認
- `npm run check`：型・テンプレート検査（CIでも実行。push前に通す）
- `npm run build`：本番ビルド。prebuild で News 用画像の整理と /admin/ の生成を行う
- `npm run news`：ローカル版の News 編集画面（127.0.0.1:4322）
- `node --test tests/`：News投稿画面のGitHub連携のテスト

## 構成

- `src/pages/`：ルーティングのみ。日本語は `src/pages/*.astro`、英語は [src/pages/en/[...page].astro](src/pages/en/[...page].astro) がまとめて生成。各ページは `src/components/screens/` の画面に `lang` を渡すだけ。
- `src/components/screens/`：各ページの本体（Home / News / Research / Members / Publications / Contact）。日英共通のテンプレートで、表示文言は `choose(lang, ja, en)` で切り替える。
- `src/data/`：本文データ。日本語版（`*.ts`）と英語版（`*.en.ts`）が対になっている。
  - 研究紹介 `research.ts` / `research.en.ts`、メンバー `members.ts` / `members.en.ts`、トップ等の文言 `content.ts`、スライドショー `slides.ts`
  - 英語版は日本語版を import し、訳文だけを上書きする形が多い。日本語側の項目を増減したら英語側の対応も確認する。
  - 業績 `publications.json`、ニュース `news.json` は1ファイルに日英両方を持つ（news は `ja` / `en` フィールド）。
- `site-public/`：公開する画像・動画（`publicDir`）。
  - `site-public/admin/` と `site-public/images/news/` は prebuild で生成・整理されるので手で編集しない。
- `public/`：元写真・元動画の置き場（非公開）。ここから縮小・変換して `site-public/` に置く。`public/` 全体を gitignore で除外している。
- `work/`, `outputs/`：作業用スクリプト・画像（gitignore済み）。`.news-editor/` はローカル編集画面のバックアップ（gitignore済み）。
- `scripts/news-editor/`：News投稿画面。公開サイトの `/admin/` で、研究室メンバーがブラウザから GitHub API 経由で `news.json`（と画像）を main に直接コミットする。
- `src/pages/designs/`, `src/pages/logos.astro`：デザイン・ロゴ検討時の比較ページ（過去の検討案。本体のデザイン基準には含めない）。
- `docs/design-system.md`：デザインの基準。

## ルール

### 作業の進め方
- News投稿画面からも main に直接コミットされるので、作業前に必ず `git pull` する。
- 変更は必ず日本語版と英語版の両方に反映する。
- コミットメッセージは日本語で「対象: 内容」の形式（例：「研究紹介: コマツナの画像を動画に置き換え」）。
- push はユーザーの確認を取ってから行う。

### GitHub Actions
- MacのGitHubトークンには workflow 権限がない。`.github/workflows/` を変更したコミットは push で拒否される。変更が必要なときは、変更後の内容をユーザーに渡し、ブラウザの GitHub で編集・コミットしてもらう（その後ローカルの同じ変更は破棄して pull する）。

### デザイン
- [docs/design-system.md](docs/design-system.md) に従う（書体・文字サイズ・配色・余白の段階・ヘッダー・スライドショーの挙動など）。
- 目指す雰囲気は SIGMA・東京都現代美術館（MOT）のサイトのような、写真と余白を生かした簡潔なもの。装飾を足すより削る方向で考える。

### 画像・動画
- 画像は WebP に変換し、EXIF（撮影機種・位置情報など）を消してから `site-public/` に置く。
- 教員写真は正方形（1000×1000）、学生写真は正方形（900×900）。
- 研究紹介の動画は `research.ts` の `video` / `poster` / `autoplay` で指定する（ファイルは `site-public/videos/`、ポスターは `site-public/images/`）。
- 図（SVG）は日英で別ファイル（`*-en.svg`）を用意する。
