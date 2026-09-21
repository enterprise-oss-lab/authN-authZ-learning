import { UserManager, WebStorageStateStore, type User } from 'oidc-client-ts';

const required = (name: keyof ImportMetaEnv) => {
  const value = import.meta.env[name];
  if (!value) {
    throw new Error(`${name} must be configured in apps/web/.env.local.`);
  }
  return value;
};

const issuer = required('VITE_ZITADEL_ISSUER');
const clientId = required('VITE_ZITADEL_CLIENT_ID');
export const userManager = new UserManager({
  authority: issuer,
  client_id: clientId,
  redirect_uri: `${window.location.origin}/auth/callback`,
  post_logout_redirect_uri: window.location.origin,
  response_type: 'code',
  scope: 'openid profile email',
  userStore: new WebStorageStateStore({ store: window.sessionStorage }),
  automaticSilentRenew: false,
});

export const getCurrentUser = (): Promise<User | null> => userManager.getUser();
