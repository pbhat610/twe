import Ajv2020, { type ValidateFunction } from "ajv/dist/2020";
import addFormats from "ajv-formats";
import type { SchemaValidator, ValidationResult } from "@/ports";
import planSchema from "../../../data/schemas/interview_plan.schema.json";
import reportSchema from "../../../data/schemas/interview_report.schema.json";

/**
 * Validates against the official JSON schemas in /data/schemas, so
 * "correct format" is proven against the contract, not our own copy of it.
 * Static imports keep them bundled with serverless functions (Vercel).
 */
export class AjvSchemaValidator implements SchemaValidator {
  private readonly plan: ValidateFunction;
  private readonly report: ValidateFunction;

  constructor(schemas: { plan: object; report: object } = { plan: planSchema, report: reportSchema }) {
    // The official schemas are JSON Schema draft 2020-12.
    const ajv = new Ajv2020({ allErrors: true, strict: false });
    addFormats(ajv);
    this.plan = ajv.compile(schemas.plan);
    this.report = ajv.compile(schemas.report);
  }

  validatePlan(plan: unknown) {
    return this.run(this.plan, plan);
  }

  validateReport(report: unknown) {
    return this.run(this.report, report);
  }

  private run(fn: ValidateFunction, data: unknown): ValidationResult {
    const valid = fn(data) as boolean;
    return {
      valid,
      errors: (fn.errors ?? []).map((e) => `${e.instancePath || "/"} ${e.message ?? "invalid"}`),
    };
  }
}
