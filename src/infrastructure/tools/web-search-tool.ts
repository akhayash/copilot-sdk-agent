/**
 * Infrastructure Layer: Web Search Tool for Copilot SDK
 * Registers as a custom tool so the AI agent can search the web during conversation.
 *
 * Requires TAVILY_API_KEY environment variable.
 */

import { defineTool } from '@github/copilot-sdk';

interface TavilyResult {
  title: string;
  url: string;
  content: string;
  score: number;
}

interface TavilyResponse {
  results: TavilyResult[];
  answer?: string;
}

async function searchTavily(query: string): Promise<TavilyResponse> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) {
    throw new Error('TAVILY_API_KEY environment variable is not set');
  }

  const res = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      max_results: 10,
      include_answer: true,
      search_depth: 'advanced',
    }),
  });

  if (!res.ok) {
    throw new Error(`Tavily API error: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  return { results: data.results ?? [], answer: data.answer };
}

export const webSearchTool = defineTool('web_search', {
  description:
    'Search the web for up-to-date information. Returns up to 10 detailed results. ' +
    'Call this tool MULTIPLE TIMES with different queries to gather comprehensive information. ' +
    'For presentations, search for: 1) official docs/specs, 2) market data/statistics, 3) use cases/case studies.',
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'The search query string',
      },
    },
    required: ['query'],
  },
  handler: async (args: { query: string }) => {
    try {
      const { results, answer } = await searchTavily(args.query);
      if (results.length === 0) {
        return { message: `No results found for "${args.query}"` };
      }
      const formatted = results
        .map((r, i) => `[${i + 1}] ${r.title}\n    URL: ${r.url}\n    ${r.content}`)
        .join('\n\n');
      return { results: formatted, count: results.length, ...(answer ? { answer } : {}) };
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Search failed' };
    }
  },
});
