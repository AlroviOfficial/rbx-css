#!/usr/bin/env bun
import { createCLI } from "./cli.ts";

createCLI().parse(process.argv);
