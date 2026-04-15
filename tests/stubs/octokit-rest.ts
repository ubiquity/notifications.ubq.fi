import { mock } from "bun:test";

export class Octokit {
  request = mock().mockResolvedValue({ data: [] });
}
