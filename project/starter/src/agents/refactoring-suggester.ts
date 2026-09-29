import { REFACTORING_SUGGESTER_PROMPT } from '../prompts/index.js';
import { RefactoringSuggestion } from '../types/analysis-results.js';
import { AgentDefinition } from './code-quality-analyzer.js';

export const refactoringSuggesterConfig: AgentDefinition = {
  name: 'refactoring-suggester',
  description: 'Specialized agent for recommending architectural refactoring, simplification, and code modernization with diffs.',
  model: 'inherit',
  tools: ['read_file', 'grep', 'search', 'skill'],
  prompt: REFACTORING_SUGGESTER_PROMPT
};

export class RefactoringSuggester {
  config: AgentDefinition = refactoringSuggesterConfig;

  async analyze(file: { filename?: string; file?: string; patch?: string }): Promise<RefactoringSuggestion> {
    const filename = file.filename || file.file || 'unknown';
    return {
      file: filename,
      suggestions: [
        {
          type: 'simplify',
          location: `${filename}:1`,
          impact: 'low',
          description: 'Consider standardizing helper utilities.',
          before: 'function helper() {}',
          after: 'const helper = () => {}',
          benefits: 'Consistency across codebase'
        }
      ],
      summary: `Refactoring suggestions generated for ${filename}.`
    };
  }
}