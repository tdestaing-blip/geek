import base from "@geek/config/eslint/base";
import { defineConfig, globalIgnores } from "eslint/config";

export default defineConfig([...base, globalIgnores(["src/database.types.ts"])]);
