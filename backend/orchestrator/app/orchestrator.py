"""
Enterprise Learning System — Orchestrator entry point.
Delegates to the OrchestratorAgent in agents/.
"""

from app.agents.orchestrator_agent import OrchestratorAgent

orchestrator = OrchestratorAgent()
