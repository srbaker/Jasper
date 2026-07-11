// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

// The Astro Starlight site that renders the living-documentation manual.
// Feature pages under src/content/docs/features are GENERATED from the Cucumber
// JSON by `npm run generate`; everything else here is authored.
export default defineConfig({
  integrations: [
    starlight({
      title: 'Jasper — Living Documentation',
      description:
        'The GemStone/S development environment for VS Code, documented by its own acceptance tests.',
      customCss: ['./src/styles/manual.css'],
      pagination: false,
      sidebar: [
        { label: 'Introduction', link: '/' },
        { label: 'Features', items: [{ autogenerate: { directory: 'features' } }] },
      ],
    }),
  ],
});
