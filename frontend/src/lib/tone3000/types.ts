export type GearType = 'amp' | 'full-rig' | 'ir' | 'pedal' | 'outboard';
export type Platform = 'nam' | 'ir' | 'aida-x' | 'aa-snapshot' | 'proteus';
export type SortOrder = 'best-match' | 'newest' | 'trending' | 'downloads-all-time';

export interface ToneUser {
  id:         string;
  username:   string;
  avatar_url: string;
  url:        string;
}

export interface Tone {
  id:              number;
  title:           string;
  gear:            GearType;
  platform:        Platform;
  description:     string;
  downloads_count: number;
  models_count:    number;
  user:            ToneUser;
  tags:            Array<{ id?: number; name?: string }>;
  images:          string[];
  url:             string;
  created_at:      string;
  updated_at:      string;
}

export interface Model {
  id:           number;
  tone_id:      number;
  download_url: string;
  file_name:    string;
}

export interface T3User {
  id:       string;
  username: string;
  email:    string;
}

export interface SearchParams {
  q?:         string;
  gears?:     GearType;
  platform?:  Platform;
  sort?:      SortOrder;
  page?:      number;
  page_size?: number;
}

export interface SearchResult {
  data:        Tone[];
  total:       number;
  page:        number;
  total_pages: number;
}
