-- Migration: Add entity_type to kommo_tags
-- Run this first if the table already exists

-- 1. Add the new column (with default for existing rows)
alter table public.kommo_tags add column if not exists entity_type text not null default 'leads';

-- 2. Drop the old unique constraint on business_id alone
alter table public.kommo_tags drop constraint if exists kommo_tags_business_id_key;

-- 3. Add new unique constraint on (business_id, entity_type)
alter table public.kommo_tags add unique (business_id, entity_type);

-- 4. Update stable_id for existing records to include entity_type
update public.kommo_tags 
set stable_id = 'kommo-tag-leads-' || business_id::text
where stable_id = 'kommo-tag-' || business_id::text;

-- 5. Create index for entity_type queries
create index if not exists idx_kommo_tags_entity_type on public.kommo_tags (entity_type);