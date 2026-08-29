-- ============================================================
-- is_international: метка «артист международный (гастролирующий)».
-- Ставит LLM-детект в collect-bali.mjs для концертов/музыки
-- (типы Балифорума «Концерт», «Музыка», «Живая музыка»).
-- UI: бейдж на карточке события (EventCard).
-- ============================================================

alter table public.events add column if not exists is_international boolean not null default false;

comment on column public.events.is_international is
  'Международный (гастролирующий) артист — метка LLM для концертов и музыки';
