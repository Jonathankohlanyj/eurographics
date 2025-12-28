# Triangle Ink OBJ Viewer + Converter

A tiny offline web app (HTML + CSS + JS) that:
- loads an OBJ file
- triangulates faces
- renders it on a canvas (software 3D)
- exports to this custom format:
- online website: https://jonathankohlanyj.github.io/eurographics/

```
[[
v x y z
v x y z
...
f a b c
f a b c
...
]]
```

## How to use (GitHub Pages)
1. Create a new repo and upload these files.
2. In repo Settings -> Pages:
   - Source: Deploy from a branch
   - Branch: main
   - Folder: / (root)
3. Open the provided `github.io` URL.

## Controls
- Drag mouse: rotate model
- Wheel: zoom
- WASD or arrow keys: move camera
- Q/E: up/down
- R: reset view

## Notes
- Triangle limit defaults to 600 for performance.
- "Enable colors" toggles per-triangle palette coloring.
