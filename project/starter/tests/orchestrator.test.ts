import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CodeReviewOrchestrator } from '../src/orchestrator.js';
import { ReviewReportSchema } from '../src/types/report-types.js';

// Mock subagent functions
const mockQualityRun = vi.fn();
const mockTestRun = vi.fn();
const mockRefactorRun = vi.fn();

// Mock agents using class syntax so 'new' works cleanly
vi.mock('../src/agents/index.js', () => ({
  CodeQualityAgent: class {
    analyze = mockQualityRun;
  },
  TestCoverageAgent: class {
    analyze = mockTestRun;
  },
  RefactoringAgent: class {
    analyze = mockRefactorRun;
  }
}));

// Mock RateLimiter with class syntax to satisfy constructor call
vi.mock('../src/utils/rate-limiter.js', () => ({
  RateLimiter: class {
    config: any;
    constructor(config: any) {
      this.config = config;
    }
    acquire = vi.fn().mockResolvedValue(undefined);
    release = vi.fn();
    getStatus = vi.fn().mockReturnValue({
      activeRequests: 0,
      requestsInWindow: 0,
      tokensInWindow: 0,
      availableRequests: 50,
      availableTokens: 100000
    });
    canProceed = vi.fn().mockReturnValue(true);
  },
  globalRateLimiter: {
    acquire: vi.fn().mockResolvedValue(undefined),
    release: vi.fn()
  }
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
    mockQualityRun.mockResolvedValue(sampleQualityResult);
    mockTestRun.mockResolvedValue(sampleTestResult);
    mockRefactorRun.mockResolvedValue(sampleRefactorResult);
  });

  describe('Configuration', () => {
    it('should initialize with default options', () => {
      const orchestrator = new CodeReviewOrchestrator();
      expect(orchestrator).toBeDefined();
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

      await orchestrator.reviewPullRequest('test-owner', 'test-repo', 42);

      expect(mockQualityRun).toHaveBeenCalled();
      expect(mockTestRun).toHaveBeenCalled();
      expect(mockRefactorRun).toHaveBeenCalled();
    });

    it('should aggregate results into ReviewReport', async () => {
      const orchestrator = new CodeReviewOrchestrator();
      vi.spyOn(orchestrator, 'fetchPRFiles').mockResolvedValue(sampleFiles);

      const report = await orchestrator.reviewPullRequest('test-owner', 'test-repo', 42);

      expect(report).toBeDefined();
      expect(report.summary).toBeDefined();
      expect(report.fileReviews).toHaveLength(1);
      expect(report.fileReviews[0].file).toBe('src/index.ts');
      expect(report.fileReviews[0].codeQuality).toEqual(sampleQualityResult);
      expect(report.fileReviews[0].testCoverage).toEqual(sampleTestResult);
      expect(report.fileReviews[0].refactorings).toEqual(sampleRefactorResult);
    });

    it('should validate output with Zod schema', async () => {
      const orchestrator = new CodeReviewOrchestrator();
      vi.spyOn(orchestrator, 'fetchPRFiles').mockResolvedValue(sampleFiles);

      const report = await orchestrator.reviewPullRequest('test-owner', 'test-repo', 42);

      const parsed = ReviewReportSchema.safeParse(report);
      expect(parsed.success).toBe(true);
    });
  });

  describe('Integration', () => {
    it.skip('should review a real small PR', async () => {
      const orchestrator = new CodeReviewOrchestrator();
      const report = await orchestrator.reviewPullRequest('octocat', 'Hello-World', 1);

      expect(report).toBeDefined();
      expect(report.summary.totalFiles).toBeGreaterThan(0);
    });
  });
});