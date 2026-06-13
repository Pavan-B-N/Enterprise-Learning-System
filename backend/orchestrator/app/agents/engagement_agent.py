"""
Engagement Agent.

Foundry-hosted A2A specialist that produces work-context-aware nudges.
Thin transport-only wrapper — callers (routes) own the prompt and pick the
output format.
"""

from __future__ import annotations

from app.agents.base_a2a_agent import BaseA2AAgent


class EngagementAgent(BaseA2AAgent):
    AGENT_NAME = "engagement-agent"
    ROUTE_KEY = "engagement"


engagement_agent = EngagementAgent()

