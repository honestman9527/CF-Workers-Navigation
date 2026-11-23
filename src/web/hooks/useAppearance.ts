import { clampBgOverlayOpacity } from '@shared';
import { useAtomValue, useSetAtom } from 'jotai';
import { useCallback, useEffect } from 'react';

import { bgOverlayOpacityAtom, paletteAtom, viewDensityAtom } from '@nav/features/settings/store';

/**
 * 外观偏好（主题色、书签视图密度、壁纸遮罩浓度）：
 * 与 useTheme 解耦，避免影响仅关注明暗模式的现有测试与调用方。
 */
export function useAppearance() {
  const palette = useAtomValue(paletteAtom);
  const setPalette = useSetAtom(paletteAtom);
  const density = useAtomValue(viewDensityAtom);
  const setDensity = useSetAtom(viewDensityAtom);
  const bgOverlayOpacity = useAtomValue(bgOverlayOpacityAtom);
  const setRawOverlayOpacity = useSetAtom(bgOverlayOpacityAtom);

  const setBgOverlayOpacity = useCallback(
    (value: number) => {
      setRawOverlayOpacity(clampBgOverlayOpacity(value));
    },
    [setRawOverlayOpacity],
  );

  useEffect(() => {
    document.documentElement.dataset.palette = palette;
  }, [palette]);

  useEffect(() => {
    document.documentElement.style.setProperty(
      '--bg-overlay-opacity',
      String(clampBgOverlayOpacity(bgOverlayOpacity)),
    );
  }, [bgOverlayOpacity]);

  return {
    palette,
    setPalette,
    density,
    setDensity,
    bgOverlayOpacity,
    setBgOverlayOpacity,
  };
}
