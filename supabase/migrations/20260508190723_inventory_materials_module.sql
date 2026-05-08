-- Simple clinic inventory module: materials + stock movements.

create type public.inventory_movement_type as enum ('in', 'out', 'adjustment');

create table if not exists public.inventory_materials (
	id uuid primary key default gen_random_uuid(),
	clinic_id uuid not null references public.clinics(id) on delete cascade,
	created_by uuid not null references public.user_profiles(id) on delete restrict,
	name text not null,
	category text,
	unit text not null default 'un',
	sku text,
	current_quantity numeric(12,2) not null default 0,
	min_quantity numeric(12,2) not null default 0,
	ideal_quantity numeric(12,2),
	notes text,
	active boolean not null default true,
	metadata jsonb not null default '{}'::jsonb,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	constraint inventory_materials_name_not_blank check (length(trim(name)) > 0),
	constraint inventory_materials_unit_not_blank check (length(trim(unit)) > 0),
	constraint inventory_materials_current_quantity_non_negative check (current_quantity >= 0),
	constraint inventory_materials_min_quantity_non_negative check (min_quantity >= 0),
	constraint inventory_materials_ideal_quantity_non_negative check (ideal_quantity is null or ideal_quantity >= 0)
);

create index if not exists idx_inventory_materials_clinic_name
	on public.inventory_materials(clinic_id, name);

create index if not exists idx_inventory_materials_clinic_active
	on public.inventory_materials(clinic_id, active, name);

create index if not exists idx_inventory_materials_clinic_category
	on public.inventory_materials(clinic_id, category);

alter table public.inventory_materials enable row level security;

drop policy if exists "inventory_materials_select" on public.inventory_materials;
create policy "inventory_materials_select"
	on public.inventory_materials for select
	using (
		clinic_id = (select public.current_user_clinic_id())
		and (select public.current_user_role()) in ('admin', 'receptionist', 'professional')
	);

drop policy if exists "inventory_materials_insert" on public.inventory_materials;
create policy "inventory_materials_insert"
	on public.inventory_materials for insert
	with check (
		clinic_id = (select public.current_user_clinic_id())
		and created_by = (select auth.uid())
		and (select public.current_user_role()) in ('admin', 'receptionist', 'professional')
	);

drop policy if exists "inventory_materials_update" on public.inventory_materials;
create policy "inventory_materials_update"
	on public.inventory_materials for update
	using (
		clinic_id = (select public.current_user_clinic_id())
		and (select public.current_user_role()) in ('admin', 'receptionist', 'professional')
	)
	with check (
		clinic_id = (select public.current_user_clinic_id())
		and (select public.current_user_role()) in ('admin', 'receptionist', 'professional')
	);

drop policy if exists "inventory_materials_delete" on public.inventory_materials;
create policy "inventory_materials_delete"
	on public.inventory_materials for delete
	using (
		clinic_id = (select public.current_user_clinic_id())
		and (select public.current_user_role()) in ('admin', 'receptionist', 'professional')
	);

drop trigger if exists set_inventory_materials_updated_at on public.inventory_materials;
create trigger set_inventory_materials_updated_at
	before update on public.inventory_materials
	for each row execute function public.set_updated_at();

create table if not exists public.inventory_movements (
	id uuid primary key default gen_random_uuid(),
	clinic_id uuid not null references public.clinics(id) on delete cascade,
	material_id uuid not null references public.inventory_materials(id) on delete cascade,
	created_by uuid not null references public.user_profiles(id) on delete restrict,
	movement_type public.inventory_movement_type not null,
	quantity numeric(12,2) not null,
	previous_quantity numeric(12,2) not null default 0,
	resulting_quantity numeric(12,2) not null default 0,
	reason text,
	notes text,
	metadata jsonb not null default '{}'::jsonb,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	constraint inventory_movements_quantity_not_zero check (quantity <> 0)
);

create index if not exists idx_inventory_movements_material_created_at
	on public.inventory_movements(material_id, created_at desc);

create index if not exists idx_inventory_movements_clinic_created_at
	on public.inventory_movements(clinic_id, created_at desc);

alter table public.inventory_movements enable row level security;

drop policy if exists "inventory_movements_select" on public.inventory_movements;
create policy "inventory_movements_select"
	on public.inventory_movements for select
	using (
		clinic_id = (select public.current_user_clinic_id())
		and (select public.current_user_role()) in ('admin', 'receptionist', 'professional')
	);

drop policy if exists "inventory_movements_insert" on public.inventory_movements;
create policy "inventory_movements_insert"
	on public.inventory_movements for insert
	with check (
		clinic_id = (select public.current_user_clinic_id())
		and created_by = (select auth.uid())
		and (select public.current_user_role()) in ('admin', 'receptionist', 'professional')
	);

drop policy if exists "inventory_movements_update" on public.inventory_movements;
create policy "inventory_movements_update"
	on public.inventory_movements for update
	using (
		clinic_id = (select public.current_user_clinic_id())
		and (select public.current_user_role()) in ('admin', 'receptionist', 'professional')
	)
	with check (
		clinic_id = (select public.current_user_clinic_id())
		and (select public.current_user_role()) in ('admin', 'receptionist', 'professional')
	);

drop policy if exists "inventory_movements_delete" on public.inventory_movements;
create policy "inventory_movements_delete"
	on public.inventory_movements for delete
	using (
		clinic_id = (select public.current_user_clinic_id())
		and (select public.current_user_role()) in ('admin', 'receptionist', 'professional')
	);

drop trigger if exists set_inventory_movements_updated_at on public.inventory_movements;
create trigger set_inventory_movements_updated_at
	before update on public.inventory_movements
	for each row execute function public.set_updated_at();

create or replace function public.apply_inventory_movement()
returns trigger
language plpgsql
set search_path = public
as $$
declare
	material_row public.inventory_materials%rowtype;
	delta numeric(12,2);
	next_quantity numeric(12,2);
begin
	select *
		into material_row
		from public.inventory_materials
	 where id = new.material_id
		 and clinic_id = new.clinic_id
	 for update;

	if not found then
		raise exception 'inventory_material_not_found';
	end if;

	if new.movement_type = 'in' then
		delta := abs(new.quantity);
	elsif new.movement_type = 'out' then
		delta := -abs(new.quantity);
	else
		delta := new.quantity;
	end if;

	next_quantity := material_row.current_quantity + delta;

	if next_quantity < 0 then
		raise exception 'inventory_negative_stock';
	end if;

	new.previous_quantity := material_row.current_quantity;
	new.resulting_quantity := next_quantity;

	update public.inventory_materials
		 set current_quantity = next_quantity,
				 updated_at = now()
	 where id = material_row.id;

	return new;
end;
$$;

drop trigger if exists apply_inventory_movement_before_insert on public.inventory_movements;
create trigger apply_inventory_movement_before_insert
	before insert on public.inventory_movements
	for each row execute function public.apply_inventory_movement();

comment on column public.clinics.modules_enabled is
	'Active feature modules for this clinic. Values: rooms, staff, services, whatsapp, financial, insurance, inventory';
