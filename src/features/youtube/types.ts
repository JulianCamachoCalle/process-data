export type YoutubeChannelRow = {
  business_id: string;
  title: string | null;
  description: string | null;
  custom_url: string | null;
  published_at: string | null;
  thumbnail_url: string | null;
  uploads_playlist_id: string | null;
  subscriber_count: number;
  video_count: number;
  view_count: number;
  last_synced_at: string;
};

export type YoutubeVideoRow = {
  business_id: string;
  channel_business_id: string;
  title: string | null;
  description: string | null;
  published_at: string | null;
  thumbnail_url: string | null;
  duration_iso8601: string | null;
  definition: string | null;
  caption_status: string | null;
  licensed_content: boolean;
  tags: string[];
  view_count: number;
  like_count: number;
  comment_count: number;
  last_synced_at: string;
};

export type YoutubeChannelDemographicDailyRow = {
  channel_business_id: string;
  stat_date: string;
  age_group: string;
  gender: string;
  views: number;
  viewer_percentage: number;
  estimated_minutes_watched: number;
};

export type YoutubeChannelAudienceBreakdownDailyRow = {
  channel_business_id: string;
  stat_date: string;
  dimension_type: 'country' | 'deviceType' | 'subscribedStatus' | 'trafficSourceType' | 'playbackLocationType';
  dimension_value: string;
  views: number;
  estimated_minutes_watched: number;
  average_view_duration: number;
};

export type YoutubeVideoDailyStatsRow = {
  video_business_id: string;
  channel_business_id: string;
  stat_date: string;
  views: number;
  likes: number;
  comments: number;
  estimated_minutes_watched: number;
  average_view_duration: number;
};

export type YoutubeAnalyticsPayload = {
  channels: YoutubeChannelRow[];
  videos: YoutubeVideoRow[];
  demographicsDaily: YoutubeChannelDemographicDailyRow[];
  audienceBreakdownsDaily: YoutubeChannelAudienceBreakdownDailyRow[];
  videoDailyStats: YoutubeVideoDailyStatsRow[];
  previousVideoDailyStats: YoutubeVideoDailyStatsRow[];
  previousPeriod: {
    dateFrom: string;
    dateTo: string;
  } | null;
};
