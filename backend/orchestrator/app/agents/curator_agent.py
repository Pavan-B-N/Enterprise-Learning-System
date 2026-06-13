"""
Learning Path Curator Agent.

Foundry-hosted A2A specialist grounded in `kb-certification-guides` (Foundry IQ).
Thin transport-only wrapper — callers (routes) own the prompt and pick the
output format (JSON for cached/dashboard endpoints, markdown for chat).
"""

from __future__ import annotations

from app.agents.base_a2a_agent import BaseA2AAgent


class CuratorAgent(BaseA2AAgent):
    AGENT_NAME = "learning-path-curator-agent"
    ROUTE_KEY = "curator"


curator_agent = CuratorAgent()


