#!/usr/bin/env node

/**
 * Mipa <-> Hermes Autonomous Agent Bridge
 * Provides direct real-time communication between Hermes Agent and Antigravity/Mipa.
 * 
 * Supports 3 runtime modes:
 * 1. CLI tool:
 *    - `node scripts/mipa-bridge.js status`
 *    - `node scripts/mipa-bridge.js query "formula"`
 *    - `node scripts/mipa-bridge.js queue "<title>" "<description>"`
 * 2. Model Context Protocol (MCP stdio):
 *    - `node scripts/mipa-bridge.js --mcp`
 * 3. Local HTTP Server:
 *    - `node scripts/mipa-bridge.js --server 9876`
 */

import fs from 'fs';
import path from 'path';
import http from 'http';
import readline from 'readline';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export const REPO_ROOT = path.resolve(__dirname, '..');
export const BACKLOG_PATH = path.join(REPO_ROOT, 'docs', 'BACKLOG.md');
export const RULES_PATH = path.join(REPO_ROOT, '.agents', 'rules', 'mipa-rules.md');
export const SKILL_PATH = path.join(REPO_ROOT, '.agents', 'skills', 'mipa-ops', 'SKILL.md');
export const BRIDGE_VERSION = '1.1.0';

/**
 * Fallback direct git inspection without shelling out to child_process.
 * Reads <repo>/.git/HEAD and <repo>/.git/logs/HEAD directly using fs.
 */
export function readGitInfoDirectly(repoRoot = REPO_ROOT) {
  let branch = 'unknown';
  const commits = [];
  const gitDir = path.join(repoRoot, '.git');

  try {
    const headPath = path.join(gitDir, 'HEAD');
    if (fs.existsSync(headPath)) {
      const headContent = fs.readFileSync(headPath, 'utf8').trim();
      if (headContent.startsWith('ref: refs/heads/')) {
        branch = headContent.replace('ref: refs/heads/', '').trim();
      } else if (headContent.startsWith('ref: ')) {
        branch = headContent.replace('ref: ', '').trim();
      } else if (/^[0-9a-f]{40}$/i.test(headContent)) {
        branch = `detached (${headContent.slice(0, 7)})`;
      }
    }

    // Try reading recent commits from .git/logs/HEAD
    const logsHeadPath = path.join(gitDir, 'logs', 'HEAD');
    if (fs.existsSync(logsHeadPath)) {
      const logLines = fs.readFileSync(logsHeadPath, 'utf8').trim().split('\n').filter(Boolean);
      // Process from newest to oldest
      for (let i = logLines.length - 1; i >= 0 && commits.length < 5; i--) {
        const line = logLines[i];
        const [meta, desc] = line.split('\t');
        if (!meta) continue;
        const metaParts = meta.split(' ');
        const sha = (metaParts[1] || '').slice(0, 7);
        const cleanDesc = (desc || '')
          .replace(/^commit(\s*\([^)]*\))?:\s*/i, '')
          .trim();
        if (cleanDesc && !cleanDesc.startsWith('checkout:')) {
          commits.push(sha ? `${sha} ${cleanDesc}` : cleanDesc);
        }
      }

      // If all recent entries were checkouts, include raw log summaries
      if (commits.length === 0) {
        for (let i = logLines.length - 1; i >= 0 && commits.length < 5; i--) {
          const line = logLines[i];
          const [meta, desc] = line.split('\t');
          const sha = ((meta || '').split(' ')[1] || '').slice(0, 7);
          commits.push(sha ? `${sha} ${desc || ''}` : (desc || line));
        }
      }
    }
  } catch {
    // Non-fatal direct read fallback
  }

  return { branch, commits };
}

/**
 * Generates an ISO calendar date formatted for Asia/Taipei local time (YYYY-MM-DD).
 */
export function getLocalTodayDateString(timeZone = 'Asia/Taipei') {
  return new Intl.DateTimeFormat('en-CA', { timeZone }).format(new Date());
}

/**
 * Pure parsing function for docs/BACKLOG.md using strict line-anchored regex.
 * Guarantees that [TODO] / [DONE] mentions in prose or descriptions are never counted.
 */
export function parseBacklog(contentOrPath) {
  let content = '';
  if (typeof contentOrPath === 'string') {
    if (contentOrPath.includes('\n')) {
      content = contentOrPath;
    } else if (fs.existsSync(contentOrPath)) {
      content = fs.readFileSync(contentOrPath, 'utf8');
    }
  }

  const result = {
    inProgress: [],
    queue: [],
    completed: []
  };

  if (!content) return result;

  function getSection(startHeader, endHeader) {
    const startIdx = content.indexOf(startHeader);
    if (startIdx === -1) return '';
    const sliceFrom = startIdx + startHeader.length;
    let sliceTo = content.length;
    if (endHeader) {
      const endIdx = content.indexOf(endHeader, sliceFrom);
      if (endIdx !== -1) sliceTo = endIdx;
    }
    return content.slice(sliceFrom, sliceTo);
  }

  const inProgressSection = getSection('## Active / In Progress', '## Queue (Priority Order)');
  const queueSection = getSection('## Queue (Priority Order)', '## Completed');
  const completedSection = getSection('## Completed', null);

  function extractHeadings(sectionText, prefix) {
    if (!sectionText) return [];
    // Strip code blocks so markdown examples inside code fences aren't matched
    const stripped = sectionText.replace(/```[\s\S]*?```/g, '');
    const regex = new RegExp(`^###\\s+\\[${prefix}\\]\\s+([^\\r\\n]+)`, 'gm');
    const items = [];
    let m;
    while ((m = regex.exec(stripped)) !== null) {
      const title = m[1].trim();
      if (title) items.push(title);
    }
    return items;
  }

  result.inProgress = extractHeadings(inProgressSection, 'IN PROGRESS');
  result.queue = extractHeadings(queueSection, 'TODO');
  result.completed = extractHeadings(completedSection, 'DONE');

  return result;
}

/**
 * Retrieves the comprehensive real-time operational status of Mipa.
 */
export function getMipaStatus(options = {}) {
  const repoRoot = options.repoRoot || REPO_ROOT;
  const backlogPath = options.backlogPath || BACKLOG_PATH;
  const degraded = [];

  // 1. Primary source: direct filesystem inspection
  const directGit = readGitInfoDirectly(repoRoot);
  let workingBranch = directGit.branch;
  let recentCommits = directGit.commits;

  // 2. Optional enrichment from git spawn if environment permits
  try {
    const gitCliBranch = execSync('git branch --show-current', {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe']
    }).trim();
    if (gitCliBranch) {
      workingBranch = gitCliBranch;
    }
    const logOutput = execSync('git log -n 5 --oneline', {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe']
    }).trim();
    if (logOutput) {
      recentCommits = logOutput.split('\n').map(s => s.trim()).filter(Boolean);
    }
  } catch {
    degraded.push('git');
  }

  // 3. Parse backlog strictly
  const backlogData = parseBacklog(backlogPath);

  return {
    status: 'online',
    bridgeVersion: BRIDGE_VERSION,
    degraded,
    platform: 'Mipa (collective-change.org)',
    workingBranch,
    activeTasksCount: backlogData.queue.length,
    activeQueue: backlogData.queue,
    inProgressCount: backlogData.inProgress.length,
    inProgress: backlogData.inProgress,
    recentCompleted: backlogData.completed.slice(0, 5),
    recentCommits,
    leverageFormula: '(netBenefitNpv * totalRoi / outstandingDirectCosts) * sign(net)',
    chineseLeverageTerm: '效應比',
    pricingTiers: {
      community: '$0 (1 seat, unlimited read-only viewers, public models or BYO key)',
      starter: '$29/mo (up to 5 seats, pooled starter AI)',
      growth: '$79/mo (up to 20 seats, pooled starter AI)',
      pro: '$199/mo (up to 50 seats, unbranded executive dossiers & PDF export)',
      enterprise: 'Custom (150+ seats, custom SLA)'
    }
  };
}

/**
 * Queries core domain and engineering knowledge base.
 */
export function queryKnowledge(query) {
  const q = (query || '').toLowerCase();
  const results = [];

  // Check leverage / formula
  if (q.includes('formula') || q.includes('leverage') || q.includes('效應比') || q.includes('roi')) {
    results.push({
      topic: 'Leverage Calculation',
      details: 'Formula: actionLeverage = (netBenefitNpv * totalRoi / outstandingDirectCosts) * sign(net). Leverage is NOT "good done per hour". Traditional Chinese term is 效應比.'
    });
  }

  // Check billing / pricing
  if (q.includes('pric') || q.includes('billing') || q.includes('tier') || q.includes('lemon') || q.includes('cost') || q.includes('plan') || q.includes('subscript')) {
    results.push({
      topic: 'Monetization & Billing',
      details: 'Merchant of Record is Lemon Squeezy (handles global taxes & W-8BEN). Tiers: Starter ($29/mo, 5 seats), Growth ($79/mo, 20 seats), Pro ($199/mo, 50 seats). Stakeholder viewers are 100% free and unlimited via /m/:modelId. Domestic Taiwan usage is 100% free.'
    });
  }

  // Check tech stack & rules
  if (q.includes('stack') || q.includes('rule') || q.includes('quasar') || q.includes('mathjs') || q.includes('vue')) {
    results.push({
      topic: 'Tech Stack & Engineering Rules',
      details: 'Vue 3 (Options API), Quasar 2, Vite, Vuex 4, Firebase JS SDK modular, Cloud Functions Node 22 TypeScript. Calculations run client-side in web worker via Math.js. All new UI strings must be in both en-us and zh-tw with zero Chinese in en-us.'
    });
  }

  // If no specific match, return general overview
  if (results.length === 0) {
    results.push({
      topic: 'Mipa Core Overview',
      details: 'Mipa is a strategic coordination web app for collective-change.org. 3 Pillars: Model (system dynamics), Ideate (actions & leverage simulation), Achieve (task coordination at PageMyTodo.vue).'
    });
  }

  return results;
}

/**
 * Appends a task to ## Queue (Priority Order) in docs/BACKLOG.md.
 */
export function queueBacklogTask(title, description, criteria = [], options = {}) {
  const backlogPath = options.backlogPath || BACKLOG_PATH;
  if (!fs.existsSync(backlogPath)) {
    throw new Error('BACKLOG.md does not exist at ' + backlogPath);
  }

  const today = options.date || getLocalTodayDateString();
  const formattedCriteria = (criteria && criteria.length > 0)
    ? criteria.map(c => `  - [ ] ${c}`).join('\n')
    : '  - [ ] Implementation complete\n  - [ ] Bilingual support (en-us and zh-tw with zero Chinese in en-us)\n  - [ ] Full unit test coverage and zero ESLint errors';

  const newItem = [
    `### [TODO] ${title.trim()}`,
    `- **Date**: ${today}`,
    `- **Description**: ${description.trim()}`,
    `- **Acceptance Criteria**:`,
    formattedCriteria
  ].join('\n');

  let content = fs.readFileSync(backlogPath, 'utf8');
  const queueHeaderRegex = /^## Queue \(Priority Order\)\s*$/m;
  const match = content.match(queueHeaderRegex);

  if (!match || match.index === undefined) {
    throw new Error('Could not find "## Queue (Priority Order)" in BACKLOG.md');
  }

  const headerIndex = match.index;
  const headerEnd = headerIndex + match[0].length;

  const afterHeader = content.slice(headerEnd);
  const nextSectionMatch = afterHeader.match(/\n## /);
  const sectionEnd = nextSectionMatch ? headerEnd + nextSectionMatch.index : content.length;

  let sectionContent = content.slice(headerEnd, sectionEnd);
  // Remove empty queue placeholder if present
  sectionContent = sectionContent.replace(/\s*\*\(Queue currently empty - all prioritized tasks completed\)\*\s*/g, '\n\n');

  const trimmedSection = sectionContent.trim();
  const newSection = '\n\n' + newItem.trim() + (trimmedSection ? '\n\n' + trimmedSection : '') + '\n\n';

  const updatedContent = content.slice(0, headerEnd) + newSection + content.slice(sectionEnd);
  fs.writeFileSync(backlogPath, updatedContent, 'utf8');

  return { success: true, message: `Task queued: "${title.trim()}"` };
}

// -------------------------------------------------------------
// MCP Protocol (Model Context Protocol) Implementation over stdio
// -------------------------------------------------------------
export function runMcpServer() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false
  });

  const sendResponse = (id, result, error = null) => {
    const res = { jsonrpc: '2.0', id };
    if (error) {
      res.error = error;
    } else {
      res.result = result;
    }
    process.stdout.write(JSON.stringify(res) + '\n');
  };

  rl.on('line', (line) => {
    if (!line.trim()) return;
    try {
      const msg = JSON.parse(line);
      const { id, method, params } = msg;

      if (method === 'initialize') {
        sendResponse(id, {
          protocolVersion: '2024-11-05',
          capabilities: {
            tools: {}
          },
          serverInfo: {
            name: 'mipa-antigravity-bridge',
            version: BRIDGE_VERSION
          }
        });
      } else if (method === 'tools/list') {
        sendResponse(id, {
          tools: [
            {
              name: 'mipa_get_status',
              description: 'Get real-time operational status, active branch, backlog tasks, and recent deployments of Mipa.',
              inputSchema: {
                type: 'object',
                properties: {}
              }
            },
            {
              name: 'mipa_query_knowledge',
              description: 'Query Mipa system rules, pricing tiers, system dynamics formulas, or architecture.',
              inputSchema: {
                type: 'object',
                properties: {
                  query: { type: 'string', description: 'The question or topic to look up (e.g. leverage formula, pricing, tech stack).' }
                },
                required: ['query']
              }
            },
            {
              name: 'mipa_queue_task',
              description: 'Directly append an engineering task to Mipa docs/BACKLOG.md for Antigravity to build and deploy.',
              inputSchema: {
                type: 'object',
                properties: {
                  title: { type: 'string', description: 'Short title of the feature or bugfix.' },
                  description: { type: 'string', description: 'Detailed specification and context.' },
                  criteria: { type: 'array', items: { type: 'string' }, description: 'List of acceptance criteria.' }
                },
                required: ['title', 'description']
              }
            }
          ]
        });
      } else if (method === 'tools/call') {
        const { name, arguments: args } = params;
        if (name === 'mipa_get_status') {
          const status = getMipaStatus();
          sendResponse(id, {
            content: [{ type: 'text', text: JSON.stringify(status, null, 2) }]
          });
        } else if (name === 'mipa_query_knowledge') {
          const answer = queryKnowledge(args?.query || '');
          sendResponse(id, {
            content: [{ type: 'text', text: JSON.stringify(answer, null, 2) }]
          });
        } else if (name === 'mipa_queue_task') {
          const result = queueBacklogTask(args.title, args.description, args.criteria || []);
          sendResponse(id, {
            content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
          });
        } else {
          sendResponse(id, null, { code: -32601, message: `Tool not found: ${name}` });
        }
      } else {
        if (id) {
          sendResponse(id, {});
        }
      }
    } catch {
      // Ignore JSON parse errors
    }
  });
}

// -------------------------------------------------------------
// Local HTTP Server Mode
// -------------------------------------------------------------
export function runHttpServer(port = 9876) {
  const server = http.createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const parsedUrl = new URL(req.url, `http://localhost:${port}`);

    if (req.method === 'GET' && parsedUrl.pathname === '/status') {
      res.writeHead(200);
      res.end(JSON.stringify(getMipaStatus(), null, 2));
      return;
    }

    if (req.method === 'GET' && parsedUrl.pathname === '/query') {
      const query = parsedUrl.searchParams.get('q') || '';
      res.writeHead(200);
      res.end(JSON.stringify(queryKnowledge(query), null, 2));
      return;
    }

    if (req.method === 'POST' && parsedUrl.pathname === '/task') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        try {
          const data = JSON.parse(body);
          const result = queueBacklogTask(data.title, data.description, data.criteria);
          res.writeHead(200);
          res.end(JSON.stringify(result, null, 2));
        } catch (err) {
          res.writeHead(400);
          res.end(JSON.stringify({ error: err.message }));
        }
      });
      return;
    }

    res.writeHead(404);
    res.end(JSON.stringify({ error: 'Endpoint not found. Use /status, /query?q=..., or POST /task' }));
  });

  server.listen(port, '127.0.0.1', () => {
    console.log(`[Mipa Bridge] HTTP Server running at http://127.0.0.1:${port}`);
    console.log(`  Endpoints:`);
    console.log(`    GET  http://127.0.0.1:${port}/status`);
    console.log(`    GET  http://127.0.0.1:${port}/query?q=formula`);
    console.log(`    POST http://127.0.0.1:${port}/task (JSON: { title, description, criteria })`);
  });
}

/**
 * Checks whether this script was executed directly from the command line.
 */
export function isMainModule() {
  if (!process.argv[1]) return false;
  try {
    const entryPath = fs.realpathSync(path.resolve(process.argv[1]));
    const currentPath = fs.realpathSync(fileURLToPath(import.meta.url));
    return entryPath === currentPath;
  } catch {
    return false;
  }
}

// -------------------------------------------------------------
// CLI Dispatcher (Only runs when executed as main script)
// -------------------------------------------------------------
if (isMainModule()) {
  const args = process.argv.slice(2);

  if (args.includes('--mcp')) {
    runMcpServer();
  } else if (args.includes('--server')) {
    const portIdx = args.indexOf('--server') + 1;
    const port = args[portIdx] ? parseInt(args[portIdx], 10) : 9876;
    runHttpServer(port);
  } else {
    const command = args[0];
    if (command === 'status') {
      console.log(JSON.stringify(getMipaStatus(), null, 2));
    } else if (command === 'query') {
      const q = args.slice(1).join(' ');
      console.log(JSON.stringify(queryKnowledge(q), null, 2));
    } else if (command === 'queue') {
      const title = args[1];
      const description = args[2] || '';
      if (!title) {
        console.error('Error: Task title is required.');
        console.error('Usage: node scripts/mipa-bridge.js queue "<title>" "<description>"');
        process.exit(1);
      }
      try {
        const result = queueBacklogTask(title, description);
        console.log(JSON.stringify(result, null, 2));
      } catch (err) {
        console.error('Error queuing task:', err.message);
        process.exit(1);
      }
    } else {
      console.log(`Mipa <-> Hermes Bridge (v${BRIDGE_VERSION})`);
      console.log(`Usage:`);
      console.log(`  node scripts/mipa-bridge.js status`);
      console.log(`  node scripts/mipa-bridge.js query "<topic>"`);
      console.log(`  node scripts/mipa-bridge.js queue "<title>" "<description>"`);
      console.log(`  node scripts/mipa-bridge.js --mcp           (Runs MCP stdio server)`);
      console.log(`  node scripts/mipa-bridge.js --server [port] (Runs local HTTP API)`);
    }
  }
}

export default {
  getMipaStatus,
  queryKnowledge,
  queueBacklogTask,
  readGitInfoDirectly,
  parseBacklog,
  getLocalTodayDateString,
  runMcpServer,
  runHttpServer,
  isMainModule
};
