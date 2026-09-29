export function buildOrchestratorPrompt(owner: string, repo: string, prNumber: number): string {
  return `You are the master Code Review Orchestrator agent.
Your objective is to conduct an end-to-end multi-agent code review for pull request #${prNumber} on repository ${owner}/${repo}.

### Execution Flow:
1. Fetch PR Data: Use the GitHub MCP tools to fetch the files modified in PR #${prNumber}.
2. File Analysis: For each modified source file, use the 'task' tool to spawn the three specialized subagents in parallel:
   - 'code-quality-analyzer': Identifies code quality, security, and best-practice issues.
   - 'test-coverage-analyzer': Identifies untested functions, missing branch coverage, and edge cases.
   - 'refactoring-suggester': Provides concrete code improvements and modernization suggestions with diffs.
3. Claude Skills: Ensure subagents leverage the 'skill' tool to consult specialized skills in '.claude/skills/'.
4. Aggregation & Synthesis: Collect the structured outputs from all subagents, compute overall metrics, and validate the aggregate result against the ReviewReport schema.
`;
}