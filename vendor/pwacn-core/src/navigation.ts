export type Presentation = 'push' | 'modal' | 'sheet';

export type StackEntry<T = unknown> = {
  key: string;
  pathname: string;
  data?: T;
  presentation: Presentation;
  scrollPosition?: number;
};

export type StackState<T = unknown> = {
  entries: StackEntry<T>[];
  direction: 'push' | 'pop' | 'replace';
};

export type StackAction<T = unknown> =
  | { type: 'push'; entry: StackEntry<T> }
  | { type: 'pop' }
  | { type: 'pop-to'; key: string }
  | { type: 'replace'; entry: StackEntry<T> }
  | { type: 'set-scroll'; key: string; scrollPosition: number };

export function stackReducer<T>(
  state: StackState<T>,
  action: StackAction<T>,
): StackState<T> {
  switch (action.type) {
    case 'push':
      return { entries: [...state.entries, action.entry], direction: 'push' };
    case 'pop':
      return state.entries.length <= 1
        ? state
        : { entries: state.entries.slice(0, -1), direction: 'pop' };
    case 'pop-to': {
      const index = state.entries.findIndex((entry) => entry.key === action.key);
      return index < 0 || index === state.entries.length - 1
        ? state
        : { entries: state.entries.slice(0, index + 1), direction: 'pop' };
    }
    case 'replace':
      return {
        entries: [...state.entries.slice(0, -1), action.entry],
        direction: 'replace',
      };
    case 'set-scroll':
      return {
        ...state,
        entries: state.entries.map((entry) =>
          entry.key === action.key
            ? { ...entry, scrollPosition: action.scrollPosition }
            : entry,
        ),
      };
  }
}
