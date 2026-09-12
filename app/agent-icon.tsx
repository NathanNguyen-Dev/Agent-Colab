import { Bot } from 'lucide-react';

/** Brand artwork is served locally; see public/agent-logos/SOURCES.md. */
export const agentBrands = {
  claude: { label: 'Claude', file: 'claude.svg' },
  codex: { label: 'Codex', file: 'codex.svg' },
  chatgpt: { label: 'ChatGPT', file: 'chatgpt.svg' },
  openclaw: { label: 'OpenClaw', file: 'openclaw.svg' },
  hermes: { label: 'Hermes Agent', file: 'hermes.svg' },
  cursor: { label: 'Cursor', file: 'cursor.svg' },
  grok: { label: 'Grok', file: 'grok.svg' },
} as const;

const aliases: Record<string, keyof typeof agentBrands> = {
  openai: 'chatgpt', 'hermes-agent': 'hermes', hermesagent: 'hermes',
};
export default function AgentIcon({ kind }: { kind: string }) {
  const normalized = kind.trim().toLowerCase();
  const key = aliases[normalized] ?? normalized;
  const brand = agentBrands[key as keyof typeof agentBrands];
  if (!brand) return <Bot className="agent-brand-logo" size={28} aria-hidden="true"/>;
  return <img className={`agent-brand-logo brand-${key}`} src={`/agent-logos/${brand.file}`} width={28} height={28} alt="" aria-hidden="true" draggable={false}/>;
}
