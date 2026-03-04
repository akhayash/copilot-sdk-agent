/**
 * Infrastructure Layer: Copilot Client Singleton
 */

import { CopilotClient } from '@github/copilot-sdk';
import type { SessionConfig } from '@github/copilot-sdk';

let clientInstance: CopilotClient | null = null;

/**
 * Get or create Copilot SDK client singleton
 */
export async function getCopilotClient(): Promise<CopilotClient> {
  if (!clientInstance) {
    const token = process.env.GITHUB_TOKEN;
    clientInstance = new CopilotClient(
      token ? { githubToken: token } : undefined,
    );
  }
  return clientInstance;
}

/**
 * Session options for createSession()
 * Supports three paths: GitHub default, GitHub specific model, or Azure BYOM
 */
export async function getSessionOptions(opts?: { streaming?: boolean; model?: string }): Promise<Partial<SessionConfig>> {
  const provider = process.env.MODEL_PROVIDER;
  // Explicit model from request takes priority, then env var
  const modelName = opts?.model || process.env.MODEL_NAME;
  const streaming = opts?.streaming ?? false;

  // Path 1: GitHub default (no env vars)
  if (!provider && !modelName) {
    return { streaming };
  }

  // Path 2: GitHub specific model
  if (!provider) {
    return { model: modelName, streaming };
  }

  // Path 3: Azure BYOM
  if (provider === 'azure') {
    const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
    if (!endpoint || !modelName) {
      throw new Error('AZURE_OPENAI_ENDPOINT and MODEL_NAME are required when MODEL_PROVIDER is "azure"');
    }

    // Get Azure bearer token via DefaultAzureCredential
    const { DefaultAzureCredential } = await import('@azure/identity');
    const credential = new DefaultAzureCredential();
    const tokenResult = await credential.getToken('https://cognitiveservices.azure.com/.default');
    if (!tokenResult) {
      throw new Error('Failed to acquire Azure bearer token');
    }

    return {
      model: modelName,
      streaming,
      provider: {
        type: 'azure',
        baseUrl: endpoint.replace(/\/$/, ''),
        bearerToken: tokenResult.token,
        wireApi: 'responses',
        azure: { apiVersion: '2025-04-01-preview' },
      },
    };
  }

  throw new Error(`Unknown MODEL_PROVIDER: ${provider}`);
}
