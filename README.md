# @dabeezor/alpha-design-wiki

Shared Starlight theme, components and project template for the Alpha Technology design wikis.
Each project keeps its wiki in `<repo>/wiki/`. Jenkins builds it into an nginx image.
The front nginx serves it at `http://10.10.10.10:3011/<slug>/`.
No build step: `.astro` and `.css` ship as source.

## Scaffold a wiki

1. Copy `template/` to `<repo>/wiki/`. From a checkout: `Copy-Item -Recurse template <repo>\wiki`.
2. In every file, replace `__SLUG__` (URL path, lowercase), `__TITLE__` (display name) and `__REPO__` (repo name).
3. Rename `gitignore` to `.gitignore`. npm does not ship a file with that name.
   Set the colours in `palette.json`.
4. Run `npm install`, commit `package-lock.json`, then run `npm run dev`.
5. Add the three stages from `jenkins/wiki-stages.groovy.txt` to the project Jenkinsfile.
   The deploy script runs from the pinned theme checkout. Do not copy it.

The Docker build copies `.env.example` to `.env`. This sets the Remark42 host and the site id.
Local `npm run dev` has no `.env`, so the comment box does not show.
To test comments locally, copy `.env.example` to `.env`.

`wiki/VERSION` is a label tag. `buildkit-publish.sh` needs it as `--version-file`.
The deploy tag is the first 12 characters of the git sha. Jenkins writes it to `wiki/public/version.txt` before the build.
Astro copies that file into the image as `/<slug>/version.txt`. The Komodo deploy step waits until that file shows the sha.
Nothing else may write `version.txt`.

## Palette contract

`palette.json` has two keys. `roles` is required. `swatches` is optional and shows on the brand page.

| Role | Use |
| --- | --- |
| `accent` | Links, buttons, active items |
| `accentText` | Text on an accent background |
| `bg` | Page background |
| `bgNav` | Header and sidebar background |
| `text` | Body text |
| `textMuted` | Secondary text |
| `line` | Hairline borders |

`paletteHead(palette)` writes them as `--palette-accent`, `--palette-accent-text`, `--palette-bg-nav` and so on.
It also sets `color-scheme` from the brightness of `bg`.
`theme.css` maps them to the Starlight `--sl-color-*` variables. Set `--palette-font` to change the font.
One palette gives one look. Light mode and dark mode both follow the palette.

## Components

Import from `@dabeezor/alpha-design-wiki/components`. Write paths without a leading slash. The components add the site base.

- `<PaletteSwatches swatches={palette.swatches} />`
- `<Wireframe src="wireframes/home.svg" caption="Home" width={390} />`
- `<Prototype src="prototypes/home.html" width={390} height={844} title="Home" />` (the HTML keeps its own palette)
- `<AudioClip src="audio/theme.mp3" caption="Main theme" />`
- `<Model3D src="models/hero.glb" poster="models/hero.png" alt="Hero" />`
- `<PlayCanvas id="123456" aspect="16/9" />`
- `<Gallery images={[{ src: 'a.png', alt: 'A', caption: 'First' }]} cols={3} />`

Put the files in the wiki `public/` folder. Components need a `.mdx` page.

## Comments

`overrides/Footer.astro` adds a Remark42 embed under every page.
It reads `PUBLIC_REMARK_HOST` and `PUBLIC_WIKI_SLUG` (the Remark42 `site_id`).
When `PUBLIC_REMARK_HOST` is not set, the embed is skipped.

## Bump the pin in a project

This repo is public. The template depends on the release tarball, so `npm ci` needs no git and no token inside `node:24-alpine`.

1. In `wiki/package.json`, change the tag in `https://github.com/dabeezor/alpha-design-wiki/archive/refs/tags/vX.Y.Z.tar.gz`.
2. Run `npm install` in `wiki/`. Commit `package.json` and `package-lock.json`.
3. Set `ALPHA_DESIGN_WIKI_REVISION` in the Jenkinsfile to the same tag.

## Deploy notes

- One-time Komodo setup: the `design-wiki` Stack must declare `tags/<slug>.env` in `additional_env_files`. Its compose service `<slug>` must use `${WIKI_<SLUG>_TAG}`.
- Jenkins credentials: `komodo-api-key` (Komodo API) and `github-dabeezor` (alpha-forge checkout).
- Two wikis that deploy at the same time can collide on the Stack. The deploy script waits for a running Update. A race that remains is accepted.
