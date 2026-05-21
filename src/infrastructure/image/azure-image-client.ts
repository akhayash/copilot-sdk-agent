/**
 * Infrastructure Layer: Azure Foundry Image Generation Client
 *
 * Wraps the Azure OpenAI / Foundry image generation REST API for
 * `gpt-image-2` (and compatible deployments). Authentication uses
 * `DefaultAzureCredential` by default (Entra ID), with optional
 * API-key fallback for local development.
 *
 * Environment variables:
 *   AZURE_IMAGE_ENDPOINT   (required) e.g. https://my-foundry.openai.azure.com
 *   AZURE_IMAGE_DEPLOYMENT (default: gpt-image-2)
 *   AZURE_IMAGE_API_VERSION (default: 2025-04-01-preview)
 *   IMAGE_AUTH_MODE        (default: entra; or "key")
 *   AZURE_IMAGE_API_KEY    (required when IMAGE_AUTH_MODE=key)
 */

import type { TokenCredential } from '@azure/identity';

/**
 * Supported sizes for Azure OpenAI `gpt-image-1` / `gpt-image-2` deployments.
 * Note: DALL-E 3 sizes (`1792x1024`, `1024x1792`) are NOT accepted by gpt-image.
 */
export type ImageSize = '1024x1024' | '1536x1024' | '1024x1536';

export interface ImageGenerateOptions {
  size?: ImageSize;
  n?: number;
}

export interface GeneratedImage {
  data: Buffer;
  mimeType: 'image/png';
}

export interface ImageClient {
  generateImage(prompt: string, opts?: ImageGenerateOptions): Promise<GeneratedImage[]>;
}

interface ImageClientConfig {
  endpoint: string;
  deployment: string;
  apiVersion: string;
  authMode: 'entra' | 'key';
  apiKey?: string;
}

interface ImageGenerationResponse {
  data: Array<{ b64_json?: string; url?: string }>;
}

const TOKEN_SCOPE = 'https://cognitiveservices.azure.com/.default';
/** Refresh token slightly before expiry to avoid races. */
const TOKEN_REFRESH_BUFFER_MS = 60_000;

let cachedClient: ImageClient | null = null;
let cachedCredential: TokenCredential | null = null;
let cachedToken: { token: string; expiresOnTimestamp: number } | null = null;

function readConfig(): ImageClientConfig | null {
  const endpoint = process.env.AZURE_IMAGE_ENDPOINT;
  if (!endpoint) {
    return null;
  }
  const authMode = (process.env.IMAGE_AUTH_MODE ?? 'entra').toLowerCase() === 'key' ? 'key' : 'entra';
  return {
    endpoint: endpoint.replace(/\/$/, ''),
    deployment: process.env.AZURE_IMAGE_DEPLOYMENT ?? 'gpt-image-2',
    apiVersion: process.env.AZURE_IMAGE_API_VERSION ?? '2025-04-01-preview',
    authMode,
    apiKey: process.env.AZURE_IMAGE_API_KEY,
  };
}

async function getBearerToken(): Promise<string> {
  const now = Date.now();
  if (cachedToken && cachedToken.expiresOnTimestamp - TOKEN_REFRESH_BUFFER_MS > now) {
    return cachedToken.token;
  }
  if (!cachedCredential) {
    const { DefaultAzureCredential } = await import('@azure/identity');
    cachedCredential = new DefaultAzureCredential();
  }
  const result = await cachedCredential.getToken(TOKEN_SCOPE);
  if (!result) {
    throw new Error('Failed to acquire Azure bearer token for image generation');
  }
  cachedToken = { token: result.token, expiresOnTimestamp: result.expiresOnTimestamp };
  return result.token;
}

function buildClient(config: ImageClientConfig): ImageClient {
  const url =
    `${config.endpoint}/openai/deployments/${encodeURIComponent(config.deployment)}` +
    `/images/generations?api-version=${encodeURIComponent(config.apiVersion)}`;

  return {
    async generateImage(prompt, opts) {
      if (!prompt || prompt.trim().length === 0) {
        throw new Error('Image prompt must be a non-empty string');
      }
      const size: ImageSize = opts?.size ?? '1024x1024';
      const n = opts?.n ?? 1;

      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (config.authMode === 'key') {
        if (!config.apiKey) {
          throw new Error('AZURE_IMAGE_API_KEY is required when IMAGE_AUTH_MODE=key');
        }
        headers['api-key'] = config.apiKey;
      } else {
        const token = await getBearerToken();
        headers.Authorization = `Bearer ${token}`;
      }

      // NOTE: gpt-image-1 / gpt-image-2 do NOT accept `response_format`.
      // The API always returns `b64_json` for these models, so we must omit
      // the parameter to avoid "Unknown parameter" 400 errors.
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          prompt,
          size,
          n,
        }),
      });

      if (!response.ok) {
        const errorBody = await response.text().catch(() => '');
        throw new Error(
          `Azure image generation failed (${response.status} ${response.statusText}): ${errorBody.slice(0, 500)}`,
        );
      }

      const json = (await response.json()) as ImageGenerationResponse;
      if (!json.data || json.data.length === 0) {
        throw new Error('Azure image generation returned no data');
      }

      return json.data
        .filter((item): item is { b64_json: string } => typeof item.b64_json === 'string')
        .map((item) => ({
          data: Buffer.from(item.b64_json, 'base64'),
          mimeType: 'image/png' as const,
        }));
    },
  };
}

/**
 * Returns a singleton image client, or `null` when `AZURE_IMAGE_ENDPOINT`
 * is not configured. Callers should treat `null` as a graceful degradation
 * signal (image generation feature disabled).
 */
export function getImageClient(): ImageClient | null {
  if (cachedClient) {
    return cachedClient;
  }
  const config = readConfig();
  if (!config) {
    return null;
  }
  cachedClient = buildClient(config);
  return cachedClient;
}

/**
 * Convenience wrapper that throws if the client is not configured.
 * Prefer this in code paths that are only reachable when the feature is on.
 */
export async function generateImage(
  prompt: string,
  opts?: ImageGenerateOptions,
): Promise<GeneratedImage[]> {
  const client = getImageClient();
  if (!client) {
    throw new Error('Image generation is not configured. Set AZURE_IMAGE_ENDPOINT.');
  }
  return client.generateImage(prompt, opts);
}
