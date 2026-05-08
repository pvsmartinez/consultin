alter table public.clinics
	add column if not exists clinical_document_templates jsonb not null default '{}'::jsonb,
	add column if not exists clinical_document_signing jsonb not null default '{}'::jsonb;
