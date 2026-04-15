import { createApiClient } from '@neko/core';
import { env } from './env';

const client = createApiClient(env.API_BASE_URL);

export const fetchRecommendations = client.fetchRecommendations;
export const searchTMDB = client.searchTMDB;

export type { RecommendRequest } from '@neko/core';
export type { SearchResult } from '@neko/core';
