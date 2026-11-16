import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import {
  RECOMMENDED_CLAUDE_MODELS,
  DEFAULT_SYSTEM_ANTHROPIC_MODEL,
  RECOMMENDED_OPENAI_MODELS,
  DEFAULT_SYSTEM_OPENAI_MODEL
} from "../../functions/src/ai/providers";
import { PRESETS } from "@/pages/PageOrgAi.vue";

describe("AI Model Name Consistency & Freshness (MIPA-9)", () => {
  it("defines claude-haiku-5-5 as the system default Anthropic model", () => {
    expect(DEFAULT_SYSTEM_ANTHROPIC_MODEL).toBe("claude-haiku-5-5");
    expect(RECOMMENDED_CLAUDE_MODELS).toContain(DEFAULT_SYSTEM_ANTHROPIC_MODEL);
  });

  it("defines gpt-4o-mini as the system default OpenAI model", () => {
    expect(DEFAULT_SYSTEM_OPENAI_MODEL).toBe("gpt-4o-mini");
    expect(RECOMMENDED_OPENAI_MODELS).toContain(DEFAULT_SYSTEM_OPENAI_MODEL);
  });

  it("ensures all Anthropic preset models in PageOrgAi.vue exist in RECOMMENDED_CLAUDE_MODELS", () => {
    const anthropicPreset = PRESETS.find(p => p.id === "anthropic");
    expect(anthropicPreset).toBeDefined();

    expect(RECOMMENDED_CLAUDE_MODELS).toContain(anthropicPreset.defaultModel);
    for (const model of anthropicPreset.models) {
      expect(
        RECOMMENDED_CLAUDE_MODELS,
        `PageOrgAi.vue offered '${model}' but it is missing from providers.ts RECOMMENDED_CLAUDE_MODELS`
      ).toContain(model);
    }
  });

  it("ensures all OpenAI preset models in PageOrgAi.vue exist in RECOMMENDED_OPENAI_MODELS", () => {
    const openaiPreset = PRESETS.find(p => p.id === "openai");
    expect(openaiPreset).toBeDefined();

    expect(RECOMMENDED_OPENAI_MODELS).toContain(openaiPreset.defaultModel);
    for (const model of openaiPreset.models) {
      expect(
        RECOMMENDED_OPENAI_MODELS,
        `PageOrgAi.vue offered '${model}' but it is missing from providers.ts RECOMMENDED_OPENAI_MODELS`
      ).toContain(model);
    }
  });

  it("ensures OpenRouter preset does not reference retired claude-3.5 models", () => {
    const openrouterPreset = PRESETS.find(p => p.id === "openrouter");
    expect(openrouterPreset).toBeDefined();
    expect(openrouterPreset.defaultModel).not.toContain("claude-3.5");
    expect(openrouterPreset.defaultModel).not.toContain("claude-3-5");
    for (const model of openrouterPreset.models) {
      expect(model).not.toContain("claude-3.5");
      expect(model).not.toContain("claude-3-5");
    }
    expect(openrouterPreset.defaultModel).toBe("anthropic/claude-sonnet-5-5");
    expect(openrouterPreset.models).toContain("anthropic/claude-sonnet-5-5");
    expect(openrouterPreset.models).toContain("anthropic/claude-haiku-5-5");
  });

  it("prohibits retired Claude 3 / 3.5 model literals anywhere in src/ or functions/src/", () => {
    const retiredPatterns = [
      "claude-3-5-haiku-20241022",
      "claude-3.5-haiku",
      "claude-3.5-sonnet",
      "claude-3-5-sonnet",
      "claude-3-opus",
      "claude-3-sonnet",
      "claude-3-haiku"
    ];

    const dirsToScan = [
      path.resolve(process.cwd(), "src"),
      path.resolve(process.cwd(), "functions/src")
    ];

    function scanDir(dir) {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          scanDir(fullPath);
        } else if (
          entry.isFile() &&
          !entry.name.includes(".test.") &&
          !entry.name.includes(".spec.") &&
          (entry.name.endsWith(".js") || entry.name.endsWith(".ts") || entry.name.endsWith(".vue"))
        ) {
          const content = fs.readFileSync(fullPath, "utf8");
          for (const retired of retiredPatterns) {
            expect(
              content.includes(retired),
              `Found retired model name '${retired}' in file: ${fullPath}`
            ).toBe(false);
          }
        }
      }
    }

    for (const d of dirsToScan) {
      scanDir(d);
    }
  });
});
