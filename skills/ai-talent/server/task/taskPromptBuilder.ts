/**
 * taskPromptBuilder.ts — Prompt construction utilities.
 * Builds system and user prompts for task execution.
 */
export { buildSystemPrompt, buildUserPrompt } from "../executeTask";

/** Format agent skills array into a readable prompt block */
export function formatAgentSkills(skills: string[]): string {
  if (!skills.length) return "";
  return `\n【Agent 技能】\n${skills.map((s, i) => `${i + 1}. ${s}`).join("\n")}`;
}
