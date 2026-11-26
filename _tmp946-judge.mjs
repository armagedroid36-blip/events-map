// Временная живая приёмка правки промпта судьи (запуск 946). Удалить при уборке.
import { judgeEventWithReason } from './scripts/moderation-llm.mjs';

const cards = [
  { title: 'SUP', city: 'Легиан, Bali', category: 'lecture', description: '',
    address: 'Legian Kaja or Prama Sanur Beach, Bali, Rip Curl School of Surf Legian & Sanur', start_date: '2026-11-17' },
  { title: 'SURF', city: 'Легиан, Bali', category: 'lecture', description: '',
    address: 'Rip Curl School of Surf Legian, Bali', start_date: '2026-11-18' },
  { title: 'Ku De Ta', city: 'Семиньяк, Bali', category: 'lecture', description: '',
    address: 'Ku De Ta, Seminyak', start_date: '2026-11-16' },
  { title: 'Alpha Wolf Lodge', city: 'Табанан, Bali', category: 'lecture', description: '',
    address: 'Alpha Wolf Lodge, Nuanu Creative City, Beraban, Kediri, Tabanan', start_date: '2026-11-17' },
];

for (const c of cards) {
  try {
    const r = await judgeEventWithReason(c);
    console.log(`${c.title} -> ${r.verdict} | ${(r.reason || '').slice(0, 80)}`);
  } catch (e) {
    console.log(`${c.title} -> ОШИБКА ${e.message}`);
  }
}
