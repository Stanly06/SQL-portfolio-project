-- SOLO DESARROLLO LOCAL: usuarias de prueba para el modo AUTH_MODE=dev.
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000d1', 'kary@demo.local', '{"full_name":"Kary (dueña · demo)"}'),
  ('00000000-0000-0000-0000-0000000000d2', 'admin@demo.local', '{"full_name":"Administradora (demo)"}'),
  ('00000000-0000-0000-0000-0000000000d3', 'empleada@demo.local', '{"full_name":"Empleada (demo)"}')
on conflict do nothing;
update public.profiles set role = 'owner' where id = '00000000-0000-0000-0000-0000000000d1';
update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-0000000000d2';
update public.profiles set role = 'employee' where id = '00000000-0000-0000-0000-0000000000d3';
