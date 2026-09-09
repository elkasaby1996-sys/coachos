import { z } from "zod";
import { COMMERCIAL_FEATURE_KEYS, PUBLIC_PLAN_KEYS } from "./contracts";

const positiveInteger = z.number().int().positive();
const publicPlanSchema = z.object({
  planKey: z.enum(PUBLIC_PLAN_KEYS),
  planVersion: positiveInteger,
  displayName: z.string().trim().min(1),
  currencyCode: z
    .string()
    .length(3)
    .regex(/^[A-Z]{3}$/),
  monthlyPriceMinor: z.number().int().positive(),
  annualPriceMinor: z.number().int().positive(),
  capacities: z
    .object({
      countedClients: positiveInteger,
      includedCoachSeats: positiveInteger,
      maxCoachSeats: positiveInteger,
      activeWorkspaces: positiveInteger,
      publishedPackages: positiveInteger.nullable(),
    })
    .refine((value) => value.includedCoachSeats <= value.maxCoachSeats, {
      message: "Included coach seats exceed the maximum.",
    }),
  isMostPopular: z.boolean(),
  features: z.array(
    z.object({
      featureKey: z.enum(COMMERCIAL_FEATURE_KEYS),
      displayName: z.string().trim().min(1),
      marketingLabel: z.string().nullable(),
    }),
  ),
});

export const publicCommercialCatalogueSchema = z.object({
  schemaVersion: z.literal(1),
  plans: z.array(publicPlanSchema),
});
export type PublicCommercialCatalogue = z.infer<
  typeof publicCommercialCatalogueSchema
>;
export type PublicCommercialPlan = PublicCommercialCatalogue["plans"][number];

export class CommercialCatalogueError extends Error {
  constructor(public readonly code: "UNAVAILABLE" | "INVALID_PAYLOAD") {
    super(
      code === "UNAVAILABLE"
        ? "Commercial catalogue is unavailable."
        : "Commercial catalogue response is invalid.",
    );
    this.name = "CommercialCatalogueError";
  }
}

export type CommercialCatalogueResult =
  | { data: PublicCommercialCatalogue; error: null }
  | { data: null; error: CommercialCatalogueError };

type CatalogueClient = {
  rpc: (
    name: "get_public_commercial_catalogue",
  ) => PromiseLike<{ data: unknown; error: unknown }>;
};

export async function fetchPublicCommercialCatalogue(
  client?: CatalogueClient,
): Promise<CommercialCatalogueResult> {
  try {
    // Lazy loading keeps static public pricing independent of Supabase configuration.
    const source = client ?? (await import("../../lib/supabase")).supabase;
    const { data, error } = await source.rpc("get_public_commercial_catalogue");
    if (error)
      return { data: null, error: new CommercialCatalogueError("UNAVAILABLE") };
    const parsed = publicCommercialCatalogueSchema.safeParse(data);
    return parsed.success
      ? { data: parsed.data, error: null }
      : { data: null, error: new CommercialCatalogueError("INVALID_PAYLOAD") };
  } catch {
    return { data: null, error: new CommercialCatalogueError("UNAVAILABLE") };
  }
}
