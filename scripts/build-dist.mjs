// 배포용 폴더 만들기: dist/popshot 에 실행에 필요한 파일만 복사 (테스트/개발 파일 제외)
// 사용: node scripts/build-dist.mjs  →  dist/popshot 폴더를 IIS 등 웹서버에 그대로 올리면 됨
import { cpSync, rmSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT = join(ROOT, 'dist', 'popshot');
const FILES = ['index.html', 'manifest.webmanifest', 'sw.js', 'web.config', 'css', 'js', 'vendor', 'icons'];

rmSync(join(ROOT, 'dist'), { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
for (const f of FILES) {
  if (!existsSync(join(ROOT, f))) throw new Error(`missing ${f}`);
  cpSync(join(ROOT, f), join(OUT, f), { recursive: true });
}
console.log(`dist ready: ${OUT}`);
