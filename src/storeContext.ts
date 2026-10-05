// The React context lives in its own module so hot reloads of store.tsx never
// create a second context (which would orphan every mounted consumer).
import { createContext, type Dispatch } from 'react';
import type { Action, State } from './store';

export const StoreCtx = createContext<{ state: State; dispatch: Dispatch<Action> } | null>(null);
