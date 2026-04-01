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

export const KOMMO_RESOURCES: KommoResourceUiConfig[] = [
  {
    key: 'leads',
    label: 'Leads',
    primaryKey: 'business_id',
    defaultSort: 'updated_at_db',
    sortColumns: ['updated_at_db', 'business_id', 'closed_at', 'price'],
  },
  {
    key: 'contacts',
    label: 'Contacts',
    primaryKey: 'business_id',
    defaultSort: 'updated_at',
    sortColumns: ['updated_at', 'business_id', 'name'],
  },
  {
    key: 'companies',
    label: 'Companies',
    primaryKey: 'business_id',
    defaultSort: 'updated_at',
    sortColumns: ['updated_at', 'business_id', 'name'],
  },
  {
    key: 'users',
    label: 'Users',
    primaryKey: 'business_id',
    defaultSort: 'business_id',
    sortColumns: ['business_id', 'name', 'email'],
  },
  {
    key: 'pipelines',
    label: 'Pipelines',
    primaryKey: 'business_id',
    defaultSort: 'updated_at',
    sortColumns: ['updated_at', 'business_id', 'name', 'sort'],
  },
  {
    key: 'tasks',
    label: 'Tasks',
    primaryKey: 'business_id',
    defaultSort: 'updated_at',
    sortColumns: ['updated_at', 'business_id', 'complete_till'],
  },
  {
    key: 'notes',
    label: 'Notes',
    primaryKey: 'stable_id',
    defaultSort: 'updated_at',
    sortColumns: ['updated_at', 'business_id', 'element_id'],
  },
  {
    key: 'events',
    label: 'Events',
    primaryKey: 'business_id',
    defaultSort: 'created_at',
    sortColumns: ['created_at', 'business_id'],
  },
  {
    key: 'catalogs',
    label: 'Catalogs',
    primaryKey: 'business_id',
    defaultSort: 'updated_at',
    sortColumns: ['updated_at', 'business_id', 'name'],
  },
  {
    key: 'unsorted',
    label: 'Unsorted',
    primaryKey: 'stable_id',
    defaultSort: 'updated_at',
    sortColumns: ['updated_at', 'business_id', 'original_creation_date'],
  },
  {
    key: 'sources',
    label: 'Sources',
    primaryKey: 'business_id',
    defaultSort: 'updated_at',
    sortColumns: ['updated_at', 'business_id', 'name'],
  },
  {
    key: 'tags',
    label: 'Tags',
    primaryKey: 'stable_id',
    defaultSort: 'business_id',
    sortColumns: ['business_id', 'name'],
  },
  {
    key: 'custom_fields',
    label: 'Custom Fields',
    primaryKey: 'stable_id',
    defaultSort: 'updated_at',
    sortColumns: ['updated_at', 'business_id', 'name', 'sort'],
  },
  {
    key: 'links',
    label: 'Links',
    primaryKey: 'stable_id',
    defaultSort: 'created_at',
    sortColumns: ['created_at', 'from_entity_id', 'to_entity_id'],
  },
];

export function getKommoResource(key: string | undefined) {
  if (!key) return null;
  return KOMMO_RESOURCES.find((r) => r.key === key) ?? null;
}
