export type KommoResourceKey =
  | 'leads'
  | 'contacts'
  | 'companies'
  | 'users'
  | 'pipelines'
  | 'tasks'
  | 'notes'
  | 'events'
  | 'catalogs'
  | 'unsorted'
  | 'sources'
  | 'tags'
  | 'custom_fields'
  | 'links';

export type KommoResourceUiConfig = {
  key: KommoResourceKey;
  label: string;
  defaultSort: string;
  sortColumns: string[];
  primaryKey: 'business_id' | 'stable_id';
};

export type KommoResourceDataConfig = KommoResourceUiConfig & {
  table: string;
  listColumns: string[];
  searchColumns: string[];
  columnLabels?: Record<string, string>;
};

const DEFAULT_COLUMN_LABELS: Record<string, string> = {
  stable_id: 'Stable ID',
  business_id: 'ID',
  name: 'Nombre',
  first_name: 'Nombre',
  last_name: 'Apellido',
  email: 'Email',
  lang: 'Idioma',
  status: 'Estado',
  status_id: 'ID Estado',
  note_type: 'Tipo de nota',
  element_type: 'Tipo de elemento',
  element_id: 'ID elemento',
  entity_type: 'Tipo de entidad',
  entity_id: 'ID entidad',
  from_entity_type: 'Desde tipo',
  from_entity_id: 'Desde ID',
  to_entity_type: 'Hacia tipo',
  to_entity_id: 'Hacia ID',
  link_type: 'Tipo de vínculo',
  type: 'Tipo',
  catalog_type: 'Tipo de catálogo',
  field_type: 'Tipo de campo',
  code: 'Código',
  color: 'Color',
  price: 'Precio',
  sort: 'Orden',
  sort_by: 'Orden',
  is_main: 'Principal',
  is_archive: 'Archivado',
  is_unsorted_on: 'No clasificado activo',
  is_deleted: 'Eliminado',
  is_admin: 'Admin',
  is_active: 'Activo',
  is_completed: 'Completada',
  is_default: 'Por defecto',
  pipeline_id: 'ID Pipeline',
  source_id: 'ID Fuente',
  responsible_user_id: 'ID Responsable',
  task_type_id: 'ID Tipo tarea',
  complete_till: 'Completar antes',
  closed_at: 'Cerrado',
  closest_task_at: 'Próxima tarea',
  original_creation_date: 'Creación original',
  created_at: 'Creado',
  updated_at: 'Actualizado',
  created_at_db: 'Creado (DB)',
  updated_at_db: 'Actualizado (DB)',
  body: 'Contenido',
  text: 'Texto',
  origin_code: 'Origen',
  external_id: 'ID externo',
};

export const KOMMO_RESOURCES: KommoResourceDataConfig[] = [
  {
    key: 'leads',
    label: 'Leads',
    table: 'kommo_leads',
    primaryKey: 'business_id',
    defaultSort: 'updated_at_db',
    listColumns: [
      'business_id',
      'name',
      'price',
      'status_id',
      'pipeline_id',
      'responsible_user_id',
      'closed_at',
      'closest_task_at',
      'is_deleted',
      'updated_at_db',
    ],
    sortColumns: ['updated_at_db', 'business_id', 'closed_at', 'price'],
    searchColumns: ['name'],
  },
  {
    key: 'contacts',
    label: 'Contacts',
    table: 'kommo_contacts',
    primaryKey: 'business_id',
    defaultSort: 'updated_at',
    listColumns: [
      'business_id',
      'name',
      'first_name',
      'last_name',
      'responsible_user_id',
      'group_id',
      'is_deleted',
      'is_unsorted',
      'updated_at',
    ],
    sortColumns: ['updated_at', 'business_id', 'name'],
    searchColumns: ['name', 'first_name', 'last_name'],
  },
  {
    key: 'companies',
    label: 'Companies',
    table: 'kommo_companies',
    primaryKey: 'business_id',
    defaultSort: 'updated_at',
    listColumns: ['business_id', 'name', 'responsible_user_id', 'group_id', 'is_deleted', 'updated_at'],
    sortColumns: ['updated_at', 'business_id', 'name'],
    searchColumns: ['name'],
  },
  {
    key: 'users',
    label: 'Users',
    table: 'kommo_users',
    primaryKey: 'business_id',
    defaultSort: 'business_id',
    listColumns: ['business_id', 'name', 'email', 'lang', 'is_admin', 'is_active'],
    sortColumns: ['business_id', 'name', 'email'],
    searchColumns: ['name', 'email'],
  },
  {
    key: 'pipelines',
    label: 'Pipelines',
    table: 'kommo_pipelines',
    primaryKey: 'business_id',
    defaultSort: 'updated_at_db',
    listColumns: ['business_id', 'name', 'sort', 'is_main', 'is_unsorted_on', 'is_archive', 'updated_at_db'],
    sortColumns: ['updated_at_db', 'business_id', 'name', 'sort'],
    searchColumns: ['name'],
  },
  {
    key: 'tasks',
    label: 'Tasks',
    table: 'kommo_tasks',
    primaryKey: 'business_id',
    defaultSort: 'updated_at_db',
    listColumns: [
      'business_id',
      'name',
      'status',
      'task_type_id',
      'responsible_user_id',
      'is_completed',
      'complete_till',
      'updated_at_db',
    ],
    sortColumns: ['updated_at_db', 'business_id', 'complete_till'],
    searchColumns: ['name', 'text', 'status'],
  },
  {
    key: 'notes',
    label: 'Notes',
    table: 'kommo_notes',
    primaryKey: 'stable_id',
    defaultSort: 'updated_at_db',
    listColumns: ['stable_id', 'business_id', 'note_type', 'element_type', 'element_id', 'created_by', 'updated_at_db'],
    sortColumns: ['updated_at_db', 'business_id', 'element_id'],
    searchColumns: ['note_type', 'body', 'element_type'],
  },
  {
    key: 'events',
    label: 'Events',
    table: 'kommo_events',
    primaryKey: 'business_id',
    defaultSort: 'created_at',
    listColumns: ['business_id', 'type', 'entity_type', 'entity_id', 'user_id', 'user_name', 'created_at'],
    sortColumns: ['created_at', 'business_id'],
    searchColumns: ['type', 'entity_type', 'user_name'],
  },
  {
    key: 'catalogs',
    label: 'Catalogs',
    table: 'kommo_catalogs',
    primaryKey: 'business_id',
    defaultSort: 'updated_at_db',
    listColumns: ['business_id', 'name', 'catalog_type', 'sort_by', 'created_at', 'updated_at_db'],
    sortColumns: ['updated_at_db', 'business_id', 'name', 'sort_by'],
    searchColumns: ['name', 'catalog_type'],
  },
  {
    key: 'unsorted',
    label: 'Unsorted',
    table: 'kommo_unsorted_leads',
    primaryKey: 'stable_id',
    defaultSort: 'updated_at_db',
    listColumns: [
      'stable_id',
      'business_id',
      'name',
      'pipeline_id',
      'status_id',
      'source_id',
      'original_creation_date',
      'updated_at_db',
    ],
    sortColumns: ['updated_at_db', 'business_id', 'original_creation_date'],
    searchColumns: ['name'],
  },
  {
    key: 'sources',
    label: 'Sources',
    table: 'kommo_sources',
    primaryKey: 'business_id',
    defaultSort: 'updated_at_db',
    listColumns: ['business_id', 'name', 'pipeline_id', 'external_id', 'is_default', 'origin_code', 'updated_at_db'],
    sortColumns: ['updated_at_db', 'business_id', 'name', 'pipeline_id'],
    searchColumns: ['name', 'external_id', 'origin_code'],
  },
  {
    key: 'tags',
    label: 'Tags',
    table: 'kommo_tags',
    primaryKey: 'stable_id',
    defaultSort: 'business_id',
    listColumns: ['stable_id', 'business_id', 'name', 'color', 'entity_type', 'updated_at_db'],
    sortColumns: ['business_id', 'name', 'updated_at_db'],
    searchColumns: ['name', 'entity_type'],
  },
  {
    key: 'custom_fields',
    label: 'Custom Fields',
    table: 'kommo_custom_fields',
    primaryKey: 'stable_id',
    defaultSort: 'updated_at_db',
    listColumns: ['stable_id', 'business_id', 'entity_type', 'name', 'code', 'field_type', 'sort', 'updated_at_db'],
    sortColumns: ['updated_at_db', 'business_id', 'name', 'sort'],
    searchColumns: ['name', 'code', 'entity_type', 'field_type'],
  },
  {
    key: 'links',
    label: 'Links',
    table: 'kommo_links',
    primaryKey: 'stable_id',
    defaultSort: 'created_at',
    listColumns: ['stable_id', 'from_entity_type', 'from_entity_id', 'to_entity_type', 'to_entity_id', 'link_type', 'created_at'],
    sortColumns: ['created_at', 'from_entity_id', 'to_entity_id'],
    searchColumns: ['from_entity_type', 'to_entity_type', 'link_type'],
  },
];

export const KOMMO_RESOURCE_CONFIG: Record<KommoResourceKey, KommoResourceDataConfig> = Object.fromEntries(
  KOMMO_RESOURCES.map((resource) => [resource.key, resource]),
) as Record<KommoResourceKey, KommoResourceDataConfig>;

function toLabelCase(raw: string) {
  if (!raw) return raw;
  const spaced = raw.replaceAll('_', ' ').trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export function getKommoColumnLabel(resourceKey: KommoResourceKey, column: string) {
  const resource = KOMMO_RESOURCE_CONFIG[resourceKey];
  const custom = resource?.columnLabels?.[column];
  if (custom) return custom;
  return DEFAULT_COLUMN_LABELS[column] ?? toLabelCase(column);
}

export function getKommoResource(key: string | undefined) {
  if (!key) return null;
  const normalized = key.trim().toLowerCase();
  return KOMMO_RESOURCES.find((r) => r.key === normalized) ?? null;
}
