import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  readGitInfoDirectly,
  getLocalTodayDateString,
  loadOperationsContent,
  getMipaStatus,
  queryKnowledge,
  isMainModule,
  BRIDGE_VERSION
} from '../../scripts/agent-bridge.js';

describe('agent-bridge.js - Tracked Agent Bridge Mechanism Suite', () => {
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

  describe('getMipaStatus & queryKnowledge', () => {
    it('returns degraded array and bridgeVersion in status output, falling back gracefully when ops content is absent', () => {
      const gitDir = path.join(tmpDir, '.git');
      fs.mkdirSync(gitDir, { recursive: true });
      fs.writeFileSync(path.join(gitDir, 'HEAD'), 'ref: refs/heads/test-branch\n');

      // Status without ops content (e.g. CI runner environment)
      const fallbackStatus = getMipaStatus({
        repoRoot: tmpDir,
        operationsContent: null,
        opsPath: path.join(tmpDir, 'nonexistent-ops.json')
      });
      expect(fallbackStatus.status).toBe('online');
      expect(fallbackStatus.bridgeVersion).toBe(BRIDGE_VERSION);
      expect(Array.isArray(fallbackStatus.degraded)).toBe(true);
      expect(fallbackStatus.degraded).toContain('operations:unconfigured');
      expect(fallbackStatus.workingBranch).toBe('test-branch');
      expect(fallbackStatus.activeTasksCount).toBe(0);
      expect(fallbackStatus.activeQueue).toEqual([]);
      expect(fallbackStatus.chineseLeverageTerm).toBe('效應比');
      expect(fallbackStatus.pricingTiers).toBeNull();

      // Status with operations content configured
      const configuredStatus = getMipaStatus({
        repoRoot: tmpDir,
        operationsContent: {
          pricingTiers: {
            tierA: '$10/mo',
            tierB: '$50/mo'
          }
        }
      });
      expect(configuredStatus.pricingTiers).toBeDefined();
      expect(configuredStatus.pricingTiers.tierA).toBe('$10/mo');
    });

    it('queryKnowledge returns domain-specific answers for leverage and tech stack', () => {
      const formulaResult = queryKnowledge('leverage formula');
      expect(formulaResult.length).toBeGreaterThan(0);
      expect(formulaResult[0].details).toContain('actionLeverage');
      expect(formulaResult[0].details).toContain('效應比');

      const techResult = queryKnowledge('tech stack');
      expect(techResult[0].details).toContain('Vue 3');
      expect(techResult[0].details).toContain('Math.js');
    });

    it('queryKnowledge answers pricing when operations content is present, and reports degradation when absent', () => {
      // Degraded case (missing ops content on fresh clone / CI runner)
      const degradedResult = queryKnowledge('pricing plans', {
        operationsContent: null,
        opsPath: path.join(tmpDir, 'nonexistent-ops.json')
      });
      expect(degradedResult.length).toBeGreaterThan(0);
      expect(degradedResult[0].degraded).toBe(true);
      expect(degradedResult[0].details).toContain('Operations content not configured');

      // Configured case (with ops content injected or loaded)
      const configuredResult = queryKnowledge('pricing plans', {
        operationsContent: {
          billing: {
            topic: 'Monetization & Billing',
            details: 'Configured billing provider with multiple tiers.'
          }
        }
      });
      expect(configuredResult.length).toBeGreaterThan(0);
      expect(configuredResult[0].degraded).toBeUndefined();
      expect(configuredResult[0].details).toContain('Configured billing provider with multiple tiers.');
    });

    it('loadOperationsContent loads from file or env when available', () => {
      const opsFile = path.join(tmpDir, 'ops.json');
      fs.writeFileSync(opsFile, JSON.stringify({ billing: { details: 'File loaded' } }));

      const loadedFromFile = loadOperationsContent({ opsPath: opsFile });
      expect(loadedFromFile.billing.details).toBe('File loaded');

      const loadedDirect = loadOperationsContent({ operationsContent: { direct: true } });
      expect(loadedDirect.direct).toBe(true);
    });

    it('isMainModule returns false during unit tests execution', () => {
      expect(isMainModule()).toBe(false);
    });
  });
});
