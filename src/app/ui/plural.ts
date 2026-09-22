const rules = new Intl.PluralRules('ru');

export interface PluralForms {
  /** 1, 21, 31 кадр */
  readonly one: string;
  /** 2, 3, 4, 22 кадра — и дробные: 1,5 кадра */
  readonly few: string;
  /** 0, 5, 11, 25 кадров */
  readonly many: string;
}

/** Число со словом в нужной форме. Правила берутся у браузера, а не из самодельной таблицы. */
export function plural(count: number, forms: PluralForms): string {
  const rule = rules.select(count);
  const word = rule === 'one' ? forms.one : rule === 'many' ? forms.many : forms.few;
  return `${count} ${word}`;
}
