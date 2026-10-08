// Карточки из ленты с районами, которых нет в словаре сборщика: как они записаны в базе.
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';
const db = createClient(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE, { auth: { persistSession: false } });
const rows = await selectAll(db, 'events', 'id,status,city,title,start_date,lat,lng,address,website', {});
const slugs = ['fambula-haus-vecherinka-v-luna-beach-club-11-oktyabrya','jungle-of-the-damned-v-luna-beach-club-31-oktyabrya','meditativnaya-praktika-i-saund-bat-v-nuanu','umalas-comedy-show-v-milano-umalas-16-oktyabrya','maha-monster-bash-turnir-po-padelu-31-oktyabrya','vystuplenie-dj-gray-v-cretya-ubud-1','poet-not-dead-poeticheskiymuzykalnyy-open-mic-12','vstrecha-educate-bali-v-tenganane-17-oktyabrya','unikalnyy-vecher-klassicheskoy-muzyki','vecher-viktoriny-v-the-flow','chto-bylo-bali-improvizatsionnoe-shou','meditativnaya-praktika-i-saund-bat-v-nuanu'];
for (const s of slugs) {
  const hits = rows.filter(r => String(r.website || '').includes(s));
  if (!hits.length) { console.log(`НЕТ В БАЗЕ  ${s}`); continue; }
  for (const r of hits) console.log(`${r.id.slice(0,8)} [${r.status}] ${r.start_date} city="${r.city}" ${r.lat},${r.lng} addr="${String(r.address||'').slice(0,30)}" | ${String(r.title).slice(0,32)} | ${s.slice(0,28)}`);
}
