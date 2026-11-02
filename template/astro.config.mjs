import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import { paletteHead } from '@dabeezor/alpha-design-wiki/palette';
import palette from './palette.json';

const dirs = [
  ['GDD', 'gdd'],
  ['UX', 'ux'],
  ['Wireframes', 'wireframes'],
  ['Story', 'story'],
  ['World', 'world'],
  ['Decisions', 'decisions'],
  ['Specs', 'specs'],
  ['Brand', 'brand'],
];

// PUBLIC_REMARK_HOST and PUBLIC_WIKI_SLUG come from .env (see .env.example).
// The Dockerfile copies .env.example to .env for the build. Local dev has no .env, so no comments.
export default defineConfig({
  site: 'http://10.10.10.10:3010',
  base: '/__SLUG__',
  integrations: [
    starlight({
      title: '__TITLE__',
      lastUpdated: true,
      customCss: ['@dabeezor/alpha-design-wiki/theme.css'],
      head: [paletteHead(palette)],
      components: { Footer: '@dabeezor/alpha-design-wiki/overrides/Footer.astro' },
      sidebar: dirs.map(([label, directory]) => ({ label, items: [{ autogenerate: { directory } }] })),
    }),
  ],
});
