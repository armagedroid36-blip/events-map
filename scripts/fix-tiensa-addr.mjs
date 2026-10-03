// Проверенные данные Tiên Sa Show (e92095ff): адрес со страницы источника,
// координаты — объект OSM amenity=theatre «Nhà hát Trưng Vương» (тот же адрес).
import { createClient } from '@supabase/supabase-js';
const db = createClient(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);
const id = 'e92095ff-cd72-43e0-822f-aff5da21c114';
const patch = {
  address: 'Nhà hát Trưng Vương (Tiên Sa Show), 86 Hùng Vương, Q. Hải Châu, Đà Nẵng',
  lat: 16.0688447,
  lng: 108.2207425,
  start_time: '20:00',
  end_time: '21:00',
  updated_at: new Date().toISOString(),
};
const { data, error } = await db.from('events').update(patch).eq('id', id).select('id,title,status,start_date,address,lat,lng,start_time,end_time').maybeSingle();
if (error) console.log('ERR', error.message);
else console.log(JSON.stringify(data));
