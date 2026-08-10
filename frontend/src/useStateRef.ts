import { useEffect, useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from "react";

// Pairs a useState with a useRef that always mirrors its latest committed
// value. Needed wherever OpenLayers code (style callbacks, click/hover
// handlers) runs outside React and can't read component state directly --
// e.g. the mooring layer's style function reads mooringSizeRef.current
// instead of the mooringSize state, since it's invoked by OL, not React.
//
// `onChange` runs whenever the value commits, same as the inline effect
// body each of these used to have before being pulled into this hook (e.g.
// pushing the new value into an OpenLayers layer's style variables). It's
// not part of the ref-mirroring itself -- most callers don't need it.

export function useStateRef<T>(
  initial: T,
  onChange?: (value: T) => void
): [T, Dispatch<SetStateAction<T>>, MutableRefObject<T>] {
  const [value, setValue] = useState(initial);
  const ref = useRef(value);
  useEffect(() => {
    ref.current = value;
    onChange?.(value);
    // onChange is passed fresh each render by callers (it closes over other
    // refs/state) -- only re-run this when the value itself changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return [value, setValue, ref];
}
