import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  readGitInfoDirectly,
  parseBacklog,
  getLocalTodayDateString,
  queueBacklogTask,
  getMipaStatus,
  queryKnowledge,
  isMainModule,
  BRIDGE_VERSION
} from '../../scripts/mipa-bridge.js';

describe('mipa-bridge.js - Hermes Agent Bridge Suite', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mipa-bridge-test-'));
  });

  afterEach(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  describe('readGitInfoDirectly', () => {
    it('extracts branch name from standard ref: refs/heads/ branch format', () => {
      const gitDir = path.join(tmpDir, '.git');
      fs.mkdirSync(gitDir, { recursive: true });
      fs.writeFileSync(path.join(gitDir, 'HEAD'), 'ref: refs/heads/modernize-2026\n');

      const info = readGitInfoDirectly(tmpDir);
      expect(info.branch).toBe('modernize-2026');
      expect(info.commits).toEqual([]);
    });

    it('extracts detached HEAD commit SHA', () => {
      const gitDir = path.join(tmpDir, '.git');
      fs.mkdirSync(gitDir, { recursive: true });
      const sha = '6ba1169efd7135312db1307c2120360bdb7cbc5e';
      fs.writeFileSync(path.join(gitDir, 'HEAD'), `${sha}\n`);

      const info = readGitInfoDirectly(tmpDir);
      expect(info.branch).toBe('detached (6ba1169)');
    });

    it('extracts recent commits from .git/logs/HEAD reflog', () => {
      const gitDir = path.join(tmpDir, '.git');
      const logsDir = path.join(gitDir, 'logs');
      fs.mkdirSync(logsDir, { recursive: true });
      fs.writeFileSync(path.join(gitDir, 'HEAD'), 'ref: refs/heads/main\n');

      const logLines = [
        '00000000 11111111 Author <a@b.com> 1700000000 +0000\tcommit (initial): Initial commit',
        '11111111 22222222 Author <a@b.com> 1700000100 +0000\tcommit: feat: add leverage model',
        '22222222 33333333 Author <a@b.com> 1700000200 +0000\tmerge master: Fast-forward'
      ].join('\n');
      fs.writeFileSync(path.join(logsDir, 'HEAD'), logLines);

      const info = readGitInfoDirectly(tmpDir);
      expect(info.branch).toBe('main');
      expect(info.commits.length).toBe(3);
      expect(info.commits[0]).toContain('Fast-forward');
      expect(info.commits[1]).toContain('feat: add leverage model');
    });

    it('falls back gracefully when .git is absent or unreadable without crashing', () => {
      const info = readGitInfoDirectly(path.join(tmpDir, 'empty-repo'));
      expect(info.branch).toBe('unknown');
      expect(info.commits).toEqual([]);
    });
  });

  describe('parseBacklog - Strict Line-Anchored Matching', () => {
    it('correctly matches only anchored headings and ignores [TODO] in item bodies, bullet points, and code fences', () => {
      const backlogContent = `
# Mipa Feature & Improvement Backlog (Local)

## Status Convention
- [TODO] — Ready to be picked up.
- [IN PROGRESS] — Currently being investigated.
- [DONE] — Implemented and merged.

## Active / In Progress

### [IN PROGRESS] Active Working Task
- **Description**: Working on something important.

## Queue (Priority Order)

### [TODO] Fix mipa-bridge reliability
- **Date**: 2026-11-15
- **Description**: Add a queue CLI subcommand: \`node scripts/mipa-bridge.js queue "<title>" "<description>"\` appends a correctly formatted ### [TODO] <Title> block under ## Queue (Priority Order).
- **Acceptance Criteria**:
  - [ ] Acceptance criterion mentioning ### [TODO] template
  - [ ] Another line with \`### [TODO] nested in code\`
  - [ ] Inside code fence:
\`\`\`markdown
### [TODO] Fake Task Inside Code Block
\`\`\`
  - [ ] End of item

## Completed

### [DONE] First Feature Merged
- Description of feature.
`;

      const parsed = parseBacklog(backlogContent);

      // Active / In Progress
      expect(parsed.inProgress.length).toBe(1);
      expect(parsed.inProgress[0]).toBe('Active Working Task');

      // Queue: must be EXACTLY 1, ignoring the prose, bullet points, and code block
      expect(parsed.queue.length).toBe(1);
      expect(parsed.queue[0]).toBe('Fix mipa-bridge reliability');

      // Completed
      expect(parsed.completed.length).toBe(1);
      expect(parsed.completed[0]).toBe('First Feature Merged');
    });

    it('returns empty lists for empty or invalid markdown without throwing', () => {
      expect(parseBacklog('')).toEqual({ inProgress: [], queue: [], completed: [] });
      expect(parseBacklog(null)).toEqual({ inProgress: [], queue: [], completed: [] });
    });
  });

  describe('getLocalTodayDateString', () => {
    it('produces YYYY-MM-DD formatted date in Asia/Taipei timezone', () => {
      const dateStr = getLocalTodayDateString('Asia/Taipei');
      expect(dateStr).toMatch(/^\d{4}-\d{2}-\d{2}$/);

      // Test with custom date mocked in UTC
      const now = new Date('2026-11-14T23:30:00Z'); // 23:30 UTC is 07:30 next day in Taipei
      vi.useFakeTimers();
      vi.setSystemTime(now);

      const taipeiDate = getLocalTodayDateString('Asia/Taipei');
      expect(taipeiDate).toBe('2026-11-15');

      vi.useRealTimers();
    });
  });

  describe('queueBacklogTask', () => {
    it('appends a correctly formatted ### [TODO] block under ## Queue (Priority Order)', () => {
      const backlogFile = path.join(tmpDir, 'BACKLOG.md');
      fs.writeFileSync(
        backlogFile,
        `# Header\n\n## Active / In Progress\n\n*(None)*\n\n## Queue (Priority Order)\n\n*(Queue currently empty - all prioritized tasks completed)*\n\n## Completed\n\n### [DONE] Old Item\n`
      );

      const result = queueBacklogTask('New Automated Task', 'Detailed description of the task', [
        'Criteria 1',
        'Criteria 2'
      ], {
        backlogPath: backlogFile,
        date: '2026-11-15'
      });

      expect(result.success).toBe(true);
      expect(result.message).toContain('New Automated Task');

      const updated = fs.readFileSync(backlogFile, 'utf8');
      expect(updated).toContain('### [TODO] New Automated Task');
      expect(updated).toContain('- **Date**: 2026-11-15');
      expect(updated).toContain('- **Description**: Detailed description of the task');
      expect(updated).toContain('- [ ] Criteria 1');
      expect(updated).not.toContain('*(Queue currently empty - all prioritized tasks completed)*');

      // Verify parseBacklog sees it
      const parsed = parseBacklog(updated);
      expect(parsed.queue).toEqual(['New Automated Task']);
    });

    it('throws descriptive error if BACKLOG.md is missing', () => {
      expect(() => {
        queueBacklogTask('Task', 'Desc', [], { backlogPath: path.join(tmpDir, 'nonexistent.md') });
      }).toThrow(/does not exist/);
    });
  });

  describe('getMipaStatus & queryKnowledge', () => {
    it('returns degraded array and bridgeVersion in status output', () => {
      const gitDir = path.join(tmpDir, '.git');
      fs.mkdirSync(gitDir, { recursive: true });
      fs.writeFileSync(path.join(gitDir, 'HEAD'), 'ref: refs/heads/test-branch\n');

      const backlogFile = path.join(tmpDir, 'BACKLOG.md');
      fs.writeFileSync(
        backlogFile,
        `## Active / In Progress\n\n## Queue (Priority Order)\n\n### [TODO] Task 1\n\n## Completed\n`
      );

      const status = getMipaStatus({ repoRoot: tmpDir, backlogPath: backlogFile });
      expect(status.status).toBe('online');
      expect(status.bridgeVersion).toBe(BRIDGE_VERSION);
      expect(Array.isArray(status.degraded)).toBe(true);
      expect(status.workingBranch).toBe('test-branch');
      expect(status.activeTasksCount).toBe(1);
      expect(status.activeQueue).toEqual(['Task 1']);
      expect(status.chineseLeverageTerm).toBe('效應比');
      expect(status.pricingTiers).toBeDefined();
    });

    it('queryKnowledge returns domain-specific answers for leverage, pricing, and rules', () => {
      const formulaResult = queryKnowledge('leverage formula');
      expect(formulaResult.length).toBeGreaterThan(0);
      expect(formulaResult[0].details).toContain('actionLeverage');
      expect(formulaResult[0].details).toContain('效應比');

      const pricingResult = queryKnowledge('pricing tiers');
      expect(pricingResult[0].details).toContain('Lemon Squeezy');
      expect(pricingResult[0].details).toContain('Starter');

      const techResult = queryKnowledge('tech stack');
      expect(techResult[0].details).toContain('Vue 3');
      expect(techResult[0].details).toContain('Math.js');
    });

    it('isMainModule returns false during unit tests execution', () => {
      expect(isMainModule()).toBe(false);
    });
  });
});
