import { defineConfig, globalIgnores } from "eslint/config";
import expoConfig from "eslint-config-expo/flat.js";

export default defineConfig([
  globalIgnores(["node_modules/**", "dist/**", ".expo/**"]),
  expoConfig,
]);
