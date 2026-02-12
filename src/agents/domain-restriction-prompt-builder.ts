import type { DomainRestriction } from "../config/schema/custom-agents";

export function buildDomainRestrictionSection(
  restrictions?: DomainRestriction[]
): string {
  if (!restrictions || restrictions.length === 0) {
    return "";
  }

  const rows: string[] = ["## Domain Restrictions (MANDATORY)", ""];

  for (const restriction of restrictions) {
    rows.push(`### ${restriction.domain}`);
    rows.push(
      `**${restriction.restrictedTools.join(", ")} WILL BE BLOCKED** — Delegate to \`${restriction.ownerAgent}\`.`
    );
    rows.push("");
    rows.push("**ALLOWED read operations**: git status, git log, git diff, git show");
    rows.push("");
    rows.push("**Delegate using**:");
    rows.push("```");
    
    // Generate load_skills based on ownerAgent type
    const loadSkills = restriction.ownerAgent === "git-owner" 
      ? '["git-master"]' 
      : "[]";
    
    rows.push(
      `task(subagent_type="${restriction.ownerAgent}", load_skills=${loadSkills}, run_in_background=false, prompt="[describe operation]")`
    );
    rows.push("```");
    rows.push("");
  }

  return rows.join("\n").trimEnd();
}
