import eslint from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import tseslint from "typescript-eslint";

export default defineConfig([
  globalIgnores(["node_modules/**", "dist/**", "build/**", ".next/**", ".expo/**"]),
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
]);
