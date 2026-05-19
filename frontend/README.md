# SwarmCam Frontend

React + TypeScript frontend for SwarmCam. This app is built separately from the legacy `dashboard/` archive.

## Commands

- Install: `corepack pnpm install`
- Dev server: `corepack pnpm dev`
- Lint: `corepack pnpm run lint`
- Build: `corepack pnpm run build`

Production/Docker builds must use `pnpm install --frozen-lockfile` and serve only the built `dist` files.
