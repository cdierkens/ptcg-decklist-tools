#!/usr/bin/env node
/** Copy the generated JSON into `dist/` beside the compiled `data.js`. */
import { cpSync, mkdirSync } from "node:fs";

mkdirSync("dist/data", { recursive: true });
cpSync("src/data", "dist/data", { recursive: true });
