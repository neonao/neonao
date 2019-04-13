import React, { DragEventHandler, useCallback, useEffect, useRef, useState } from 'react';

import { ID, Item } from '../Item';
import { dragMode, DropPosition, EditMode, editMode, loadItemState, normalMode } from '../tree';
import * as actions from '../actions';
import './ListNode.scss';
import { Children } from './Children';
import { Dispatch, useDispatch } from './List';
import { Editor } from './Editor';

const DRAGGING_CLASS = 'node-dragging';
const DROP_DATA_TYPE = 'text/list-node-id';

export interface Props {
  id: ID;
  item: Item;
  editing: null | EditMode;
  parentDragging: boolean;
}

const useLoadChildren = (item: Item, dispatch: Dispatch) => {
  const init = useRef(true);
  useEffect(() => {
    if (init.current) {
      init.current = false;
      if (!item.loaded) loadItemState(item).then(dispatch);
    }
  });
};

interface DragAndDrop {
  onDragStart: DragEventHandler;
  onDragEnd: DragEventHandler;
  onDrop: DragEventHandler;
  onDragOver: DragEventHandler;
  onDragLeave: DragEventHandler;
  dragging: boolean;
  isOver: DropPosition | null;
}

const getDropId = (e: React.DragEvent): ID => {
  return e.dataTransfer.getData(DROP_DATA_TYPE);
};

type Rect = ClientRect | DOMRect;

const computeDropPosition = (e: React.DragEvent, rect: Rect): DropPosition => {
  const y = e.clientY;

  const top = Math.abs(y - rect.top);
  const bottom = Math.abs(y - rect.bottom);
  console.log(`Y: ${y} top: ${top} ${bottom}`);
  return top > bottom ? 'below' : 'above';
};

const useDragAndDrop = (
  id: ID,
  dispatch: Dispatch,
  ref: React.RefObject<Element>,
  parentDragging: boolean
): DragAndDrop => {
  const [dragging, setDragging] = useState(false);
  const [isOver, setIsOver] = useState<DropPosition | null>(null);
  const onDragStart: DragEventHandler = e => {
    e.dataTransfer.setData(DROP_DATA_TYPE, id);
    e.dataTransfer.effectAllowed = 'move';
    setDragging(true);
    dispatch(actions.switchMode(dragMode()));
  };
  const onDragEnd: DragEventHandler = () => {
    setDragging(false);
    dispatch(actions.switchMode(normalMode()));
  };
  const canDrop = (e: React.DragEvent): boolean => {
    return e.dataTransfer.types.includes(DROP_DATA_TYPE) && !dragging && !parentDragging;
  };

  const onDrop: DragEventHandler = e => {
    setDragging(false);
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    if (canDrop(e)) {
      const dropId = getDropId(e);
      e.stopPropagation();
      if (dropId === id) return;
      e.preventDefault();
      setIsOver(null);
      dispatch(actions.drop(getDropId(e), id, computeDropPosition(e, rect)));
    }
    dispatch(actions.switchMode(normalMode()));
  };
  const onDragOver: DragEventHandler = e => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    if (canDrop(e)) {
      e.preventDefault();
      e.stopPropagation();
      const position = computeDropPosition(e, rect);
      if (position !== isOver) {
        setIsOver(position);
      }
    } else if (dragging || parentDragging) {
      e.stopPropagation();
    }
  };
  const onDragLeave: DragEventHandler = () => {
    if (isOver) {
      setIsOver(null);
    }
  };
  return { onDragEnd, onDragLeave, onDragOver, onDragStart, onDrop, isOver, dragging: dragging || parentDragging };
};

export interface EditOperator {
  swapUp: () => void;
  swapDown: () => void;
  unIndent: () => void;
  indent: () => void;
  create: () => void;
  remove: () => void;
  toggle: () => void;
  edit: () => void;
  gotoNext: () => void;
  gotoPrev: () => void;
}

const useEditOperate = (dispatch: Dispatch, item: Item, editing: EditMode | null): EditOperator => {
  const id = item.id;
  const parent = item.parent;
  const childCount = item.children.size;
  const swapUp = useCallback(() => {
    if (parent) {
      dispatch(actions.reorder(id, -1));
    }
  }, [parent]);
  const swapDown = useCallback(() => {
    if (parent) {
      dispatch(actions.reorder(id, 1));
    }
  }, [parent]);
  const unIndent = useCallback(() => {
    if (parent) {
      dispatch(actions.unIndent(id, parent));
    }
  }, [parent]);
  const indent = useCallback(() => {
    if (parent) {
      dispatch(actions.indent(id, parent));
    }
  }, [parent]);
  const create = useCallback(() => {
    dispatch(actions.create(Item.create('', parent), id));
  }, [parent]);
  const remove = useCallback(() => {
    if (childCount === 0) {
      dispatch(actions.remove(id));
    }
  }, [childCount]);
  const toggle = useCallback(() => {
    if (childCount > 0) {
      dispatch(actions.toggle(id));
    }
  }, [childCount]);
  const edit = useCallback(() => {
    if (!editing) {
      dispatch(actions.switchMode(editMode(id)));
    }
  }, [editing]);
  const gotoNext = () => {
    dispatch(actions.gotoNext(id));
  };
  const gotoPrev = () => {
    dispatch(actions.gotoPrev(id));
  };
  return { swapUp, swapDown, unIndent, indent, remove, create, toggle, edit, gotoNext, gotoPrev };
};

export const ListNode = ({ item, id, parentDragging, editing }: Props) => {
  const dispatch = useDispatch();
  useLoadChildren(item, dispatch);
  const onChange = useCallback((source: string) => dispatch(actions.edit(item.id, source)), [item]);
  const operates = useEditOperate(dispatch, item, editing);

  const dropRef = useRef<HTMLDivElement>(null);
  const { onDrop, onDragStart, onDragOver, onDragLeave, onDragEnd, isOver, dragging } = useDragAndDrop(
    id,
    dispatch,
    dropRef,
    parentDragging
  );

  const classNames = ['ListNode'];
  if (dragging) {
    classNames.push(DRAGGING_CLASS);
  }
  if (parentDragging) {
    classNames.push('parent-dragging');
  }
  if (isOver !== null) {
    // drop-inner | drop-above | drop-below
    classNames.push(`drop-${isOver}`);
  }
  return (
    <div
      ref={dropRef}
      className={classNames.join(' ')}
      onDrop={onDrop}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
    >
      <div className="bullet" draggable={true} onDragStart={onDragStart} onDragEnd={onDragEnd}>
        •
      </div>
      <div>
        <Editor onChange={onChange} source={item.source} editing={!!editing} modified={item.modified} {...operates} />
      </div>
      <Children items={item.children} loaded={item.loaded} expand={item.expand} parentDragging={dragging} />
    </div>
  );
};

export default ListNode;
