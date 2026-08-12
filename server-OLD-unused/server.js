require("dotenv").config();
const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());

const PORT = process.env.PORT || 4000;
const ANTHROPIC_ADMIN_KEY = process.env.ANTHROPIC_ADMIN_KEY;
const OPENAI_ADMIN_KEY = process.env.OPENAI_ADMIN_KEY;
const HETZNER_API_TOKEN = process.env.HETZNER_API_TOKEN;

// ---- Hetzner cost report ----
app.get("/api/hetzner-costs", async (req, res) => {
  if (!HETZNER_API_TOKEN) {
    return res.status(500).json({ error: "HETZNER_API_TOKEN missing on server" });
  }
  try {
    const authHeaders = { Authorization: `Bearer ${HETZNER_API_TOKEN}` };

    // Fetch live Cloud servers
    const serversRes = await fetch("https://api.hetzner.cloud/v1/servers", {
      headers: authHeaders,
    });
    const serversData = await serversRes.json();
    if (!serversRes.ok) {
      return res.status(serversRes.status).json(serversData);
    }

    // Fetch pricing to compute hourly cost per server type
    const pricingRes = await fetch("https://api.hetzner.cloud/v1/pricing", {
      headers: authHeaders,
    });
    const pricingData = await pricingRes.json();
    const serverTypePricing = pricingData?.pricing?.server_types || [];

    function getHourlyRate(serverTypeName, location) {
      const typeEntry = serverTypePricing.find((t) => t.name === serverTypeName);
      if (!typeEntry) return null;
      const priceEntry = typeEntry.prices.find((p) => p.location === location);
      const price = priceEntry || typeEntry.prices[0];
      return price ? Number(price.price_hourly.gross) : null;
    }

    const items = serversData.servers.map((server) => {
      const hourlyRate = getHourlyRate(server.server_type.name, server.datacenter.location.name);
      const hoursRunning =
        (Date.now() - new Date(server.created).getTime()) / (1000 * 60 * 60);
      const runningCost = hourlyRate !== null ? hourlyRate * hoursRunning : null;
      const daysInMonth = new Date(
        new Date().getFullYear(),
        new Date().getMonth() + 1,
        0
      ).getDate();
      const costThisMonth = hourlyRate !== null ? hourlyRate * 24 * daysInMonth : null;

      return {
        id: server.id,
        name: server.name,
        serverType: server.server_type.name,
        location: server.datacenter.location.name,
        status: server.status,
        hourlyRate,
        runningCost,
        costThisMonth,
        source: "hetzner-monitoring-live",
      };
    });

    const totalRunningCost = items.reduce((sum, i) => sum + (i.runningCost || 0), 0);
    const totalMonthCost = items.reduce((sum, i) => sum + (i.costThisMonth || 0), 0);

    res.json({
      items,
      totalRunningCost,
      totalMonthCost,
      monthLabel: new Date().toLocaleString("default", { month: "long", year: "numeric" }),
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ---- Anthropic (Claude) cost report ----
app.get("/api/anthropic-costs", async (req, res) => {
  if (!ANTHROPIC_ADMIN_KEY) {
    return res.status(500).json({ error: "ANTHROPIC_ADMIN_KEY missing on server" });
  }
  try {
    const days = Number(req.query.days || 7);
    const startingAt = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
      .toISOString()
      .split(".")[0] + "Z";

    const url = new URL("https://api.anthropic.com/v1/organizations/cost_report");
    url.searchParams.set("starting_at", startingAt);
    url.searchParams.append("group_by[]", "description");
    url.searchParams.set("limit", "31");

    const response = await fetch(url, {
      headers: {
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
        "x-api-key": ANTHROPIC_ADMIN_KEY,
      },
    });

    const data = await response.json();
    if (!response.ok) return res.status(response.status).json(data);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ---- OpenAI cost report ----
app.get("/api/openai-costs", async (req, res) => {
  if (!OPENAI_ADMIN_KEY) {
    return res.status(500).json({ error: "OPENAI_ADMIN_KEY missing on server" });
  }
  try {
    const days = Number(req.query.days || 7);
    const startTime = Math.floor(Date.now() / 1000) - days * 24 * 60 * 60;

    const url = new URL("https://api.openai.com/v1/organization/costs");
    url.searchParams.set("start_time", String(startTime));
    url.searchParams.set("bucket_width", "1d");
    url.searchParams.set("limit", "30");
    url.searchParams.set("group_by", "line_item");

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${OPENAI_ADMIN_KEY}`,
        "Content-Type": "application/json",
      },
    });

    const data = await response.json();
    if (!response.ok) return res.status(response.status).json(data);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.listen(PORT, () => {
  console.log(`AI cost server listening on http://localhost:${PORT}`);
});