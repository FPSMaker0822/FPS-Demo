// 모든 화면 문구(한국어)에 영어 번역이 있는지 검사
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { hasTranslation, t, setLang } from '../js/i18n.js';

const HANGUL = /[가-힣]/;

function collectKeys() {
  const keys = new Set();
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  for (const m of html.matchAll(/<([a-z0-9]+)[^>]*\bdata-i18n\b[^>]*>([\s\S]*?)<\/\1>/g)) {
    const k = m[2].replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim().replace(/\s+/g, ' ');
    if (HANGUL.test(k)) keys.add(k);
  }
  const dir = new URL('../js/', import.meta.url);
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.js') || f === 'i18n.js') continue;
    const src = readFileSync(new URL(f, dir), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split('\n')
      .map((l) => l.replace(/(^|[^:'"`])\/\/.*$/, '$1'))
      .join('\n');
    for (const m of src.matchAll(/'((?:[^'\\\n]|\\.)*)'/g)) if (HANGUL.test(m[1])) keys.add(m[1]);
  }
  return [...keys];
}

test('every Korean UI string has an English translation', () => {
  const missing = collectKeys().filter((k) => !hasTranslation(k, 'en'));
  assert.deepEqual(missing, []);
});

test('t() substitutes variables in both languages', () => {
  setLang('ko');
  assert.equal(t('최고 {n}', { n: 100 }), '최고 100');
  setLang('en');
  assert.equal(t('최고 {n}', { n: 100 }), 'Best 100');
  assert.equal(t('unknown key {x}', { x: 1 }), 'unknown key 1');
  setLang('ko');
});
