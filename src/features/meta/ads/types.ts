export type MetaAdAccountOption = {
  business_id: string;
  name: string | null;
};

export type MetaAdsReportingRow = {
  insight_row_id: string;
  date_start: string;
  date_stop: string;
  account_business_id: string;
  account_name: string | null;
  account_status: string | null;
  campaign_business_id: string | null;
  campaign_name: string | null;
  campaign_status: string | null;
  campaign_effective_status: string | null;
  objective: string | null;
  adset_business_id: string | null;
  adset_name: string | null;
  adset_status: string | null;
  adset_effective_status: string | null;
  ad_business_id: string;
  ad_name: string | null;
  ad_status: string | null;
  ad_effective_status: string | null;
  creative_id: string | null;
  creative_name: string | null;
  object_story_id: string | null;
  effective_object_story_id: string | null;
  spend: number | null;
  impressions: number | null;
  reach: number | null;
  clicks: number | null;
  reactions: number | null;
  comments: number | null;
  shares: number | null;
  video_views: number | null;
  video_p25_views: number | null;
  video_p50_views: number | null;
  video_p75_views: number | null;
  video_p95_views: number | null;
  video_p100_views: number | null;
  ctr: number | null;
  cpc: number | null;
};

export type MetaAdsOverviewFilters = {
  accountId: string;
  campaignId: string;
  adId: string;
  dateFrom: string;
  dateTo: string;
};

export type MetaAdsOverviewPayload = {
  accounts: MetaAdAccountOption[];
  rows: MetaAdsReportingRow[];
  hourlyRows: MetaAdsHourlyRow[];
};

export type MetaAdsHourlyRow = {
  ad_business_id: string;
  date_start: string;
  hour_bucket: string;
  spend: number | null;
  impressions: number | null;
  reach: number | null;
  clicks: number | null;
  reactions: number | null;
  comments: number | null;
  shares: number | null;
  video_views: number | null;
  video_p25_views: number | null;
  video_p50_views: number | null;
  video_p75_views: number | null;
  video_p95_views: number | null;
  video_p100_views: number | null;
  ctr: number | null;
  cpc: number | null;
};

export type MetaAdAudienceBreakdownRow = {
  ad_business_id: string;
  date_start: string;
  date_stop: string;
  breakdown_type: 'age_gender' | 'country' | 'region' | 'publisher_platform' | 'device_platform';
  breakdown_value_1: string;
  breakdown_value_2: string;
  spend: number | null;
  impressions: number | null;
  reach: number | null;
  clicks: number | null;
  reactions: number | null;
  comments: number | null;
  shares: number | null;
  video_views: number | null;
  video_p25_views: number | null;
  video_p50_views: number | null;
  video_p75_views: number | null;
  video_p95_views: number | null;
  video_p100_views: number | null;
  ctr: number | null;
  cpc: number | null;
};

export type MetaSyncRunResourceSummary = {
  pages_fetched?: number;
  pulled?: number;
  upserted?: number;
  has_more?: boolean;
};

export type MetaSyncRunRow = {
  id: string;
  provider: string;
  resource: string;
  sync_type: string;
  account_business_id: string | null;
  started_at: string;
  finished_at: string | null;
  duration_ms: number | null;
  success: boolean | null;
  early_stop: Record<string, unknown> | null;
  totals: {
    pulled?: number;
    upserted?: number;
  } | null;
  resources: Record<string, MetaSyncRunResourceSummary> | null;
  request_params: Record<string, unknown> | null;
  error_message: string | null;
  created_at_db: string;
  updated_at_db: string;
};
