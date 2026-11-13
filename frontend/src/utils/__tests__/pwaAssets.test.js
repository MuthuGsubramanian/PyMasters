import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = path.resolve(__dirname, '../../../..');
const FRONTEND_PUBLIC = path.join(REPO_ROOT, 'frontend/public');
const MOBILE_PUBLIC = path.join(REPO_ROOT, 'mobile-companion/public');
const ANDROID_RES = path.join(REPO_ROOT, 'android/app/src/main/res');

function readPngSize(filePath) {
  const buf = fs.readFileSync(filePath);
  expect(buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe(true);
  return {
    width: buf.readUInt32BE(16),
    height: buf.readUInt32BE(20),
    colorType: buf[25],
  };
}

describe('PWA, Service Worker & Android Launcher Icon integrity', () => {
  it('frontend and mobile-companion service workers bust v1 cache and fetch icons network-first', () => {
    const webSw = fs.readFileSync(path.join(FRONTEND_PUBLIC, 'sw.js'), 'utf8');
    const mobileSw = fs.readFileSync(path.join(MOBILE_PUBLIC, 'sw.js'), 'utf8');

    expect(webSw).toContain("const CACHE_NAME = 'pymasters-shell-v2'");
    expect(webSw).toContain('fetch(event.request)');
    expect(webSw).toMatch(/icon-\|favicon\\.\|logo/);
    expect(webSw).not.toMatch(/\/\\\.\(png\|svg\|woff2\?\)\$\/\.test/);

    expect(mobileSw).toContain("const CACHE_NAME = 'pymasters-pocket-v2'");
    expect(mobileSw).toContain('fetch(event.request)');
    expect(mobileSw).not.toMatch(/\/\\\.\(png\|svg\|css\|js\)\$\/\.test/);
  });

  it('all manifest icons exist on disk with declared PNG dimensions', () => {
    for (const dir of [FRONTEND_PUBLIC, MOBILE_PUBLIC]) {
      const manifestPath = path.join(dir, 'manifest.webmanifest');
      const raw = fs.readFileSync(manifestPath, 'utf8');
      expect(raw).not.toMatch(/Version\s*2|PyMasters\s*2/i);
      const manifest = JSON.parse(raw);
      expect(Array.isArray(manifest.icons)).toBe(true);
      expect(manifest.icons.length).toBeGreaterThanOrEqual(3);

      for (const icon of manifest.icons) {
        const iconFile = path.join(dir, icon.src.replace(/^\//, ''));
        expect(fs.existsSync(iconFile)).toBe(true);
        if (icon.type === 'image/png' && icon.sizes) {
          const [w, h] = icon.sizes.split('x').map(Number);
          const actual = readPngSize(iconFile);
          expect(actual.width).toBe(w);
          expect(actual.height).toBe(h);
        }
      }
    }
  });

  it('Android launcher mipmaps and splash_logo use RGBA/RGB PNGs at exact density dimensions', () => {
    const densities = {
      mdpi: [108, 48],
      hdpi: [162, 72],
      xhdpi: [216, 96],
      xxhdpi: [324, 144],
      xxxhdpi: [432, 192],
    };

    for (const [density, [fgDim, legDim]] of Object.entries(densities)) {
      const fg = readPngSize(path.join(ANDROID_RES, `mipmap-${density}/ic_launcher_foreground.png`));
      const sq = readPngSize(path.join(ANDROID_RES, `mipmap-${density}/ic_launcher.png`));
      const rnd = readPngSize(path.join(ANDROID_RES, `mipmap-${density}/ic_launcher_round.png`));

      expect(fg).toEqual({ width: fgDim, height: fgDim, colorType: 6 });
      expect(sq.width).toBe(legDim);
      expect(sq.height).toBe(legDim);
      expect(rnd.width).toBe(legDim);
      expect(rnd.height).toBe(legDim);
    }

    const splash = readPngSize(path.join(ANDROID_RES, 'drawable-nodpi/splash_logo.png'));
    expect(splash).toEqual({ width: 288, height: 288, colorType: 6 });
  });
});
