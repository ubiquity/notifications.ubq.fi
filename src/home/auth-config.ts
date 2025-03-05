interface AuthData {
  provider_token: string;
  access_token: string;
  expires_in: number;
  expires_at: number;
  refresh_token: string;
  token_type: string;
  user: {
    id: string;
    aud: string;
    role: string;
    email: string;
    email_confirmed_at: string;
    phone: string;
    confirmed_at: string;
    last_sign_in_at: string;
    app_metadata: {
      provider: string;
      providers: string[];
    };
    user_metadata: {
      avatar_url: string;
      email: string;
      email_verified: boolean;
      full_name: string;
      iss: string;
      name: string;
      phone_verified: boolean;
      preferred_username: string;
      provider_id: string;
      sub: string;
      user_name: string;
    };
  };
}

declare const AUTH_TOKEN_KEY: string;
declare const AUTH_PROVIDER_TOKEN: string;
declare const AUTH_ACCESS_TOKEN: string;
declare const AUTH_REFRESH_TOKEN: string;

export function setupAuth() {
  // Only set up test auth on localhost
  if (!window.location.hostname.includes('localhost')) {
    return;
  }

  const authData: AuthData = {
    provider_token: AUTH_PROVIDER_TOKEN,
    access_token: AUTH_ACCESS_TOKEN,
    expires_in: 86400,
    expires_at: 1741220191,
    refresh_token: AUTH_REFRESH_TOKEN,
    token_type: 'bearer',
    user: {
      id: '176def94-cb0a-4ceb-b1c0-8582b09ffa9d',
      aud: 'authenticated',
      role: 'authenticated',
      email: 'github@pavlovcik.com',
      email_confirmed_at: '2023-11-30T06:27:23.941923Z',
      phone: '',
      confirmed_at: '2023-11-30T06:27:23.941923Z',
      last_sign_in_at: '2025-03-04T23:32:09.772191Z',
      app_metadata: {
        provider: 'github',
        providers: ['github']
      },
      user_metadata: {
        avatar_url: 'https://avatars.githubusercontent.com/u/4975670?v=4',
        email: 'github@pavlovcik.com',
        email_verified: true,
        full_name: 'アレクサンダー.eth',
        iss: 'https://api.github.com',
        name: 'アレクサンダー.eth',
        phone_verified: false,
        preferred_username: '0x4007',
        provider_id: '4975670',
        sub: '4975670',
        user_name: '0x4007'
      }
    }
  };

  localStorage.setItem(AUTH_TOKEN_KEY, JSON.stringify(authData));
  console.log('Authentication data set in localStorage');
}
