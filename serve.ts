/// <reference lib="deno.ns" />

import { serveDir } from "jsr:@std/http/file-server";

const root = Deno.env.get("STATIC_DIR") ?? "static";

Deno.serve((req: Request) => serveDir(req, { fsRoot: root, quiet: true }));
