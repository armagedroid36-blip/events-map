-- Категория «Театры и шоу» для постоянных театральных представлений
-- (collect-shows/collect-theatres). Категории динамические (читаются из БД),
-- после вставки появятся в фильтрах карты и форме автоматически.
insert into categories (id, name_ru, name_en, emoji)
values ('theatre', 'Театры и шоу', 'Theatres & Shows', '🎭')
on conflict (id) do nothing;

-- Существующие театральные события (собраны до появления категории) переводим
-- в новую категорию: VinWonders (Tata/Once), Danang Fantasticity (Charming
-- Danang, Ao Dai), театры Убуда/Улувату/Нячанга (collect-theatres).
update events set category_id = 'theatre'
where status in ('active', 'moderation')
  and (
    website like '%vinwonders.com%'
    or website like '%danangfantasticity.com%'
    or website like '%ubudcenter.com%'
    or website like '%dotheatre.vn%'
    or website like '%uluwatutemple.id%'
  );
