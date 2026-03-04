/**
 * Domain Port: Skill
 * Common interface for all skills
 */

export interface Skill<TInput, TOutput> {
  readonly name: string;
  readonly description: string;
  execute(input: TInput): Promise<TOutput>;
}

export interface SkillInfo {
  name: string;
  description: string;
}

/**
 * Skill Registry Port
 * Abstraction for skill management
 */
export interface ISkillRegistry {
  register(skill: Skill<unknown, unknown>): void;
  get(name: string): Skill<unknown, unknown> | undefined;
  list(): SkillInfo[];
  execute(name: string, input: unknown): Promise<unknown>;
}
