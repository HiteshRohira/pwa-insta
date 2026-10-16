import { chromium } from '@playwright/test';
import { readFile } from 'node:fs/promises';

// Keep install icons opaque; iOS applies its own home-screen corner mask.
const svg = await readFile('public/icon.svg', 'utf8');
const browser = await chromium.launch({ headless: true });
try {
  for (const [size, names] of [
    [180, ['apple-touch-icon', 'instagram-apple-touch-icon']],
    [192, ['icon-192', 'instagram-icon-192']],
    [512, ['icon-512', 'instagram-icon-512', 'instagram-app-icon']],
  ]) {
    const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
    await page.setContent(`<style>html,body{margin:0}svg{display:block;width:100vw;height:100vh}</style>${svg}`);
    for (const name of names) await page.screenshot({ path: `public/${name}.png` });
    await page.close();
  }
} finally {
  await browser.close();
}
