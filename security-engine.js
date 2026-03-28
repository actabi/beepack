/**
 * Beepack Security Engine
 * Inspired by ClawHub's moderation engine (MIT license)
 *
 * 3-layer security pipeline:
 * 1. Static deterministic scan (regex-based)
 * 2. LLM evaluation (OpenAI) - async
 * 3. Community reporting with auto-hide
 */

// Severity levels
const SEVERITY = { INFO: 'info', WARN: 'warn', CRITICAL: 'critical' };

// Static scan patterns
const PATTERNS = [
  // Code execution
  { code: 'EVAL_USAGE', pattern: /\beval\s*\(/, severity: SEVERITY.CRITICAL, description: 'eval() call detected - potential code injection' },
  { code: 'NEW_FUNCTION', pattern: /new\s+Function\s*\(/, severity: SEVERITY.CRITICAL, description: 'new Function() detected - dynamic code execution' },
  { code: 'CHILD_PROCESS', pattern: /child_process|exec\s*\(|execSync|spawn\s*\(|spawnSync/, severity: SEVERITY.WARN, description: 'Process execution detected' },
  { code: 'VM_USAGE', pattern: /\brequire\s*\(\s*['"]vm['"]\s*\)|import\s+.*from\s+['"]vm['"]/, severity: SEVERITY.WARN, description: 'VM module usage detected' },

  // Network exfiltration (only flag when env vars are passed as body/data, not as auth headers - that's normal)
  { code: 'CREDENTIAL_HARVEST', pattern: /process\.env[\s\S]{0,50}(body|data|payload|JSON\.stringify)[\s\S]{0,50}(fetch|http|axios)/, severity: SEVERITY.CRITICAL, description: 'Env vars sent as request body - potential credential exfiltration', fileTypes: ['js', 'ts', 'mjs'] },
  { code: 'ENV_MASS_READ', pattern: /Object\.(keys|entries|values)\s*\(\s*process\.env\s*\)/, severity: SEVERITY.CRITICAL, description: 'Reading all environment variables at once', fileTypes: ['js', 'ts', 'mjs'] },
  { code: 'WEBSOCKET_NONSTANDARD', pattern: /new\s+WebSocket\s*\(\s*['"]ws:\/\/(?!localhost)/, severity: SEVERITY.WARN, description: 'WebSocket connection to non-localhost' },

  // Obfuscation
  { code: 'HEX_OBFUSCATION', pattern: /\\x[0-9a-fA-F]{2}(\\x[0-9a-fA-F]{2}){10,}/, severity: SEVERITY.CRITICAL, description: 'Long hex-encoded string detected - possible obfuscation' },
  { code: 'BASE64_LARGE', pattern: /[A-Za-z0-9+/=]{200,}/, severity: SEVERITY.WARN, description: 'Large base64-encoded string detected' },
  { code: 'BASE64_EXEC', pattern: /atob\s*\(|Buffer\.from\s*\([^)]+,\s*['"]base64['"][\s\S]{0,100}(eval|exec|spawn|Function)/, severity: SEVERITY.CRITICAL, description: 'Base64 decode near code execution' },

  // Crypto mining
  { code: 'CRYPTO_MINER', pattern: /xmrig|coinhive|cryptonight|minergate|coin-?hive|stratum\+tcp/i, severity: SEVERITY.CRITICAL, description: 'Crypto mining reference detected' },

  // Malicious install patterns
  { code: 'CURL_PIPE_BASH', pattern: /curl\s+.*\|\s*(ba)?sh/i, severity: SEVERITY.CRITICAL, description: 'curl pipe to shell - dangerous install pattern' },
  { code: 'WGET_PIPE', pattern: /wget\s+.*\|\s*(ba)?sh/i, severity: SEVERITY.CRITICAL, description: 'wget pipe to shell - dangerous install pattern' },
  { code: 'URL_SHORTENER', pattern: /https?:\/\/(bit\.ly|tinyurl|t\.co|goo\.gl|is\.gd|buff\.ly|ow\.ly)\//i, severity: SEVERITY.WARN, description: 'URL shortener detected - obscures destination' },
  { code: 'RAW_IP_URL', pattern: /https?:\/\/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/, severity: SEVERITY.WARN, description: 'Direct IP address URL - suspicious' },

  // File system access
  { code: 'SSH_KEY_ACCESS', pattern: /\.ssh\/|id_rsa|id_ed25519|authorized_keys/, severity: SEVERITY.CRITICAL, description: 'SSH key file access detected' },
  { code: 'PASSWD_ACCESS', pattern: /\/etc\/passwd|\/etc\/shadow/, severity: SEVERITY.CRITICAL, description: 'System password file access' },
  { code: 'BROWSER_CREDS', pattern: /Chrome\/.*Login Data|Firefox\/.*logins\.json|\.mozilla.*key[34]\.db/i, severity: SEVERITY.CRITICAL, description: 'Browser credential file access' },

  // Prompt injection
  { code: 'PROMPT_INJECTION', pattern: /ignore\s+(all\s+)?previous\s+instructions|disregard\s+(all\s+)?prior|forget\s+(everything|all\s+rules)/i, severity: SEVERITY.CRITICAL, description: 'Prompt injection attempt detected' },
  { code: 'SYSTEM_OVERRIDE', pattern: /you\s+are\s+now\s+a|act\s+as\s+if\s+you\s+are|pretend\s+(you\s+are|to\s+be)/i, severity: SEVERITY.WARN, description: 'System prompt override attempt' },

  // Suspicious npm/pip installs
  { code: 'GLOBAL_INSTALL', pattern: /npm\s+install\s+-g|pip\s+install\s+--user/, severity: SEVERITY.WARN, description: 'Global package install detected' },
  { code: 'SUDO_USAGE', pattern: /\bsudo\s+/, severity: SEVERITY.WARN, description: 'sudo usage detected - privilege escalation' },
];

// Known malicious patterns (blacklist)
const BLACKLISTED_SLUGS = [];

/**
 * Run static security scan on package files
 * @param {Array<{name: string, content: string}>} files - Files to scan
 * @returns {Object} Scan results with findings and verdict
 */
export function runStaticScan(files) {
  const findings = [];
  let hasCritical = false;

  for (const file of files) {
    const content = typeof file.content === 'string' ? file.content : file.content.toString('utf8');

    const fileExt = (file.name || '').split('.').pop()?.toLowerCase();

    for (const pattern of PATTERNS) {
      // Skip patterns that only apply to specific file types
      if (pattern.fileTypes && !pattern.fileTypes.includes(fileExt)) continue;

      const matches = content.match(new RegExp(pattern.pattern, 'gi'));
      if (matches) {
        findings.push({
          code: pattern.code,
          severity: pattern.severity,
          description: pattern.description,
          file: file.name,
          matches: matches.length,
          evidence: matches[0].slice(0, 100),
        });

        if (pattern.severity === SEVERITY.CRITICAL) {
          hasCritical = true;
        }
      }
    }
  }

  // Determine verdict
  let verdict = 'clean';
  if (hasCritical) verdict = 'malicious';
  else if (findings.some(f => f.severity === SEVERITY.WARN)) verdict = 'suspicious';

  return {
    verdict,
    findings,
    criticalCount: findings.filter(f => f.severity === SEVERITY.CRITICAL).length,
    warnCount: findings.filter(f => f.severity === SEVERITY.WARN).length,
    infoCount: findings.filter(f => f.severity === SEVERITY.INFO).length,
    scannedFiles: files.length,
    scanEngine: 'beepack-static-v1',
    scannedAt: new Date().toISOString(),
  };
}

/**
 * Run LLM security evaluation (async, non-blocking)
 * @param {Object} pkg - Package metadata
 * @param {Array<{name: string, content: string}>} files - Files to evaluate
 * @param {string} openaiKey - OpenAI API key
 * @returns {Object} LLM evaluation results
 */
export async function runLLMEvaluation(pkg, files, openaiKey) {
  if (!openaiKey) return { verdict: 'skipped', reason: 'No OpenAI API key configured' };

  const systemPrompt = `You are a security analyst for Beepack, an API package registry.
Your job is to evaluate packages for security risks. Analyze the package on 5 dimensions:

1. PURPOSE-CAPABILITY ALIGNMENT: Do the required env vars, dependencies match the stated purpose?
   - Flag if credentials are requested for unrelated services
   - Flag if binaries are required that don't match the description

2. INSTRUCTION SCOPE: Does the code stay within its stated purpose?
   - Flag if it accesses env vars beyond what's declared in requires
   - Flag if it makes network calls to undisclosed endpoints

3. INSTALL MECHANISM RISK: Are install instructions safe?
   - Flag curl|bash, URL shorteners, raw IP downloads
   - Flag requests to disable security features

4. CREDENTIAL PROPORTIONALITY: Are required env vars justified?
   - Flag env vars named SECRET/TOKEN/KEY/PASSWORD that aren't justified by the description
   - Flag excessive credential requirements for a simple utility

5. PERSISTENCE & PRIVILEGE: Does it try to persist or escalate?
   - Flag always-on configurations
   - Flag modification of other packages or system configs
   - Flag sudo or admin privilege requests

Respond in JSON format:
{
  "verdict": "benign" | "suspicious" | "malicious",
  "confidence": 0.0-1.0,
  "findings": [{"dimension": 1-5, "risk": "low|medium|high", "description": "..."}],
  "summary": "One sentence summary"
}`;

  const filesContent = files.map(f => {
    const content = typeof f.content === 'string' ? f.content : f.content.toString('utf8');
    return `### ${f.name}\n\`\`\`\n${content.slice(0, 5000)}\n\`\`\``;
  }).join('\n\n');

  const userMessage = `## Package: ${pkg.displayName || pkg.slug}
**Description:** ${pkg.description || 'None'}
**Required env vars:** ${JSON.stringify(pkg.requires?.env || [])}
**Required deps:** ${JSON.stringify(pkg.requires?.deps || [])}
**Keywords:** ${JSON.stringify(pkg.keywords || [])}
**Capabilities:** ${JSON.stringify(pkg.capabilities || [])}

## Source Files

${filesContent}`;

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openaiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
        temperature: 0,
        response_format: { type: 'json_object' },
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      return { verdict: 'skipped', reason: `OpenAI API error: ${response.status}` };
    }

    const data = await response.json();
    const result = JSON.parse(data.choices[0].message.content);

    return {
      verdict: result.verdict || 'benign',
      confidence: result.confidence || 0,
      findings: result.findings || [],
      summary: result.summary || '',
      model: 'gpt-4o-mini',
      evaluatedAt: new Date().toISOString(),
    };
  } catch (e) {
    return { verdict: 'skipped', reason: `LLM evaluation failed: ${e.message}` };
  }
}

/**
 * Build final moderation snapshot from all scan results
 */
export function buildModerationSnapshot(staticScan, llmEval) {
  const allFindings = [...(staticScan.findings || [])];

  // Add LLM findings if available
  if (llmEval && llmEval.findings) {
    llmEval.findings.forEach(f => {
      allFindings.push({
        code: `LLM_DIM${f.dimension}`,
        severity: f.risk === 'high' ? SEVERITY.CRITICAL : f.risk === 'medium' ? SEVERITY.WARN : SEVERITY.INFO,
        description: f.description,
        file: 'LLM evaluation',
        source: 'llm',
      });
    });
  }

  // Determine final verdict
  let finalVerdict = 'clean';

  if (staticScan.verdict === 'malicious' || (llmEval && llmEval.verdict === 'malicious')) {
    finalVerdict = 'malicious';
  } else if (staticScan.verdict === 'suspicious' || (llmEval && llmEval.verdict === 'suspicious')) {
    // If LLM says benign with high confidence, downgrade static suspicious
    if (llmEval && llmEval.verdict === 'benign' && llmEval.confidence > 0.8) {
      finalVerdict = 'clean';
    } else {
      finalVerdict = 'suspicious';
    }
  }

  return {
    verdict: finalVerdict,
    staticScan: {
      verdict: staticScan.verdict,
      criticalCount: staticScan.criticalCount,
      warnCount: staticScan.warnCount,
    },
    llmEval: llmEval ? {
      verdict: llmEval.verdict,
      confidence: llmEval.confidence,
      summary: llmEval.summary,
    } : null,
    findings: allFindings,
    totalFindings: allFindings.length,
    moderatedAt: new Date().toISOString(),
    engineVersion: 'beepack-security-v1',
  };
}

// Reporting constants
export const AUTO_HIDE_THRESHOLD = 3;
export const MAX_REPORTS_PER_USER = 20;
