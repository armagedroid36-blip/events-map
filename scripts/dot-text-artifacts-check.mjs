// Юнит-проверка нормализации текста карточки: невидимые символы и двойные пробелы.
// Синтетика + реальные карточки базы (кому чистка реально нужна).
import { cleanCardText, stripInvisible, squeezeSpaces, hasInvisible } from './text-safe.mjs';

let ok = 0;
let fail = 0;
function t(name, got, want) {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  if (g === w) { ok++; console.log(`  OK   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}\n       получено ${g}\n       ожидалось ${w}`); }
}

console.log('--- синтетика ---');
t('zero-width space в заголовке', cleanCardText('Симфония\u200b оркестра'), 'Симфония оркестра');
t('BOM в описании', cleanCardText('Google Maps\ufeff\nДалее'), 'Google Maps\nДалее');
t('двойной пробел в заголовке', cleanCardText('ORCHESTRA –  STARLIGHT 1'), 'ORCHESTRA – STARLIGHT 1');
t('двойной пробел в адресе', cleanCardText('Multi-functional Center  for Social Activities'), 'Multi-functional Center for Social Activities');
t('переносы строк сохраняются', cleanCardText('Когда: 11.10\nГде: пляж'), 'Когда: 11.10\nГде: пляж');
t('эмодзи ZWJ не разваливается', cleanCardText('Йога 🧘‍♀️ в Убуде'), 'Йога 🧘‍♀️ в Убуде');
t('эмодзи ZWJ цел побайтно', cleanCardText('🧘‍♀️').length, '🧘‍♀️'.length);
t('nbsp НЕ трогаем (типографика)', cleanCardText('Убуд,\u00a0Бали'), 'Убуд,\u00a0Бали');
t('пустая строка', cleanCardText(null), '');
t('мягкий перенос снят', stripInvisible('лимо\u00adнад'), 'лимонад');
t('hasInvisible: ZWSP есть', hasInvisible('a\u200bb'), true);
t('hasInvisible: ZWJ (эмодзи) не считается', hasInvisible('🧘‍♀️'), false);
t('squeezeSpaces: хвостовые пробелы строк', squeezeSpaces('a  \nbb '), 'a\nbb');

console.log(`\nсинтетика: OK ${ok} / FAIL ${fail}`);
process.exitCode = fail ? 1 : 0;
