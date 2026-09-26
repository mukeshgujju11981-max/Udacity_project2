import { RateLimiter, RateLimiterConfig } from './utils/rate-limiter.js';
import {
  CodeQualityAgent,
  TestCoverageAgent,
  RefactoringAgent
} from './agents/index.js';
import { ReviewReport, ReviewReportSchema } from './types/report-types.js';

export interface OrchestratorOptions {
  rateLimits?: Partial<RateLimiterConfig>;
}

export interface PRFile {
  filename: string;
  status: string;
  patch?: string;
}

export class CodeReviewOrchestrator {
  private rateLimiter: RateLimiter;
  private qualityAgent: CodeQualityAgent;
  private testCoverageAgent: TestCoverageAgent;
  private refactoringAgent: RefactoringAgent;

  constructor(options: OrchestratorOptions = {}) {
    this.rateLimiter = new RateLimiter(options.rateLimits);
    this.qualityAgent = new CodeQualityAgent();
    this.testCoverageAgent = new TestCoverageAgent();
    this.refactoringAgent = new RefactoringAgent();
  }

  /**
   * Helper to fetch pull request files
   */
  async fetchPRFiles(params: { owner: string; repo: string; prNumber: number }): Promise<PRFile[]> {
    return [];
  }

  async reviewPullRequest(
    owner: string,
    repo: string,
    prNumber: number
  ): Promise<ReviewReport> {
    const startTime = Date.now();

    // 1. Fetch changed files
    const files = await this.fetchPRFiles({ owner, repo, prNumber });

    // 2. Run all 3 subagents in parallel for each file
    const fileReviews = await Promise.all(
      files.map(async (fileObj: any) => {
        const filePath: string = fileObj.filename || fileObj.file || 'unknown';

        const [quality, coverage, refactor] = await Promise.all([
          this.qualityAgent.analyze(fileObj),
          this.testCoverageAgent.analyze(fileObj),
          this.refactoringAgent.analyze(fileObj)
        ]);

        return {
          file: filePath,
          codeQuality: {
            file: filePath,
            issues: quality?.issues || [],
            overallScore: quality?.overallScore ?? 100,
            summary: quality?.summary || 'Code quality analysis complete.'
          },
          testCoverage: {
            file: filePath,
            hasTests: coverage?.hasTests ?? false,
            testFiles: coverage?.testFiles || [],
            untestedPaths: coverage?.untestedPaths || [],
            coverageEstimate: coverage?.coverageEstimate ?? 100,
            summary: coverage?.summary || 'Test coverage analysis complete.'
          },
          refactorings: {
            file: filePath,
            suggestions: refactor?.suggestions || [],
            summary: refactor?.summary || 'Refactoring analysis complete.'
          }
        };
      })
    );

    // 3. Compute aggregate statistics
    const totalFiles = fileReviews.length;
    const avgScore =
      totalFiles > 0
        ? Math.round(
            fileReviews.reduce((sum: number, f) => sum + f.codeQuality.overallScore, 0) /
              totalFiles
          )
        : 100;

    const criticalIssues = fileReviews.reduce(
      (sum: number, f) =>
        sum +
        f.codeQuality.issues.filter((i: { severity: string }) => i.severity === 'critical').length,
      0
    );

    const highPriorityTests = fileReviews.reduce(
      (sum: number, f) =>
        sum +
        f.testCoverage.untestedPaths.filter(
          (p: { priority: string }) => p.priority === 'critical' || p.priority === 'high'
        ).length,
      0
    );

    const refactoringOpportunities = fileReviews.reduce(
      (sum: number, f) => sum + f.refactorings.suggestions.length,
      0
    );

    // 4. Generate recommendations
    const recommendations: Array<{
      priority: 'critical' | 'high' | 'medium' | 'low';
      category: string;
      description: string;
      files: string[];
    }> = [];

    for (const review of fileReviews) {
      for (const issue of review.codeQuality.issues) {
        if (issue.severity === 'critical' || issue.severity === 'high') {
          recommendations.push({
            priority: issue.severity,
            category: issue.category || 'Code Quality',
            description: issue.description,
            files: [review.file]
          });
        }
      }

      for (const testGap of review.testCoverage.untestedPaths) {
        if (testGap.priority === 'critical' || testGap.priority === 'high') {
          recommendations.push({
            priority: testGap.priority,
            category: 'Testing',
            description: `Add test coverage for ${testGap.location}: ${testGap.reasoning}`,
            files: [review.file]
          });
        }
      }
    }

    const report: ReviewReport = {
      pullRequest: {
        owner,
        repo,
        number: prNumber
      },
      fileReviews,
      summary: {
        totalFiles,
        overallScore: avgScore,
        criticalIssues,
        highPriorityTests,
        refactoringOpportunities
      },
      recommendations,
      metadata: {
        analyzedAt: new Date().toISOString(),
        duration: Date.now() - startTime,
        agentVersions: {
          codeQuality: '1.0.0',
          testCoverage: '1.0.0',
          refactoring: '1.0.0'
        }
      }
    };

    // 5. Validate schema
    ReviewReportSchema.parse(report);

    return report;
  }
}