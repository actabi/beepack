/**
 * Skill Parser
 * Deterministic extractor for SKILL.md and supporting scripts.
 * Pulls out shell commands, URLs, npm/pip packages, imports, and file I/O hints.
 *
 * Not LLM-based: output must be reproducible for the verdict aggregator.
 */

const SHELL_LANGS = new Set(['bash', 'sh', 'shell', 'zsh', 'console', 'terminal', '']);
const JS_LANGS = new Set(['javascript', 'js', 'typescript', 'ts', 'tsx', 'jsx', 'mjs', 'cjs']);
const PY_LANGS = new Set(['python', 'py', 'python3']);

const URL_RE = /https?:\/\/[^\s)\]'">`]+/gi;
const MD_CODE_FENCE_RE = /```([^\n`]*)\n([\s\S]*?)```/g;
const MD_INLINE_CODE_RE = /`([^`\n]+)`/g;

const SHELL_COMMAND_SPLIT_RE = /(?:\|\||&&|;|\n|\|)/;

const NPM_INSTALL_COMMANDS = new Set(['install', 'i', 'add', 'in', 'ins']);
const YARN_INSTALL = new Set(['add']);
const PIP_INSTALL_SUB = new Set(['install']);

// Paths we treat as file references (read/write)
const FILE_IO_COMMANDS = new Set(['cat', 'less', 'more', 'head', 'tail', 'tee', 'cp', 'mv', 'rm', 'touch', 'chmod', 'chown']);

/**
 * Public API: parse a skill (SKILL.md + optional scripts).
 *
 * @param {string} markdown - SKILL.md content
 * @param {Array<{name:string, content:string}>} [scripts] - referenced scripts
 * @returns {{
 *   shellCommands: Array<{command:string, args:string[], raw:string, source:string, line:number}>,
 *   urls: Array<{url:string, source:string, line:number}>,
 *   npmPackages: Array<{name:string, version?:string, reason:string, source:string, line:number}>,
 *   pipPackages: Array<{name:string, version?:string, reason:string, source:string, line:number}>,
 *   imports: Array<{module:string, language:string, source:string, line:number}>,
 *   fileRefs: Array<{path:string, op:string, source:string, line:number}>
 * }}
 */
export function parseSkill(markdown, scripts = []) {
  const out = {
    shellCommands: [],
    urls: [],
    npmPackages: [],
    pipPackages: [],
    imports: [],
    fileRefs: [],
  };

  parseMarkdown(markdown || '', 'SKILL.md', out);

  for (const script of scripts || []) {
    const lang = detectLangFromName(script.name);
    parseSource(script.content || '', lang, script.name, out);
  }

  dedupe(out);
  return out;
}

function detectLangFromName(name) {
  const lower = name.toLowerCase();
  if (lower.endsWith('.sh') || lower.endsWith('.bash') || lower.endsWith('.zsh')) return 'bash';
  if (lower.endsWith('.js') || lower.endsWith('.mjs') || lower.endsWith('.cjs')) return 'javascript';
  if (lower.endsWith('.ts') || lower.endsWith('.tsx')) return 'typescript';
  if (lower.endsWith('.jsx')) return 'javascript';
  if (lower.endsWith('.py')) return 'python';
  if (lower.endsWith('.yaml') || lower.endsWith('.yml')) return 'yaml';
  if (lower.endsWith('.json')) return 'json';
  if (lower.endsWith('.md') || lower.endsWith('.markdown')) return 'markdown';
  return '';
}

function parseMarkdown(md, source, out) {
  // Scan all URLs in free text (outside code blocks is fine to also include inside code)
  extractUrls(md, source, 1, out);

  // Code fences with language tag
  let match;
  MD_CODE_FENCE_RE.lastIndex = 0;
  while ((match = MD_CODE_FENCE_RE.exec(md)) !== null) {
    const tag = (match[1] || '').trim().toLowerCase().split(/\s+/)[0] || '';
    const code = match[2];
    const line = lineOfOffset(md, match.index);
    parseSource(code, tag, source, out, line);
  }

  // Inline backticks: look for commands that start with npx/pip/curl
  MD_INLINE_CODE_RE.lastIndex = 0;
  while ((match = MD_INLINE_CODE_RE.exec(md)) !== null) {
    const inline = match[1].trim();
    if (looksLikeCommand(inline)) {
      const line = lineOfOffset(md, match.index);
      parseShellLine(inline, source, line, out);
    }
  }
}

function looksLikeCommand(s) {
  return /^(npx|npm|yarn|pnpm|bun|pip|pip3|python|python3|curl|wget|bash|sh)\b/.test(s);
}

function parseSource(code, lang, source, out, baseLine = 1) {
  if (SHELL_LANGS.has(lang)) {
    parseShellBlock(code, source, baseLine, out);
    // Untagged fences often contain requirements.txt or package.json snippets
    if (lang === '') parseDepFileHints(code, source, baseLine, out);
  } else if (JS_LANGS.has(lang)) {
    parseJsBlock(code, lang, source, baseLine, out);
  } else if (PY_LANGS.has(lang)) {
    parsePythonBlock(code, source, baseLine, out);
  } else if (lang === 'yaml' || lang === 'yml' || lang === 'json' || lang === 'toml') {
    // Still extract URLs and npm-looking patterns (dependency arrays)
    extractUrls(code, source, baseLine, out);
    parseDepFileHints(code, source, baseLine, out);
  } else {
    // Unknown tag: try shell as a best effort for the first line heuristic, but at minimum scan URLs
    extractUrls(code, source, baseLine, out);
    // If any line starts with a known command, treat as shell
    for (const line of code.split('\n')) {
      if (looksLikeCommand(line.trim())) {
        parseShellBlock(code, source, baseLine, out);
        break;
      }
    }
  }
}

function parseShellBlock(code, source, baseLine, out) {
  const lines = code.split('\n');
  let joined = '';
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    // Handle line continuations
    while (line.endsWith('\\') && i + 1 < lines.length) {
      line = line.slice(0, -1) + ' ' + lines[++i];
    }
    joined = line;
    const lineNum = baseLine + i;
    // Strip leading shell prompt markers like "$ " or "> " (not "#" - that is a comment)
    const stripped = joined.replace(/^\s*[$>]\s+/, '').trim();
    if (!stripped) continue;
    if (stripped.startsWith('#')) continue; // comment
    // Split compound commands
    const parts = stripped.split(SHELL_COMMAND_SPLIT_RE);
    for (const part of parts) {
      parseShellLine(part.trim(), source, lineNum, out);
    }
  }
  extractUrls(code, source, baseLine, out);
}

function parseShellLine(line, source, lineNum, out) {
  if (!line) return;
  if (line.startsWith('#')) return;
  const tokens = tokenize(line);
  if (tokens.length === 0) return;
  const cmd = tokens[0];
  const args = tokens.slice(1);

  out.shellCommands.push({ command: cmd, args, raw: line, source, line: lineNum });

  // npx
  if (cmd === 'npx') {
    const pkg = extractNpxTarget(args);
    if (pkg) pushPkg(out.npmPackages, pkg, 'npx', source, lineNum);
  }
  // npm/pnpm/bun install
  else if (cmd === 'npm' || cmd === 'pnpm' || cmd === 'bun') {
    if (args.length >= 2 && NPM_INSTALL_COMMANDS.has(args[0])) {
      for (const a of args.slice(1)) {
        if (a.startsWith('-')) continue;
        pushPkg(out.npmPackages, splitPkgVersion(a), `${cmd} ${args[0]}`, source, lineNum);
      }
    }
  }
  // yarn add
  else if (cmd === 'yarn') {
    if (args.length >= 2 && YARN_INSTALL.has(args[0])) {
      for (const a of args.slice(1)) {
        if (a.startsWith('-')) continue;
        pushPkg(out.npmPackages, splitPkgVersion(a), 'yarn add', source, lineNum);
      }
    }
  }
  // pip install
  else if (cmd === 'pip' || cmd === 'pip3') {
    if (args.length >= 2 && PIP_INSTALL_SUB.has(args[0])) {
      collectPipTargets(args.slice(1), out, source, lineNum, `${cmd} install`);
    }
  }
  // python -m pip install
  else if ((cmd === 'python' || cmd === 'python3') && args[0] === '-m' && args[1] === 'pip' && args[2] === 'install') {
    collectPipTargets(args.slice(3), out, source, lineNum, 'python -m pip install');
  }
  // curl/wget: record URL targets
  else if (cmd === 'curl' || cmd === 'wget') {
    for (const a of args) {
      if (/^https?:\/\//i.test(a)) {
        out.urls.push({ url: stripQuotes(a), source, line: lineNum });
      }
    }
  }
  // file I/O hints
  else if (FILE_IO_COMMANDS.has(cmd)) {
    for (const a of args) {
      if (a.startsWith('-')) continue;
      if (/^https?:\/\//i.test(a)) continue;
      out.fileRefs.push({ path: a, op: cmd, source, line: lineNum });
    }
  }
}

function extractNpxTarget(args) {
  let i = 0;
  while (i < args.length) {
    const a = args[i];
    if (a === '-y' || a === '--yes' || a === '--no-install') { i++; continue; }
    if (a === '-p' || a === '--package') { i += 2; continue; }
    if (a.startsWith('-')) { i++; continue; }
    return splitPkgVersion(a);
  }
  return null;
}

function collectPipTargets(args, out, source, lineNum, reason) {
  let i = 0;
  while (i < args.length) {
    const a = args[i];
    if (a === '-r' || a === '--requirement') { i += 2; continue; }
    if (a === '-e' || a === '--editable') { i++; continue; }
    if (a.startsWith('-')) { i++; continue; }
    if (/^https?:\/\//i.test(a)) { i++; continue; }
    pushPkg(out.pipPackages, splitPipSpec(a), reason, source, lineNum);
    i++;
  }
}

function splitPkgVersion(spec) {
  const s = stripQuotes(spec);
  // Scoped: @scope/pkg or @scope/pkg@1.0.0
  if (s.startsWith('@')) {
    const slash = s.indexOf('/');
    if (slash === -1) return { name: s };
    const rest = s.slice(slash + 1);
    const at = rest.indexOf('@');
    if (at === -1) return { name: s };
    return { name: s.slice(0, slash + 1 + at), version: rest.slice(at + 1) };
  }
  const at = s.indexOf('@');
  if (at === -1) return { name: s };
  return { name: s.slice(0, at), version: s.slice(at + 1) };
}

function splitPipSpec(spec) {
  const s = stripQuotes(spec);
  // Split on == >= <= ~= != or space
  const m = s.match(/^([A-Za-z0-9._\-]+)\s*(?:(==|>=|<=|~=|!=|<|>)\s*(.+))?$/);
  if (!m) return { name: s };
  if (!m[2]) return { name: m[1] };
  return { name: m[1], version: `${m[2]}${m[3]}`.trim() };
}

function parseJsBlock(code, lang, source, baseLine, out) {
  const lines = code.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = baseLine + i;
    // import ... from 'pkg'  |  import 'pkg'
    const importMatch = line.match(/^\s*import\b.*?from\s+['"]([^'"]+)['"]/) || line.match(/^\s*import\s+['"]([^'"]+)['"]/);
    if (importMatch) {
      addJsImport(importMatch[1], lang, source, lineNum, out);
      continue;
    }
    // const x = require('pkg')
    const reqMatch = line.match(/require\s*\(\s*['"]([^'"]+)['"]\s*\)/);
    if (reqMatch) addJsImport(reqMatch[1], lang, source, lineNum, out);
    // dynamic import('pkg')
    const dynMatch = line.match(/import\s*\(\s*['"]([^'"]+)['"]\s*\)/);
    if (dynMatch) addJsImport(dynMatch[1], lang, source, lineNum, out);
  }
  extractUrls(code, source, baseLine, out);
}

function addJsImport(spec, lang, source, line, out) {
  // Ignore relative and absolute paths
  if (spec.startsWith('.') || spec.startsWith('/') || spec.startsWith('node:')) return;
  if (/^https?:/i.test(spec)) return;
  out.imports.push({ module: spec, language: 'javascript', source, line });
  // Map to npm package name (strip subpath)
  const pkgName = spec.startsWith('@')
    ? spec.split('/').slice(0, 2).join('/')
    : spec.split('/')[0];
  if (pkgName) pushPkg(out.npmPackages, { name: pkgName }, 'import', source, line);
}

function parsePythonBlock(code, source, baseLine, out) {
  const lines = code.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = baseLine + i;
    // from pkg.sub import x  |  import pkg.sub  |  import pkg as p
    const fromMatch = line.match(/^\s*from\s+([A-Za-z0-9_.]+)\s+import\b/);
    if (fromMatch) {
      addPyImport(fromMatch[1], source, lineNum, out);
      continue;
    }
    const imp = line.match(/^\s*import\s+([A-Za-z0-9_.]+(?:\s*,\s*[A-Za-z0-9_.]+)*)/);
    if (imp) {
      for (const mod of imp[1].split(',').map(s => s.trim())) {
        addPyImport(mod, source, lineNum, out);
      }
    }
  }
  extractUrls(code, source, baseLine, out);
}

function addPyImport(mod, source, line, out) {
  const top = mod.split('.')[0];
  if (!top) return;
  // Skip stdlib-ish via a conservative list: we don't have it, so include everything and let validator decide
  out.imports.push({ module: mod, language: 'python', source, line });
  pushPkg(out.pipPackages, { name: top }, 'import', source, line);
}

function parseDepFileHints(code, source, baseLine, out) {
  // Look for "dependencies": { "pkg": "^1.0" } in JSON-like content
  const depRe = /"(?:dependencies|devDependencies|peerDependencies)"\s*:\s*\{([^}]*)\}/g;
  let m;
  while ((m = depRe.exec(code)) !== null) {
    const block = m[1];
    const pkgRe = /"([^"]+)"\s*:\s*"([^"]+)"/g;
    let pm;
    const lineNum = baseLine + lineOfOffset(code, m.index) - 1;
    while ((pm = pkgRe.exec(block)) !== null) {
      pushPkg(out.npmPackages, { name: pm[1], version: pm[2] }, 'dependencies', source, lineNum);
    }
  }
  // requirements.txt style
  const lines = code.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    if (!t || t.startsWith('#')) continue;
    const m2 = t.match(/^([A-Za-z0-9._\-]+)\s*(==|>=|<=|~=|!=|<|>)\s*([A-Za-z0-9._\-]+)\s*$/);
    if (m2) pushPkg(out.pipPackages, { name: m2[1], version: `${m2[2]}${m2[3]}` }, 'requirements', source, baseLine + i);
  }
}

function extractUrls(text, source, baseLine, out) {
  URL_RE.lastIndex = 0;
  let m;
  while ((m = URL_RE.exec(text)) !== null) {
    const url = m[0].replace(/[.,;:)\]]+$/, '');
    out.urls.push({ url, source, line: baseLine + lineOfOffset(text, m.index) - 1 });
  }
}

// Simple shell tokenizer honoring single and double quotes
function tokenize(line) {
  const tokens = [];
  let cur = '';
  let quote = null;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quote) {
      if (c === quote) { quote = null; continue; }
      cur += c;
      continue;
    }
    if (c === '"' || c === "'") { quote = c; continue; }
    if (c === '\\' && i + 1 < line.length) { cur += line[++i]; continue; }
    if (/\s/.test(c)) {
      if (cur) { tokens.push(cur); cur = ''; }
      continue;
    }
    cur += c;
  }
  if (cur) tokens.push(cur);
  return tokens;
}

function stripQuotes(s) {
  if (!s) return s;
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1);
  }
  return s;
}

function lineOfOffset(text, offset) {
  let line = 1;
  for (let i = 0; i < offset && i < text.length; i++) {
    if (text[i] === '\n') line++;
  }
  return line;
}

function pushPkg(arr, spec, reason, source, line) {
  if (!spec || !spec.name) return;
  // Basic validity: npm name must be non-empty; strip trailing punctuation from inline extracts
  const name = spec.name.replace(/[.,;:)\]'"]+$/, '');
  if (!name) return;
  arr.push({ name, version: spec.version, reason, source, line });
}

function dedupe(out) {
  out.shellCommands = uniqBy(out.shellCommands, x => `${x.source}|${x.line}|${x.raw}`);
  out.urls = uniqBy(out.urls, x => `${x.source}|${x.url}`);
  out.npmPackages = uniqBy(out.npmPackages, x => `${x.name}|${x.version || ''}|${x.reason}|${x.source}|${x.line}`);
  out.pipPackages = uniqBy(out.pipPackages, x => `${x.name}|${x.version || ''}|${x.reason}|${x.source}|${x.line}`);
  out.imports = uniqBy(out.imports, x => `${x.source}|${x.line}|${x.language}|${x.module}`);
  out.fileRefs = uniqBy(out.fileRefs, x => `${x.source}|${x.line}|${x.op}|${x.path}`);
}

function uniqBy(arr, keyFn) {
  const seen = new Set();
  const res = [];
  for (const item of arr) {
    const k = keyFn(item);
    if (seen.has(k)) continue;
    seen.add(k);
    res.push(item);
  }
  return res;
}
