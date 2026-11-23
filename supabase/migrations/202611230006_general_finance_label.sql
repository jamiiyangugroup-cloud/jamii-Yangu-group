-- Keep the existing SUPER_FINANCE role key and assignments intact for data compatibility.
-- The user-facing name is General Finance to distinguish organization-wide oversight
-- from Regional Finance. Permissions remain controlled by the existing role grants.
update public.roles
set display_name='General Finance'
where role_key='SUPER_FINANCE';
