import { fromJS, Map } from 'immutable';
import { ID, Item } from './Item';
import { loadedState, LoadedState } from './actions';
import { DETAIL_MODE, DRAG_MODE, EDIT_MODE, NORMAL_MODE, SELECT_MODE } from './constants';
import { RawDraftContentState, SelectionState } from 'draft-js';

export type ItemMap = Map<ID, Item>;

export interface Tree {
  root: ID | null;
  map: ItemMap;
  loading: boolean;
  mode: Mode;
}

export type Mode = EditMode | SelectMode | DetailMode | DragMode | NormalMode;

export interface NormalMode {
  type: typeof NORMAL_MODE;
}

export const normalMode = (): NormalMode => ({ type: NORMAL_MODE });

export type DropPosition = 'above' | 'below' | 'inner';

export interface DropAt {
  target: ID;
  position: DropPosition;
}

export const dropAt = (target: ID, position: DropPosition): DropAt => ({
  target,
  position,
});

export interface DragMode {
  type: typeof DRAG_MODE;
  dropAt?: DropAt;
}

export const dragMode = (dropAt?: DropAt): DragMode => ({
  type: DRAG_MODE,
  dropAt,
});

export interface EditMode {
  type: typeof EDIT_MODE;
  id: ID;
  selection?: SelectionState;
}

export const editMode = (id: ID, selection?: SelectionState): EditMode => ({
  type: EDIT_MODE,
  id,
  selection,
});

export interface SelectMode {
  type: typeof SELECT_MODE;
  selected: ID[];
  cut: boolean;
}

export interface DetailMode {
  type: typeof DETAIL_MODE;
  id: ID;
}

export const initTree: Tree = {
  root: null,
  map: Map(),
  loading: true,
  mode: normalMode(),
};

export const saveTreeState = async (state: Tree) => {
  const localForage = await import('localforage');
  if (!state.root) return;
  await localForage.setItem('root', state.root);
  const { editorToRow } = await import('./editor');
  const toJSON = ({ id, expand, editor, children, parent }: Item): ExportedItem => ({
    id,
    expand,
    parent,
    children: children.toJS(),
    rawContent: editorToRow(editor),
  });
  state.map.forEach((item: Item, key: ID) => localForage.setItem(key, toJSON(item)));
  console.debug('saved');
};

const getItemByIDFromStorage = async (id: ID): Promise<Item | null> => {
  const localForage = await import('localforage');
  const raw = await localForage.getItem<ExportedItem>(id);
  const { editorFromRaw } = await import('./editor');
  const fromJSON = ({ id, expand, rawContent, children, parent }: ExportedItem): Item => ({
    id,
    expand,
    parent,
    children: fromJS(children),
    editor: editorFromRaw(rawContent),
    deleted: false,
    loaded: children.length === 0,
  });
  if (raw) {
    let item = fromJSON(raw);
    item.loaded = true;
    return item;
  } else {
    return null;
  }
};

const loadChildren = async (item: Item | null, max_level: number): Promise<ItemMap> => {
  const mapper = async (childID: ID): Promise<ItemMap> => {
    const item = await getItemByIDFromStorage(childID);
    return loadChildren(item, max_level - 1);
  };

  let map: ItemMap = Map();
  if (item) {
    map = map.set(item.id, item);
    if (max_level > 0) {
      const childrenMaps = await Promise.all(item.children.toArray().map(mapper));
      return await map.merge(...childrenMaps);
    } else if (item.children.size > 0) {
      item.loaded = false;
    }
  }

  return await map;
};

export interface ExportedItem {
  id: ID;
  parent?: ID;
  children: Array<ID>;
  expand: boolean;
  rawContent: RawDraftContentState;
}

const createEmptyState = async (): Promise<LoadedState> => {
  const { createEditorWithText } = await import('./editor');
  const text = 'Hello, this is an empty notebook.';
  const root = Item.create(createEditorWithText(text));
  const rootID = root.id;
  const map: ItemMap = Map({ [rootID]: root });
  const state = { root: rootID, map, loading: false };
  return loadedState(state);
};

export const loadItemState = async (item: Item, max_level: number = 2): Promise<LoadedState> => {
  let map = await loadChildren(item, max_level);
  map = map.set(item.id, { ...item, loaded: true });
  return await loadedState({ map });
};

export const loadTreeState = async (max_level: number = 128): Promise<LoadedState> => {
  const localForage = await import('localforage');
  const rootID = await localForage.getItem<ID>('root');
  if (!rootID) return await createEmptyState();
  const root = await getItemByIDFromStorage(rootID);
  const map = await loadChildren(root, max_level);
  console.log('loaded');
  return await loadedState({ root: rootID, map, loading: false });
};

export const isChildrenOf = (map: ItemMap, child: ID, parent: ID): boolean => {
  if (child === parent) return false;
  let now = map.get(child) || null;
  while (now && now.id !== parent && now.parent) {
    now = map.get(now.parent) || null;
  }
  return now ? now.id === parent : false;
};
