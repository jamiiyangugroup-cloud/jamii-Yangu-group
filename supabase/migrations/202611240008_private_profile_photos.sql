-- Profile photos belong to an authenticated user and can exist before membership.
alter table public.private_documents
  drop constraint if exists private_documents_check;

alter table public.private_documents
  add constraint private_documents_owner_or_profile_photo_check check (
    (member_id is null) <> (application_id is null)
    or (category='PROFILE_PHOTO' and member_id is null and application_id is null)
  );
