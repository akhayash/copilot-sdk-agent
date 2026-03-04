/**
 * Application Layer: Skill Registry Implementation
 */

import type { Skill, SkillInfo, ISkillRegistry } from '../../domain/ports/skills/skill';
import { getPptxgenAdapter } from '../../infrastructure/skills/pptxgen-adapter';

export class SkillRegistry implements ISkillRegistry {
  private skills = new Map<string, Skill<unknown, unknown>>();

  register(skill: Skill<unknown, unknown>): void {
    this.skills.set(skill.name.toLowerCase(), skill);
  }

  get(name: string): Skill<unknown, unknown> | undefined {
    return this.skills.get(name.toLowerCase());
  }

  list(): SkillInfo[] {
    return Array.from(this.skills.values()).map((skill) => ({
      name: skill.name,
      description: skill.description,
    }));
  }

  async execute(name: string, input: unknown): Promise<unknown> {
    const skill = this.get(name);
    if (!skill) {
      throw new Error(`Skill "${name}" not found`);
    }
    return skill.execute(input);
  }
}

// Singleton instance
let registryInstance: SkillRegistry | null = null;

export function getSkillRegistry(): SkillRegistry {
  if (!registryInstance) {
    registryInstance = new SkillRegistry();
    registryInstance.register(getPptxgenAdapter());
  }
  return registryInstance;
}
