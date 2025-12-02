import { serveDir } from "https://deno.land/std@0.224.0/http/file_server.ts";

const root = Deno.env.get("STATIC_DIR") ?? "static/dist";

Deno.serve((req) => serveDir(req, { fsRoot: root, quiet: true }));
