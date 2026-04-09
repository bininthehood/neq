function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export const TMDB_API_KEY = requireEnv("TMDB_API_KEY");
export const OPENAI_API_KEY = requireEnv("OPENAI_API_KEY");
