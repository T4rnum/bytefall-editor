/**
 * Базовые контролы редактора. Слой `ui` ничего не знает о сторах и о документе: он получает
 * значения и колбэки. Любой новый контрол появляется здесь, а не внутри панели, иначе через
 * месяц у каждой панели будет свой слайдер со своими отступами.
 */
export { formatAge } from './age';
export { AnchorPicker, type AnchorPickerProps } from './AnchorPicker';
export { Button, tooltip, type ButtonProps, type ButtonVariant, type ControlSize } from './Button';
export { Checkbox, type CheckboxProps } from './Checkbox';
export { ColorField, type ColorFieldProps } from './ColorField';
export { Field, FieldGroup, type FieldProps } from './Field';
export { NumberField, type NumberFieldProps } from './NumberField';
export { Panel, type PanelProps } from './Panel';
export { Resizer, type ResizerProps } from './Resizer';
export { Select, optionsOf, type SelectOption, type SelectProps } from './Select';
export { Slider, type SliderProps } from './Slider';
export { Tabs, type TabItem, type TabsProps } from './Tabs';
export { TextField, type TextFieldProps } from './TextField';
export { TIP_ATTR, TooltipLayer } from './Tooltip';
export { readSetting, writeSetting } from './persist';
export { plural, type PluralForms } from './plural';
export { resizePreview, type PreviewBox, type ResizePreview } from './resizePreview';
export {
  clamp,
  formatNumber,
  parseNumber,
  snapToStep,
  type DragMode,
  type NumericRange,
} from './numeric';
