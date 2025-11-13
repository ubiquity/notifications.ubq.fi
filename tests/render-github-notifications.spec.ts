/** @jest-environment jsdom */

(global as any).SUPABASE_URL = 'test';
(global as any).SUPABASE_ANON_KEY = 'test';

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({}))
}));
// Mock home module to avoid importing src/home/home.ts (which pulls auth setup)
jest.mock('../src/home/home', () => ({
  get notificationsContainer() {
    // Resolve the container dynamically to match the current DOM set in beforeEach
    return document.getElementById('notifications') as HTMLDivElement;
  },
  shouldShowBotNotifications: false
}));
jest.mock('../src/home/rendering/render-preview-modal');
jest.mock('../src/home/rendering/render-github-login-button');
jest.mock('../src/home/getters/get-github-access-token', () => ({
  getGitHubAccessToken: jest.fn()
}));

import { renderNotifications } from '../src/home/rendering/render-github-notifications';
import { getGitHubAccessToken } from '../src/home/getters/get-github-access-token';
import { GitHubAggregated } from '../src/home/github-types';

describe('renderNotifications', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="notifications"></div>';
    (global.fetch as jest.Mock).mockResolvedValue({
      json: jest.fn().mockResolvedValue({
        user: { login: 'testuser', type: 'User', avatar_url: 'https://example.com/avatar.png' },
        html_url: 'https://github.com/testuser',
        body: 'Comment body'
      })
    });
    (getGitHubAccessToken as jest.Mock).mockReturnValue(null);
  });

  it('appends issue-element-inner with mocked fetch', async () => {
    const notifications: GitHubAggregated[] = [
      {
        notification: {
          id: '1',
          reason: 'review_requested',
          subject: { title: 'Test Notification', url: 'https://github.com/owner/repo/issues/123', type: 'Issue', latest_comment_url: 'https://api.github.com/repos/owner/repo/issues/123/comments/456' },
          repository: { full_name: 'owner/repo', url: 'https://api.github.com/repos/owner/repo' },
          updated_at: '2023-01-01T00:00:00Z'
        },
        pullRequest: null,
        issue: {
          title: 'Test Issue',
          url: 'https://api.github.com/repos/owner/repo/issues/123',
          state: 'open',
          labels: [{ name: 'Priority: High' }],
          assignees: [],
          created_at: '2023-01-01T00:00:00Z',
          updated_at: '2023-01-01T00:00:00Z',
          body: 'Issue body',
          repository_url: 'https://api.github.com/repos/owner/repo',
          html_url: 'https://github.com/owner/repo/issues/123',
          number: 123
        },
        backlinkCount: 0
      }
    ];

    await renderNotifications(notifications, true);
    const elements = document.querySelectorAll('.issue-element-inner');
    expect(elements.length).toBe(1);
  });
});
