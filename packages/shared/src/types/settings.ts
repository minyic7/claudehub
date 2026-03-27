export interface Settings {
  anthropicApiKey?: string;
  maxConcurrentTickets: number;
}

export interface SettingsResponse {
  anthropicApiKey?: string; // masked, last 4 chars only
  maxConcurrentTickets: number;
}

export interface UpdateSettingsInput {
  anthropicApiKey?: string;
  maxConcurrentTickets?: number;
}
