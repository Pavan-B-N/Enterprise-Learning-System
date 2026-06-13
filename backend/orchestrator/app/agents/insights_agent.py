"""
Manager Insights Agent.

Foundry-hosted A2A specialist for manager-only team analytics. Thin
transport-only wrapper — callers (routes) own the prompt, role guard, and
output format.
"""

from __future__ import annotations

from app.agents.base_a2a_agent import BaseA2AAgent


class InsightsAgent(BaseA2AAgent):
    AGENT_NAME = "manager-insights-agent"
    ROUTE_KEY = "insights"


insights_agent = InsightsAgent()

