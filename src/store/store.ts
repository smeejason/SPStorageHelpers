import type {
  AuthState,
  TenantStorageSummary,
  SiteStorageInfo,
  LargeFileInfo,
  RecycleBinItem,
  CleanupRecommendation,
  RouteName,
} from '../types';

/** Full application state shape */
export interface AppState {
  auth: AuthState;
  route: RouteName;
  loading: boolean;
  error: string | null;
  tenantSummary: TenantStorageSummary | null;
  sites: SiteStorageInfo[];
  selectedSiteId: string | null;
  largeFiles: LargeFileInfo[];
  recycleBinItems: RecycleBinItem[];
  recommendations: CleanupRecommendation[];
}

/** All possible action types */
export type ActionType =
  | 'SET_AUTH'
  | 'SET_ROUTE'
  | 'SET_LOADING'
  | 'SET_ERROR'
  | 'SET_TENANT_SUMMARY'
  | 'SET_SITES'
  | 'SET_SELECTED_SITE'
  | 'SET_LARGE_FILES'
  | 'SET_RECYCLE_BIN'
  | 'SET_RECOMMENDATIONS'
  | 'RESET';

export interface Action {
  type: ActionType;
  payload?: unknown;
}

type Listener = (state: AppState) => void;

const initialState: AppState = {
  auth: {
    isAuthenticated: false,
    userName: null,
    userEmail: null,
    tenantId: null,
  },
  route: 'dashboard',
  loading: false,
  error: null,
  tenantSummary: null,
  sites: [],
  selectedSiteId: null,
  largeFiles: [],
  recycleBinItems: [],
  recommendations: [],
};

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'SET_AUTH':
      return { ...state, auth: action.payload as AuthState };
    case 'SET_ROUTE':
      return { ...state, route: action.payload as RouteName };
    case 'SET_LOADING':
      return { ...state, loading: action.payload as boolean };
    case 'SET_ERROR':
      return { ...state, error: action.payload as string | null };
    case 'SET_TENANT_SUMMARY':
      return {
        ...state,
        tenantSummary: action.payload as TenantStorageSummary,
      };
    case 'SET_SITES':
      return { ...state, sites: action.payload as SiteStorageInfo[] };
    case 'SET_SELECTED_SITE':
      return { ...state, selectedSiteId: action.payload as string | null };
    case 'SET_LARGE_FILES':
      return { ...state, largeFiles: action.payload as LargeFileInfo[] };
    case 'SET_RECYCLE_BIN':
      return { ...state, recycleBinItems: action.payload as RecycleBinItem[] };
    case 'SET_RECOMMENDATIONS':
      return {
        ...state,
        recommendations: action.payload as CleanupRecommendation[],
      };
    case 'RESET':
      return { ...initialState };
    default:
      return state;
  }
}

/** Simple Redux-like store */
class Store {
  private state: AppState;
  private listeners: Set<Listener> = new Set();

  constructor() {
    this.state = { ...initialState };
  }

  getState(): AppState {
    return this.state;
  }

  dispatch(action: Action): void {
    this.state = reducer(this.state, action);
    this.listeners.forEach((fn) => fn(this.state));
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

/** Singleton application store */
export const store = new Store();
