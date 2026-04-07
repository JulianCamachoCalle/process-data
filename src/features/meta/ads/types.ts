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
  ctr: number | null;
  cpc: number | null;
};

export type MetaAdsOverviewFilters = {
  accountId: string;
  dateFrom: string;
  dateTo: string;
};

export type MetaAdsOverviewPayload = {
  accounts: MetaAdAccountOption[];
  rows: MetaAdsReportingRow[];
};
