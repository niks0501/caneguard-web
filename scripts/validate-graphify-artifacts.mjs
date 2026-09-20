import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, lstatSync } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outputRoot = join(repositoryRoot, 'graphify-out');
const graphPath = join(outputRoot, 'graph.json');
const failures = [];

function fail(message) {
  failures.push(message);
}

function git(...args) {
  return execFileSync('git', args, {
    cwd: repositoryRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    fail(`cannot read ${relative(repositoryRoot, path)} as JSON: ${error.message}`);
    return null;
  }
}

function walkFiles(directory) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'cache') files.push(...walkFiles(path));
    } else if (entry.isFile()) {
      files.push(path);
    }
  }
  return files;
}

function nodeSource(node) {
  return typeof node?.source_file === 'string' ? node.source_file : '';
}

function hasSourceNode(nodesBySource, sourceFile) {
  return (nodesBySource.get(sourceFile) ?? []).length > 0;
}

const graph = readJson(graphPath);
if (!graph) process.exit(1);

if (!Array.isArray(graph.nodes) || !Array.isArray(graph.links)) {
  fail('graph.json must contain nodes and links arrays');
}

const nodes = Array.isArray(graph.nodes) ? graph.nodes : [];
const links = Array.isArray(graph.links) ? graph.links : [];
const nodeIds = new Set();
const nodesById = new Map();
const nodesBySource = new Map();

for (const node of nodes) {
  if (!node || typeof node !== 'object' || typeof node.id !== 'string' || node.id.length === 0) {
    fail('every graph node must have a non-empty string id');
    continue;
  }
  if (nodeIds.has(node.id)) fail(`duplicate node id: ${node.id}`);
  nodeIds.add(node.id);
  nodesById.set(node.id, node);

  const sourceFile = nodeSource(node);
  if (sourceFile.startsWith('/')) {
    fail(`absolute node provenance: ${sourceFile}`);
  }
  if (sourceFile.split('/').includes('..')) {
    fail(`parent-traversing node provenance: ${sourceFile}`);
  }
  if (sourceFile) {
    const sourceNodes = nodesBySource.get(sourceFile) ?? [];
    sourceNodes.push(node);
    nodesBySource.set(sourceFile, sourceNodes);
  }
}

const edgeKeys = new Set();
for (const link of links) {
  if (!link || typeof link !== 'object') {
    fail('every graph link must be an object');
    continue;
  }
  const { source, target, relation } = link;
  if (typeof source !== 'string' || typeof target !== 'string' || typeof relation !== 'string') {
    fail('every graph link must have string source, target, and relation fields');
    continue;
  }
  if (!nodeIds.has(source) || !nodeIds.has(target)) {
    fail(`dangling graph link: ${source} -> ${target}`);
  }
  if (source === target) fail(`self-loop graph link: ${source}`);
  const key = `${source}\u0000${target}\u0000${relation}\u0000${link.source_file ?? ''}\u0000${link.source_location ?? ''}`;
  if (edgeKeys.has(key)) fail(`duplicate graph link: ${source} -> ${target} (${relation})`);
  edgeKeys.add(key);

  if (typeof link.source_file === 'string') {
    if (link.source_file.startsWith('/')) fail(`absolute edge provenance: ${link.source_file}`);
    if (link.source_file.split('/').includes('..')) {
      fail(`parent-traversing edge provenance: ${link.source_file}`);
    }
  }
}

if (graph.directed !== false || graph.multigraph !== false) {
  fail('graph.json must preserve Graphify\'s directed=false, multigraph=false contract');
}

let head = '';
let parents = [];
try {
  head = git('rev-parse', 'HEAD');
  parents = git('rev-list', '--parents', '-n', '1', head).split(/\s+/).slice(1);
} catch (error) {
  fail(`cannot determine Git freshness: ${error.message}`);
}

if (!/^[0-9a-f]{40}$/.test(graph.built_at_commit ?? '')) {
  fail('graph.json must record a 40-character built_at_commit');
} else if (head && graph.built_at_commit !== head && !parents.includes(graph.built_at_commit)) {
  fail(`graph was built at ${graph.built_at_commit}, but HEAD is ${head} and its direct parents are ${parents.join(', ')}`);
}

const rootMarkerPath = join(outputRoot, '.graphify_root');
try {
  if (readFileSync(rootMarkerPath, 'utf8').trim() !== '.') {
    fail('graphify-out/.graphify_root must contain the repository-relative marker "."');
  }
} catch (error) {
  fail(`cannot read graphify-out/.graphify_root: ${error.message}`);
}

const machineMarkerPath = join(outputRoot, '.graphify_python');
try {
  lstatSync(machineMarkerPath);
  fail('graphify-out/.graphify_python must not be committed because it records a machine-local interpreter path');
} catch (error) {
  if (error.code !== 'ENOENT') fail(`cannot inspect graphify-out/.graphify_python: ${error.message}`);
}

for (const guidanceFile of ['AGENTS.md', 'CLAUDE.md']) {
  const guidancePath = join(repositoryRoot, guidanceFile);
  try {
    if (!lstatSync(guidancePath).isFile()) fail(`${guidanceFile} must be a repository-local regular file`);
  } catch (error) {
    fail(`cannot inspect ${guidanceFile}: ${error.message}`);
  }
}

for (const filePath of walkFiles(outputRoot)) {
  const extension = extname(filePath).toLowerCase();
  if (!['.json', '.html', '.md', '.txt', '.sig'].includes(extension)) continue;
  const text = readFileSync(filePath, 'utf8');
  if (/(?:^|["'\\s])(?:\/(?:home|Users)\/|[A-Za-z]:[\\/])/.test(text)) {
    fail(`machine-local absolute path in ${relative(repositoryRoot, filePath)}`);
  }
}

const requiredSourceFiles = [
  'README.md',
  'AGENTS.md',
  'PROJECT_CONTEXT.md',
  'PROJECT_CHECKS.md',
  'PROJECT_STACK.md',
  'package.json',
  'api/composer.json',
  'api/routes/api.php',
  'src/App.tsx',
  'src/app/router.tsx',
];
for (const sourceFile of requiredSourceFiles) {
  if (!hasSourceNode(nodesBySource, sourceFile)) fail(`missing required source node: ${sourceFile}`);
}

function linkMatches(predicate) {
  return links.some((link) => predicate(link, nodesById.get(link.target) ?? null));
}

const realProjectConnections = [
  ['src/App.tsx imports the router', (link, target) => link.source_file === 'src/App.tsx' && link.relation === 'imports_from' && nodeSource(target) === 'src/app/router.tsx'],
  ['the router imports the case review page', (link, target) => link.source_file === 'src/app/router.tsx' && link.relation === 'imports_from' && nodeSource(target) === 'src/pages/CaseReviewPage.tsx'],
  ['package.json contains its dependency tree', (link, target) => link.source_file === 'package.json' && link.relation === 'contains' && target?.label === 'dependencies'],
  ['the API route table imports controllers', (link, target) => link.source_file === 'api/routes/api.php' && link.relation === 'imports' && nodeSource(target).startsWith('api/app/Http/Controllers/')],
  ['PROJECT_CONTEXT.md contains its project context', (link, target) => link.source_file === 'PROJECT_CONTEXT.md' && link.relation === 'contains' && target?.label === 'Project Context'],
  ['AGENTS.md contains extracted guidance relationships', (link) => link.source_file === 'AGENTS.md' && ['contains', 'implements', 'references'].includes(link.relation)],
];
for (const [description, predicate] of realProjectConnections) {
  if (!linkMatches(predicate)) fail(`missing expected real connection: ${description}`);
}

if (failures.length > 0) {
  console.error('Graphify artifact validation failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Graphify artifacts valid: ${nodes.length} nodes, ${links.length} links, source ${graph.built_at_commit}`);
