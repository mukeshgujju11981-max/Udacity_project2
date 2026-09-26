import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import { CodeReviewOrchestrator } from './orchestrator.js';
import { ReportGenerator, logger, formatError } from './utils/index.js';

// Load environment variables
dotenv.config();

/**
 * Main entry point for the Claude Multi-Agent Code Review System
 * Usage: npm run dev <owner> <repo> <pr-number>
 */
async function main() {
  const [owner, repo, prStr] = process.argv.slice(2);

  // 1. Validate command line arguments
  if (!owner || !repo || !prStr) {
    logger.error('Missing required arguments.');
    console.error('\nUsage: npm run dev <owner> <repo> <pr-number>\nExample: npm run dev octocat Hello-World 42\n');
    process.exit(1);
  }

  const prNumber = parseInt(prStr, 10);
  if (isNaN(prNumber) || !Number.isInteger(prNumber) || prNumber <= 0) {
    logger.error(`Invalid PR number: "${prStr}". It must be a positive integer.`);
    process.exit(1);
  }

  // 2. Validate authentication
  const hasAnthropicKey = Boolean(process.env.ANTHROPIC_API_KEY);
  const hasBedrockKeys = Boolean(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY);

  if (hasBedrockKeys) {
    if (!process.env.AWS_REGION) {
      logger.error('AWS Bedrock authentication requires the AWS_REGION environment variable to be set.');
      process.exit(1);
    }
    console.log('🔐 Using AWS Bedrock authentication');
  } else if (hasAnthropicKey) {
    console.log('🔐 Using Anthropic API authentication');
  } else {
    logger.error('Authentication configuration missing.');
    console.error(
      '\nPlease configure one of the following authentication methods in your .env file:\n' +
      'Option 1 (Anthropic Direct):\n' +
      '  ANTHROPIC_API_KEY=your_anthropic_api_key\n\n' +
      'Option 2 (AWS Bedrock):\n' +
      '  AWS_ACCESS_KEY_ID=your_access_key\n' +
      '  AWS_SECRET_ACCESS_KEY=your_secret_key\n' +
      '  AWS_REGION=your_aws_region\n'
    );
    process.exit(1);
  }

  // 3. Validate ANTHROPIC_MODEL environment variable
  const model = process.env.ANTHROPIC_MODEL;
  if (!model) {
    logger.error('ANTHROPIC_MODEL environment variable is required.');
    process.exit(1);
  }

  // Log starting information
  logger.info(`Starting review of ${owner}/${repo} PR #${prNumber}...`);
  logger.info('Starting code review', {
    service: 'code-review-system',
    owner,
    repo,
    prNumber
  });

  const startTime = Date.now();

  try {
    const orchestrator = new CodeReviewOrchestrator();
    const reviewResult = await orchestrator.reviewPullRequest(owner, repo, prNumber);

    const duration = Date.now() - startTime;
    const score = reviewResult.summary?.overallScore ?? 0;

    // Log completion payload
    logger.info('Code review completed', {
      service: 'code-review-system',
      owner,
      repo,
      prNumber,
      score,
      duration,
      status: 'success'
    });

    // Ensure reports directory exists
    const reportsDir = path.resolve(process.cwd(), 'reports');
    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir, { recursive: true });
    }

    const reportGenerator = new ReportGenerator();
    const fileBase = `${owner}_${repo}_${prNumber}`;

    const jsonPath = path.join(reportsDir, `${fileBase}.json`);
    const mdPath = path.join(reportsDir, `${fileBase}.md`);
    const htmlPath = path.join(reportsDir, `${fileBase}.html`);

    const jsonReport = reportGenerator.generateJSONReport(reviewResult);
    const mdReport = reportGenerator.generateMarkdownReport(reviewResult);
    const htmlReport = reportGenerator.generateHTMLReport(reviewResult);

    fs.writeFileSync(jsonPath, jsonReport, 'utf8');
    fs.writeFileSync(mdPath, mdReport, 'utf8');
    fs.writeFileSync(htmlPath, htmlReport, 'utf8');

    // Display summary output lines matching the expected rubric
    logger.info('Review complete. Reports saved:');
    logger.info(`  JSON:     reports/${fileBase}.json`);
    logger.info(`  Markdown: reports/${fileBase}.md`);
    logger.info(`  HTML:     reports/${fileBase}.html`);
    logger.info(`  Overall score: ${score}/100`);
  } catch (error) {
    logger.error(`❌ Review process failed: ${formatError(error)}`);
    process.exit(1);
  }
}

main();