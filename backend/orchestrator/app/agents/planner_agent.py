"""
Study-Plan Generator (Planner) Agent.

Foundry-hosted A2A specialist that builds capacity-aware weekly study
schedules using Fabric IQ + Work IQ signals. Thin transport-only wrapper —
callers (routes) own the prompt and pick the output format.
"""

from __future__ import annotations

from app.agents.base_a2a_agent import BaseA2AAgent


class PlannerAgent(BaseA2AAgent):
    AGENT_NAME = "study-plan-generator-agent"
    ROUTE_KEY = "planner"


planner_agent = PlannerAgent()

