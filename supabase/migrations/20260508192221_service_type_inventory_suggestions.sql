alter table public.service_types
	add column if not exists inventory_suggestions jsonb not null default '[]'::jsonb;

comment on column public.service_types.inventory_suggestions is
	'Suggested inventory consumption per service type. Array of objects: { materialId, quantity }';
