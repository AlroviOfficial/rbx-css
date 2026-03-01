#!/usr/bin/env node
import { createCLI } from "./cli.ts";

createCLI().parse(process.argv);
