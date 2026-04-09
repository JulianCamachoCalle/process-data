export type MetaPageRow = {
  id: string;
  name: string | null;
  category: string | null;
  fan_count: number;
  followers_count: number;
  link: string | null;
  picture_url: string | null;
  has_page_token: boolean;
};

export type MetaPagePostRow = {
  id: string;
  page_id: string;
  page_name: string | null;
  message: string | null;
  created_time: string | null;
  permalink_url: string | null;
  full_picture: string | null;
  reactions: number;
  comments: number;
  shares: number;
};

export type MetaPageInsightRow = {
  page_id: string;
  page_name: string | null;
  metric: string;
  end_time: string | null;
  value: number;
};

export type MetaPagesErrorRow = {
  page_id: string;
  page_name: string | null;
  stage: 'posts' | 'insights';
  message: string;
};

export type MetaPagesPayload = {
  success: boolean;
  resource: 'pages';
  duration_ms: number;
  since: string;
  until: string;
  pages: MetaPageRow[];
  posts: MetaPagePostRow[];
  insights: MetaPageInsightRow[];
  errors: MetaPagesErrorRow[];
  permissions_hint: string[];
};
