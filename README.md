# ⚽ Formation Builder

A lightweight web app for laying out two soccer teams side-by-side and exporting the result as an image. Built with Vite + React.

## Features

- **Persistent squad** — build your roster once, save it to the browser, and just tick who's coming each day.
- **Free-form drag & drop** — drag players anywhere onto either team's half. Light alignment guides appear while dragging so rows/columns line up tidily.
- **Auto position labels** — each shirt's label (CB, CDM, LW, GK, …) is derived from where it sits on the pitch and updates as you move it. Click a shirt to override the label.
- **Team colors** — pick each team's jersey color from a dropdown.
- **Export** — save the two-team pitch view as a PNG.

## Develop

```bash
npm install
npm run dev      # start the dev server
npm run build    # production build to dist/
npm run preview  # preview the production build
```
