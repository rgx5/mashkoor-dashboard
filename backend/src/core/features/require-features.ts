import { SetMetadata } from "@nestjs/common";
import type { FeatureName } from "@mashkoor/shared";

export const FEATURES_KEY = "mashkoor:features";

/**
 * Marks a controller (or a single route) as belonging to an optional area of the platform (see ENABLED_FEATURES).
 * When any listed feature is switched off, `FeatureGuard` answers 404 as if the route did not exist.
 * Routes under `/b2b` and `/b2c` are gated automatically by the `b2b` and `portal` features.
 */
export const RequireFeatures = (...features: FeatureName[]) => SetMetadata(FEATURES_KEY, features);
