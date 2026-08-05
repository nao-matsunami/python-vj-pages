# Python VJ Site

Python / Pillow / OpenCVで生成するVJ素材のサンプルを公開する静的サイトです。

This is an offline-generation pipeline frame. GitHub Pages shows a lightweight browser preview; saleable MP4 / alpha MOV masters should be generated on the Mac mini with fixed FPS.

## Run

```sh
python3 -m http.server 4224
```

Open `http://localhost:4224/`.

## Daily Publish

```sh
npm run daily:publish
```

## Offline Starter

```sh
python3 offline/generate_preview.py
```
