import { build } from 'esbuild';
import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import './verify-threeui.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
const vendor = path.join(root, 'vendor/threeui');
const source = await readFile(path.join(vendor, 'src/shaders/landing-pages/LandingPages.tsx'), 'utf8');
// Isolate the registered Sylva export from unrelated, unpublished page imports.
// The component body, frame, typography hook and recipes remain exact source.
const variants = source.match(/export const SYLVA_HERO_VARIANTS = [^\n]+/)[0];
const baseUrl = source.match(/const SYLVA_HERO_BASE_URL = [^\n]+/)[0];
const titles = source.slice(source.indexOf('const SYLVA_HERO_TITLES:'), source.indexOf('export function SylvaHero'));
const component = source.slice(source.indexOf('export function SylvaHero'));
if (!component.trimEnd().endsWith('}')) throw new Error('Unexpected registered component boundary.');
await mkdir(path.join(vendor, 'generated'), { recursive: true });
await writeFile(path.join(vendor, 'generated/SylvaHero.tsx'), `// Generated from verified registered source. Do not edit.\nimport { useMemo } from 'react';\nimport { LandingPageFrame, type LandingPageProps } from '../src/shaders/landing-pages/LandingPageFrame';\nimport { splitTypographyProps, usePageTypography, type PageTypographyProps } from '../src/shaders/landing-pages/pageTypography';\nimport { SYLVA_TYPOGRAPHY } from '../src/shaders/landing-pages/pageRecipes';\n${variants}\ntype SylvaHeroVariant = (typeof SYLVA_HERO_VARIANTS)[number];\ntype SylvaHeroProps = LandingPageProps & PageTypographyProps & { variant?: 'living-green' };\n${baseUrl}\n${titles}\nfunction buildSylvaHeroDocument(variant: string): never { throw new Error('Only the requested Living Green variant is vendored: ' + variant); }\n${component}`);
await mkdir(path.join(root, 'public/assets'), { recursive: true });
await build({ absWorkingDir: root, entryPoints: ['src/Scene.tsx'], bundle: true, minify: true, format: 'esm', jsx: 'automatic', target: ['es2022'], outfile: 'public/assets/scene.js', legalComments: 'linked', loader: { '.woff2': 'file' }, assetNames: '[name]-[hash]', alias: { '@designcodeio/threeui': path.join(vendor, 'generated/SylvaHero.tsx'), '@designcodeio/threeui/style.css': path.join(vendor, 'src/shaders/threeui.css') }, define: { 'process.env.NODE_ENV': '"production"' } });
await copyFile(path.join(root, 'src/page.html'), path.join(root, 'public/index.html'));
await copyFile(path.join(root, 'src/app.css'), path.join(root, 'public/styles.css'));
await copyFile(path.join(root, 'src/app.js'), path.join(root, 'public/app.js'));
console.log('Built the verified Sylva Living Green hero and Player Value interface.');
