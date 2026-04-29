/**
 * Cheap pattern-based scan.
 * Catches: leaked API keys, prompt-injection escape sequences, system-prompt
 * extraction attempts, obvious data exfil, common malware refs.
 *
 * NOT a substitute for sandboxed execution review — but stops 95% of garbage
 * from public scrape sources.
 */

import type { SecurityCheckResult } from "./types";

const PATTERNS: Array<{ name: string; regex: RegExp; weight: number }> = [
  { name: "openai_key",      regex: /sk-[A-Za-z0-9]{20,}/g, weight: 40 },
  { name: "anthropic_key",   regex: /sk-ant-[A-Za-z0-9_-]{20,}/g, weight: 40 },
  { name: "gemini_key",      regex: /AIza[0-9A-Za-z_-]{35}/g, weight: 40 },
  { name: "github_token",    regex: /ghp_[A-Za-z0-9]{30,}/g, weight: 35 },
  { name: "slack_webhook",   regex: /hooks\.slack\.com\/services\/T[A-Z0-9]+/g, weight: 30 },
  { name: "aws_access",      regex: /AKIA[0-9A-Z]{16}/g, weight: 40 },
  { name: "private_key_pem", regex: /-----BEGIN (RSA|EC|DSA|OPENSSH|PRIVATE) /g, weight: 50 },

  // Prompt injection / jailbreak markers
  { name: "ignore_previous", regex: /\bignore (all |the )?(previous|above) (instructions|prompts)\b/gi, weight: 25 },
  { name: "system_extract",  regex: /\b(reveal|dump|show me)( the| your)? system prompt\b/gi, weight: 25 },
  { name: "role_override",   regex: /\byou are (now |actually )(a |an )?(DAN|GPT-?dev|jailbroken)/gi, weight: 30 },

  // Data exfil hints
  { name: "fetch_to_url",    regex: /\bfetch\s*\(\s*['"]https?:\/\/(?!api\.openai\.com|api\.anthropic\.com|generativelanguage\.googleapis\.com)/gi, weight: 15 },
  { name: "send_to_webhook", regex: /\b(POST|send) (data|user_input|prompt)( to)? https?:\/\//gi, weight: 20 },

  // Malware / shell escapes
  { name: "shell_rm_rf",     regex: /\brm\s+-rf\s+\/(?!tmp|var\/cache)/g, weight: 50 },
  { name: "curl_pipe_sh",    regex: /\bcurl\s+[^|]+\|\s*(sh|bash)\b/g, weight: 35 },
];

export function scan(text: string): SecurityCheckResult {
  const flags: string[] = [];
  let riskScore = 0;

  for (const p of PATTERNS) {
    const matches = text.match(p.regex);
    if (matches && matches.length > 0) {
      flags.push(`${p.name}(x${matches.length})`);
      riskScore += p.weight;
    }
  }

  riskScore = Math.min(100, riskScore);
  return {
    passed: riskScore < 30,
    scannedAt: new Date().toISOString(),
    flags,
    riskScore,
  };
}
