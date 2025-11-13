/** @jest-environment jsdom */

// Minimal SUPABASE env + client mock to satisfy transitive imports
(global as any).SUPABASE_URL = 'test';
(global as any).SUPABASE_ANON_KEY = 'test';
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({}))
}));

jest.mock('../src/home/getters/get-indexed-db', () => ({
  saveNotificationsToCache: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../src/home/getters/get-github-access-token', () => ({
  getGitHubAccessToken: jest.fn(() => null),
}));

// Octokit is already stubbed via moduleNameMapper to return empty []

import { fetchIssues, fetchPullRequests, fetchAllNotifications, processNotifications, getIssueNotifications } from '../src/home/fetch-github/fetch-data';
import { GitHubIssue, GitHubNotification, GitHubNotifications, GitHubPullRequest } from '../src/home/github-types';
import { saveNotificationsToCache } from '../src/home/getters/get-indexed-db';

describe('fetch-data helpers', () => {
  const realFetch = global.fetch as any;

  afterEach(() => {
    jest.resetAllMocks();
    global.fetch = realFetch;
  });

  it('fetchIssues returns [] on non-ok response', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500, statusText: 'Internal Error' });
    const issues = await fetchIssues();
    expect(issues).toEqual([]);
  });

  it('fetchPullRequests returns parsed JSON on ok', async () => {
    const pr: Partial<GitHubPullRequest> = { url: 'https://api.github.com/repos/owner/repo/pulls/1', state: 'open', draft: false, body: '' };
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: jest.fn().mockResolvedValue([pr]) });
    const pulls = await fetchPullRequests();
    expect(pulls.length).toBe(1);
    expect(pulls[0].url).toBe(pr.url);
  });

  it('pre-filter excludes disallowed reasons and repos', () => {
    const devpoolRepos = new Set(['owner/repo']);
    const notifications: GitHubNotifications = [
      {
        id: 'n1',
        reason: 'comment', // should be filtered out
        subject: { title: 'Ignored', url: 'https://api.github.com/repos/owner/repo/issues/1', type: 'Issue' },
        repository: { full_name: 'owner/repo' },
        updated_at: '2023-01-01T00:00:00Z'
      } as unknown as GitHubNotification,
      {
        id: 'n2',
        reason: 'assign', // allowed reason, but wrong repo
        subject: { title: 'Wrong Repo', url: 'https://api.github.com/repos/other/repo/issues/2', type: 'Issue' },
        repository: { full_name: 'other/repo' },
        updated_at: '2023-01-01T00:00:00Z'
      } as unknown as GitHubNotification,
    ];

    const issues: Partial<GitHubIssue>[] = [
      { url: 'https://api.github.com/repos/owner/repo/issues/1', state: 'open', repository_url: 'https://api.github.com/repos/owner/repo' },
    ];
    const result = getIssueNotifications(devpoolRepos, notifications as any, issues as any);
    expect(result).toHaveLength(0);
  });

  it('processNotifications filters by Priority label and counts backlinks for issues', async () => {
    const notifications: GitHubNotifications = [
      {
        id: 'n3',
        reason: 'assign',
        subject: { title: 'Issue With Priority', url: 'https://api.github.com/repos/owner/repo/issues/42', type: 'Issue' },
        repository: { full_name: 'owner/repo' },
        updated_at: '2023-01-01T00:00:00Z'
      } as unknown as GitHubNotification,
      {
        id: 'n4',
        reason: 'assign',
        subject: { title: 'Issue Without Priority', url: 'https://api.github.com/repos/owner/repo/issues/43', type: 'Issue' },
        repository: { full_name: 'owner/repo' },
        updated_at: '2023-01-01T00:00:00Z'
      } as unknown as GitHubNotification,
    ];

    const issues: Partial<GitHubIssue>[] = [
      {
        url: 'https://api.github.com/repos/owner/repo/issues/42',
        state: 'open',
        number: 42,
        repository_url: 'https://api.github.com/repos/owner/repo',
        labels: [{ name: 'Priority: High' } as any],
        body: 'See details',
      },
      {
        url: 'https://api.github.com/repos/owner/repo/issues/43',
        state: 'open',
        number: 43,
        repository_url: 'https://api.github.com/repos/owner/repo',
        labels: [], // will be filtered out
        body: null as any,
      },
      // Another issue body linking by short ref
      {
        url: 'https://api.github.com/repos/owner/repo/issues/99',
        state: 'open',
        number: 99,
        repository_url: 'https://api.github.com/repos/owner/repo',
        labels: [],
        body: 'Related to #42',
      },
    ];

    const pullRequests: Partial<GitHubPullRequest>[] = [
      {
        url: 'https://api.github.com/repos/owner/repo/pulls/100',
        state: 'open',
        draft: false,
        base: { repo: { url: 'https://api.github.com/repos/owner/repo' } } as any,
        body: 'Fixes https://api.github.com/repos/owner/repo/issues/42', // full issue URL backlink
      },
    ];

    const result = await processNotifications(notifications as any, pullRequests as any, issues as any);
    expect(result).not.toBeNull();
    expect(result!.length).toBe(1);
    const agg = result![0];
    expect(agg.issue.number).toBe(42);
    // Should count 2 backlinks: PR full URL + short ref in an issue in same repo
    expect(agg.backlinkCount).toBeGreaterThanOrEqual(2);
  });

  it('fetchAllNotifications saves to cache when data returns', async () => {
    // Mock fetch for pulls and issues
    const pr: Partial<GitHubPullRequest> = { url: 'https://api.github.com/repos/owner/repo/pulls/1', state: 'open', draft: false, body: '' };
    const issue: Partial<GitHubIssue> = { url: 'https://api.github.com/repos/owner/repo/issues/1', state: 'open', repository_url: 'https://api.github.com/repos/owner/repo', labels: [{ name: 'Priority: High' }] as any };
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({ ok: true, json: jest.fn().mockResolvedValue([]) }) // pulls
      .mockResolvedValueOnce({ ok: true, json: jest.fn().mockResolvedValue([issue]) }); // issues

    const result = await fetchAllNotifications();
    expect(saveNotificationsToCache).toHaveBeenCalled();
    // With empty notifications from Octokit stub, returns []
    expect(result).toEqual([]);
  });
});
