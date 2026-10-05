/** 输入法确认按键不应触发页面快捷操作；229 兼容部分浏览器的组合输入事件。 */
export function isComposingKey(event: Pick<KeyboardEvent, 'isComposing' | 'keyCode'>) {
  return event.isComposing || event.keyCode === 229;
}

export function canFocusSearch(event: KeyboardEvent) {
  return (
    event.key === '/' &&
    !event.defaultPrevented &&
    !isComposingKey(event) &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.altKey &&
    !(
      event.target instanceof Element &&
      event.target.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"])')
    )
  );
}
