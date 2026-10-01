import { ZodError } from "zod";
import { normalizeProjectFuelProfiles } from "../model/fuels";
import { normalizeLoadedProject } from "../model/project-normalize";
import { factoryProjectSchema } from "../model/schemas";
import type { FactoryProject } from "../model/types";

export class FactoryJsonError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FactoryJsonError";
  }
}

export function parseFactoryProjectJson(source: string): FactoryProject {
  let raw: unknown;

  try {
    raw = JSON.parse(source);
  } catch (error) {
    throw new FactoryJsonError(
      `Invalid JSON: ${error instanceof Error ? error.message : "Unknown parse error"}`,
    );
  }

  try {
    return normalizeLoadedProject(factoryProjectSchema.parse(raw));
  } catch (error) {
    if (error instanceof ZodError) {
      const issues = error.issues
        .map((issue) => `${issue.path.join(".") || "root"}: ${issue.message}`)
        .join("; ");
      throw new FactoryJsonError(`Invalid factory project: ${issues}`);
    }

    throw error;
  }
}

export function serializeFactoryProject(project: FactoryProject): string {
  const normalizedProject = normalizeProjectFuelProfiles(project);
  const exportSafeProject = {
    ...normalizedProject,
    recipes: normalizedProject.recipes.map((recipe) => {
      if (!recipe.machineHandlers?.length) {
        return recipe;
      }
      return {
        ...recipe,
        machineHandlers: recipe.machineHandlers.map((handler) => ({
          ...handler,
          label: handler.label || handler.machineType || recipe.machineType,
          machineType: handler.machineType || handler.label || recipe.machineType,
        })),
      };
    }),
  };
  const validatedProject = factoryProjectSchema.parse(exportSafeProject);
  return `${JSON.stringify(validatedProject, null, 2)}\n`;
}

export function cloneImportedProject(project: FactoryProject): FactoryProject {
  return {
    ...project,
    metadata: {
      ...project.metadata,
      updatedAt: new Date().toISOString(),
    },
  };
}
