do $migration$
declare
  function_definition text;
  updated_definition text;
  declarations_before text := $fragment$  media_record jsonb;$fragment$;
  declarations_after text := $fragment$  media_record jsonb;
  component_record jsonb;$fragment$;
  counters_before text := $fragment$  identifiers_created integer := 0;$fragment$;
  counters_after text := $fragment$  identifiers_created integer := 0;
  components_created integer := 0;$fragment$;
  candidate_validation_before text := $fragment$    or pg_catalog.jsonb_typeof(candidate_value -> 'media') <> 'array'$fragment$;
  candidate_validation_after text := $fragment$    or pg_catalog.jsonb_typeof(candidate_value -> 'components') <> 'array'
    or pg_catalog.jsonb_typeof(candidate_value -> 'media') <> 'array'$fragment$;
  failure_validation_before text := $fragment$    and failure_stage_value not in ('after_edition', 'after_identifiers', 'after_evidence')$fragment$;
  failure_validation_after text := $fragment$    and failure_stage_value not in (
      'after_edition',
      'after_identifiers',
      'after_evidence',
      'after_components'
    )$fragment$;
  component_loop text := $fragment$  for component_record in
    select value
    from pg_catalog.jsonb_array_elements(candidate_value -> 'components')
  loop
    if pg_catalog.jsonb_typeof(component_record) <> 'object'
      or component_record ->> 'componentKey' not in ('cartridge', 'box', 'manual')
      or component_record ->> 'kind' <> component_record ->> 'componentKey'
      or component_record ->> 'name' not in ('Cartridge', 'Box', 'Manual')
      or pg_catalog.jsonb_typeof(component_record -> 'requiredForComplete') <> 'boolean'
      or not (component_record ->> 'requiredForComplete')::boolean
      or (component_record ->> 'sortOrder') !~ '^[0-9]+$'
      or (
        component_record ->> 'componentKey' = 'cartridge'
        and (component_record ->> 'sortOrder')::integer <> 0
      )
      or (
        component_record ->> 'componentKey' = 'box'
        and (component_record ->> 'sortOrder')::integer <> 1
      )
      or (
        component_record ->> 'componentKey' = 'manual'
        and (component_record ->> 'sortOrder')::integer <> 2
      )
    then
      raise exception 'MobyGames Edition component evidence is invalid.' using errcode = '22023';
    end if;

    insert into public.edition_components (
      edition_id,
      component_key,
      name,
      kind,
      required_for_complete,
      sort_order
    )
    values (
      edition_id_value,
      component_record ->> 'componentKey',
      component_record ->> 'name',
      component_record ->> 'kind',
      (component_record ->> 'requiredForComplete')::boolean,
      (component_record ->> 'sortOrder')::integer
    )
    on conflict (edition_id, component_key) do nothing;

    get diagnostics row_count_value = row_count;
    components_created := components_created + row_count_value;
  end loop;

  if failure_stage_value = 'after_components' then
    raise exception 'Injected failure after Edition components.' using errcode = 'P0001';
  end if;

$fragment$;
  media_loop_marker text := $fragment$  for media_record in$fragment$;
  return_before text := $fragment$    'identifiersCreated', identifiers_created,$fragment$;
  return_after text := $fragment$    'identifiersCreated', identifiers_created,
    'componentsCreated', components_created,$fragment$;
begin
  select pg_catalog.pg_get_functiondef(
    'public.persist_mobygames_edition_candidate(uuid,uuid,jsonb,jsonb,uuid,text)'::regprocedure
  )
  into function_definition;

  updated_definition := pg_catalog.replace(
    function_definition,
    declarations_before,
    declarations_after
  );
  updated_definition := pg_catalog.replace(updated_definition, counters_before, counters_after);
  updated_definition := pg_catalog.replace(
    updated_definition,
    candidate_validation_before,
    candidate_validation_after
  );
  updated_definition := pg_catalog.replace(
    updated_definition,
    failure_validation_before,
    failure_validation_after
  );
  updated_definition := pg_catalog.replace(
    updated_definition,
    media_loop_marker,
    component_loop || media_loop_marker
  );
  updated_definition := pg_catalog.replace(updated_definition, return_before, return_after);

  if updated_definition = function_definition
    or pg_catalog.strpos(updated_definition, declarations_after) = 0
    or pg_catalog.strpos(updated_definition, counters_after) = 0
    or pg_catalog.strpos(updated_definition, candidate_validation_after) = 0
    or pg_catalog.strpos(updated_definition, failure_validation_after) = 0
    or pg_catalog.strpos(updated_definition, component_loop) = 0
    or pg_catalog.strpos(updated_definition, return_after) = 0
  then
    raise exception 'Could not apply the reviewed MobyGames Edition-component function delta.';
  end if;

  execute updated_definition;
end;
$migration$;

comment on function public.persist_mobygames_edition_candidate(
  uuid,
  uuid,
  jsonb,
  jsonb,
  uuid,
  text
) is
  'Atomically persists one provenance-scoped MobyGames Edition candidate, including explicitly evidenced physical components.';
