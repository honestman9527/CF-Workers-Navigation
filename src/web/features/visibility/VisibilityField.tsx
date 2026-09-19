import type { Visibility } from '@shared/api/types';

import { LockKeyhole } from 'lucide-react';
import { useId } from 'react';

import { Badge } from '@/components/ui/badge';
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from '@/components/ui/field';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { api } from '@nav/api/client';
import { useApiData } from '@nav/hooks/useApiData';

const loadDefaults = (signal: AbortSignal) => api.getSettings(undefined, signal);
export function useVisibilityDefaults() {
  return useApiData(loadDefaults);
}

export function VisibilityField({
  value,
  onChange,
  inherited = false,
  label = '访问权限',
  disabled = false,
}: {
  value?: Visibility;
  onChange: (value: Visibility) => void;
  inherited?: boolean;
  label?: string;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <FieldSet disabled={disabled}>
      <FieldLegend variant="label">{label}</FieldLegend>
      <FieldGroup>
        <RadioGroup
          value={value ?? null}
          disabled={disabled}
          onValueChange={(next) => {
            if (next === 'public' || next === 'private') onChange(next);
          }}
          aria-label={label}
          className="flex flex-wrap gap-4"
        >
          <Field orientation="horizontal" className="w-auto">
            <RadioGroupItem id={`${id}-public`} value="public" />
            <FieldLabel htmlFor={`${id}-public`}>公开</FieldLabel>
          </Field>
          <Field orientation="horizontal" className="w-auto">
            <RadioGroupItem id={`${id}-private`} value="private" />
            <FieldLabel htmlFor={`${id}-private`}>私有</FieldLabel>
          </Field>
        </RadioGroup>
        <FieldDescription>
          {inherited
            ? '受上级分类限制：当前仅登录可见。移动到公开分类后，将按自身权限生效。'
            : '公开内容无需登录；私有内容仅管理员登录后可见。'}
        </FieldDescription>
      </FieldGroup>
    </FieldSet>
  );
}

export function VisibilityBadge({
  item,
}: {
  item: { visibility: Visibility; effectiveVisibility: Visibility };
}) {
  if (item.effectiveVisibility !== 'private') return null;
  const label = item.visibility === 'private' ? '私有' : '受上级分类限制';
  return (
    <Badge variant="secondary" title={label}>
      <LockKeyhole data-icon="inline-start" />
      {label}
    </Badge>
  );
}
