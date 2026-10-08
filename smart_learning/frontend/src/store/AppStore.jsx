import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import { produce } from 'immer'
import { createInitialState } from '../data/seed.js'

// One shared store for every role, because the roles feed each other: a
// teacher's quizzes appear for learners, HOD reports land on the principal's
// dashboard, and so on. `update(s => { ... })` mutates a draft (via immer).
const StoreContext = createContext(null);

export function StoreProvider({ children, initialState }){
  const [state, setState] = useState(()=>initialState || createInitialState());
  const update = useCallback((recipe)=>setState(prev=>produce(prev, recipe)), []);
  const value = useMemo(()=>({ state, update }), [state, update]);
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(){
  return useContext(StoreContext);
}
