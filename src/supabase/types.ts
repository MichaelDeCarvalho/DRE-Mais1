export interface Organization {
  id: string;
  name: string;
  slug: string;
  created_at: string;
}

export interface Store {
  id: string;
  organization_id: string;
  code: string;
  display_name: string;
  created_at: string;
}

export interface StoreMembership {
  id: string;
  user_id: string;
  organization_id: string;
  store_id: string | null;
  role: 'OWNER' | 'ADMIN' | 'MANAGER' | 'OPERATOR';
}

export interface UserSession {
  user: {
    id: string;
    email: string;
  } | null;
  organization: Organization | null;
  store: Store | null;
  role: 'OWNER' | 'ADMIN' | 'MANAGER' | 'OPERATOR' | null;
}
