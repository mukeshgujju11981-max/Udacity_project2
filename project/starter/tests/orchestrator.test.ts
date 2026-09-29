import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CodeReviewOrchestrator } from '../src/orchestrator.js';
import { ReviewReportSchema } from '../src/types/report-types.js';

// Mock Claude Agent SDK query
vi.mock('@anthropic-ai/claude-agent-sdk', () => ({
  query: vi.fn().mockResolvedValue('{}')
}));

describe('CodeReviewOrchestrator', () => {
  const sampleFiles = [
    {
      filename: 'src/index.ts',
      status: 'modified',
      patch: '@@ -1,5 +1,5 @@\n-const a = 1;\n+const a = 2;'
    }
  ];

  const sampleQualityResult = {
    file: 'src/index.ts',
    overallScore: 85,
    summary: 'Good code',
    issues: [
      {
        line: 2,
        severity: 'medium' as const,
        category: 'best-practice' as const,
        description: 'Variable could be const',
        suggestion: 'Use const'
      }
    ]
  };

  const sampleTestResult = {
    file: 'src/index.ts',
    hasTests: true,
    testFiles: ['tests/index.test.ts'],
    coverageEstimate: 75,
    summary: 'Good coverage',
    untestedPaths: [
      {
        type: 'function' as const,
        location: 'src/index.ts:2',
        priority: 'high' as const,
        reasoning: 'Missing test',
        suggestedTest: 'test it'
      }
    ]
  };

  const sampleRefactorResult = {
    file: 'src/index.ts',
    summary: 'Minor changes',
    suggestions: [
      {
        type: 'simplify' as const,
        location: 'src/index.ts:2',
        impact: 'low' as const,
        description: 'Simplify expression',
        before: 'a = 1',
        after: 'a = 2',
        benefits: 'Cleaner code'
      }
    ]
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Configuration', () => {
    it('should initialize with registered subagents and Task tool', () => {
      const orchestrator = new CodeReviewOrchestrator();
      expect(orchestrator).toBeDefined();
      expect(Object.keys(orchestrator.registeredAgents)).toHaveLength(3);
      expect(orchestrator.allowedTools).toContain('Task');
      expect(orchestrator.allowedTools).toContain('Skill');
    });

    it('should accept custom rate limit configuration', () => {
      const customRateLimits = {
        maxRequestsPerMinute: 20,
        maxTokensPerMinute: 50000,
        maxConcurrent: 2
      };

      const orchestrator = new CodeReviewOrchestrator({
        rateLimits: customRateLimits
      });

      expect(orchestrator).toBeDefined();
    });
  });

  describe('reviewPullRequest', () => {
    it('should fetch PR files from GitHub MCP', async () => {
      const orchestrator = new CodeReviewOrchestrator();
      const fetchSpy = vi.spyOn(orchestrator, 'fetchPRFiles').mockResolvedValue(sampleFiles);
      vi.spyOn(orchestrator, 'spawnAgent')
        .mockResolvedValueOnce(sampleQualityResult)
        .mockResolvedValueOnce(sampleTestResult)
        .mockResolvedValueOnce(sampleRefactorResult);

      await orchestrator.reviewPullRequest('test-owner', 'test-repo', 42);

      expect(fetchSpy).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
        prNumber: 42
      });
    });

    it('should spawn all 3 subagents in parallel', async () => {
      const orchestrator = new CodeReviewOrchestrator();
      vi.spyOn(orchestrator, 'fetchPRFiles').mockResolvedValue(sampleFiles);
      const spawnSpy = vi.spyOn(orchestrator, 'spawnAgent')
        .mockResolvedValueOnce(sampleQualityResult)
        .mockResolvedValueOnce(sampleTestResult)
        .mockResolvedValueOnce(sampleRefactorResult);

      await orchestrator.reviewPullRequest('test-owner', 'test-repo', 42);

      expect(spawnSpy).toHaveBeenCalledTimes(3);
      expect(spawnSpy).toHaveBeenCalledWith('code-quality-analyzer', sampleFiles[0], expect.anything());
      expect(spawnSpy).toHaveBeenCalledWith('test-coverage-analyzer', sampleFiles[0], expect.anything());
      expect(spawnSpy).toHaveBeenCalledWith('refactoring-suggester', sampleFiles[0], expect.anything());
    });

    it('should aggregate results into ReviewReport', async () => {
      const orchestrator = new CodeReviewOrchestrator();
      vi.spyOn(orchestrator, 'fetchPRFiles').mockResolvedValue(sampleFiles);
      vi.spyOn(orchestrator, 'spawnAgent')
        .mockResolvedValueOnce(sampleQualityResult)
        .mockResolvedValueOnce(sampleTestResult)
        .mockResolvedValueOnce(sampleRefactorResult);

      const report = await orchestrator.reviewPullRequest('test-owner', 'test-repo', 42);

      expect(report).toBeDefined();
      expect(report.summary).toBeDefined();
      expect(report.fileReviews).toHaveLength(1);
      expect(report.fileReviews[0].file).toBe('src/index.ts');
    });

    it('should validate output with Zod schema', async () => {
      const orchestrator = new CodeReviewOrchestrator();
      vi.spyOn(orchestrator, 'fetchPRFiles').mockResolvedValue(sampleFiles);
      vi.spyOn(orchestrator, 'spawnAgent')
        .mockResolvedValueOnce(sampleQualityResult)
        .mockResolvedValueOnce(sampleTestResult)
        .mockResolvedValueOnce(sampleRefactorResult);

      const report = await orchestrator.reviewPullRequest('test-owner', 'test-repo', 42);

      const parsed = ReviewReportSchema.safeParse(report);
      expect(parsed.success).toBe(true);
    });
  });
});