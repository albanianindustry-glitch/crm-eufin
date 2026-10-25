// Lidhje e vogël midis moduleve dhe guaskës: rifreskimi i pamjes aktuale pas një veprimi.
let rerender = async () => {};
export const setRerender = (fn) => { rerender = fn; };
export const refresh = () => rerender();
