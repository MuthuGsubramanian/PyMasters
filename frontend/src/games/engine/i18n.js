// Play-side i18n: the app's t(key, english) plus {placeholder} interpolation.
import useI18n from '../../hooks/useI18n';

export function fill(template, vars) {
  return String(template).replace(/\{(\w+)\}/g, (_, k) => (vars && k in vars ? String(vars[k]) : `{${k}}`));
}

export function usePlayT() {
  const { t } = useI18n();
  return (key, english, vars) => (vars ? fill(t(key, english), vars) : t(key, english));
}
