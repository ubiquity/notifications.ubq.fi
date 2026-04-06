jest.mock('../src/home/rendering/render-preview-modal');

import { setLocalStore, getLocalStore } from '../src/home/getters/get-local-store';

describe('setLocalStore and getLocalStore', () => {
  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = '<div id="modal"></div>';
  });

  it('round-trips string[]', () => {
    const key = 'viewed-notifications';
    const value: string[] = ['1', '2'];
    setLocalStore(key, value);
    const result = getLocalStore<string[]>(key);
    expect(result).toEqual(value);
  });

  it('round-trips OAuthToken object', () => {
    const key = 'auth-token';
    const value = { provider_token: 'token123', expires_at: 123456 };
    setLocalStore(key, value);
    const result = getLocalStore<typeof value>(key);
    expect(result).toEqual(value);
  });
});
