/**
 * openrouter.js
 * Fetches per-model, per-day LLM usage/cost from OpenRouter's Activity API
 * (last 30 completed UTC days). Requires a Management key.
 */

async function getOpenRouterCosts() {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY missing on server");
  }

  const response = await fetch("https://openrouter.ai/api/v1/activity", {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
  });

  const json = await response.json();
  if (!response.ok) {
    throw new Error(json?.error?.message || `OpenRouter request failed (${response.status})`);
  }

  const items = (json.data || []).map((item) => ({
    date: item.date,
    model: item.model,
    provider: item.provider_name,
    tokensUsed: (item.prompt_tokens || 0) + (item.completion_tokens || 0),
    cost: item.usage || 0,
    requests: item.requests || 0,
  }));

  const totalCost = items.reduce((sum, i) => sum + i.cost, 0);
  const totalTokens = items.reduce((sum, i) => sum + i.tokensUsed, 0);

  return {
    items,
    totalCost: Number(totalCost.toFixed(4)),
    totalTokens,
  };
}

module.exports = { getOpenRouterCosts };